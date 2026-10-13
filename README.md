# Contribution City

Your year on GitHub, as a small city at dusk. Each of the last 365 days becomes a building; contributions set its height, and repository commits light its windows.

**Private live site:** <https://contribution-city-dusk.bushy-horse-2013.chatgpt.site>

Built with Vite, TypeScript, Three.js, and plain DOM controls. The implementation includes the city, smooth camera controls, day inspection, repository isolation and recolouring, GitHub loading, statistics, shareable URLs, and PNG export. See [Plan.md](Plan.md) and [verification notes](docs/verification.md) for evidence and remaining release checks.

## Run locally

Use **Node.js 24 LTS** (also supported: Node 22.12+ in the 22 release line, or Node 26+).

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally <http://localhost:5173>. A deterministic demo appears immediately. Enter a GitHub username and choose **Build city** to load real activity. Public calendars work without a token. The Vite dev server supplies the same `/api/city` endpoint used in production.

No external fonts or assets are required. Demo mode works offline after installation. **Inspect daily data** provides a keyboard-accessible table of all 365 dates, including when WebGL is unavailable.

## Controls

| Action | Desktop | Touch / keyboard |
| --- | --- | --- |
| Rotate and tilt | Drag | One-finger drag; arrow keys |
| Smooth zoom | Scroll; + / − buttons | Pinch; + / − keys |
| Pan | Shift-drag or right-drag | Two-finger drag; Shift + arrows |
| Zoom toward a point | Scroll at the cursor | Pinch around the finger centre |
| Zoom in 2.2× | Double-click | + button |
| Reset view | 1:1 button | 0 or Home key |
| Inspect a day | Hover; click to pin scrollable details | Tap to pin; daily data table; Esc or × dismisses details |
| Isolate a repo | Click its legend name; click again to clear | Keyboard-operable legend buttons |
| Change repo colour | Choose its colour swatch | Native colour picker |

Zoom is clamped to **0.4×–16×**. Camera angles and log-distance use frame-rate-independent easing. The default camera fits all city bounds and uses a more diagonal angle on portrait screens. Resizing adapts its framing smoothly; once you explore, it preserves your zoom, rotation, tilt, and pan. Automatic rotation resumes three seconds after interaction and pauses while a day is highlighted. **Orbit** toggles it. Reduced-motion preferences disable automatic rotation and the building rise animation.

**Share** copies the current URL; `?user=username` automatically loads that user. The URL changes only after a successful build. **Export PNG** downloads the renderer's current view, including its sky, without the page controls.

## GitHub data

The server has two modes:

- With `GITHUB_TOKEN`, it queries GitHub GraphQL's `contributionsCollection.contributionCalendar` and attributes public, recently pushed repositories through REST.
- Without a server token, it reads exact counts from GitHub's public contribution-calendar tooltips, then uses unauthenticated REST for public repository attribution. Both calendar years are fetched when the rolling range spans a year boundary. Colour intensity is never used to estimate counts. Public results are cached in memory for two minutes, with a maximum of 50 entries.

An optional visitor token uses direct browser-to-GitHub GraphQL/REST requests. It is kept only for the current load and cleared afterwards. Tokens never enter URLs, local/session storage, client build variables, or logs. A connected GitHub app in Codex is separate from the website's runtime credentials.

To configure the authenticated server path locally:

```sh
cp .env.example .env.local
```

Set `GITHUB_TOKEN` in `.env.local`, then restart the dev server. Use a GitHub token with access to read the calendar and repositories being inspected. Keep it server-side; **do not use a `VITE_` variable**. `.env.local` is ignored by Git.

The date range includes the current **UTC** date and the preceding 364 dates. Labels also use UTC. Repository attribution uses commit **author timestamps normalized to UTC**, with duplicate SHAs removed within each repository across pages. Commit eligibility or date differences can cause attribution to differ from the graph: daily calendar totals always win, attribution is clamped, and the rest becomes grey **Other activity**.

Other activity includes issues, pull requests, reviews, private or omitted repositories, and unmatched commits. Repository names and totals describe attributed commits only. Repository colours follow descending attributed commit totals, repeating a 12-colour palette beyond 12 repositories.

### Limits and partial results

- Normal/server mode scans up to **15** recently pushed, non-fork repositories; a visitor token allows **40**.
- Discovery scans at most **5 pages × 100 repositories**.
- Each repository scans at most **3 pages × 100 authored commits**, with **3** concurrent repository workers.
- Requests time out after at most **10 seconds**; the scan has a **45-second overall budget**, including public-calendar retrieval in public mode.
- Empty repositories (409) are harmless. Missing repos, failed pages, timeouts, and rate limits retain fetched commits and preserve exact calendar heights. Data notes explain partial attribution.
- A failed or cancelled new load preserves the previous city.

## Demo and rendering contract

