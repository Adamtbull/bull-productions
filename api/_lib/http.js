// Shared HTTP helpers for the Bull Productions serverless routes.

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// Returns true when the request has already been answered with a 405.
export function methodNotAllowed(req, res, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (list.includes(req.method)) return false;
  res.setHeader('Allow', list.join(', '));
  json(res, 405, { error: 'Method not allowed.' });
  return true;
}

// Vercel parses JSON bodies for us, but be tolerant of a raw string body.
export function readBody(req) {
  const body = req.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return typeof body === 'object' ? body : {};
}

// Accepts either a bare base64 payload or a full `data:image/jpeg;base64,...` URI.
export function normalizeBase64(value) {
  if (!value || typeof value !== 'string') return null;
  const comma = value.indexOf(',');
  const cleaned = comma >= 0 ? value.slice(comma + 1) : value;
  return cleaned.trim() || null;
}

export function safeName(value, fallback = 'Item') {
  const v = String(value ?? '').trim().slice(0, 80);
  return v || fallback;
}

export async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Downloading generated asset failed (${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}
