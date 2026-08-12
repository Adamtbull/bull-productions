# Ground contact

Why characters used to sink: the loader normalised each GLB so its bounding-box
bottom sat at the holder origin — but that box is measured on the **bind pose**,
before any animation plays. The moment a Tripo clip poses the skeleton, the
visible lowest point moves, and the static offset leaves feet inside the floor.
Different models drifted by different amounts, which is why no single Y offset
could ever fix it.

## How it works now

Every cast holder carries a grounding record (`holder.userData.ground`). The
system keeps two ideas separate, exactly as they should be:

- **`item.y` is the detected ground height at the character** — fed by
  collider raycasts on placement, drag, Director moves, and when a collider
  finishes loading under an already-placed cast. Saves store this, so reloads
  are correct by construction.
- **The grounding lift is a render-time correction** — the measured distance
  between the holder origin and the *current pose's* true lowest point, plus a
  3 mm sole clearance. It is added when the transform is applied each frame and
  never leaks into saves, drags, motions or animations.

Contact is measured from the **skinned vertices** (`SkinnedMesh.
getVertexPosition`, which applies the live bone transforms), subsampled to a
few hundred points, in holder-local space. Because the cached value is local:

- **Scale needs no re-measure** — the lift is `clearance − contact × scale`,
  recomputed from the cached contact every frame, so the Size slider and grow
  animations stay planted continuously.
- **Turning needs no re-measure** — a Y rotation cannot change the lowest
  point's height.

Measures are event-driven, never per-frame: on load (first posed frame, and
again half a second later), on every act change (after the 0.2 s crossfade
settles), and for **fall** a second time once the clip clamps into its lying
pose — so a fallen character settles on the floor, not through it. Each clip's
contact is cached per character; switching back to a measured clip lands
instantly from cache and is trued up right after.

Ground rays intersect **only** the world's collider subtree (marked
`userData.isGround`), so characters, props, selection boxes and helpers can
never be mistaken for floor. Walkable hits are filtered by face normal
(`up > 0.45`), which is what makes ramps count and walls not. With no collider,
the slider floor is the fallback. Director moves re-sample the ground every
frame of travel, so a walk over a ramp or onto a platform follows the surface
instead of cutting a straight line through it.

Modes: `auto` resolves to **feet** when the rig carries at least two
recognisably named foot bones (`foot`/`ankle`/`toe` — Mixamo-style imports),
calibrating an ankle-to-sole drop on first measure so coats and dangling
geometry can't fake the floor. Tripo rigs have no such names, so they resolve
to **bounds** (the measured silhouette). Rigid or unsupported meshes fall back
to **static** box bounds. A contact further than 3 m from the origin is
clamped and logged as a malformed pivot.

States: `grounded` (idle/walk/run/hurt), `falling` (fall clip), `airborne`
(Float/hover motion — the lift still applies underneath the hover offset, so
the bob's low point stays clear, but ground snapping leaves the height to the
motion, which is the point of Float).

## Debug mode

Open the app with `#grounddebug` on the URL —
`https://bull-productions.vercel.app/#grounddebug` — or from a console run
`bpGround.debug(true)`. `bpGround.remeasure()` forces a fresh measure of
everyone on set.

While it's on, every measure logs:

```
GROUNDING DEBUG
Actor: Adam
Root Y: 0.000
Bounds Min Y: -0.183
Floor Y: 0.000 (collider)
Correction: +0.183
Final Bounds Min Y: 0.003
Mode: bounds · state grounded
```

and the **selected** character shows the same line on the hint bar (readable on
a phone, no console needed), plus a green bounding box and a contact marker in
the scene. A malformed Tripo export shows up immediately as a huge Bounds Min Y
or a `-clamped` mode.

## Manual checklist

The maths, cache, mode selection and ray filtering are pinned by
`test/grounding.test.mjs` (14 checks, no GPU needed). Real GLBs plus a real
splat need eyes, so on the phone:

1. Build a normal solo-photo character, place on flat floor — soles touch, no
   sink, no hover.
2. A model whose pivot sits at the waist — still lands on its feet (debug shows
   a large positive correction).
3. A model whose pivot sits below the feet — no hovering (negative correction).
4. Size slider to 0.5× — feet stay planted through the whole slide.
5. Size slider to 2× — same.
6. Turn slider through 360° — no sinking at any angle.
7. Drag across flat ground — follows the floor.
8. Drag onto a raised surface (table, ledge) — stands on it, not on the old
   floor height.
9. Director-move a character across a ramp or step — feet track the surface
   mid-route.
10. Idle for 30 s — no slow sink or float.
11. Walk/run somewhere — feet stay at the surface while moving.
12. Hurt — the flinch doesn't punch the feet through the floor.
13. Fall — the body ends lying ON the floor and stays there.
14. Two characters at different Sizes side by side — both planted.
15. Reload the app with a saved scene — everyone still planted (grounding
    re-measures on load).

## Deliberate limits

- Contact is measured at a settled frame of each clip, not the minimum over the
  whole cycle — walk-cycle bob can graze the clearance by a few millimetres.
  If it ever shows, the fix is scrubbing each clip once at load and caching the
  cycle minimum.
- No per-foot IK: the whole character grounds as one. Two-foot terrain
  adaptation (each sole raycast independently, knees bending) is the future
  step, and the per-clip contact cache is the slot it would drop into.
- No physics engine — deliberately. Raycast + measured bounds solves placement;
  Rapier only earns its weight if walls/stairs/capsule collision become a
  requirement.
- The splat you *see* and the collider you *stand on* are different models of
  the same room; where Marble's collider disagrees with the splat by a
  centimetre, the feet follow the collider. That disagreement is World Labs'
  accuracy, not placement error — debug mode makes it visible.
