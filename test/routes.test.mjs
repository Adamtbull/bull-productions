const dir = new URL("../api", import.meta.url).pathname;
const load = (n) => import(`${dir}/${n}.js`).then(m => m.default);

function mock(method, { query = {}, body = null } = {}) {
  const res = { statusCode: 0, headers: {}, body: '', ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b ?? ''; this.ended = true; } };
  return [{ method, query, body }, res];
}
const parse = (res) => { try { return JSON.parse(res.body); } catch { return {}; } };

let pass = 0, fail = 0;
async function check(label, fn) {
  try { await fn(); console.log(`  ok   ${label}`); pass++; }
  catch (e) { console.log(`  FAIL ${label} — ${e.message}`); fail++; }
}
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`); };

// Env deliberately empty: exercises the unconfigured path.
for (const k of ['ANTHROPIC_API_KEY','TRIPO_API_KEY','WORLDLABS_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']) delete process.env[k];

console.log('=== method guards (wrong verb must 405 + set Allow) ===');
for (const [name, wrong] of [['generate','GET'],['operation','POST'],['worlds','POST'],
  ['props-generate','GET'],['props-task','POST'],['library','POST'],['props-proxy','POST'],
  ['cast-generate','GET'],['cast-task','POST'],['direct','GET'],['scene','DELETE'],['show','DELETE']]) {
  await check(`${name} rejects ${wrong}`, async () => {
    const h = await load(name); const [req, res] = mock(wrong); await h(req, res);
    eq(res.statusCode, 405, 'status');
    if (!res.headers.allow) throw new Error('missing Allow header');
  });
}

console.log('\n=== validation (missing required input must 400) ===');
const cases = [
  ['generate','POST',{body:{}},'photo or describe'],
  ['operation','GET',{query:{}},'Operation id'],
  ['props-task','GET',{query:{}},'Task id'],
  ['cast-task','GET',{query:{}},'Task id'],
  ['props-proxy','GET',{query:{}},'Asset URL'],
  ['direct','POST',{body:{}},'director'],
  ['scene','GET',{query:{}},'world_id'],
  ['show','POST',{body:{}},'action'],
  ['show','POST',{body:{action:'create_show'}},'title'],
  ['show','POST',{body:{action:'write_next'}},'show_id'],
  ['library','GET',{query:{}},'kind'],
  ['cast-generate','POST',{body:{}},'front-on photo'],
];
// Configured, so validation is reached rather than the not-configured guard.
const KEYS = {ANTHROPIC_API_KEY:'sk-test',TRIPO_API_KEY:'t',WORLDLABS_API_KEY:'w',
  SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'k'};
for (const [name, m, opt, needle] of cases) {
  await check(`${name} 400s without required input`, async () => {
    Object.assign(process.env, KEYS);
    const h = await load(name); const [req, res] = mock(m, opt); await h(req, res);
    for (const k of Object.keys(KEYS)) delete process.env[k];
    eq(res.statusCode, 400, 'status');
    const e = parse(res).error || '';
    if (!e.toLowerCase().includes(needle.toLowerCase())) throw new Error(`error text was "${e}"`);
  });
}

console.log('\n=== not-configured guard fires before validation ===');
for (const [name, m] of [['generate','POST'],['direct','POST'],['props-task','GET'],['cast-generate','POST']]) {
  await check(`${name} 500s when its key is absent`, async () => {
    const h = await load(name); const [req, res] = mock(m, {body:{}, query:{}}); await h(req, res);
    eq(res.statusCode, 500, 'status');
    if (!/not configured/i.test(parse(res).error || '')) throw new Error('unclear error text');
  });
}

console.log('\n=== writers room specifics ===');
await check('show GET degrades to cloud:false', async () => {
  const h = await load('show'); const [req, res] = mock('GET'); await h(req, res);
  eq(res.statusCode, 200, 'status'); eq(parse(res).cloud, false, 'cloud');
});
await check('show POST 500s without Supabase', async () => {
  const h = await load('show');
  const [req, res] = mock('POST', { body: { action: 'create_show', title: 'Test' } });
  await h(req, res);
  eq(res.statusCode, 500, 'status');
  if (!/not configured/i.test(parse(res).error || '')) throw new Error('unclear error');
});
await check('write_scene needs only the Anthropic key, never Supabase', async () => {
  const h = await load('show');
  const [req, res] = mock('POST', { body: { action: 'write_scene', idea: 'a duel' } });
  await h(req, res);
  eq(res.statusCode, 500, 'status');
  const e = parse(res).error || '';
  if (!/ANTHROPIC/i.test(e)) throw new Error(`error was "${e}" — one-offs must not be gated on Supabase`);
});

console.log('\n=== unconfigured Supabase degrades, does not error ===');
for (const kind of ['props','cast']) {
  await check(`library?kind=${kind} returns cloud:false`, async () => {
    const h = await load('library'); const [req, res] = mock('GET', { query: { kind } }); await h(req, res);
    eq(res.statusCode, 200, 'status'); eq(parse(res).cloud, false, 'cloud');
    if (!Array.isArray(parse(res)[kind])) throw new Error(`missing ${kind} array`);
  });
}

console.log('\n=== the director speaks the fight verbs ===');
// The schema only reaches the API on a live call, so hold the source to the
// contract instead: every verb the frontend schedules must be offered to the
// model, and structured outputs demand every property is listed as required.
const { readFileSync } = await import('node:fs');
const directSrc = readFileSync(`${dir}/direct.js`, 'utf8');
for (const verb of ['act', 'give', 'drop', 'throw']) {
  await check(`direct schema offers "${verb}"`, async () => {
    if (!directSrc.includes(`'${verb}'`)) throw new Error(`${verb} missing from direct.js`);
  });
}
await check('direct schema requires the new fields', async () => {
  for (const f of ["'clip'", "'to'", "'at'"]) {
    if (!directSrc.includes(f)) throw new Error(`${f} missing from schema`);
  }
  if (!/required: \['verb', 'target', 'start', 'dur', 'x', 'z', 'type', 'speed', 'clip', 'to', 'at'\]/.test(directSrc)) {
    throw new Error('required list does not cover every property');
  }
});
await check('cast-task bails out when the rig check says not riggable', async () => {
  const src = readFileSync(`${dir}/cast-task.js`, 'utf8');
  if (!src.includes('riggable === false')) throw new Error('riggable guard missing');
});

console.log('\n=== background clean-up is optional, never a build gate ===');
const openaiSrc = readFileSync(`${dir}/_lib/openai.js`, 'utf8');
const castGenSrc = readFileSync(`${dir}/cast-generate.js`, 'utf8');
await check('_lib/openai.js exports cleanBackground and apiKey', async () => {
  if (!openaiSrc.includes('export async function cleanBackground')) throw new Error('cleanBackground missing');
  if (!openaiSrc.includes('export function apiKey')) throw new Error('apiKey missing');
});
await check('the clean-up prompt never asks to change the person', async () => {
  if (!/background/i.test(openaiSrc)) throw new Error('prompt does not even mention the background');
  if (!/unchanged|do not (add|alter)/i.test(openaiSrc)) throw new Error('prompt has no explicit hands-off-the-subject instruction');
});
await check('cast-generate degrades instead of gating when OPENAI_API_KEY is absent', async () => {
  if (!castGenSrc.includes('openai.apiKey()')) throw new Error('missing apiKey guard');
  // The guard must return a warn+fallback, not a json(res, 5xx, ...) error response.
  const guard = castGenSrc.slice(castGenSrc.indexOf('!openai.apiKey()'));
  const nextLine = guard.slice(0, guard.indexOf('\n', guard.indexOf('\n') + 1));
  if (!/return \{ views, warn:/.test(nextLine)) throw new Error(`guard does not fall back cleanly: "${nextLine.trim()}"`);
});
await check('a failed clean-up per photo falls back to that photo, not an error', async () => {
  if (!/catch \(error\)[\s\S]{0,260}return src/.test(castGenSrc)) throw new Error('per-photo failure does not fall back to the original');
});

console.log('\n=== cast build quality + unverified-parameter fallback ===');
const tripo = await import(`${dir}/_lib/tripo.js`);
const CAST_ENV = ['TRIPO_CAST_FACE_LIMIT','TRIPO_CAST_TEXTURE_QUALITY','TRIPO_CAST_QUAD','TRIPO_CAST_MODEL_VERSION'];
const clearCastEnv = () => { for (const k of CAST_ENV) delete process.env[k]; };

await check('cast quality defaults to the close-up tier', async () => {
  clearCastEnv();
  const q = tripo.castQuality();
  eq(q.texture_quality, 'detailed', 'texture_quality');
  // 16000 is the live-verified cap for P1-20260311 — see the ladder comment.
  eq(q.face_limit, 16000, 'face_limit');
  eq(q.texture, true, 'texture');
  eq(q.pbr, true, 'pbr');
});
await check('quad stays off by default (it would break the rig pipeline)', async () => {
  clearCastEnv();
  if ('quad' in tripo.castQuality()) throw new Error('quad enabled without being asked for');
  process.env.TRIPO_CAST_QUAD = '1';
  eq(tripo.castQuality().quad, true, 'quad when opted in');
  clearCastEnv();
});
await check('quality and model version are env-tunable without a deploy', async () => {
  process.env.TRIPO_CAST_FACE_LIMIT = '120000';
  process.env.TRIPO_CAST_TEXTURE_QUALITY = 'standard';
  process.env.TRIPO_CAST_MODEL_VERSION = 'v3.1-test';
  const q = tripo.castQuality();
  eq(q.face_limit, 120000, 'face_limit');
  eq(q.texture_quality, 'standard', 'texture_quality');
  eq(tripo.castModelVersion(), 'v3.1-test', 'model version');
  clearCastEnv();
  if (!tripo.castModelVersion()) throw new Error('no default model version');
});

// startTask's retry is the safety net for parameters we could not verify
// against the docs, so it is worth testing against a stubbed Tripo rather
// than trusting the source to read correctly.
const realFetch = globalThis.fetch;
function stubTripo(responses) {
  const seen = [];
  globalThis.fetch = async (_url, init) => {
    seen.push(JSON.parse(init.body));
    const next = responses.shift();
    return {
      ok: next.ok !== false,
      status: next.status || 200,
      text: async () => JSON.stringify(next.body),
    };
  };
  return seen;
}
process.env.TRIPO_API_KEY = 'test';

await check('an unaccepted quality field is dropped and retried, not fatal', async () => {
  const seen = stubTripo([
    { ok: false, status: 400, body: { code: 2002, message: "invalid parameter 'texture_quality'" } },
    { body: { code: 0, data: { task_id: 'task-retry' } } },
  ]);
  const id = await tripo.startTask(
    { type: 'multiview_to_model', texture_quality: 'detailed', model_version: 'P1' },
    tripo.CAST_OPTIONAL_KEYS);
  eq(id, 'task-retry', 'task id');
  eq(seen.length, 2, 'attempts');
  if ('texture_quality' in seen[1]) throw new Error('retry kept the rejected field');
  eq(seen[1].model_version, 'P1', 'retry keeps fields Tripo did not complain about');
});

// The bug this replaced: Tripo said "face_limit value is invalid" and the
// retry threw away texture_quality and model_version instead — losing the
// close-up quality to fix a complaint about polygon count.
await check('a face_limit complaint steps the budget down, keeping the quality settings', async () => {
  const seen = stubTripo([
    { ok: false, status: 400, body: { code: 1004, message: 'One or more of your parameter is invalid, face_limit value is invalid' } },
    { body: { code: 0, data: { task_id: 'task-fl' } } },
  ]);
  const id = await tripo.startTask(
    { type: 'multiview_to_model', model_version: 'P1-20260311', texture_quality: 'detailed', face_limit: 60000 },
    tripo.CAST_OPTIONAL_KEYS);
  eq(id, 'task-fl', 'task id');
  eq(seen[1].face_limit, 40000, 'stepped down one rung');
  eq(seen[1].texture_quality, 'detailed', 'texture quality kept');
  eq(seen[1].model_version, 'P1-20260311', 'model version kept');
});
await check('it keeps stepping down until Tripo accepts, then stops', async () => {
  const reject = { ok: false, status: 400, body: { code: 1004, message: 'face_limit value is invalid' } };
  const seen = stubTripo([reject, reject, reject, { body: { code: 0, data: { task_id: 'task-low' } } }]);
  await tripo.startTask(
    { type: 'multiview_to_model', texture_quality: 'detailed', face_limit: 60000 },
    tripo.CAST_OPTIONAL_KEYS);
  eq(seen.map((s) => s.face_limit).join(','), '60000,40000,24000,16000', 'ladder');
  eq(seen[3].texture_quality, 'detailed', 'quality survived the whole ladder');
});
await check('it gives up rather than looping forever', async () => {
  stubTripo(Array.from({ length: 8 }, () => ({ ok: false, status: 400, body: { code: 1004, message: 'invalid parameter' } })));
  let threw = false;
  try {
    await tripo.startTask({ type: 'image_to_model', texture_quality: 'detailed', face_limit: 60000, model_version: 'x' },
      tripo.CAST_OPTIONAL_KEYS);
  } catch { threw = true; }
  if (!threw) throw new Error('never gave up');
});
await check('a degraded build tells the caller, so the app can say so', async () => {
  stubTripo([
    { ok: false, status: 400, body: { code: 2002, message: "invalid parameter 'quad'" } },
    { body: { code: 0, data: { task_id: 'task-x' } } },
  ]);
  let told = null;
  await tripo.startTask({ type: 'image_to_model', quad: true }, tripo.CAST_OPTIONAL_KEYS,
    (adjustments) => { told = adjustments; });
  if (!told || !told.join(' ').includes('quad')) throw new Error('degrade was not reported to the caller');
});
await check('an out-of-credit failure is never retried', async () => {
  const seen = stubTripo([
    { ok: false, status: 400, body: { code: 2004, message: 'insufficient balance' } },
  ]);
  let threw = false;
  try { await tripo.startTask({ type: 'image_to_model', texture_quality: 'detailed' }, tripo.CAST_OPTIONAL_KEYS); }
  catch (e) { threw = /balance/i.test(e.message); }
  if (!threw) throw new Error('balance error was swallowed');
  eq(seen.length, 1, 'attempts');
});
await check('an auth failure is never retried', async () => {
  const seen = stubTripo([{ ok: false, status: 401, body: { code: 1001, message: 'invalid token' } }]);
  try { await tripo.startTask({ type: 'image_to_model', quad: true }, tripo.CAST_OPTIONAL_KEYS); } catch {}
  eq(seen.length, 1, 'attempts');
});
await check('a task with no optional fields fails fast, keeping Tripo’s wording', async () => {
  stubTripo([{ ok: false, status: 400, body: { code: 2002, message: "invalid model 'v2.5-old'" } }]);
  let msg = '';
  try { await tripo.startTask({ type: 'animate_rig', model_version: 'v2.5-old' }); } catch (e) { msg = e.message; }
  if (!msg.includes("invalid model")) throw new Error(`lost Tripo's message: "${msg}"`);
});
globalThis.fetch = realFetch;
delete process.env.TRIPO_API_KEY;

console.log('\n=== props-proxy refuses non-allowlisted hosts (SSRF guard) ===');
for (const [u, why] of [['http://169.254.169.254/latest/meta-data/','cloud metadata'],
  ['https://evil.example.com/x.glb','arbitrary host'],['not-a-url','malformed']]) {
  await check(`blocks ${why}`, async () => {
    const h = await load('props-proxy'); const [req, res] = mock('GET', { query: { u } }); await h(req, res);
    if (res.statusCode !== 403 && res.statusCode !== 400) throw new Error(`expected 403/400, got ${res.statusCode}`);
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
