// Pulls the live effects engine straight out of index.html and runs it against
// minimal THREE/DOM stubs, so this test can never drift from the shipped code.
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mod = src.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const block = mod.slice(mod.indexOf('const FX_ONESHOT'), mod.indexOf('// ---------- Scene persistence ----------'));

class V3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} }
const THREE = {
  Vector3: V3, Sphere: class { constructor(c,r){this.center=c;this.radius=r;} },
  BufferAttribute: class { constructor(a,n){this.array=a;this.itemSize=n;this.needsUpdate=false;} },
  BufferGeometry: class { constructor(){this.attributes={};} setAttribute(k,v){this.attributes[k]=v;} setDrawRange(){} dispose(){} },
  Points: class { constructor(g,m){this.geometry=g;this.material=m;} },
  ShaderMaterial: class { constructor(o){Object.assign(this,o);} dispose(){} },
  CanvasTexture: class {}, AdditiveBlending: 1, NormalBlending: 2,
};
const document = { createElement: () => ({ width:0, height:0, getContext: () => ({
  createRadialGradient: () => ({ addColorStop(){} }), fillRect(){}, set fillStyle(v){} }) }) };
const scene3 = { add(){}, remove(){} };
let placedGroup = { children: [] };

const factory = new Function('THREE', 'document', 'scene3', 'placedGroup',
  block + '\nreturn { FX_PRESETS, FX_IDS, FX_ONESHOT, FxEmitter };');
export const { FX_PRESETS, FX_IDS, FX_ONESHOT, FxEmitter } = factory(THREE, document, scene3, placedGroup);
