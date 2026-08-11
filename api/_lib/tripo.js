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

export async function startTask(payload) {
  const r = await fetch(`${TRIPO_API}/task`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.code !== 0 || !d.data?.task_id) {
    throw new Error(d.message || d.suggestion || `Tripo task start failed (${r.status}).`);
  }
  return d.data.task_id;
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
