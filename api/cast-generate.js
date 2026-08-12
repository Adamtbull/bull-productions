import { json, methodNotAllowed, readBody } from './_lib/http.js';
import * as tripo from './_lib/tripo.js';
import * as openai from './_lib/openai.js';

// Front-only keeps the original single-image path so existing behaviour is
// unchanged. Two or more views switch to Tripo's multiview generation, which
// gives a noticeably better likeness. Response key stays `task_id` either way so
// the cast-task pipeline continues unchanged.

// Optional background clean-up (OpenAI gpt-image-1) runs first, on whichever
// views were supplied. It never touches the subject — see _lib/openai.js —
// and any failure just keeps that view's original photo rather than blocking
// the build: this is a cosmetic step, not a requirement, so a missing key or
// a refused edit degrades to "built with your original photos" instead of an
// error.
async function maybeClean(views, wantClean) {
  if (!wantClean) return { views, warn: null };
  if (!openai.apiKey()) {
    return { views, warn: 'Background clean-up needs OPENAI_API_KEY — built with your original photos instead.' };
  }

  const keys = Object.keys(views);
  let failed = 0;
  const cleaned = await Promise.all(keys.map(async (k) => {
    const src = views[k];
    if (!src) return src;
    try {
      return await openai.cleanBackground(src);
    } catch (error) {
      console.warn(`cast-generate: background clean-up failed for ${k}:`, error?.message || error);
      failed++;
      return src;
    }
  }));

  const next = {};
  keys.forEach((k, i) => { next[k] = cleaned[i]; });
  const supplied = keys.filter((k) => views[k]).length;
  const warn = failed ? `Background clean-up didn't work for ${failed} of ${supplied} photo${supplied === 1 ? '' : 's'} — used the original${failed === 1 ? '' : 's'} for those.` : null;
  return { views: next, warn };
}

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'POST')) return;
  if (!tripo.apiKey()) return json(res, 500, { error: 'TRIPO_API_KEY is not configured.' });

  const body = readBody(req);
  const rawViews = body.views && typeof body.views === 'object' ? body.views : null;
  const front = rawViews?.front || body.image_base64 || null;
  const left = rawViews?.left || null;
  const back = rawViews?.back || null;
  const right = rawViews?.right || null;

  if (!front) return json(res, 400, { error: 'A front-on photo is required.' });

  try {
    const { views, warn } = await maybeClean({ front, left, back, right }, Boolean(body.clean_background));
    const supplied = [views.front, views.left, views.back, views.right].filter(Boolean).length;

    // Cast run at the close-up tier — see castQuality() in _lib/tripo.js.
    const quality = tripo.castQuality();
    const notes = warn ? [warn] : [];
    const onDegrade = (adjustments) => {
      notes.push(`Tripo trimmed the settings for this build: ${adjustments.join('; ')}.`);
    };

    if (supplied === 1) {
      const token = await tripo.uploadImage(views.front, 'front');
      const taskId = await tripo.startTask({
        type: 'image_to_model',
        model_version: tripo.castModelVersion(),
        file: { type: 'jpg', file_token: token },
        ...quality,
      }, tripo.CAST_OPTIONAL_KEYS, onDegrade);
      return json(res, 200, { task_id: taskId, mode: 'single', warn: notes.join(' ') || null });
    }

    // Tripo expects exactly four ordered slots; missing views are sent as {}.
    const tokens = await Promise.all([
      tripo.uploadImage(views.front, 'front'),
      tripo.uploadImage(views.left, 'left'),
      tripo.uploadImage(views.back, 'back'),
      tripo.uploadImage(views.right, 'right'),
    ]);

    const taskId = await tripo.startTask({
      type: 'multiview_to_model',
      model_version: tripo.castModelVersion(),
      files: tokens.map((t) => (t ? { type: 'jpg', file_token: t } : {})),
      ...quality,
    }, tripo.CAST_OPTIONAL_KEYS, onDegrade);

    return json(res, 200, {
      task_id: taskId,
      mode: 'multiview',
      views_used: ['front', 'left', 'back', 'right'].filter((_, i) => Boolean(tokens[i])),
      warn: notes.join(' ') || null,
    });
  } catch (error) {
    console.error('cast-generate:', error);
    return json(res, 502, { error: error?.message || 'That character could not be started.' });
  }
}
