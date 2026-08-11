import { json, methodNotAllowed } from './_lib/http.js';

// Byte relay, used only when a direct browser fetch of an asset fails (CORS or a
// expired signed URL). Vercel responses are capped, so anything oversized is
// refused with the `too_large` sentinel the frontend knows how to explain.
const MAX_BYTES = 30 * 1024 * 1024;

// This endpoint takes a URL from the client, so without a host allowlist it
// would be an open proxy — a request forgery tool pointed at anything reachable
// from the serverless function, including cloud metadata endpoints. Only the
// asset hosts this app actually generates from are relayed.
const ALLOWED_HOST_SUFFIXES = [
  'tripo3d.ai',
  'tripo-data.cdn.bcebos.com',
  'tripo-data.rgl.bcebos.com',
  'supabase.co',
  'supabase.in',
  'worldlabs.ai',
  'amazonaws.com',
];

function allowed(parsed) {
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'GET')) return;

  const raw = String(req.query?.u || '');
  if (!raw) return json(res, 400, { error: 'Asset URL is required.' });

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return json(res, 400, { error: 'That asset URL is not valid.' });
  }
  if (!allowed(parsed)) {
    return json(res, 403, { error: 'That asset host is not allowed.' });
  }

  try {
    const upstream = await fetch(parsed.toString());
    if (!upstream.ok) return json(res, 502, { error: `Couldn't download the prop (${upstream.status}).` });

    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared && declared > MAX_BYTES) return json(res, 413, { error: 'too_large' });

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) return json(res, 413, { error: 'too_large' });

    res.statusCode = 200;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(buf);
  } catch (error) {
    console.error('props-proxy:', error);
    return json(res, 502, { error: 'Relaying that asset failed.' });
  }
}
