import { json, methodNotAllowed, safeName, fetchBytes } from './_lib/http.js';
import * as tripo from './_lib/tripo.js';
import * as db from './_lib/supabase.js';

// Tripo's asset URLs expire quickly, so a finished prop is copied into Supabase
// Storage and recorded in bp_props. If that persistence fails we still hand the
// raw Tripo URLs back with a warning — the frontend downloads them immediately,
// so the user keeps their prop even though it won't be in the permanent library.
async function persist(task, name) {
  const modelUrl = tripo.modelUrlOf(task);
  if (!modelUrl) throw new Error('Tripo did not return a model URL.');

  const previewUrl = tripo.previewUrlOf(task);
  if (!db.isConfigured()) return { modelUrl, previewUrl, prop: null, warn: null };

  const id = `prop_${crypto.randomUUID()}`;
  const glbBytes = await fetchBytes(modelUrl);
  const glbUrl = await db.upload(`${id}.glb`, glbBytes, 'model/gltf-binary');

  let permanentPreview = null;
  if (previewUrl) {
    try {
      permanentPreview = await db.upload(`${id}.jpg`, await fetchBytes(previewUrl), 'image/jpeg');
    } catch (error) {
      console.warn('prop preview persistence failed:', error?.message || error);
    }
  }

  const row = await db.insert('bp_props', {
    id,
    name: safeName(name, 'Prop'),
    glb_url: glbUrl,
    preview_url: permanentPreview,
  });

  return {
    modelUrl,
    previewUrl,
    prop: {
      id: row.id || id,
      name: row.name || safeName(name, 'Prop'),
      glb_url: row.glb_url || glbUrl,
      preview_url: row.preview_url || permanentPreview,
    },
    warn: null,
  };
}

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'GET')) return;
  if (!tripo.apiKey()) return json(res, 500, { error: 'TRIPO_API_KEY is not configured.' });

  const id = String(req.query?.id || '').trim();
  const name = safeName(req.query?.name, 'Prop');
  if (!id) return json(res, 400, { error: 'Task id is required.' });

  try {
    const task = await tripo.getTask(id);
    const failure = tripo.taskFailure(task, 'Prop build');
    if (failure === false) return json(res, 200, { done: false });
    if (failure) return json(res, 502, { error: failure });

    try {
      const { modelUrl, previewUrl, prop } = await persist(task, name);
      if (prop) return json(res, 200, { done: true, prop });
      return json(res, 200, { done: true, model_url: modelUrl, preview_url: previewUrl });
    } catch (error) {
      console.warn('props-task persistence failed:', error?.message || error);
      const modelUrl = tripo.modelUrlOf(task);
      if (!modelUrl) throw error;
      return json(res, 200, {
        done: true,
        model_url: modelUrl,
        preview_url: tripo.previewUrlOf(task),
        warn: "Saved to this device only — the permanent library couldn't be reached.",
      });
    }
  } catch (error) {
    console.error('props-task:', error);
    return json(res, 502, { error: error?.message || 'The prop build failed.' });
  }
}
