const TRIPO_API = 'https://api.tripo3d.ai/v2/openapi';
const RIG_VERSION = 'v2.5-20260210';
const CAST_ANIMATIONS = ['preset:idle', 'preset:walk', 'preset:run', 'preset:hurt', 'preset:fall'];
const BUCKET = 'bull-props';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function tripoKey() {
  return process.env.TRIPO_API_KEY || process.env.TRIPO_KEY || '';
}

async function getTask(apiKey, taskId) {
  const r = await fetch(`${TRIPO_API}/task/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.code !== 0 || !d.data) {
    throw new Error(d.message || d.suggestion || `Tripo task lookup failed (${r.status}).`);
  }
  return d.data;
}

async function startTask(apiKey, payload) {
  const r = await fetch(`${TRIPO_API}/task`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.code !== 0 || !d.data?.task_id) {
    throw new Error(d.message || d.suggestion || `Tripo task start failed (${r.status}).`);
  }
  return d.data.task_id;
}

function taskFailure(task, label) {
  if (task.status === 'success') return null;
  if (task.status === 'queued' || task.status === 'running') return false;
  return `${label} failed (${task.status || 'unknown'}).`;
}

function safeName(value) {
  const v = String(value || 'Cast').trim().slice(0, 80);
  return v || 'Cast';
}

function safeId() {
  return `cast_${crypto.randomUUID()}`;
}

function supabaseConfig() {
  return {
    url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

async function supabaseUpload(path, bytes, contentType) {
  const { url, key } = supabaseConfig();
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || d.error || `Supabase asset upload failed (${r.status}).`);
  }
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function saveCastRow(row) {
  const { url, key } = supabaseConfig();
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  const r = await fetch(`${url}/rest/v1/bp_cast`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.message || `Saving cast record failed (${r.status}).`);
  return Array.isArray(d) ? d[0] : row;
}

async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Downloading generated asset failed (${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}

async function finishCast(apiKey, originalModelTaskId, animatedTask, name) {
  const modelUrl = animatedTask.output?.model || animatedTask.output?.pbr_model || animatedTask.output?.base_model;
  if (!modelUrl) throw new Error('Tripo did not return an animated model URL.');

  const original = await getTask(apiKey, originalModelTaskId);
  const previewUrl = original.output?.rendered_image || original.output?.generated_image || null;

  const id = safeId();
  const glbBytes = await fetchBytes(modelUrl);
  const glbUrl = await supabaseUpload(`${id}.glb`, glbBytes, 'model/gltf-binary');

  let permanentPreview = null;
  if (previewUrl) {
    try {
      const previewBytes = await fetchBytes(previewUrl);
      permanentPreview = await supabaseUpload(`${id}.jpg`, previewBytes, 'image/jpeg');
    } catch (error) {
      console.warn('cast preview persistence failed:', error?.message || error);
    }
  }

  const anims = {
    presets: CAST_ANIMATIONS.map((value) => value.replace('preset:', '')),
    rig: 'tripo',
    version: RIG_VERSION,
  };
  const row = await saveCastRow({
    id,
    name: safeName(name),
    glb_url: glbUrl,
    preview_url: permanentPreview,
    anims,
  });

  return {
    id: row.id || id,
    name: row.name || safeName(name),
    glb_url: row.glb_url || glbUrl,
    preview_url: row.preview_url || permanentPreview,
    anims: row.anims || anims,
    created_at: row.created_at,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const apiKey = tripoKey();
  if (!apiKey) return json(res, 500, { error: 'TRIPO_API_KEY is not configured.' });

  const stage = String(req.query.stage || 'model');
  const id = String(req.query.id || '');
  const model = String(req.query.model || id);
  const name = safeName(req.query.name);
  if (!id) return json(res, 400, { error: 'Task id is required.' });

  try {
    const task = await getTask(apiKey, id);
    const failure = taskFailure(task, stage);
    if (failure === false) return json(res, 200, { done: false, stage, id, model });
    if (failure) return json(res, 502, { error: failure });

    if (stage === 'model') {
      const next = await startTask(apiKey, {
        type: 'animate_prerigcheck',
        original_model_task_id: model,
      });
      return json(res, 200, { done: false, stage: 'check', id: next, model });
    }

    if (stage === 'check') {
      const rigType = task.output?.rig_type || 'biped';
      const next = await startTask(apiKey, {
        type: 'animate_rig',
        original_model_task_id: model,
        out_format: 'glb',
        model_version: RIG_VERSION,
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
      const next = await startTask(apiKey, {
        type: 'animate_retarget',
        original_model_task_id: id,
        out_format: 'glb',
        animations: CAST_ANIMATIONS,
        bake_animation: true,
        export_with_geometry: true,
        animate_in_place: true,
      });
      return json(res, 200, { done: false, stage: 'anim', id: next, model });
    }

    if (stage === 'anim') {
      const cast = await finishCast(apiKey, model, task, name);
      return json(res, 200, { done: true, cast });
    }

    return json(res, 400, { error: `Unknown cast stage: ${stage}` });
  } catch (error) {
    console.error('cast-task:', error);
    return json(res, 502, { error: error?.message || 'Character pipeline failed.' });
  }
}
