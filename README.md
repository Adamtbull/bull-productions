# Bull Productions

Photo or prompt in, walkable splat-rendered 3D set out. Populate it with props and
cast generated from photos, direct them in plain language, add effects, film it.

Built mobile-first — the whole thing is meant to be used from a phone.

**House rule: only cast real people who have agreed to appear.**

## Layout

```
index.html            the entire frontend, self-contained
api/                  13 routes in 12 files (the plan caps functions at 12;
                      props-list and cast-list share one via vercel.json rewrites)
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
  dragged, turned and scaled on the set. Anything on the shelf can be deleted
  from its × badge — two taps, since it also clears the stored model — which
  removes it from the set, the device and the cloud library together.
- **Cast** — photo to a rigged, animated character. Four photo slots
  (front required, left/back/right optional); more angles give a better likeness.
  Rigs carry idle, walk, run, hurt and fall clips. The pipeline refuses early —
  before rigging spends credits — when Tripo's rig check says the photo won't rig
  as one person. An optional "Tidy the background first" checkbox has OpenAI swap
  a cluttered backdrop for plain studio grey before the photo reaches Tripo — the
  person is explicitly left untouched, both for likeness and because these APIs
  won't touch a real face anyway — which cuts down on the background getting
  folded into the mesh. Off by default; skips cleanly with a note if the key
  isn't set or an edit fails.
- **Acts, fights and props in hands** — a selected cast member has an Act row
  (Idle/Walk/Run/Hurt/Fall): hurt plays a random flinch and recovers, fall stays
  down until the next act. Walking a character somewhere plays their walk (or run)
  by itself. A selected prop can be handed to any cast member — hands are found on
  the rig by shape, so it works on Tripo's unnamed skeletons — carried around, dropped,
  or thrown at someone: parabolic arc, impact burst (comic POW under toon looks),
  camera punch, and the victim flinches without being asked.
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
  motion, appear, vanish, turn, act, give, drop and throw commands against the
  tagged items on set — "Dave runs at Steve and Steve decks him" now stages itself.
- **The writers' room** — shows with continuing storylines. A show carries a
  premise, a tone (comedy, action comedy, anime saga, clay deathmatch, sitcom,
  drama) and a default look. "Write the next episode" has Claude read the whole
  run so far plus the sets and cast that actually exist, and pitch a recap,
  staged beats and a cliffhanger; keep it and the storyline continues from
  there next time. Opening a show applies its look to the whole app.
- **One-off scenes** — the same writer without the series, for any set opened
  straight from the Backlot. A Write button next to the Director pitches a
  self-contained sketch (title, logline, beats, a punchline ender) staged in
  the current set with the cast that exists — type an idea first or let it
  surprise you, and the active look sets the tone. Every beat has a Stage
  button that hands it to the Director. The last scene per set is remembered;
  tap Write with an empty box to bring it back.
- **Ground contact** — cast stand on the floor they're on, without per-model
  offsets. The current skinned pose's true lowest point is measured (not the
  bind-pose box), cached per animation clip, and applied as a render-time lift
  over the collider-detected ground; scale and rotation stay planted for free,
  Director moves follow ramps and platforms, and a fallen character settles on
  the floor. `#grounddebug` on the URL shows the working for any selected
  character. See `docs/GROUNDING.md`.
- **Walk camera** — thumb stick to move, one-finger drag to look, ground-snapped
  and wall-blocked. Installs to the Home Screen and clears Safari's bars.

## Running the checks

```bash
npm install
npm test          # route guards + all 26 effect presets
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
| `ANTHROPIC_API_KEY` | `direct`, `show` (writers' room, one-off scenes) |
| `OPENAI_API_KEY` (optional) | `cast-generate` background clean-up |
| `TRIPO_CAST_FACE_LIMIT`, `TRIPO_CAST_TEXTURE_QUALITY`, `TRIPO_CAST_MODEL_VERSION`, `TRIPO_CAST_QUAD` (all optional) | tune cast build quality without a deploy |

Supabase holds `bp_props`, `bp_scenes` and `bp_cast` plus the public `bull-props`
storage bucket. With Supabase unconfigured the libraries degrade to device-local
rather than erroring. `OPENAI_API_KEY` is the same story: leave it unset and the
"Tidy the background first" checkbox just builds with the original photos instead
of failing the whole character.

See `docs/API_CONTRACT.md` for every route's request and response shape.

## Deploying

This repo is the source of truth. Connect it to the Vercel project via git
integration rather than uploading files — ad-hoc uploads are what caused the
outage this repo was created to recover from.

Note that the repo's current Vercel git integration points at
`bull-productions-v26m`, not the live `bull-productions` project. That needs
redirecting before a merge deploys anywhere useful.
