// World Labs Marble access.
//
// NOTE: docs.worldlabs.ai was unreachable from the environment this was written
// in, so the exact response field names could not be confirmed against the spec.
// Everything here is therefore written defensively: requests use the documented
// endpoint and header from the project brief, and responses are normalised from
// several plausible field spellings into the single shape the frontend needs
// (see docs/API_CONTRACT.md). If a field arrives under an unexpected name the
// normaliser returns null for it rather than throwing, so a rename degrades one
// feature instead of breaking generation.

const API = 'https://api.worldlabs.ai/marble/v1';

// Draft is ~$0.18 a go, full is ~$1.26. The frontend sends the id directly.
export const DRAFT_MODEL = 'marble-1.0-draft';
export const FULL_MODEL = 'marble-1.1';

export function apiKey() {
  return process.env.WORLDLABS_API_KEY || process.env.WORLD_LABS_API_KEY || '';
}

function headers(extra = {}) {
  return { 'WLT-Api-Key': apiKey(), ...extra };
}

function pick(obj, ...names) {
  if (!obj || typeof obj !== 'object') return null;
  for (const n of names) {
    const v = obj[n];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

async function parse(r) {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const message = pick(d, 'message') || pick(d.error || {}, 'message') || `World Labs request failed (${r.status}).`;
    const err = new Error(message);
    err.status = r.status;
    throw err;
  }
  return d;
}

// Operations may come back as "operations/abc123" or a bare id.
export function operationIdOf(value) {
  const raw = typeof value === 'string' ? value : (pick(value, 'operation_id', 'name', 'id') || '');
  return String(raw).replace(/^operations\//, '');
}

export async function generate({ textPrompt, imageBase64, model, autoEnhance, displayName }) {
  const body = { model };
  if (textPrompt) body.text_prompt = textPrompt;
  if (imageBase64) body.image_base64 = imageBase64;
  if (displayName) body.display_name = displayName;
  if (autoEnhance !== undefined) body.auto_enhance = Boolean(autoEnhance);

  const r = await fetch(`${API}/worlds:generate`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const d = await parse(r);
  const id = operationIdOf(pick(d, 'operation_id', 'name', 'id') || d);
  if (!id) throw new Error('World Labs did not return an operation id.');
  return id;
}

export async function getOperation(operationId) {
  const id = operationIdOf(operationId);
  const r = await fetch(`${API}/operations/${encodeURIComponent(id)}`, { headers: headers() });
  return parse(r);
}

export async function listWorlds() {
  const r = await fetch(`${API}/worlds`, { headers: headers() });
  const d = await parse(r);
  const raw = pick(d, 'worlds', 'items', 'results') || (Array.isArray(d) ? d : []);
  return (Array.isArray(raw) ? raw : []).map(normalizeWorld).filter(Boolean);
}

// Splats arrive keyed by resolution. The frontend's Fast/Full toggle just needs
// a low and a high entry, so collapse whatever shape arrives into that.
function normalizeSplats(source) {
  const splats = pick(source, 'splats', 'splat_urls', 'gaussians');
  if (!splats) return null;

  if (Array.isArray(splats)) {
    const byRes = {};
    for (const s of splats) {
      const url = typeof s === 'string' ? s : pick(s, 'url', 'uri', 'download_url');
      if (!url) continue;
      const label = (typeof s === 'object' && pick(s, 'resolution', 'quality', 'name')) || `r${Object.keys(byRes).length}`;
      byRes[String(label)] = url;
    }
    return Object.keys(byRes).length ? byRes : null;
  }
  return typeof splats === 'object' ? splats : null;
}

export function normalizeWorld(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const source = pick(raw, 'world', 'result') || raw;
  const worldId = pick(source, 'world_id', 'id', 'name');
  if (!worldId) return null;

  return {
    world_id: String(worldId).replace(/^worlds\//, ''),
    display_name: pick(source, 'display_name', 'title', 'name') || 'Untitled set',
    caption: pick(source, 'caption', 'description', 'text_prompt') || '',
    thumbnail_url: pick(source, 'thumbnail_url', 'thumbnail', 'preview_url', 'image_url'),
    splats: normalizeSplats(source),
    collider_url: pick(source, 'collider_url', 'collider', 'collision_mesh_url', 'mesh_url'),
    floor_y: pick(source, 'floor_y', 'ground_y', 'ground_plane_y'),
  };
}

// Google-style long-running operations: done, plus either error or response.
export function normalizeOperation(d) {
  const done = Boolean(pick(d, 'done') ?? false);
  if (!done) return { done: false };

  const error = pick(d, 'error');
  if (error) {
    return { done: true, error: (typeof error === 'string' ? error : pick(error, 'message')) || 'Generation failed.' };
  }

  const world = normalizeWorld(pick(d, 'response', 'result', 'world') || d);
  if (!world) return { done: true, error: 'Generation finished but no world was returned.' };
  return { done: true, world };
}
