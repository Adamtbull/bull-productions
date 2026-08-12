# Bull Productions

Photo or prompt in, walkable splat-rendered 3D set out. Populate it with props and
cast generated from photos, direct them in plain language, add effects, film it.

Built mobile-first — the whole thing is meant to be used from a phone.

**House rule: only cast real people who have agreed to appear.**

## Layout

```
index.html            the entire frontend, self-contained
api/                  one file per route, 12 routes
api/_lib/             shared helpers (http, supabase, tripo, worldlabs)
test/                 route guards, effects engine, headless browser boot
docs/                 API contract, recovery notes, multiview spec
```

`index.html` deliberately has no build step and no local script or stylesheet
dependencies — only Google Fonts and CDN builds of `three` and `@sparkjsdev/spark`
via an importmap. It is served as-is.

## What it does

- **Sets** — World Labs Marble turns a photo or a prompt into a splat world.
  Draft (~$0.18) and full (~$1.26) tiers, with live polling while it builds.
- **Viewer** — Three.js + Spark, with a Fast/Full fidelity toggle. Real floor and
  wall collision from the world's collider mesh, so placement and walking both
  respect the room.
- **Props** — photo to 3D object via Tripo, saved to a permanent library, then
  dragged, turned and scaled on the set.
- **Cast** — photo to a rigged, animated character. Four photo slots
  (front required, left/back/right optional); more angles give a better likeness.
  Rigs carry idle, walk, run, hurt and fall clips.
- **Motion and entrances** — float, bob, spin, orbit; fade, rise, pop, materialise.
  Action staggers them so a take reads as one sequence.
- **Effects** — 26 per-item particle effects. 19 continuous (fire, torch, campfire,
  blue flame, smoke, steam, dust, sparks, embers, fireflies, glow, magic, arcane
  swirl, portal, energy shield, rain, snow, bubbles, power aura) and 7 one-shot
  hits (explosion, impact, dust puff, shockwave, magic nova, comic hit, lens
  flare). Hits also punch the camera — screen shake and a white flash.
- **Looks** — whole-frame movie styles from a picker in the filming strip:
  Blockbuster, Anime, Cartoon, Claymation, Comic and Noir. A look grades the
  splat room, swaps placed items to toon shading where it suits, and layers
  grain, vignette and letterbox on top. Claymation runs the scene at 12
  hand-wobbled frames a second, stop-motion style.
- **Director** — type an instruction and Claude turns it into scheduled move,
  motion, appear, vanish and turn commands against the tagged items on set.
- **Walk camera** — thumb stick to move, one-finger drag to look, ground-snapped
  and wall-blocked. Installs to the Home Screen and clears Safari's bars.

## Running the checks

```bash
npm install
npm test          # route guards + all 23 effect presets
```

`npm test` needs no network and no credentials — it exercises the handlers'
method guards, input validation, unconfigured-service paths and the proxy's host
allowlist, then runs every particle preset for three simulated seconds.

The browser check is separate because it needs Chromium:

```bash
npm i -D playwright-core
node test/browser/run.mjs
```

It boots `index.html` in headless Chromium with local stand-ins for the two CDN
modules, so it still runs where those CDNs are blocked.

## Environment

Server-side only. These live in Vercel and never reach the browser — every API
call from the frontend is a same-origin relative path.

| Variable | Used by |
|---|---|
| `WORLDLABS_API_KEY` | `generate`, `operation`, `worlds` |
| `TRIPO_API_KEY` | `props-*`, `cast-*` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `props-list`, `cast-list`, `scene`, asset persistence |
| `ANTHROPIC_API_KEY` | `direct` |

Supabase holds `bp_props`, `bp_scenes` and `bp_cast` plus the public `bull-props`
storage bucket. With Supabase unconfigured the libraries degrade to device-local
rather than erroring.

See `docs/API_CONTRACT.md` for every route's request and response shape.

## Deploying

This repo is the source of truth. Connect it to the Vercel project via git
integration rather than uploading files — ad-hoc uploads are what caused the
outage this repo was created to recover from.

Note that the repo's current Vercel git integration points at
`bull-productions-v26m`, not the live `bull-productions` project. That needs
redirecting before a merge deploys anywhere useful.
