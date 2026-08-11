import { json, methodNotAllowed } from './_lib/http.js';
import * as db from './_lib/supabase.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'GET')) return;

  // The frontend ignores the payload unless cloud is true, so an unconfigured
  // Supabase degrades to a local-only library rather than an error.
  if (!db.isConfigured()) return json(res, 200, { cloud: false, props: [] });

  try {
    const props = await db.select('bp_props', 'select=*&order=created_at.desc');
    return json(res, 200, { cloud: true, props });
  } catch (error) {
    console.error('props-list:', error);
    return json(res, 502, { error: error?.message || 'The prop library could not be loaded.' });
  }
}
