// Boots index.html in headless Chromium with local stand-ins for the CDN modules
// (three / spark), so the app's own code runs even where those CDNs are blocked.
// Needs: npm i -D playwright-core   (Chromium is expected at /opt/pw-browsers)
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFileSync } from 'fs';

// Serve index.html with the CDN importmap repointed at local stubs.
let html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
html = html.replace(/"three":\s*"[^"]+"/, '"three": "/stub/three.js"')
           .replace(/"three\/addons\/":\s*"[^"]+"/, '"three/addons/loaders/GLTFLoader.js": "/stub/gltf.js"')
           .replace(/"@sparkjsdev\/spark":\s*"[^"]+"/, '"@sparkjsdev/spark": "/stub/spark.js"')
           .replace(/<link[^>]*fonts\.[^>]*>/g, '');

const srv = createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/' || u === '/index.html') { res.setHeader('content-type','text/html'); return res.end(html); }
  if (u.startsWith('/stub/')) {
    res.setHeader('content-type','text/javascript');
    try { return res.end(readFileSync(new URL('.' + u, import.meta.url), 'utf8')); } catch { res.statusCode = 404; return res.end(''); }
  }
  if (u.startsWith('/api/')) { res.setHeader('content-type','application/json'); return res.end('{"worlds":[],"cloud":false,"props":[],"cast":[]}'); }
  res.statusCode = 404; res.end('');
}).listen(8099);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [], logs = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });

await page.goto('http://127.0.0.1:8099/', { waitUntil: 'load' });
await page.waitForTimeout(1200);

// The "+ Cast" chip only exists inside a world, which needs real splat assets.
// So run the panel's own code, lifted out of index.html, against the real DOM.
const castBlock = (() => {
  const m = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
    .match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  return m.slice(m.indexOf('const CAST_SLOTS'), m.indexOf('castCancelBtn.onclick = closeCastPanel;'));
})();

const cast = await page.evaluate((src) => {
  const g = (id) => document.getElementById(id);
  const api = new Function('castGrid','castNameInput','castModeLabel','castBuildBtn',
    'castStrip','shelfEl','hintEl','castPhotoInput',
    src + '; return { openCastPanel, closeCastPanel, renderCastSlots, castViews, CAST_SLOTS };')(
    g('cast-grid'), g('cast-name'), g('cast-mode-label'), g('cast-build'),
    g('cast-strip'), g('shelf'), g('hint'), g('cast-photo-input'));

  const snap = () => ({
    slots: [...document.querySelectorAll('[id^="cast-slot-"]')].map(e => e.id),
    filled: [...document.querySelectorAll('.cast-slot.filled')].map(e => e.id.replace('cast-slot-','')),
    frontRequired: !!document.querySelector('#cast-slot-front.required'),
    buildDisabled: g('cast-build').disabled,
    label: g('cast-mode-label').textContent,
    open: g('cast-strip').classList.contains('on'),
    thumbs: document.querySelectorAll('.cast-slot img').length,
    clears: document.querySelectorAll('.cast-slot .cs-clear').length,
  });

  api.openCastPanel();
  const empty = snap();

  api.castViews.front = { b64: 'AAAA', name: 'nina' };
  api.renderCastSlots();
  const frontOnly = snap();

  api.castViews.left = { b64: 'AAAA', name: '' };
  api.castViews.back = { b64: 'AAAA', name: '' };
  api.renderCastSlots();
  const three = snap();

  // Removing the front photo must re-gate the build.
  api.castViews.front = null;
  api.renderCastSlots();
  const noFront = snap();

  return { empty, frontOnly, three, noFront };
}, castBlock);

console.log('  --- multiview cast (real DOM) ---');
console.log('  panel opens     :', cast.empty.open);
console.log('  slots rendered  :', cast.empty.slots.join(', '));
console.log('  front is required:', cast.empty.frontRequired);
console.log('  empty  -> label', JSON.stringify(cast.empty.label), '| build disabled', cast.empty.buildDisabled, '| thumbs', cast.empty.thumbs);
console.log('  front  -> label', JSON.stringify(cast.frontOnly.label), '| build disabled', cast.frontOnly.buildDisabled, '| thumbs', cast.frontOnly.thumbs, '| clears', cast.frontOnly.clears);
console.log('  3 views-> label', JSON.stringify(cast.three.label), '| build disabled', cast.three.buildDisabled, '| filled', cast.three.filled.join('+'));
console.log('  drop front ->  label', JSON.stringify(cast.noFront.label), '| build disabled', cast.noFront.buildDisabled);

const castOk =
  cast.empty.open && cast.empty.slots.length === 4 && cast.empty.frontRequired &&
  cast.empty.buildDisabled === true && cast.empty.label === 'Need front' &&
  cast.frontOnly.buildDisabled === false && cast.frontOnly.label === 'Front only' && cast.frontOnly.thumbs === 1 &&
  cast.three.label === '3 views' && cast.three.buildDisabled === false &&
  cast.noFront.buildDisabled === true && cast.noFront.label === 'Need front';

const r = await page.evaluate(() => {
  const sel = document.getElementById('fx-select');
  const opts = sel ? [...sel.querySelectorAll('option')] : [];
  const groups = sel ? [...sel.querySelectorAll('optgroup')].map(g => g.label + ':' + g.children.length) : [];
  return {
    title: document.title,
    fxSelect: !!sel,
    fxOptions: opts.length,
    fxGroups: groups,
    burstBtn: !!document.getElementById('fx-burst'),
    lookOptions: document.querySelectorAll('#look-select option').length,
    lookOverlays: ['fx-vignette','fx-grain','letter-top','letter-bottom','fx-flash']
      .every(id => !!document.getElementById(id)),
    wrPresent: !!document.getElementById('writers-room'),
    wrFormHidden: (document.getElementById('show-form') || {}).hidden === true,
    wrLookOptions: document.querySelectorAll('#show-look option').length,
    directBox: !!document.getElementById('direct-input'),
    castStrip: !!document.getElementById('cast-strip'),
    handlerWired: !!(document.getElementById('fx-select') || {}).onchange,
  };
});

console.log('=== browser smoke test ===');
console.log('  title           :', r.title);
console.log('  fx select       :', r.fxSelect ? 'present' : 'MISSING');
console.log('  fx options      :', r.fxOptions, '(1 "No effect" + 26 presets = 27 expected)');
console.log('  fx groups       :', r.fxGroups.join('  '));
console.log('  burst button    :', r.burstBtn ? 'present' : 'MISSING');
console.log('  look options    :', r.lookOptions, '(7 expected)');
console.log('  look overlays   :', r.lookOverlays ? 'all present' : 'MISSING');
console.log('  writers room    :', r.wrPresent ? 'present' : 'MISSING', '| form hidden:', r.wrFormHidden, '| look options:', r.wrLookOptions);
console.log('  onchange wired  :', r.handlerWired ? 'yes' : 'NO');
console.log('  page errors     :', errors.length ? errors : 'none');
console.log('  console errors  :', logs.length ? logs.slice(0,4) : 'none');

await browser.close(); srv.close();
const ok = r.fxOptions === 27 && r.lookOptions === 7 && r.lookOverlays && r.wrPresent && r.wrFormHidden && r.wrLookOptions === 7 && r.fxSelect && r.burstBtn && r.handlerWired
  && errors.length === 0 && r.castStrip && castOk;
console.log(ok ? '\nPASS — page boots, effects UI builds, cast panel opens with 4 gated slots, no runtime errors' : '\nFAIL');
process.exit(ok ? 0 : 1);
