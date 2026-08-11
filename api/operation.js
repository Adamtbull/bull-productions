import { json, methodNotAllowed } from './_lib/http.js';
import * as wl from './_lib/worldlabs.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'GET')) return;
  if (!wl.apiKey()) return json(res, 500, { error: 'WORLDLABS_API_KEY is not configured.' });

  const id = String(req.query?.id || '').trim();
  if (!id) return json(res, 400, { error: 'Operation id is required.' });

  try {
    const raw = await wl.getOperation(id);
    return json(res, 200, wl.normalizeOperation(raw));
  } catch (error) {
    console.error('operation:', error);
    const status = error?.status === 402 ? 402 : 502;
    return json(res, status, { error: error?.message || 'Lost track of that build.' });
  }
}
