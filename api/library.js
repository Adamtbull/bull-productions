import { json, methodNotAllowed } from './_lib/http.js';
import * as db from './_lib/supabase.js';

// Serves both /api/props-list and /api/cast-list via rewrites in vercel.json.
// One file instead of two because the plan allows 12 serverless functions per
// deployment and every slot counts. The public paths and response shapes are
// unchanged — the frontend has no idea this happened.
export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'GET')) return;

  const kind = String(req.query?.kind || '');
  const table = kind === 'props' ? 'bp_props' : kind === 'cast' ? 'bp_cast' : null;
  if (!table) return json(res, 400, { error: 'kind must be props or cast.' });

  if (!db.isConfigured()) return json(res, 200, { cloud: false, [kind]: [] });

  try {
    const rows = await db.select(table, 'select=*&order=created_at.desc');
    return json(res, 200, { cloud: true, [kind]: rows });
  } catch (error) {
    console.error(`${kind}-list:`, error);
    return json(res, 502, { error: error?.message || `The ${kind} library could not be loaded.` });
  }
}
