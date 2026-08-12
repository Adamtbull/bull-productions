import Anthropic from '@anthropic-ai/sdk';
import { json, methodNotAllowed, readBody, safeName } from './_lib/http.js';
import * as db from './_lib/supabase.js';

// The writers' room. A show carries a premise, a tone and a default look; the
// AI writer reads the whole run so far and pitches the next episode — recap,
// beats staged on the sets and cast that actually exist, and a cliffhanger.
//
// One route with actions rather than a file per verb: Vercel counts one
// function per api/*.js file and the plan's budget is worth conserving.

const MODEL = 'claude-sonnet-4-6';

const TONES = {
  'comedy': 'Broad comedy. Physical gags, escalating chaos, running jokes that pay off across episodes.',
  'action-comedy': 'Action comedy. Real stakes played fast and funny — every fight has a joke in it, every joke has a consequence.',
  'anime saga': 'Shonen anime saga. Power levels, rivalries, training arcs, dramatic declarations, one genuinely emotional beat per episode.',
  'clay deathmatch': 'Claymation deathmatch. Absurd celebrity-style grudge fights, over-the-top finishing moves, deadpan commentary energy.',
  'sitcom': 'Sitcom. A small cast in recurring locations, misunderstandings that snowball, a status quo that resets but relationships that grow.',
  'drama': 'Drama with dry humour. Character-driven, secrets and consequences, tension that carries across episodes.',
};

const PITCH_SCHEMA = {
  type: 'object',
  properties: {
    recap: {
      type: 'string',
      description: 'One or two sentences of "Previously on…" covering only what this episode needs. Empty string for a pilot.',
    },
    title: { type: 'string', description: 'The episode title. Punchy, no episode number in it.' },
    logline: { type: 'string', description: 'One sentence selling the episode.' },
    beats: {
      type: 'array',
      description: '3 to 5 story beats in order.',
      items: {
        type: 'object',
        properties: {
          set: { type: 'string', description: 'Where it plays. Use one of the available sets when one fits.' },
          action: {
            type: 'string',
            description: 'What happens, in 1-3 sentences, stageable with characters moving, appearing, vanishing and effects going off.',
          },
        },
        required: ['set', 'action'],
        additionalProperties: false,
      },
    },
    cliffhanger: { type: 'string', description: 'The final moment that makes the next episode unmissable.' },
  },
  required: ['recap', 'title', 'logline', 'beats', 'cliffhanger'],
  additionalProperties: false,
};

function clip(v, n) {
  return String(v ?? '').trim().slice(0, n);
}

function writerSystem(show, episodes, sets, cast) {
  const tone = TONES[show.tone] || TONES['comedy'];
  const history = episodes.length
    ? episodes.map((e) => {
        const bits = [`Episode ${e.number} — "${e.title}": ${e.logline}`];
        if (e.cliffhanger) bits.push(`Ended on: ${e.cliffhanger}`);
        return bits.join(' ');
      }).join('\n')
    : '(none yet — this pitch is the pilot)';
  const last = episodes[episodes.length - 1];

  return `You are the writers' room for "${show.title}", a short-form 3D-animated series
made by one person on a phone. Episodes are a few minutes long.

Premise: ${show.premise || '(none given — infer a fun one from the title and stay consistent with it)'}
Tone: ${tone}

Episodes so far:
${history}
${last?.synopsis ? `\nFull synopsis of the latest episode:\n${clip(last.synopsis, 1500)}` : ''}

Sets that exist and can be filmed in right now:
${sets.length ? sets.map((s) => `- ${s}`).join('\n') : '- (none yet — set beats anywhere, they will build the sets to match)'}

Cast who exist as characters right now:
${cast.length ? cast.map((c) => `- ${c}`).join('\n') : '- (none yet — keep the cast small so they are easy to create)'}

How to make it hook:
- If the last episode ended on a cliffhanger, pay it off in the first beat — never ignore it.
- Escalate: this episode's problem should be bigger or stranger than the last one's.
- Plant one small thing that pays off in a later episode, and call back a running gag when one exists.
- Every beat must be stageable with what this app can do: characters walking, appearing,
  vanishing, turning, and effects (fire, smoke, explosions, comic-book POW hits, auras,
  lens flares). No dialogue-heavy scenes, no facial acting, no props being handed around.
- Prefer the sets and cast listed above. Invent at most one new set or character per
  episode, and only when the story truly needs it.
- End on a cliffhanger that raises a question the audience has to see answered.`;
}

