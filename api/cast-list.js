import { json, methodNotAllowed } from './_lib/http.js';
import * as db from './_lib/supabase.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'GET')) return;
  if (!db.isConfigured()) return json(res, 200, { cloud: false, cast: [] });

  try {
    const cast = await db.select('bp_cast', 'select=*&order=created_at.desc');
    return json(res, 200, { cloud: true, cast });
  } catch (error) {
    console.error('cast-list:', error);
    return json(res, 502, { error: error?.message || 'The cast library could not be loaded.' });
  }
}
