import Anthropic from '@anthropic-ai/sdk';
import { json, methodNotAllowed, readBody } from './_lib/http.js';

// The Director box: plain-language instruction in, scheduled choreography out.
//
// claude-haiku-4-5 is deliberate — this is a small structured-extraction task on
// the user's critical path (they're waiting for the scene to move), and it's what
// the live app used. Thinking and effort are both omitted: Haiku 4.5 predates
// adaptive thinking, and `effort` errors on it.
const MODEL = 'claude-haiku-4-5';

const MOTIONS = ['none', 'hover', 'bob', 'spin', 'orbit'];
const ENTRANCES = ['fade', 'rise', 'pop', 'sparkle'];

// Structured outputs guarantee the response parses and matches this shape, so
// there's no "reply with only JSON" prompting and no salvage parsing.
// Every field is required — the frontend reads only the ones each verb uses, and
// requiring them all keeps the schema flat instead of a per-verb anyOf.
const SCHEMA = {
  type: 'object',
  properties: {
    say: {
      type: 'string',
      description: 'One short line confirming the direction, in a film-set voice.',
    },
    commands: {
      type: 'array',
      description: 'Choreography steps, in the order they should be scheduled.',
      items: {
        type: 'object',
        properties: {
          verb: { type: 'string', enum: ['moveto', 'motion', 'appear', 'vanish', 'turn'] },
          target: { type: 'string', description: 'The iid of the item this acts on.' },
          start: { type: 'number', description: 'Seconds from now to begin.' },
          dur: { type: 'number', description: 'Seconds the action takes (0.2 to 20).' },
          x: { type: 'number', description: 'Destination x for moveto; 0 otherwise.' },
          z: { type: 'number', description: 'Destination z for moveto; 0 otherwise.' },
          type: {
            type: 'string',
            description: 'Motion type for motion, entrance type for appear; "none" otherwise.',
            enum: [...new Set([...MOTIONS, ...ENTRANCES])],
          },
          speed: { type: 'number', description: 'Motion speed for motion (0.25 to 3); 1 otherwise.' },
        },
        required: ['verb', 'target', 'start', 'dur', 'x', 'z', 'type', 'speed'],
        additionalProperties: false,
      },
    },
  },
  required: ['say', 'commands'],
  additionalProperties: false,
};

function systemPrompt(items, cam) {
  const roster = items.length
    ? items.map((i) => `- ${i.iid}: "${i.name}" (${i.kind}) at x=${i.x}, z=${i.z}`).join('\n')
    : '- (the set is empty)';

  return `You are the director of a small 3D stage. Turn the user's instruction into
choreography for the items below.

Items on set (refer to them ONLY by their iid):
${roster}

The camera is at x=${cam.x}, z=${cam.z}. The floor is a flat plane; x and z are metres,
and items are typically within about 8 metres of the origin.

Verbs:
- moveto  - travel to x,z over dur seconds. Cast members turn to face the way they walk.
- motion  - set an ongoing motion: ${MOTIONS.join(', ')}. speed 0.25 to 3.
- appear  - materialise with an entrance: ${ENTRANCES.join(', ')}.
- vanish  - fade out.
- turn    - rotate on the spot.

Rules:
- target must be one of the iids above. Never invent an iid; if the instruction names
  something that is not on set, leave it out rather than guessing.
- Use start to stagger the action so it reads as a sequence, not everything at once.
- Keep dur between 0.2 and 20 seconds.
- Fill unused fields with harmless defaults: x and z as 0, type as "none", speed as 1.
- If the instruction does not call for any change, return an empty commands list and
  say so in "say".

"say" is one short line, in the voice of a director calling a shot.`;
}

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, 'POST')) return;
  if (!process.env.ANTHROPIC_API_KEY) {
    return json(res, 500, { error: 'ANTHROPIC_API_KEY is not configured.' });
  }

  const body = readBody(req);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return json(res, 400, { error: 'Tell the director what you want.' });

  const items = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  const cam = body.cam && typeof body.cam === 'object' ? body.cam : { x: 0, z: 0 };

  if (!items.length) {
    return json(res, 200, { commands: [], say: 'Nothing on set to direct yet.' });
  }

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt(items, { x: Number(cam.x) || 0, z: Number(cam.z) || 0 }),
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    });

    if (message.stop_reason === 'max_tokens') {
      return json(res, 502, { error: 'That direction was too involved. Try a simpler one.' });
    }

    const text = message.content.find((b) => b.type === 'text')?.text;
    if (!text) return json(res, 502, { error: 'The director had nothing to say.' });

    // Guaranteed to parse and match SCHEMA, but the frontend clamps every value
    // anyway, so a surprising number degrades to a default rather than breaking.
    const parsed = JSON.parse(text);
    const known = new Set(items.map((i) => i.iid));

    return json(res, 200, {
      commands: (parsed.commands || []).filter((c) => known.has(c.target)),
      say: parsed.say || 'Rolling.',
    });
  } catch (error) {
    console.error('direct:', error);
    if (error instanceof Anthropic.RateLimitError) {
      return json(res, 429, { error: 'The director is busy. Try again in a moment.' });
    }
    return json(res, 502, { error: error?.message || 'The director could not read that.' });
  }
}
