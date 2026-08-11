import { json, methodNotAllowed, readBody } from './_lib/http.js';
import * as tripo from './_lib/tripo.js';

// Front-only keeps the original single-image path so existing behaviour is
// unchanged. Two or more views switch to Tripo's multiview generation, which
// gives a noticeably better likeness. Response key stays `task_id` either way so
// the cast-task pipeline continues unchanged.
export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'POST')) return;
  if (!tripo.apiKey()) return json(res, 500, { error: 'TRIPO_API_KEY is not configured.' });

  const body = readBody(req);
  const views = body.views && typeof body.views === 'object' ? body.views : null;
  const front = views?.front || body.image_base64 || null;
  const left = views?.left || null;
  const back = views?.back || null;
  const right = views?.right || null;

  if (!front) return json(res, 400, { error: 'A front-on photo is required.' });

  try {
    const supplied = [front, left, back, right].filter(Boolean).length;

    if (supplied === 1) {
      const token = await tripo.uploadImage(front, 'front');
      const taskId = await tripo.startTask({
        type: 'image_to_model',
        model_version: tripo.MODEL_VERSION,
        file: { type: 'jpg', file_token: token },
        texture: true,
        pbr: true,
        face_limit: 10000,
      });
      return json(res, 200, { task_id: taskId, mode: 'single' });
    }

    // Tripo expects exactly four ordered slots; missing views are sent as {}.
    const tokens = await Promise.all([
      tripo.uploadImage(front, 'front'),
      tripo.uploadImage(left, 'left'),
      tripo.uploadImage(back, 'back'),
      tripo.uploadImage(right, 'right'),
    ]);

    const taskId = await tripo.startTask({
      type: 'multiview_to_model',
      model_version: tripo.MODEL_VERSION,
      files: tokens.map((t) => (t ? { type: 'jpg', file_token: t } : {})),
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
    return json(res, 502, { error: error?.message || 'That character could not be started.' });
  }
}
