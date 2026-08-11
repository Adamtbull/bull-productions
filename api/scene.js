import { json, methodNotAllowed, readBody } from './_lib/http.js';
import * as db from './_lib/supabase.js';

// One saved dressing per world, upserted on bp_scenes.world_id. The frontend
// writes here debounced and fire-and-forget, and always keeps a localStorage
// copy, so a missing scene must read as "nothing saved" rather than an error.
export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;
  if (!db.isConfigured()) return json(res, 200, { cloud: false, scene: null });

  if (req.method === 'GET') {
    const worldId = String(req.query?.world_id || '').trim();
    if (!worldId) return json(res, 400, { error: 'world_id is required.' });

    try {
      const rows = await db.select(
        'bp_scenes',
        `select=*&world_id=eq.${encodeURIComponent(worldId)}&limit=1`,
      );
      return json(res, 200, { cloud: true, scene: rows[0] || null });
    } catch (error) {
      console.error('scene read:', error);
      return json(res, 502, { error: error?.message || 'That set dressing could not be loaded.' });
    }
  }

  const body = readBody(req);
  const worldId = String(body.world_id || '').trim();
  if (!worldId) return json(res, 400, { error: 'world_id is required.' });

  try {
    const scene = await db.insert(
      'bp_scenes',
      {
        world_id: worldId,
        floor_y: typeof body.floor_y === 'number' ? body.floor_y : null,
        items: Array.isArray(body.items) ? body.items : [],
        updated_at: new Date().toISOString(),
      },
      { upsert: true },
    );
    return json(res, 200, { cloud: true, scene });
  } catch (error) {
    console.error('scene write:', error);
    return json(res, 502, { error: error?.message || 'That set dressing could not be saved.' });
  }
}
