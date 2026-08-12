// Tripo v2 access. Props and the character body use image_to_model /
// multiview_to_model; the character rig pipeline uses the animate_* task types,
// all through the same /v2/openapi/task endpoint.

import { normalizeBase64 } from './http.js';

export const TRIPO_API = 'https://api.tripo3d.ai/v2/openapi';

// Bumping these is the single place to change which Tripo models are used.
export const MODEL_VERSION = 'P1-20260311';
export const RIG_VERSION = 'v2.5-20260210';

// idle + walk are what the live app shipped. hurt/fall/run are additions that
// give the Director something to work with for reactions.
export const CAST_ANIMATIONS = ['preset:idle', 'preset:walk', 'preset:run', 'preset:hurt', 'preset:fall'];

// --- Cast quality profile -------------------------------------------------
//
// Characters get shot in close-up; props sit in the background. So cast builds
// run at a higher tier than props rather than sharing one setting.
//
// Everything here is env-overridable because tripo3d.ai's docs and API are both
// unreachable from the build environment, so the exact spelling of the newest
// HD tier could not be confirmed by reading. Rather than guess in code and
// hard-fail a build the user has waited minutes for, unverified fields are
// declared optional: startTask logs Tripo's full rejection body (which names
// the offending field and usually lists what it will accept) and retries once
// without it. The first real build therefore answers the question in the logs,
// at the cost of one validation round-trip rather than credits.
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

export function castQuality() {
  const q = {
    texture: true,
    pbr: true,
    // Props run 10k. Characters carry the close-ups, so they get the budget.
    face_limit: num(process.env.TRIPO_CAST_FACE_LIMIT, 60000),
    texture_quality: process.env.TRIPO_CAST_TEXTURE_QUALITY || 'detailed',
  };
  // Quad topology is for taking a model into Blender to retopologise by hand.
  // It is NOT what Tripo's own rigging needs — animate_rig works from the
  // standard mesh, and glTF has no quad primitive, so a GLB gets triangulated
  // on export anyway. Left off by default so it cannot break the rig -> anim
  // stages that produce the idle/walk/run/hurt/fall clips.
  if (process.env.TRIPO_CAST_QUAD === '1') q.quad = true;
  return q;
}

// Fields whose exact names/values could not be verified against the live docs.
// A rejection naming one of these costs a retry, not the build.
export const CAST_OPTIONAL_KEYS = ['texture_quality', 'quad', 'model_version'];

export function castModelVersion() {
  return process.env.TRIPO_CAST_MODEL_VERSION || MODEL_VERSION;
}

export function apiKey() {
  return process.env.TRIPO_API_KEY || process.env.TRIPO_KEY || '';
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${apiKey()}`, ...extra };
}

// Uploads a base64 JPEG and returns Tripo's image token, or null when absent.
export async function uploadImage(base64, label) {
  const cleaned = normalizeBase64(base64);
  if (!cleaned) return null;

  let bytes;
  try {
    bytes = Buffer.from(cleaned, 'base64');
  } catch {
    throw new Error(`${label} image is not valid base64.`);
  }
  if (!bytes.length) throw new Error(`${label} image is empty.`);

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), `${label}.jpg`);

  const r = await fetch(`${TRIPO_API}/upload/sts`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.code !== 0 || !d.data?.image_token) {
    throw new Error(d.message || d.suggestion || `Tripo upload failed (${r.status}).`);
  }
  return d.data.image_token;
}

async function postTask(payload) {
  const r = await fetch(`${TRIPO_API}/task`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const raw = await r.text().catch(() => '');
  let d = {};
  try { d = raw ? JSON.parse(raw) : {}; } catch {}
  if (!r.ok || d.code !== 0 || !d.data?.task_id) {
    // Keep the whole body. This is how the retired rig-version outage
    // announced itself — the message named the bad value AND listed the
    // allowed ones — and with the docs unreachable it is the only current
    // description of this API available.
    console.error(`tripo task ${payload.type} -> HTTP ${r.status}:`, raw.slice(0, 1200));
    const err = new Error(d.message || d.suggestion || `Tripo task start failed (${r.status}).`);
    err.status = r.status;
    err.body = raw;
    throw err;
  }
  return d.data.task_id;
}

// Auth and funding problems must never be retried — dropping a quality field
// will not fix them, and a silent retry just doubles the confusion.
function isParamComplaint(error) {
  if (error.status === 401 || error.status === 403) return false;
  const text = `${error.message || ''} ${error.body || ''}`.toLowerCase();
  if (/balance|credit|insufficient|quota|unauthor|forbidden|expired/.test(text)) return false;
  return /invalid|unsupported|unknown|not support|unrecogni|param|version|field/.test(text);
}

// optionalKeys are fields we are not certain this account's Tripo tier accepts.
// On a parameter complaint they are dropped and the task retried once, so an
// unverified quality setting degrades the model instead of failing the build.
export async function startTask(payload, optionalKeys = [], onDegrade) {
  try {
    return await postTask(payload);
  } catch (error) {
    const droppable = optionalKeys.filter((k) => k in payload);
    if (!droppable.length || !isParamComplaint(error)) throw error;

    const retry = { ...payload };
    for (const k of droppable) delete retry[k];
    console.warn(
      `tripo: ${payload.type} rejected — retrying without ${droppable.join(', ')}. ` +
      `Tripo said: ${error.message}`);
    const taskId = await postTask(retry);
    console.warn(`tripo: retry succeeded without ${droppable.join(', ')} — quality reduced for this build.`);
    // A silent quality drop is worse than a slow build: tell the caller so the
    // user finds out from the app, not from a server log they cannot read.
    if (typeof onDegrade === 'function') onDegrade(droppable, error.message);
    return taskId;
  }
}

export async function getTask(taskId) {
  const r = await fetch(`${TRIPO_API}/task/${encodeURIComponent(taskId)}`, {
    headers: authHeaders(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.code !== 0 || !d.data) {
    throw new Error(d.message || d.suggestion || `Tripo task lookup failed (${r.status}).`);
  }
  return d.data;
}

// null = finished cleanly, false = still working, string = failure message.
export function taskFailure(task, label) {
  if (task.status === 'success') return null;
  if (task.status === 'queued' || task.status === 'running') return false;
  return `${label} failed (${task.status || 'unknown'}).`;
}

export function modelUrlOf(task) {
  return task.output?.model || task.output?.pbr_model || task.output?.base_model || null;
}

export function previewUrlOf(task) {
  return task.output?.rendered_image || task.output?.generated_image || null;
}
