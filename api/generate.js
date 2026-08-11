import { json, methodNotAllowed, readBody, normalizeBase64, safeName } from './_lib/http.js';
import * as wl from './_lib/worldlabs.js';

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'POST')) return;
  if (!wl.apiKey()) return json(res, 500, { error: 'WORLDLABS_API_KEY is not configured.' });

  const body = readBody(req);
  const textPrompt = typeof body.text_prompt === 'string' ? body.text_prompt.trim() : '';
  const imageBase64 = normalizeBase64(body.image_base64);

  if (!textPrompt && !imageBase64) {
    return json(res, 400, { error: 'Add a photo or describe the set you want.' });
  }

  const model = body.model === wl.FULL_MODEL ? wl.FULL_MODEL : wl.DRAFT_MODEL;

  try {
    const operationId = await wl.generate({
      textPrompt: textPrompt || null,
      imageBase64,
      model,
      autoEnhance: body.auto_enhance,
      displayName: body.display_name ? safeName(body.display_name, 'Untitled set') : null,
    });
    return json(res, 200, { operation_id: operationId });
  } catch (error) {
    console.error('generate:', error);
    // 402 is surfaced by the frontend as the "out of World Labs credits" message.
    const status = error?.status === 402 ? 402 : 502;
    return json(res, status, { error: error?.message || 'The studio could not start that build.' });
  }
}
