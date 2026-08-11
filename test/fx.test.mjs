const { FX_PRESETS, FX_IDS, FX_ONESHOT, FxEmitter } = await import('./fx-extract.mjs');
let pass = 0, fail = 0;
const bad = (m) => { console.log('  FAIL ' + m); fail++; };

console.log(`=== ${FX_IDS.length} presets ===`);
for (const id of FX_IDS) {
  const e = new FxEmitter(id);
  e.origin.set(0, 1, 0);
  let peak = 0, moved = false;
  const start = [];

  if (e.oneShot) e.burst();
  // 3 seconds at 60fps.
  for (let f = 0; f < 180; f++) {
    e.update(1 / 60, f / 60);
    peak = Math.max(peak, e.live);
    if (f === 6) for (let i = 0; i < e.n; i++) start.push(e.pos[i * 3], e.pos[i * 3 + 1], e.pos[i * 3 + 2]);
    if (f === 20) for (let i = 0; i < start.length; i++) if (Math.abs(e.pos[i] - start[i]) > 1e-4) { moved = true; break; }
  }

  const finite = e.pos.every(Number.isFinite) && e.alpha.every(Number.isFinite) && e.col.every(Number.isFinite);
  const alphaOk = e.alpha.every(a => a >= 0 && a <= 1.0001);
  const colOk = e.col.every(c => c >= -0.0001 && c <= 1.0001);

  // A one-shot must burn out; a continuous one must still be going.
  let after = e.live;
  if (e.oneShot) { for (let f = 0; f < 600; f++) after = e.update(1/60, f/60); }

  const problems = [];
  if (peak === 0) problems.push('never spawned');
  if (!moved) problems.push('particles never moved');
  if (!finite) problems.push('NaN/Infinity in buffers');
  if (!alphaOk) problems.push('alpha out of 0..1');
  if (!colOk) problems.push('colour out of 0..1');
  if (peak > e.n) problems.push(`peak ${peak} exceeds pool ${e.n}`);
  if (e.oneShot && after !== 0) problems.push('one-shot never burnt out');
  if (!e.oneShot && e.live === 0) problems.push('continuous emitter died');

  if (problems.length) bad(`${id.padEnd(10)} — ${problems.join('; ')}`);
  else { console.log(`  ok   ${id.padEnd(10)} peak ${String(peak).padStart(3)}/${e.n} ${e.oneShot ? '(burns out)' : '(sustains)'}`); pass++; }
}

// Pool ceiling: a continuous emitter must never exceed its allocation.
const e = new FxEmitter('campfire'); e.origin.set(0,0,0);
let over = false;
for (let f = 0; f < 900; f++) { e.update(1/60, f/60); if (e.live > e.n) over = true; }
if (over) bad('campfire exceeded its pool under sustained load'); else { console.log('\n  ok   pool ceiling respected over 15s'); pass++; }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
