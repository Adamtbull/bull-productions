# Live compatibility baseline

The current production app is treated as the behavioural source of truth.

## Frontend capabilities observed

- Build World Labs/Marble sets from a prompt or photo.
- Browse a Backlot of generated worlds.
- Open a world in a Three.js/Spark splat viewer.
- Switch Fast/Full splat fidelity.
- Dress a set with generated 3D props.
- Generate a Cast member from a single image.
- Place, rotate, scale and move props/cast.
- Apply motion modes: still, float, bob, spin, orbit.
- Apply entrance modes: none, fade, rise, pop, materialise.
- Persist scene dressing locally and to cloud.
- Use a world collider when available.

## Verified API routes referenced by the live frontend

- `POST /api/generate`
- `GET /api/operation?id=...`
- `GET /api/worlds`
- `GET /api/props-list`
- `POST /api/props-generate`
- `GET /api/props-task?id=...&name=...`
- `GET /api/props-proxy?u=...`
- `GET /api/cast-list`
- `POST /api/cast-generate`
- `GET /api/cast-task?stage=...&id=...&model=...&name=...`
- `GET /api/scene?world_id=...`
- `POST /api/scene`

## Verified production health

- `/api/worlds` responds successfully.
- `/api/props-list` responds with `cloud: true`.
- `/api/cast-list` responds with `cloud: true`.
- `/api/scene` reads the saved Martial Arts Training Gym dressing.
- `bp_props` contains one permanent generated prop.
- `bp_scenes` contains one saved world layout.
- `bp_cast` currently contains zero completed cast members.
