# Recovery status — 2026-08-11

## What this commit does

Puts the working Bull Productions frontend into git for the first time.

Until now the app existed **only** inside Vercel deployments, uploaded ad-hoc as
files with no git integration. That is the root cause of the current outage, and it
meant a single bad upload could destroy the only copy. It no longer can.

## What was recovered

`index.html` — the complete working app, 79,077 characters / 2,190 lines.

Pulled from deployment `bull-productions-koqqaq0qf-visual-studio1.vercel.app`
(`dpl_6hgkyFBstEbirTrX4kkX7qrBhEoY`), the known-good build identified in the handoff
brief. Committed byte-for-byte as served — `sha256:934c4744e99a864c…`, verified
against the HTTP response body. Nothing was reformatted, split, or edited.

It is fully self-contained. The only external references are Google Fonts and an
importmap pointing at CDN builds of `three@0.178.0` and `@sparkjsdev/spark@0.1.10`.
There are no local script or stylesheet dependencies, so this one file is the entire
frontend.

Feature spot-check against the brief: World Labs generation, Backlot, Three.js/Spark
splat viewer with Fast/Full toggle, collider-based floor and wall collision
(31 references), props, cast, motion and entrance modes, walk camera, the Director
box, and scene persistence are all present. The particle effects engine is **not**
present — correct, since this build predates that work.

## What could NOT be recovered

**All 12 serverless handlers (`api/*.js`).** Server-side source is not readable over
HTTP, and this session has no Vercel API token, so the deployment's source bundle
could not be downloaded.

The 12 handlers are: `generate`, `operation`, `worlds`, `props-generate`, `props-task`,
`props-list`, `props-proxy`, `cast-generate`, `cast-task`, `cast-list`, `scene`, `direct`.

That the count is exactly 12 is confirmed independently: the frontend references 12
distinct routes, and the live deployment reports `lambdaRuntimeStats: {"nodejs":12}`.
So the surface is fully known even though the source is not.

`docs/API_CONTRACT.md` records the exact request and response shape each route must
honour, derived from the recovered frontend. That is enough to rebuild them
faithfully, but it is a rebuild, not a recovery — behaviour inside each handler
(Tripo model ids, prompt text, retry logic, storage paths) is not captured.

**Two ways to close that gap, in order of preference:**

1. Adam exports the source from Vercel (Deployment → Source tab, or
   `vercel pull` / the deployment's "Download source" option) and drops the files in.
   This preserves the working handlers exactly.
2. A Vercel API token is provided to a session, which can then download the
   deployment source bundle directly.

Rebuilding blind from the contract is the last resort, not the plan.

## Deployment timeline (Sydney time, 11 Aug 2026)

| time | deployment | state |
|---|---|---|
| 19:27 | `koqqaq0qf` | **known good** — recovered here, serves the full app (HTTP 200) |
| 19:48 | `buvp7mv37` | **broken** — HTTP 404 `NOT_FOUND`, this is the deploy that dropped `index.html` |
| 19:51 | `gzc829vlh` | **current production**, holds all three production aliases |

The 404 on `buvp7mv37` is confirmed directly and matches the brief's account.

`gzc829vlh` could not be read: the project has SSO deployment protection enabled
(`ssoProtection: all_except_custom_domains`), and requests to it redirect to Vercel
SSO. So its brokenness is **reported by Adam, not independently verified here** —
it is presumably the build with the leftover placeholder string. Worth noting the
same protection did not block `koqqaq0qf`, which served normally.

## Recommended next steps

1. **Restore production.** Either Instant Rollback in the Vercel dashboard, or
   redeploy from this recovered `index.html` once the handlers are in place.
   Note that Vercel currently lists only `gzc829vlh` and `buvp7mv37` as rollback
   candidates — and `buvp7mv37` is the 404 build, so rolling back one step lands on
   a *worse* state. `koqqaq0qf` is not offered as a rollback candidate. Use the
   preview URL directly, or redeploy, rather than a blind one-step rollback.
2. **Get the 12 handlers into git**, by export if at all possible.
3. **Connect this repo to Vercel via git integration**, replacing ad-hoc file
   uploads. This is what stops the failure mode recurring.
4. **Only then** restructure into the agreed layout, and re-land the effects engine.

Restructuring the 79 KB single file into modules is deliberately **not** done in this
commit. Splitting it before there is a working deploy pipeline and a way to verify the
result would repeat exactly the mistake that caused this outage: a large unverifiable
change shipped straight to production. The file is safe in git now; it can be split
with confidence once previews are running from git.
