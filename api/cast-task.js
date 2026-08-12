import { json, methodNotAllowed, safeName, fetchBytes } from './_lib/http.js';
import * as tripo from './_lib/tripo.js';
import * as db from './_lib/supabase.js';

// Four-stage character pipeline, driven by the frontend polling every 4s:
//
//   model -> body mesh built from the photo(s)
//   check -> Tripo inspects the mesh and reports a rig type
//   rig   -> skeleton fitted
//   anim  -> animation clips retargeted onto the rig, then saved
//
// Each stage returns the next stage's task id. `model` is carried through the
// whole run because the rig and preview both need the original body task.

async function finishCast(originalModelTaskId, animatedTask, name) {
  const modelUrl = tripo.modelUrlOf(animatedTask);
  if (!modelUrl) throw new Error('Tripo did not return an animated model URL.');

  const original = await tripo.getTask(originalModelTaskId);
  const previewUrl = tripo.previewUrlOf(original);

  const id = `cast_${crypto.randomUUID()}`;
  const glbUrl = await db.upload(`${id}.glb`, await fetchBytes(modelUrl), 'model/gltf-binary');

  let permanentPreview = null;
  if (previewUrl) {
    try {
      permanentPreview = await db.upload(`${id}.jpg`, await fetchBytes(previewUrl), 'image/jpeg');
    } catch (error) {
      console.warn('cast preview persistence failed:', error?.message || error);
    }
  }

  const anims = {
    presets: tripo.CAST_ANIMATIONS.map((v) => v.replace('preset:', '')),
    rig: 'tripo',
    version: tripo.RIG_VERSION,
  };

  const row = await db.insert('bp_cast', {
    id,
    name: safeName(name, 'Cast'),
    glb_url: glbUrl,
    preview_url: permanentPreview,
    anims,
  });

  return {
    id: row.id || id,
    name: row.name || safeName(name, 'Cast'),
    glb_url: row.glb_url || glbUrl,
    preview_url: row.preview_url || permanentPreview,
    anims: row.anims || anims,
    created_at: row.created_at,
  };
}

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'GET')) return;
  if (!tripo.apiKey()) return json(res, 500, { error: 'TRIPO_API_KEY is not configured.' });

  const stage = String(req.query?.stage || 'model');
  const id = String(req.query?.id || '').trim();
  const model = String(req.query?.model || id).trim();
  const name = safeName(req.query?.name, 'Cast');
  if (!id) return json(res, 400, { error: 'Task id is required.' });

  try {
    const task = await tripo.getTask(id);
    const failure = tripo.taskFailure(task, stage);
    if (failure === false) return json(res, 200, { done: false, stage, id, model });
    if (failure) return json(res, 502, { error: failure });

    if (stage === 'model') {
      const next = await tripo.startTask({
        type: 'animate_prerigcheck',
        original_model_task_id: model,
      });
      return json(res, 200, { done: false, stage: 'check', id: next, model });
    }

    if (stage === 'check') {
      // Bail out before rigging burns credits on a mesh that will never rig —
      // the classic cause is a photo with two people (or a busy background),
      // which fuses into one blob Tripo can't put a skeleton in.
      if (task.output?.riggable === false) {
        return json(res, 502, {
          error: "That photo doesn't rig as one person. Use a single person, head to toe, on a plain background, and build again.",
        });
      }
      const rigType = task.output?.rig_type || 'biped';
      const next = await tripo.startTask({
        type: 'animate_rig',
        original_model_task_id: model,
        out_format: 'glb',
        model_version: tripo.RIG_VERSION,
        rig_type: rigType,
        spec: 'tripo',
      });
      return json(res, 200, {
        done: false,
        stage: 'rig',
        id: next,
        model,
        rig_type: rigType,
        riggable: task.output?.riggable,
      });
    }

    if (stage === 'rig') {
      // Retarget runs against the rigged task, not the original body task.
      const next = await tripo.startTask({
        type: 'animate_retarget',
        original_model_task_id: id,
        out_format: 'glb',
        animations: tripo.CAST_ANIMATIONS,
        bake_animation: true,
        export_with_geometry: true,
        animate_in_place: true,
      });
      return json(res, 200, { done: false, stage: 'anim', id: next, model });
    }

    if (stage === 'anim') {
      if (!db.isConfigured()) {
        return json(res, 500, { error: 'Supabase is not configured, so the character cannot be saved.' });
      }
      return json(res, 200, { done: true, cast: await finishCast(model, task, name) });
    }

    return json(res, 400, { error: `Unknown cast stage: ${stage}` });
  } catch (error) {
    console.error('cast-task:', error);
    return json(res, 502, { error: error?.message || 'The character pipeline failed.' });
  }
}
