# Multiview Cast specification

## Goal

Upgrade `+ Cast` from one source image to a multiview character workflow while preserving the current front-only fallback.

## Input UI

Four explicit slots:

1. Front — required
2. Left — optional
3. Back — optional
4. Right — optional

Each slot must show a thumbnail, filename, Replace action and Remove action. The UI must never silently infer the view from upload order.

## Request contract

```json
{
  "name": "Female Instructor",
  "views": {
    "front": "<base64 JPEG>",
    "left": "<base64 JPEG or null>",
    "back": "<base64 JPEG or null>",
    "right": "<base64 JPEG or null>"
  }
}
```

## Behaviour

- Front only: retain current single-image image-to-model path.
- Two or more views: use provider multiview generation.
- Reject a request with no front view.
- Do not accept a contact sheet as a substitute for explicitly assigned views.
- Resize inputs client-side before upload.
- Do not expose provider or Supabase secret keys to the browser.

## Pipeline stages

`Uploading views -> Building body -> Checking skeleton -> Rigging -> Adding moves -> Saving actor -> Ready`

## Persistence

On success, copy permanent assets to Supabase Storage and create/update `bp_cast` with permanent URLs and animation metadata.

## Backward compatibility

Existing cast entries, props and scenes must continue to load unchanged.
