import { json, methodNotAllowed } from './_lib/http.js';
import * as wl from './_lib/worldlabs.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'GET')) return;
  if (!wl.apiKey()) return json(res, 500, { error: 'WORLDLABS_API_KEY is not configured.' });

  try {
    return json(res, 200, { worlds: await wl.listWorlds() });
  } catch (error) {
    console.error('worlds:', error);
    return json(res, 502, { error: error?.message || 'The Backlot could not be loaded.' });
  }
}
