# API contract

Derived by reading the recovered `index.html` (the known-good production frontend,
deployment `bull-productions-koqqaq0qf`, recovered 2026-08-11).

This is the contract the working frontend actually depends on. The serverless
source in `api/*.js` could not be recovered (see `RECOVERY_STATUS_2026-08-11.md`),
so any rebuilt handler must satisfy the shapes below or the frontend will break.

**Cross-check:** the frontend references exactly 12 routes, and the live production
deployment reports `lambdaRuntimeStats: {"nodejs":12}`. The route list below is
therefore complete — there are no unreferenced handlers hiding in the deployment.

## Error convention

Every route returns a non-2xx with `{ "error": "<message>" }`. The frontend surfaces
`body.error` directly to the user, with one special case: HTTP `402` on `/api/generate`
and `/api/operation` is rewritten client-side to the "Out of World Labs credits" message.

---

## World generation

### `POST /api/generate`
Request:
```json
{ "text_prompt": "string|null", "image_base64": "string|null",
  "model": "string", "auto_enhance": true, "display_name": "string|null" }
```
Response: `{ "operation_id": "string" }`

`model` is the World Labs tier — `marble-1.0-draft` (draft) or `marble-1.1` (full).

### `GET /api/operation?id=<operation_id>`
Polled every few seconds until `done` is true.

Response while running: `{ "done": false }`

Response when finished:
```json
{ "done": true, "world": { ... }, "error": "string|null" }
```
The frontend treats `done: true` with `error` set, or with `world` missing, as failure.

### `GET /api/worlds`
Response: `{ "worlds": [ world, ... ] }`

### The `world` object

Fields the frontend reads:

| field | use |
|---|---|
| `world_id` | identity; scene save/load key |
| `display_name` | Backlot card title |
| `caption` | Backlot card subtitle |
| `thumbnail_url` | Backlot card image |
| `splats` | splat URLs by fidelity — drives the Fast/Full toggle |
| `collider_url` | collider mesh for floor/wall collision; optional |

`collider_url` is optional — the viewer degrades to a slider-set floor height when absent.

---

## Props

### `POST /api/props-generate`
Request: `{ "image_base64": "string" }` (JPEG, max edge 1280, quality 0.85)
Response: `{ "task_id": "string" }`

### `GET /api/props-task?id=<task_id>&name=<prop_name>`
Polled every 4000 ms. Response while running: `{ "done": false }`

On completion, one of two shapes:

- **Persisted** (preferred) — `{ "done": true, "prop": { "id", "name", "glb_url", "preview_url" } }`
  The handler has already copied the asset into Supabase Storage and inserted a
  `bp_props` row, so the asset URL is durable.
- **Not persisted** — `{ "done": true, "model_url": "...", "preview_url": "..." }`
  The frontend downloads immediately, because Tripo's URLs expire quickly.

Optional on either shape: `"warn": "string"` (shown via `alert`), `"error": "string"`.

### `GET /api/props-list`
Response: `{ "cloud": true, "props": [ { "id", "name", "glb_url", "preview_url" } ] }`

The frontend ignores the payload entirely unless `cloud` is `true`.

### `GET /api/props-proxy?u=<encoded_url>`
Byte relay, used only as a fallback after a direct asset fetch fails (CORS or expiry).
Returns the asset body on success. On failure returns JSON `{ "error": "..." }`;
the sentinel `{"error":"too_large"}` is rewritten client-side to
"That prop file is too big to relay. Try a simpler object."

---

## Cast

### `POST /api/cast-generate`
Request: `{ "image_base64": "string" }`, or `{ "views": { "front", "left", "back", "right" } }`
for multiview (each optional except `front`). Either shape accepts an optional
`"clean_background": boolean` (default false).
Response: `{ "task_id": "string", "mode": "single|multiview", "warn": "string|null" }`

`clean_background` runs each supplied photo through an OpenAI `gpt-image-1` edit
before Tripo ever sees it, swapping only the backdrop for a plain grey studio
background — the prompt explicitly leaves the person untouched, both because
regenerating a real face would undercut the whole multiview-likeness pipeline and
because these APIs are built to refuse exactly that. It targets the actual cause of
most mangled casts: Tripo folding background clutter into the mesh. This step is
cosmetic, never a gate — a missing `OPENAI_API_KEY` or a refused/failed edit falls
back to that photo's original and reports why via `warn`, same convention as props
and cast-task below. `warn` here arrives on the *start* response, before polling
begins.

### `GET /api/cast-task?stage=<stage>&id=<id>&model=<model_task_id>&name=<name>`

A four-stage state machine, polled every 4000 ms. The frontend starts at
`stage=model`, with `id` and `model` both set to the task id from `cast-generate`,
then echoes back whatever `stage`/`id`/`model` the previous response returned.

Stages and their user-facing labels:

| stage | label |
|---|---|
| `model` | Body… |
| `check` | Bones… |
| `rig` | Rigging… |
| `anim` | Moves… |

Response while running: `{ "done": false, "stage": "...", "id": "...", "model": "..." }`

