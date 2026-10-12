# Contribution City

A year of GitHub activity as an interactive Three.js city. Vite + TypeScript, no UI framework. Buildings, windows, repo bands, roofs, lots, and road markings use instanced meshes. A procedural dusk sky is rendered inside the same canvas, including in PNG exports.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
cp .env.example .env
# Set GITHUB_TOKEN in .env to a valid GitHub token.
npm run dev
```

Open the printed localhost URL. The demo works with no token. Vite provides the same `/api/github?user=name` proxy used in production. Restart Vite after changing `.env`.

GitHub GraphQL requires authentication. A server-side token with access to public GitHub data is sufficient; a classic token without additional scopes can query public data. Do not grant broad private-repo permissions to a shared proxy. Never use `VITE_GITHUB_TOKEN`: Vite-prefixed variables become public client assets. `.env` is ignored by Git.

Visitors can instead open **Access token** and use their own token. This mode calls GitHub directly from their browser, includes up to 40 public non-fork repositories, clears the password field when the build starts, and never saves the token in browser storage, a URL, analytics, or logs. Repository listing is public even when using a visitor token; the contribution calendar can include GitHub's aggregate private activity, which appears as **Other activity**.

## Deploy on Vercel

1. Import this repository into Vercel. Select the Vite preset (the supplied `vercel.json` sets `npm run build` and `dist`).
2. Add **GITHUB_TOKEN** to the server environment for Production and any Preview environments you use.
3. Deploy. Vercel serves `dist` as static assets and `api/github.ts` as the single Node function. The function has a 60-second maximum, and collection stops within a 48-second budget.

No secret is needed during the client build. The production function reads its token from `process.env.GITHUB_TOKEN`. A plain static host also runs the demo and visitor-token fallback; without the function it cannot provide the default token-free GitHub flow.

### Optional Sites distribution

The private Sites preview uses `npm run build:sites` to package Vite's static assets and the same proxy into one Cloudflare Worker. Its source identity is in `.openai/hosting.json`; `worker/index.ts` is the adapter and `scripts/build-sites.mjs` embeds assets into the distribution. Set **GITHUB_TOKEN** as a secret in that Site's runtime environment and redeploy to enable token-free loading there. The Vercel deployment remains ordinary static files plus one function.

```sh
npm test       # Data accounting, API pagination/failures, proxy, layout
npm run build # TypeScript + production client build
npm run preview # Static production preview; use npm run dev for the local API
```

## Explore the city

| Action | Desktop | Touch / keyboard |
| --- | --- | --- |
| Orbit / tilt | Drag | One finger / arrow keys |
| Pan | Shift-drag or right-drag | Two fingers / Shift + arrows |
| Zoom toward a point | Wheel, double-click (2.2×) | Pinch |
| Zoom / reset | +, −, 1:1 controls | + / − / 0 keys when canvas is focused |
| Inspect a day | Hover | Tap |
| Isolate a repo | Click legend row; click again to clear | Tap or focus and Enter |
| Change a repo colour | Click colour swatch | Native keyboard/touch colour picker |
| Export | Save PNG | Exports the current canvas with sky |

Zoom spans 0.4×–16×. Auto-orbit resumes three seconds after interaction and pauses while a building is highlighted. `prefers-reduced-motion` disables auto-orbit and the initial rise. Share `?user=octocat` to load a username automatically.

## Data rules

- **Exactly 365 UTC dates**, ending today, come from GraphQL `contributionsCollection.contributionCalendar`. GitHub's count sets the total height: one floor per contribution, plus a small base slab. Inactive days are slabs. Missing dates are filled with zero.
- Repo discovery scans public, owned, non-fork repos sorted by push date, stopping before the rolling year. It selects at most **15** recent repos using the proxy, or **40** with a visitor token. Listing has a five-page safety limit. Repos with no commits by this user are omitted from the legend.
- Commits are fetched with `author`, `since`, and `until`, 100 per page, up to 12 pages per repo, across three workers. Duplicate SHAs within a repo are ignored. Contribution attribution uses the commit's **author date** (committer date is only a fallback).
- Repos sort by fetched commit count descending. Floors stack in that order. Each day's segments are clamped to its calendar count because GitHub's contribution eligibility and REST commit totals can differ. All remaining contributions become one grey **Other activity** segment, including PRs, issues, reviews, private activity, omitted repos, and unfetched commits.
- The legend's repo counts are the fetched commit totals; **Other activity** is the sum of unmatched calendar contributions. The 12-colour palette repeats for more than 12 repos; every repo remains independently recolourable and filterable.
- Empty repos (409) are skipped. Missing users, invalid tokens, and calendar failures show clear errors and leave the previous city visible. Rate limits, network errors, repo 404s, pagination limits, and time budgets retain partial attribution and show a notice. They never lower the contribution calendar's building heights.
- The proxy keeps a bounded in-memory cache (10 minutes, one minute for partial results) and shares simultaneous requests for the same username. Visitor-token results are not cached. Tokens and upstream error payloads are never logged or returned.

## Rendering and performance

The layout starts each week on Sunday, places weeks on X and weekdays on Z (the ground's second axis), adds a 1.1-cell street every four weeks, and puts an avenue between Wednesday and Thursday. Four window faces let the city be explored from any angle; each has three windows per floor. A deterministic integer hash keeps about 12% dark. Shader-based rise animates all instances without per-frame matrix updates.

When projected floors are less than 2.2 CSS pixels tall, the detailed window mesh is hidden and instanced repo bands are shown instead. At higher zoom, all individual floor windows are shown. Filtering and recolouring update instance colours immediately. A shared WebGL renderer draws the sky and city, with a maximum 1.75 device pixel ratio; rendering stops while the document is hidden, and motion-free idle scenes only redraw when needed.

The intended default view is 60 fps on a mid-range laptop, but hardware/browser profiling is needed to certify that target. Extremely high contribution totals create correspondingly more detailed window instances. There are no shadows, post-processing bloom, or per-building draw calls.

## Project structure

```text
src/city/renderer.ts   Instancing, sky, LOD, picking, animation, gestures, export
src/city/layout.ts     Calendar-to-world layout
src/data/github.ts    Shared GraphQL + REST collector (server or token fallback)
src/data/types.ts     Calendar normalization and conservative attribution
src/data/demo.ts      Deterministic generated demo
src/main.ts           Accessible DOM UI and request lifecycle
src/style.css         Responsive dusk interface
server/proxy.ts       Secret boundary, cache, API response handling
api/github.ts         Vercel function
tests/                Data, proxy, pagination/failure, and layout checks
```

The referenced `contribution-city-v3.html` was not present in the supplied workspace. This implementation follows the written visual and interaction specification; a side-by-side prototype comparison remains possible when that file is available.
