# Multiview Cast implementation

Status: feature branch only. Production remains untouched.

## Contract

`POST /api/cast-generate`

Old compatible request:

```json
{ "image_base64": "..." }
```

New request:

```json
{
  "views": {
    "front": "...",
    "left": "...",
    "back": "...",
    "right": "..."
  }
}
```

Front is required. With front only, the route uses Tripo `image_to_model`. With 2–4 supplied views, it uploads each image and calls `multiview_to_model` using exactly four ordered slots: front, left, back, right.

The route deliberately preserves the existing response key `task_id` so the recovered `cast-task` pipeline can continue from the generated body task.

## UI

`src/cast-multiview.js` provides four independent image slots with preview, replace/remove behaviour, front-required validation, and a clear indication of single-view fallback versus multiview mode.

## Next recovery step

Recover/integrate the live `index.html`, then reconstruct `api/cast-task.js` and verify the existing model -> check -> rig -> anim -> Supabase pipeline against the live production API before preview deployment.
