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
for (const [name, m] of [['generate','POST'],['direct','POST'],['props-task','GET']]) {
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

console.log('\n=== unconfigured Supabase degrades, does not error ===');
for (const kind of ['props','cast']) {
  await check(`library?kind=${kind} returns cloud:false`, async () => {
    const h = await load('library'); const [req, res] = mock('GET', { query: { kind } }); await h(req, res);
    eq(res.statusCode, 200, 'status'); eq(parse(res).cloud, false, 'cloud');
    if (!Array.isArray(parse(res)[kind])) throw new Error(`missing ${kind} array`);
  });
}

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
