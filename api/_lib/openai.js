// OpenAI image edits — optional background clean-up for cast photos, run
// before a photo goes to Tripo.
//
// Scoped to the background on purpose. Regenerating a real person's face is
// both a likeness risk (defeats the whole point of the multiview pipeline —
// the photo stops being *them*) and the kind of edit these APIs are built to
// refuse. Swapping only the backdrop stays clear of both problems and still
// fixes the actual cause of most mangled casts: Tripo pulling background
// clutter into the mesh alongside the person.
//
// This is a cosmetic step, never a gate — see maybeClean() in cast-generate.js,
// which falls back to the original photo on any failure here.

import { normalizeBase64 } from './http.js';

const API = 'https://api.openai.com/v1/images/edits';
export const MODEL = 'gpt-image-1';

const PROMPT = 'Replace only the background of this photo with a plain, evenly lit ' +
  'light-grey studio backdrop, edge to edge. Keep the person exactly as they appear — ' +
  'same face, pose, body, clothing and framing, completely unchanged. Do not add, ' +
  'remove, retouch or alter anything about the person.';

export function apiKey() {
  return process.env.OPENAI_API_KEY || '';
}

// Returns a cleaned base64 JPEG. Throws with OpenAI's own explanation kept
// intact — the same lesson as worldlabs.js parse(): a discarded rejection
// body just means guessing at the same failure twice.
export async function cleanBackground(base64) {
  const cleaned = normalizeBase64(base64);
  if (!cleaned) throw new Error('No image to clean.');

  const bytes = Buffer.from(cleaned, 'base64');
  const form = new FormData();
  form.append('model', MODEL);
  form.append('prompt', PROMPT);
  form.append('size', 'auto');
  form.append('image', new Blob([bytes], { type: 'image/jpeg' }), 'photo.jpg');

  const r = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  const raw = await r.text().catch(() => '');
  let d = {};
  try { d = raw ? JSON.parse(raw) : {}; } catch {}

  if (!r.ok) {
    console.error(`openai images/edits -> HTTP ${r.status}:`, raw.slice(0, 800));
    throw new Error(d.error?.message || `Background clean-up failed (${r.status}).`);
  }
  const out = d.data?.[0]?.b64_json;
  if (!out) throw new Error('Background clean-up returned no image.');
  return out;
}
