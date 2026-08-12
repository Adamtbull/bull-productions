// Extracts the grounding block from index.html (same pattern as fx.test.mjs)
// and drives it with fabricated holders, so the contact maths, per-clip cache,
// scale behaviour and ground raycast fallback are all pinned without a GPU.
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = (() => {
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const a = m.indexOf('// ---------- Grounding ----------');
  const b = m.indexOf('// ---------- Grounding end ----------');
  if (a < 0 || b < 0) throw new Error('grounding anchors missing from index.html');
  return m.slice(a, b);
})();

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); console.log(`  ok   ${label}`); pass++; }
  catch (e) { console.log(`  FAIL ${label} — ${e.message}`); fail++; }
}
const eq = (a, b, what) => {
  if (typeof b === 'number' ? Math.abs(a - b) > 1e-9 : a !== b) {
    throw new Error(`${what}: expected ${b}, got ${a}`);
  }
};

// --- minimal THREE + page context the block needs ---
let rayHits = [];
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
}
const THREE = {
  Vector3,
  Raycaster: class { constructor() {} intersectObject() { return rayHits; } },
  Box3: class { setFromObject() { this.min = { y: -0.25 }; return this; } },
  BoxHelper: class {}, Mesh: class {}, SphereGeometry: class {}, MeshBasicMaterial: class {},
};

function build(ctx = {}) {
  return new Function(
    'THREE', 'colliderReady', 'colliderRoot', 'floorY', 'placedGroup', 'selected', 'hintEl', 'scene3', 'window', 'location',
    src + `; return { getGroundHeightAt, footBonesOf, measureContactLocalY, initGrounding,
      scheduleGroundMeasure, groundLiftTarget, groundMeasure, groundUseCached, groundDebugLine };`
  )(THREE, ctx.colliderReady ?? false, ctx.colliderRoot ?? null, ctx.floorY ?? -1.4,
    null, null, null, null, {}, { hash: '' });
}

// A fake cast holder: identity transforms so world == holder-local, a skinned
// mesh whose vertices we control, and optional named foot bones.
function fakeHolder({ verts, scale = 1, feet = [] }) {
  let calls = 0;
  const mesh = {
    isMesh: true, isSkinnedMesh: true,
    geometry: { attributes: { position: { count: verts.length } } },
    getVertexPosition(i, v) { calls++; const p = verts[i]; v.set(p[0], p[1], p[2]); },
    localToWorld(v) { return v; },
  };
  const h = {
    userData: { item: { name: 'Adam', x: 0, z: 0, y: 0, scale }, actName: 'idle' },
    updateWorldMatrix() {},
    traverse(f) { f(h); f(mesh); feet.forEach(f); },
    worldToLocal(v) { return v; },
    getWorldPosition(v) { return v.set(0, 0, 0); },
    swapVerts(next) { verts = next; mesh.geometry.attributes.position = { count: next.length }; },
    sampleCalls: () => calls,
  };
  return h;
}
const bone = (name, y) => ({ isBone: true, name, getWorldPosition: (v) => v.set(0, y, 0) });

console.log('=== grounding: contact measurement ===');
const G = build();
const h1 = fakeHolder({ verts: [[0, 1.6, 0], [0.1, -0.183, 0], [0, 0.4, 0.1]] });
check('bounds mode finds the skinned low point', () => {
  G.initGrounding(h1);
  G.groundMeasure(h1);
  eq(h1.userData.ground.mode, 'bounds', 'mode');
  eq(h1.userData.ground.contactLocalY, -0.183, 'contact');
});
check('lift = clearance − contact × scale', () => {
  eq(G.groundLiftTarget(h1), 0.003 + 0.183, 'lift at scale 1');
});
check('scale changes need no re-measure', () => {
  const before = h1.sampleCalls();
  h1.userData.item.scale = 2;
  eq(G.groundLiftTarget(h1), 0.003 + 0.366, 'lift at scale 2');
  eq(h1.sampleCalls(), before, 'vertex samples');
});
check('first measure seeds the eased lift directly', () => {
  eq(h1.userData.ground.seeded, true, 'seeded');
  eq(h1.userData.ground.lift, 0.003 + 0.183, 'seeded lift (scale 1 at seed time)');
});

