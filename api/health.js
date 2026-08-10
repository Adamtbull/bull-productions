function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const checks = {
    tripo: Boolean(process.env.TRIPO_API_KEY || process.env.TRIPO_KEY),
    world_labs: Boolean(process.env.WORLD_LABS_API_KEY),
    supabase_url: Boolean(process.env.SUPABASE_URL),
    supabase_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  const ready = Object.values(checks).every(Boolean);
  return json(res, ready ? 200 : 503, { ready, checks });
}