Demo defaults are frozen: seed `contribution-city-v1`, end date `2026-10-13`, start date `2025-10-14`, five fictional repositories, exactly 365 consecutive dates. `generateDemoCity({ endDate, seed })` accepts other fixtures.

Each day has an authoritative `contributionCount` and ordered segments:

```ts
{
  date: '2026-10-13',
  contributionCount: 8,
  segments: [
    { kind: 'repository', repoId: 'demo/city-engine', count: 5 },
    { kind: 'other', count: 3 },
  ],
}
```

Segment counts always sum to the daily total. Quiet days have no segments and remain visible as slabs. Geometry uses weeks on X, Sunday–Saturday on Z, four-week blocks, and an avenue between Wednesday and Thursday. Building height is `0.12 + contributions × 0.24`; totals are never capped or compressed.

Buildings, windows, repository bands, roofs, lots, and road markings use instanced meshes. Detailed floors have three windows on each of four faces; a stable hash leaves about 12% dark. A 1.2-second ease-out rise respects reduced motion. Windows switch to repo tint bands when floors become small on screen, with hysteresis to avoid flicker.

Detailed window allocations are bounded to 180,000 instances. Buildings beyond that allocation draw their windows procedurally on repository bands: zooming in restores three windows per face per floor without allocating an instance for each window. Both paths retain exact heights, counts, colours, filtering, and deterministic dark windows. Actual GPU appearance and performance still require release review. Hover highlighting updates only the outline, avoiding full window-buffer rebuilds. New city loads dispose old graphics resources.

## Checks and builds

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

Tests cover deterministic dates, leap years, attribution sums, real-data normalization, repository and pagination caps, failure/partial-result handling, window counts and LOD, expanded GLSL shader syntax, exact geometry, camera easing and cursor anchors, combined pinch/pan, statistics, DOM controls, and load cancellation/stale results. Shader syntax checks do not prove GPU compilation or appearance; browser verification remains separate.

`npm run build` produces Vercel/static client files in `dist/`. `npm run preview` serves that client build, normally at <http://localhost:4173>, **without the local API**. Use `npm run dev` for full local GitHub loading, or supply a visitor token in preview. Three.js is a separate reusable bundle; Vite's non-blocking 500 kB warning concerns that engine bundle.

GitHub Actions runs a clean install, tests, and production build for pushes and pull requests.

## Deployment

### Vercel

The repo includes `vercel.json` and exactly one function, `api/city.ts`. Import the GitHub repository into Vercel, use the Vite preset, and retain the build command `npm run build` and output directory `dist`. Optionally set `GITHUB_TOKEN` as a server-side project environment variable; public mode works without it.

For CLI deployment after signing in:

```sh
npm exec --package=vercel -- vercel login
npm exec --package=vercel -- vercel --prod
```

### Sites

`.openai/hosting.json` identifies the existing owner-private Contribution City site. Its deployment uses the same Vite client and data service in one portable Worker. `worker/index.ts` serves the embedded client assets and the single `/api/city` route.

```sh
npm run build:sites
```

This builds temporary client files in `.site-client/`, then creates `dist/server/index.js` and `dist/.openai/hosting.json` with the client assets embedded in the Worker. This output is for the Sites publication workflow, not `vite preview` or Vercel's static output. Run `npm run build` again to return to a normal Vite build. Publication source is kept in a separate ignored `.site-publish/` checkout so the GitHub repository's remote is preserved.

## Structure

```text
src/data/                 Types, dates, demo, statistics, GitHub calendar/attribution
src/rendering/            Calendar layout, instanced city, sky, viewport, picking, export
src/interaction/camera.ts  Smoothed camera and pointer/keyboard gestures
src/ui/                   Plain DOM shell, legend, tooltips, statistics, inspector
src/main.ts               Loading lifecycle, share URLs, export, cleanup
server/                   Shared endpoint service and public-calendar parser
api/city.ts               Vercel/Node adapter
worker/index.ts           Sites Worker adapter
scripts/build-sites.mjs   Self-contained Sites artifact builder
docs/                     Verification notes and recorded live data comparison
```

## Troubleshooting

- **WebGL unavailable:** Enable graphics acceleration or use a WebGL 2-compatible browser. The daily table and GitHub loading remain available.
- **Only grey activity:** The calendar loaded, but commits could not be matched. Open the data notes; anonymous API limits or omitted/private repositories may explain it.
- **Public calendar format changed:** Try the optional token or configure the server token to use GraphQL. The app reports the error and preserves the previous city.
- **Invalid token / rate limit:** Check token access or retry after the limit resets. Tokens are cleared after the attempt.
- **Share fails to copy:** Copy the address-bar URL. Clipboard access requires a supported secure context.
- **Dependency errors:** Use a supported Node version and `npm ci`.

The user accepted the written specification and a new minimal design because the original prototype is unavailable. Live public-calendar verification is recorded; authenticated GraphQL, actual GPU rendering, physical-device touch feel, and the sustained 60 fps target remain separate checks in [verification notes](docs/verification.md).