async function writeNext(show, episodes, sets, cast) {
  const client = new Anthropic();
  const n = episodes.length + 1;
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: writerSystem(show, episodes, sets, cast),
    output_config: { format: { type: 'json_schema', schema: PITCH_SCHEMA } },
    messages: [{ role: 'user', content: `Pitch episode ${n}.` }],
  });

  if (message.stop_reason === 'max_tokens') {
    throw new Error('The pitch ran long. Try again.');
  }
  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('The writers came back with nothing. Try again.');
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

  if (req.method === 'GET') {
    if (!db.isConfigured()) return json(res, 200, { cloud: false, shows: [] });
    try {
      const shows = await db.select('bp_shows', 'select=*&order=created_at.desc');
      const eps = await db.select('bp_episodes', 'select=*&order=number.asc');
      const byShow = {};
      for (const e of eps) (byShow[e.show_id] ||= []).push(e);
      return json(res, 200, {
        cloud: true,
        shows: shows.map((s) => ({ ...s, episodes: byShow[s.id] || [] })),
      });
    } catch (error) {
      console.error('show list:', error);
      return json(res, 502, { error: error?.message || 'The shows could not be loaded.' });
    }
  }

  const body = readBody(req);
  const action = String(body.action || '');
  if (!action) return json(res, 400, { error: 'An action is required.' });
  if (!db.isConfigured()) return json(res, 500, { error: 'Supabase is not configured.' });

  try {
    if (action === 'create_show') {
      const title = clip(body.title, 80);
      if (!title) return json(res, 400, { error: 'A show needs a title.' });
      const show = await db.insert('bp_shows', {
        id: `show_${crypto.randomUUID()}`,
        title: safeName(title, 'Untitled show'),
        premise: clip(body.premise, 2000),
        tone: TONES[body.tone] ? body.tone : 'comedy',
        look: clip(body.look, 24) || 'off',
      });
      return json(res, 200, { show: { ...show, episodes: [] } });
    }

    if (action === 'save_episode') {
      const showId = clip(body.show_id, 64);
      if (!showId) return json(res, 400, { error: 'show_id is required.' });
      const last = await db.select(
        'bp_episodes',
        `select=number&show_id=eq.${encodeURIComponent(showId)}&order=number.desc&limit=1`,
      );
      const episode = await db.insert('bp_episodes', {
        id: `ep_${crypto.randomUUID()}`,
        show_id: showId,
        number: (last[0]?.number || 0) + 1,
        title: safeName(clip(body.title, 120), 'Untitled episode'),
        logline: clip(body.logline, 400),
        synopsis: clip(body.synopsis, 4000),
        cliffhanger: clip(body.cliffhanger, 400),
      });
      return json(res, 200, { episode });
    }

    if (action === 'delete_show') {
      const showId = clip(body.show_id, 64);
      if (!showId) return json(res, 400, { error: 'show_id is required.' });
      await db.remove('bp_shows', `id=eq.${encodeURIComponent(showId)}`);
      return json(res, 200, { ok: true });
    }

    if (action === 'write_next') {
      const showId = clip(body.show_id, 64);
      if (!showId) return json(res, 400, { error: 'show_id is required.' });
      if (!process.env.ANTHROPIC_API_KEY) {
        return json(res, 500, { error: 'ANTHROPIC_API_KEY is not configured.' });
      }
      const shows = await db.select('bp_shows', `select=*&id=eq.${encodeURIComponent(showId)}&limit=1`);
      if (!shows[0]) return json(res, 404, { error: 'That show is gone.' });
      const episodes = await db.select(
        'bp_episodes',
        `select=*&show_id=eq.${encodeURIComponent(showId)}&order=number.asc`,
      );
      const sets = (Array.isArray(body.sets) ? body.sets : []).slice(0, 24).map((s) => clip(s, 80)).filter(Boolean);
      const cast = (Array.isArray(body.cast) ? body.cast : []).slice(0, 24).map((c) => clip(c, 60)).filter(Boolean);
      const pitch = await writeNext(shows[0], episodes, sets, cast);
      return json(res, 200, { pitch });
    }

    return json(res, 400, { error: `Unknown action: ${action}` });
  } catch (error) {
    console.error(`show ${action}:`, error);
    if (error instanceof Anthropic.RateLimitError) {
      return json(res, 429, { error: "The writers' room is flat out. Try again in a moment." });
    }
    return json(res, 502, { error: error?.message || 'The writers’ room hit a snag.' });
  }
}
