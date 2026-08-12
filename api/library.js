import { json, methodNotAllowed } from './_lib/http.js';
import * as db from './_lib/supabase.js';

// Serves both /api/props-list and /api/cast-list via rewrites in vercel.json.
// One file instead of two because the plan allows 12 serverless functions per
// deployment and every slot counts. The public paths and response shapes are
// unchanged — the frontend has no idea this happened.
export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'DELETE'])) return;

  const kind = String(req.query?.kind || '');
  const table = kind === 'props' ? 'bp_props' : kind === 'cast' ? 'bp_cast' : null;
  if (!table) return json(res, 400, { error: 'kind must be props or cast.' });

  // DELETE lives here rather than in its own file because the plan caps the
  // deployment at 12 functions and this is already the library route.
  if (req.method === 'DELETE') {
    const id = String(req.query?.id || '').trim();
    if (!id) return json(res, 400, { error: 'An id is required.' });
    // Ids are minted server-side as `${kind}_${uuid}`. Anything else is refused
    // rather than allowed to reach into storage paths.
    if (!/^(prop|cast)_[a-z0-9-]{6,64}$/i.test(id)) {
      return json(res, 400, { error: 'That id is not one of ours.' });
    }
    if (!db.isConfigured()) return json(res, 200, { cloud: false, deleted: id });

    try {
      // Assets before the row: a leftover row is visible and can be deleted
      // again, whereas an orphaned file in storage is invisible and pays rent
      // forever.
      for (const path of [`${id}.glb`, `${id}.jpg`]) await db.removeObject(path);
      await db.remove(table, `id=eq.${encodeURIComponent(id)}`);
      return json(res, 200, { cloud: true, deleted: id });
    } catch (error) {
      console.error(`${kind} delete:`, error);
      return json(res, 502, {
        error: error?.message || `That ${kind === 'cast' ? 'character' : 'prop'} could not be deleted.`,
      });
    }
  }

  if (!db.isConfigured()) return json(res, 200, { cloud: false, [kind]: [] });

  try {
    const rows = await db.select(table, 'select=*&order=created_at.desc');
    return json(res, 200, { cloud: true, [kind]: rows });
  } catch (error) {
    console.error(`${kind}-list:`, error);
    return json(res, 502, { error: error?.message || `The ${kind} library could not be loaded.` });
  }
}