console.log('\n=== grounding: per-clip cache ===');
check('each clip caches its own contact; cached swaps are instant', () => {
  h1.userData.actName = 'hurt';
  h1.swapVerts([[0, -0.31, 0], [0, 1.2, 0]]);
  G.groundMeasure(h1);
  eq(h1.userData.ground.contactByClip.hurt, -0.31, 'hurt cached');
  const samples = h1.sampleCalls();
  G.groundUseCached(h1, 'idle');
  eq(h1.userData.ground.contactLocalY, -0.183, 'idle restored from cache');
  eq(h1.sampleCalls(), samples, 'no re-sample on cached swap');
});
check('measure queue caps at 4 pending', () => {
  for (let i = 0; i < 9; i++) G.scheduleGroundMeasure(h1, 0.35);
  if (h1.userData.ground.measureTimes.length > 4) throw new Error('queue unbounded');
});

console.log('\n=== grounding: feet mode and malformed models ===');
check('foot-named bones switch contact to feet mode', () => {
  const h = fakeHolder({
    verts: [[0, -0.02, 0], [0, 1.7, 0]],
    feet: [bone('mixamorig:LeftFoot', 0.08), bone('mixamorig:RightFoot', 0.09)],
  });
  G.initGrounding(h);
  G.groundMeasure(h);
  eq(h.userData.ground.mode, 'feet', 'mode');
  // soleDrop calibrates so the calibration pose grounds at the true sole.
  eq(h.userData.ground.contactLocalY, -0.02, 'contact at sole');
});
check('tripo-named rigs have no foot bones and use bounds', () => {
  const h = fakeHolder({
    verts: [[0, -0.1, 0]],
    feet: [bone('tripo::0_Left_Limb_4', 0.05)],
  });
  G.initGrounding(h);
  G.groundMeasure(h);
  eq(h.userData.ground.mode, 'bounds', 'mode');
});
check('an implausible pivot is clamped and flagged', () => {
  const h = fakeHolder({ verts: [[0, -9.4, 0]] });
  G.initGrounding(h);
  G.groundMeasure(h);
  eq(h.userData.ground.contactLocalY, -3, 'clamped');
  if (!h.userData.ground.mode.includes('clamped')) throw new Error('mode not flagged');
});
check('rigid meshes fall back to static bounds', () => {
  const h = fakeHolder({ verts: [[0, 0, 0]] });
  h.traverse = (f) => { f(h); f({ isMesh: true, geometry: { attributes: { position: { count: 1 } } } }); };
  const m = G.measureContactLocalY(h);
  eq(m.mode, 'static', 'mode');
  eq(m.minLocal, -0.25, 'box min');
});

console.log('\n=== grounding: ground detection ===');
check('collider hit wins', () => {
  rayHits = [{ point: { y: 0.42 } }];
  const g = build({ colliderReady: true, colliderRoot: {} });
  const r = g.getGroundHeightAt(1, 2, 0);
  eq(r.hit, true, 'hit'); eq(r.y, 0.42, 'y');
});
check('steep faces are skipped in favour of walkable ones', () => {
  const obj = { matrixWorld: {} };
  rayHits = [
    { point: { y: 1.0 }, object: obj, face: { normal: { clone: () => ({ transformDirection: () => ({ y: 0.1 }) }) } } },
    { point: { y: 0.2 }, object: obj, face: { normal: { clone: () => ({ transformDirection: () => ({ y: 0.98 }) }) } } },
  ];
  const g = build({ colliderReady: true, colliderRoot: {} });
  eq(g.getGroundHeightAt(0, 0, 0).y, 0.2, 'walkable y');
});
check('no collider falls back to the slider floor', () => {
  const g = build({ colliderReady: false, floorY: -1.4 });
  const r = g.getGroundHeightAt(0, 0, 0);
  eq(r.hit, false, 'hit'); eq(r.y, -1.4, 'y');
});

console.log('\n=== grounding: debug output ===');
check('debug line carries actor, floor, correction and mode', () => {
  const line = G.groundDebugLine('Adam', 0, -0.183, 0, 0.186, 'bounds');
  for (const bit of ['Adam', 'root 0.000', 'bottom -0.183', 'floor 0.000', 'fix +0.186', 'bounds']) {
    if (!line.includes(bit)) throw new Error(`missing "${bit}" in "${line}"`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
