class V3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}clone(){return new V3(this.x,this.y,this.z);}}
class Obj{constructor(){this.children=[];this.position=new V3();this.rotation={x:0,y:0,z:0};this.scale=new V3(1,1,1);
this.userData={};this.visible=true;}add(o){this.children.push(o);}remove(o){const i=this.children.indexOf(o);if(i>=0)this.children.splice(i,1);}
traverse(f){f(this);this.children.forEach(c=>c.traverse&&c.traverse(f));}getWorldPosition(t){return t.copy(this.position);}}
export class Vector3 extends V3{}
export class Vector2{constructor(x=0,y=0){this.x=x;this.y=y;}}
export class Scene extends Obj{}
export class Group extends Obj{}
export class Points extends Obj{constructor(g,m){super();this.geometry=g;this.material=m;}}
export class Sphere{constructor(c,r){this.center=c;this.radius=r;}}
export class BufferAttribute{constructor(a,n){this.array=a;this.itemSize=n;this.needsUpdate=false;}}
export class BufferGeometry{constructor(){this.attributes={};}setAttribute(k,v){this.attributes[k]=v;}
setDrawRange(){}dispose(){}}
export class ShaderMaterial{constructor(o){Object.assign(this,o);}dispose(){}}
export class CanvasTexture{constructor(c){this.image=c;}}
export class PerspectiveCamera extends Obj{constructor(){super();this.aspect=1;}updateProjectionMatrix(){}}
export class WebGLRenderer{constructor(o){this.domElement=(o&&o.canvas)||{};}setPixelRatio(){}setSize(){}
setAnimationLoop(f){globalThis.__loop=f;}render(){}}
export class HemisphereLight extends Obj{}
export class DirectionalLight extends Obj{}
export class GridHelper extends Obj{}
export class BoxHelper extends Obj{update(){}}
export class Clock{getDelta(){return 0.016;}}
export class Raycaster{setFromCamera(){}intersectObjects(){return [];}intersectObject(){return [];}}
export class Box3{setFromObject(){return this;}getSize(){return new V3(1,1,1);}getCenter(){return new V3();}}
export const AdditiveBlending=1, NormalBlending=2, DoubleSide=2;
export class MeshBasicMaterial{constructor(o){Object.assign(this,o||{});}dispose(){}}
export class Mesh extends Obj{constructor(g,m){super();this.geometry=g;this.material=m;}}
export class PlaneGeometry{}
export class MathUtils{}
