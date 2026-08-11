import { json, methodNotAllowed, readBody } from './_lib/http.js';
import * as tripo from './_lib/tripo.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'POST')) return;
  if (!tripo.apiKey()) return json(res, 500, { error: 'TRIPO_API_KEY is not configured.' });

  const body = readBody(req);
  if (!body.image_base64) return json(res, 400, { error: 'A photo of the object is required.' });

  try {
    const token = await tripo.uploadImage(body.image_base64, 'prop');
    const taskId = await tripo.startTask({
      type: 'image_to_model',
      model_version: tripo.MODEL_VERSION,
      file: { type: 'jpg', file_token: token },
      texture: true,
      pbr: true,
      face_limit: 10000,
    });
    return json(res, 200, { task_id: taskId });
  } catch (error) {
    console.error('props-generate:', error);
    return json(res, 502, { error: error?.message || 'That prop could not be started.' });
  }
}
