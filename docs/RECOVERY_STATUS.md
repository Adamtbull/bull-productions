# Bull Productions recovery status

Date: 2026-08-10

## Protected production

The existing Vercel production project `bull-productions` remains untouched. No Git integration has been attached to production and no production deployment has been replaced.

## Recovered directly from live Vercel

The full production `index.html` response was retrieved from `https://bull-productions.vercel.app` through the authenticated Vercel connector. This gives us the exact current frontend behaviour, including:

- Backlot/new-set UI and styling
- World Labs generation request shape
- World polling flow
- Three.js/Spark viewer
- Fast/Full splat switching
- Collider loading and placement surfaces
- Dress/Direct modes
- prop shelf and IndexedDB cache
- Supabase-backed prop/cast library reads through server APIs
- prop generation flow
- current single-image `+ Cast` flow
- cast pipeline stages: model -> check -> rig -> anim
- scene save/restore flow
- object placement, rotation, scale, motion and entrances

## Current Cast frontend contract observed

`+ Cast` currently exposes one hidden file input:

```html
<input id="cast-photo-input" type="file" accept="image/*" hidden />
```

The browser resizes that one image to JPEG/base64 and sends:

```json
{ "image_base64": "<jpeg-base64>" }
```

to `POST /api/cast-generate`.

It then polls `/api/cast-task` through the stages `model`, `check`, `rig`, and `anim`. A completed response is cached locally and added to the cloud Cast shelf.

## Still to reconstruct

The original Vercel serverless source is not directly downloadable through the current connector. These routes therefore require evidence-based reconstruction and preview testing:

- `/api/generate`
- `/api/operation`
- `/api/worlds`
- `/api/props-list`
- `/api/props-generate`
- `/api/props-task`
- `/api/props-proxy`
- `/api/cast-list`
- `/api/cast-generate`
- `/api/cast-task`
- `/api/scene`

## Next implementation target

Recreate the live frontend on this branch, then replace only the Cast input UI/contract with explicit Front / Left / Back / Right slots. Preserve the current front-only path and use provider multiview generation when two or more assigned views are supplied.