Response when finished:
```json
{ "done": true,
  "cast": { "id", "name", "glb_url", "preview_url", "anims": { ... } } }
```
`anims` describes the clips baked into the GLB (`preset:` idle, walk, run, hurt and
fall today). Optional `warn` / `error` as with props.

The `check` stage fails fast with a 502 and a plain-language message when Tripo's
rig inspection reports `riggable: false` (typically a multi-person photo fused into
one mesh), rather than spending credits rigging something that can never work.

### `GET /api/cast-list`
Response: `{ "cloud": true, "cast": [ { "id", "name", "glb_url", "preview_url", "anims" } ] }`

Same `cloud: true` gate as `props-list`.

---

## Scene persistence

### `POST /api/scene`
Debounced 400 ms after any change. Fire-and-forget — the frontend ignores the response
and always writes the same payload to `localStorage` as well.

Request: `{ "world_id": "string", "floor_y": number, "items": [ item, ... ] }`

### `GET /api/scene?world_id=<world_id>`
Response: `{ "cloud": true, "scene": { "floor_y": number, "items": [ ... ] } }`

Cloud state wins when `cloud` and `scene` are both present; otherwise the frontend
falls back to `localStorage`. A missing scene must not be an error.

---

## Director

### `POST /api/direct`
Backed by `claude-haiku-4-5`.

Request:
```json
{ "prompt": "the skull glides to the door",
  "items": [ { "iid": "i7x3k9a", "name": "Skull", "kind": "prop|cast",
               "x": 1.20, "z": -3.40 } ],
  "cam": { "x": 0.00, "z": 0.00 } }
```
`iid` is a short client-generated id. Duplicate names are disambiguated before
sending ("Skull", "Skull 2"), so the model can refer to items unambiguously.

Response:
```json
{ "commands": [ { "verb": "...", "target": "<iid>", "start": 0, "dur": 1.5, ... } ],
  "say": "Rolling." }
```

`say` is echoed to the hint line. Commands with an unknown `target` are silently skipped.

`start` is clamped to `>= 0`. `dur` is clamped to `0.2 .. 20` seconds.

| verb | extra fields | notes |
|---|---|---|
| `moveto` | `x`, `z` | snapped to the collider surface; cast auto-turn to face travel and auto-play walk (or run, above ~2.2 m/s) for the move |
| `motion` | `type`, `speed` | `type` ∈ none/hover/bob/spin/orbit; `speed` clamped `0.25 .. 3` |
| `appear` | `type` | `type` ∈ fade/rise/pop/sparkle (default `fade`) |
| `vanish` | — | fixed 0.8 s fade-out |
| `turn` | — | see `scheduleDirect` in `index.html` |
| `act` | `clip` | cast only; `clip` ∈ idle/walk/run/hurt/fall (unknown → idle). `hurt` plays a short random slice of the reaction reel then returns to idle; `fall` clamps on its last frame and stays down; walk/run hold for `dur` |
| `give` | `to` | props only; the prop rides the cast member's hand each frame (hands are found by shape — the bone with 4+ short finger chains). Commands whose `to` is not a known iid are dropped server-side |
| `drop` | — | releases a held prop and floor-snaps it |
| `throw` | `at` | prop flies a parabolic arc at the cast member in `at` (an unknown `at` is rewritten to `""` = straight ahead); impact fires a burst (comic POW under toon looks), punches the camera, and plays `hurt` on the victim |

Any value outside the listed sets falls back to the default rather than erroring, so
a loose model response degrades gracefully instead of breaking the scene.

`act`, `give`, `drop` and `throw` were added after recovery (2026-08-12) alongside
matching manual controls in the item panel; the schema carries `clip`, `to` and `at`
as required fields with `"none"`/`""` defaults, per the flat-schema convention above.

---

## Added after recovery

### `POST /api/show` / `GET /api/show`

Not part of the recovered contract — added 2026-08-12 for the writers' room.
`GET` lists shows with their episodes (`{cloud, shows:[{...show, episodes}]}`).
`POST` takes `{action}`: `create_show`, `save_episode`, `delete_show`, or
`write_next`, which has `claude-sonnet-4-6` pitch the next episode as
structured output `{recap, title, logline, beats:[{set, action}], cliffhanger}`
from the show's premise, tone, prior episodes, and the caller-supplied `sets`
and `cast` name lists. Backed by `bp_shows` and `bp_episodes` (same RLS
pattern as the other tables).

A fifth action, `write_scene`, serves one-off videos from inside the set
viewer: `{action:'write_scene', idea?, tone?, set, sets, cast}` returns
`{pitch: {title, logline, beats:[{set, action}], ender}}` — a self-contained
sketch with a punchline instead of a cliffhanger. It touches no tables and is
deliberately not gated on Supabase; only `ANTHROPIC_API_KEY` is required. The
frontend keeps the last pitch per world in `localStorage` (`bp-pitch-<world_id>`)
and each beat can be piped into `/api/direct` verbatim via its Stage button.
