const TRIPO_API = 'https://api.tripo3d.ai/v2/openapi';
const MODEL_VERSION = 'P1-20260311';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getApiKey() {
  return process.env.TRIPO_API_KEY || process.env.TRIPO_KEY || '';
}

function normalizeBase64(value) {
  if (!value || typeof value !== 'string') return null;
  const comma = value.indexOf(',');
  return comma >= 0 ? value.slice(comma + 1) : value;
}

async function uploadImage(apiKey, base64, label) {
  const cleaned = normalizeBase64(base64);
  if (!cleaned) return null;

  let bytes;
  try {
    bytes = Buffer.from(cleaned, 'base64');
  } catch {
    throw new Error(`${label} image is not valid base64.`);
  }
  if (!bytes.length) throw new Error(`${label} image is empty.`);

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), `${label}.jpg`);

  const response = await fetch(`${TRIPO_API}/upload/sts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0 || !data.data?.image_token) {
    const message = data.message || data.suggestion || `Tripo upload failed (${response.status}).`;
    throw new Error(message);
  }
  return data.data.image_token;
}

async function startTask(apiKey, body) {
  const response = await fetch(`${TRIPO_API}/task`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0 || !data.data?.task_id) {
    const message = data.message || data.suggestion || `Tripo generation failed (${response.status}).`;
    throw new Error(message);
  }
  return data.data.task_id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const apiKey = getApiKey();
  if (!apiKey) return json(res, 500, { error: 'TRIPO_API_KEY is not configured.' });

  const payload = req.body || {};
  const views = payload.views && typeof payload.views === 'object' ? payload.views : null;
  const front = views?.front || payload.image_base64 || null;
  const left = views?.left || null;
  const back = views?.back || null;
  const right = views?.right || null;

  if (!front) return json(res, 400, { error: 'Front image is required.' });

  try {
    const suppliedCount = [front, left, back, right].filter(Boolean).length;

    if (suppliedCount === 1) {
      const frontToken = await uploadImage(apiKey, front, 'front');
      const taskId = await startTask(apiKey, {
        type: 'image_to_model',
        model_version: MODEL_VERSION,
        file: { type: 'jpg', file_token: frontToken },
        texture: true,
        pbr: true,
        face_limit: 10000,
      });
      return json(res, 200, { task_id: taskId, mode: 'single' });
    }

    const tokens = await Promise.all([
      uploadImage(apiKey, front, 'front'),
      uploadImage(apiKey, left, 'left'),
      uploadImage(apiKey, back, 'back'),
      uploadImage(apiKey, right, 'right'),
    ]);
    const files = tokens.map((token) => token ? ({ type: 'jpg', file_token: token }) : ({}));

    const taskId = await startTask(apiKey, {
      type: 'multiview_to_model',
      model_version: MODEL_VERSION,
      files,
      texture: true,
      pbr: true,
      face_limit: 10000,
    });

    return json(res, 200, {
      task_id: taskId,
      mode: 'multiview',
      views_used: ['front', 'left', 'back', 'right'].filter((_, i) => Boolean(tokens[i])),
    });
  } catch (error) {
    console.error('cast-generate:', error);
    return json(res, 502, { error: error?.message || 'Character generation could not be started.' });
  }
}
