function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed.' });
  }
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return json(res, 200, { cloud: false, cast: [] });

  try {
    const r = await fetch(`${url}/rest/v1/bp_cast?select=*&order=created_at.desc`, {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    });
    const data = await r.json().catch(() => []);
    if (!r.ok) throw new Error(data?.message || `Supabase read failed (${r.status}).`);
    return json(res, 200, { cloud: true, cast: Array.isArray(data) ? data : [] });
  } catch (error) {
    console.error('cast-list:', error);
    return json(res, 502, { error: error?.message || 'Cast library could not be loaded.' });
  }
}
