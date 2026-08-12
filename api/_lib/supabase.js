// Supabase REST + Storage access. Service-role key only, never sent to the browser.
//
// Tables live in the shared "AnchorFrame AI Studio" project: bp_props, bp_scenes, bp_cast.
// RLS is on with no policies, so only the service-role key can read or write.

export const BUCKET = 'bull-props';

export function config() {
  return {
    url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

export function isConfigured() {
  const { url, key } = config();
  return Boolean(url && key);
}

function headers(extra = {}) {
  const { key } = config();
  return { Authorization: `Bearer ${key}`, apikey: key, ...extra };
}

function requireConfig() {
  const c = config();
  if (!c.url || !c.key) throw new Error('Supabase server configuration is missing.');
  return c;
}

export async function select(table, query = '') {
  const { url } = requireConfig();
  const r = await fetch(`${url}/rest/v1/${table}?${query}`, { headers: headers() });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.message || `Supabase read failed (${r.status}).`);
  return Array.isArray(data) ? data : [];
}

export async function insert(table, row, { upsert = false } = {}) {
  const { url } = requireConfig();
  const prefer = ['return=representation'];
  if (upsert) prefer.push('resolution=merge-duplicates');
  const r = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: prefer.join(',') }),
    body: JSON.stringify(row),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.message || `Supabase write failed (${r.status}).`);
  return Array.isArray(data) ? data[0] : (data || row);
}

export async function remove(table, query) {
  const { url } = requireConfig();
  const r = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d?.message || `Supabase delete failed (${r.status}).`);
  }
}

// Deletes one stored object. A missing object is not an error — the caller
// wants it gone, and it already is.
export async function removeObject(path) {
  const { url } = requireConfig();
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!r.ok && r.status !== 404) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || d.error || `Supabase asset delete failed (${r.status}).`);
  }
}

// Uploads to the public `bull-props` bucket and returns the public URL.
export async function upload(path, bytes, contentType) {
  const { url } = requireConfig();
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType, 'x-upsert': 'true' }),
    body: bytes,
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || d.error || `Supabase asset upload failed (${r.status}).`);
  }
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}
