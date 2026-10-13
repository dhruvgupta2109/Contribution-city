# Contribution City

A Git City-style city made from a GitHub user's repositories and authored commits. Explore pixel-lit repository towers, parks and streets with moving cars and traffic lights, or fly through the skyline with the reference's tuned controls.

**Private live site:** <https://contribution-city-dusk.bushy-horse-2013.chatgpt.site>

The supplied `gitcity/git-city` reference was analysed and adapted. See [reference analysis](docs/gitcity-analysis.md), [verification notes](docs/verification.md), and [NOTICE](NOTICE). The original daily contribution city remains available under **Days**.

## Run locally

Use **Node.js 24 LTS** (also supported: Node 22.12+ in the 22 release line, or Node 26+).

```sh
npm ci
npm run dev
```

Open the Vite URL, normally <http://localhost:5173>. **Demo** loads fictional, deterministic activity immediately. Enter a GitHub username and choose **Build city** for real repositories and commits. The dev server includes the production-style `/api/city?user=username` endpoint.

The maps, trees, cars, font, paper plane, and source offer are self-hosted. No external fonts, model service, database, multiplayer server, or login is needed for the demo. Repository and daily data tables remain usable when WebGL 2 is unavailable.

## City views

**Repos** is the default: one tower per discovered project, ranked by authored commits fetched during the displayed 365-day UTC period. An explicitly labelled Other activity tower represents calendar contributions that could not be matched.

The scene uses Git City's actual **Bay Area map**, San Francisco building footprints, smoothed road/sidewalk geometry, coastline, parks, animated water, Golden Gate Bridge, Bay Bridge, Alcatraz and GitHub HQ landmarks. Repository towers occupy road/park-cleared footprints near downtown. The 25,000 candidate lots support the full catalog. Around them, 800 subdued buildings fill unused nearby lots so a user with few repositories still sees a lived-in skyline; these buildings are scenery and never claim to represent repositories or commits.

Tower heights use the reference map's normalized commit/star score and repository size, within **10–360 world units**, with 4-unit window/floor spacing. Pixel windows aggregate all 365 days of each repository's activity into temporal buckets; they do not claim one window per commit.

Map geometry is prepared off the main thread from two compressed local files. A loading state disables flight until it is ready. If loading fails, a notice explains the reference-sized block-grid fallback (35–600-unit towers); repository data remains usable.

The map loader accepts both raw `.gz` files and servers that advertise `Content-Encoding: gzip` and let browser Fetch decode them first. This keeps the reference map working in local Vite and the published Worker.

The city includes 1,017 mapped parks, 11,001 sampled trees using six original Kenney models, sidewalks, zebra crossings, lamps, benches, fountains, and 96 moving Kenney cars on 48 nearby road routes. Signals cycle through green, amber and red with an all-red safety interval. Cars stop before crossings, queue behind one another, resume on green, and make smooth turns at route ends. Reduced-motion preferences freeze ambient traffic and disable rise animation, orbiting and flight shake.

**Days** retains the original calendar: exactly 365 buildings/slabs, aligned by weekday, with linear activity height `0.12 + contributions × 0.24`. Calendar totals remain authoritative; repository bands stack below grey unmatched activity. Instanced/procedural window detail, filtering and recolouring remain available in this view.

**Emerald**, **Midnight**, **Sunset**, and **Neon** adapt the reference's sky and facade palettes. Bright windows and lights use bloom. Click/tap a building to pin details; Escape or × dismisses them. The legend supports isolation and colour changes.

## Orbit controls

| Action              | Desktop                           | Touch / keyboard                  |
| ------------------- | --------------------------------- | --------------------------------- |
| Pan                 | Left drag                         | One-finger drag; arrows           |
| Rotate / tilt       | Right or Shift/Ctrl drag          | Two-finger motion; Shift + arrows |
| Zoom toward a point | Scroll at the cursor; middle drag | Pinch at the finger centre        |
| Zoom in 2.2×        | Double-click                      | + button                          |
| Reset               | 1:1 button                        | 0 or Home                         |
| Inspect             | Hover; click to pin               | Tap; accessible data tables       |

The repository map uses the reference's home camera `[-800, 700, -1000]`, target `[0, 70, 0]`, 55° field of view, and **40–36,000-unit** orbit distance range. Zoom and angles ease independently; manual map interaction stops automatic rotation. Resizing preserves the explored view. Repository details and legend buttons can frame a specific tower.

**Days** uses left/one-finger orbit, Shift/right/two-finger pan, and its original **0.4×–16×** zoom range. Its default framing adapts to screen proportions and rotation resumes after interaction.

## Flight controls

Choose **Fly**. The paper plane enters from the current view with a short camera transition.

| Action                | Input                               |
| --------------------- | ----------------------------------- |
| Steer / climb         | Mouse position; touch joystick drag |
| Turn                  | A / D or Left / Right               |
| Climb / dive          | W / S or Up / Down                  |
| Persistent throttle   | Wheel or throttle slider            |
| Temporary boost       | Hold Shift or Boost                 |
| Temporary brake       | Hold Q / Alt or Brake               |
| Pause / resume        | Space / P or Pause / Resume         |
| Pause, then exit      | Escape                              |
| Point toward the city | R                                   |
| Exit                  | Exit or Flying button               |

Flight retains the reference's **55 u/s cruise**, **10× throttle cap**, **2.5× Shift boost**, **74 u chase arm**, **24 u chase height**, squared 8% steering deadzone, and tuned turn/climb/speed/camera easing. The chase arm smooths angle and height rather than accumulating position lag. Fixed 1/240-second simulation steps make trajectories consistent across display refresh rates. The original model, two craft lights and fading contrail are included. Flight keys work after the HUD takes focus. Buttons and sliders keep their native keyboard controls; Escape can still pause or exit. Blur or a hidden page pauses flight and clears held inputs.

Mouse steering follows the pointer across the whole window, including HUD controls. Touch steering stays on the city surface's captured joystick pointer.

Flight altitude is clamped to 25–900 world units. These are scene units, not a physical aircraft simulation. Like the reference, flight is an exploration camera and does not simulate building collisions.

## GitHub data and limits

The server supports two calendar modes:

- With `GITHUB_TOKEN`: GitHub GraphQL contribution calendar plus REST repository/commit requests.
- Without it: exact counts from GitHub's public calendar tooltips plus unauthenticated REST, with public commit-history pages as a bounded fallback when the shared REST quota is exhausted.

Repository discovery retains up to **500 public projects** over five pages. Quiet and unscanned projects remain visible. Commit scans cover up to **15 recently pushed non-fork repositories** normally, or **40** with a visitor token. Scans use GitHub's default-branch commit endpoint, not every branch. Each scans at most **300 authored commits**, with **three** concurrent workers. Individual requests have a 10-second limit and the calendar/REST scan has a 45-second budget.

The catalog distinguishes raw authored commits fetched from commits matched to the calendar. Commit author timestamps are normalized to UTC and duplicate SHAs are removed per repository. Daily attribution is clamped to the graph and the remainder stays Other activity; clamping never changes the raw repository activity used by the repository city.

Rate limits, missing repositories, page caps and timeouts preserve available results. During anonymous API limits, the server can recover public repository names, stars and language from up to three GitHub HTML pages within nine seconds. It then reads authored dates and pagination from public commit-history pages for up to 40 owned projects and 300 commits per project, within the remaining server budget. These are real commit records, not estimates. A live token-free local check recovered 902 raw authored commits and 740 calendar-matched commits while the REST API was limited; see [verification](docs/verification.md). If the shared server quota interrupts scans, the client also retries anonymous REST from the visitor’s browser, retaining the verified calendar and best scan per repository. The retry budget is 5 seconds after public history recovered commits, or 20 seconds otherwise. Partial/unavailable scans are labelled; an unscanned zero is not evidence of no activity. Public results are cached for two minutes, up to 50 users. A failed/cancelled new load preserves the prior city.

An optional password-field visitor token makes direct browser-to-GitHub requests. It is cleared after the load and never stored in local/session storage or URLs. The connected GitHub app in Codex does not supply the website's runtime token.

To use a server token locally:

```sh
cp .env.example .env.local
```

Set `GITHUB_TOKEN` in the ignored file, then restart Vite. Keep it server-side; **do not use a `VITE_` variable**.

## Sharing and export

**Share** copies the URL; `?user=username` loads that user automatically. The URL updates only after a successful build. **Export PNG** downloads the current rendered view, including the sky and lighting, without the page controls.

## Checks and builds

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

Tests cover data/API boundaries, raw versus matched commits, catalog retention, geometry, facade activity, filtering, traffic stop/conflict/replay behavior, orbit anchors and resizing, flight across 30/60/120/144 Hz, pause/resume, DOM controls, loading lifecycle, map decoding, and expanded GLSL syntax. A local headless Chrome run rendered the reference map on an Apple M4 Metal GPU and sampled 60 seconds of flight near 16.7 ms per frame at 1440×900. See [verification](docs/verification.md) for screenshots and limits. Visual equivalence to Git City, physical-device touch feel, PNG appearance, and mid-range hardware performance still need manual review.

`npm run build` generates Vite client files in `dist/`. Preview serves the client without the local API; use the dev server or a visitor token for GitHub loading. The map uses the reference’s 1.25 device-pixel-ratio cap and view/distance-culls tree instances about ten times per second. The larger reusable Three.js bundle includes the flight model loader and postprocessing. Its size warning does not fail the build.

On localhost, `window.cityDiagnostics()` reports draw calls, triangles, frame interval, instance/prop counts and graphics memory without credentials.

## Deployment

**Vercel:** Use the Vite preset, `npm run build`, and output directory `dist`. `vercel.json` configures the one function in `api/city.ts`. An optional project `GITHUB_TOKEN` stays server-side.

**Sites:** The existing owner-private project is recorded in `.openai/hosting.json`.

```sh
npm run build:sites
```

This embeds the Vite files, local maps/models/font/licenses, and source ZIP into a Worker serving assets and `/api/city`. Output is `dist/server/index.js` plus hosting metadata. Run `npm run build` to return to the normal static build. Publication uses a separate ignored `.site-publish/` checkout and preserves the GitHub remote and private audience.

The Sites publication checkout sets its default build command to `npm run build:sites`; its downloadable source retains that command and the required hosting metadata. For a static build from that archive, run `npm run typecheck && node scripts/build-source.mjs && npm exec vite -- build`.

## Structure

```text
src/data/                       UTC calendar, demo, catalog, commit attribution
src/rendering/repository-*.ts    Repository lots, scores, pixel facades
src/rendering/world-*.ts         Background map loading and processing
src/rendering/map-*.ts           Reference geography, models, landmarks, traffic
src/rendering/traffic.ts         Signals and block-grid fallback traffic
src/rendering/themes.ts, sky.ts  Adapted palettes and sky
src/rendering/city-scene.ts      Original daily calendar renderer
src/rendering/viewport.ts        View switching, picking, bloom, export, cleanup
src/interaction/flight*.ts       Tuned flight simulation and input
src/interaction/camera.ts        Smooth orbit, anchored zoom, pan
src/ui/                         DOM controls, details, legends, data tables
server/, api/, worker/           Shared data service and deployment adapters
scripts/build-source.mjs         Credential-excluding source offer builder
docs/                           Reference analysis and verification evidence
```

## License and source offer

This adaptation is **AGPL-3.0-only**. Git City code, geometry, palettes and the paper plane retain attribution to Samuel Rizzon in [NOTICE](NOTICE); see [LICENSE](LICENSE). The Kenney tree and car assets are CC0. Map data is © OpenStreetMap contributors under ODbL 1.0; compressed source map data is included in the source offer. Silkscreen uses the included SIL Open Font License. Third-party license texts are in `public/licenses/` and `public/fonts/`.

The footer's **Source · AGPL-3.0** link downloads `/source.zip`. Builds generate it from an explicit source allowlist. Credentials, `.env.local`, dependencies, generated output, and the supplied reference checkout are excluded.

## Troubleshooting

- **Unlit repo / partial scan:** Inspect the scan status and data notes. Anonymous limits or public-history changes can leave some commit scans unavailable; use an optional token or retry after limits reset.
- **WebGL unavailable:** Enable graphics acceleration or use a WebGL 2 browser. Both data tables remain available.
- **Public GitHub markup changed:** Use a visitor/server token; the app preserves the previous city on calendar failure.
- **Flight stays paused:** Focus the canvas and press Space/P or choose Resume.
- **Share cannot copy:** Copy the address-bar URL.
- **Build problems:** Use a supported Node version and `npm ci`.

The user chose to review the live site manually. The headless Metal run verifies one local GPU configuration; it does not establish exact visual equivalence or touch feel on the user's device.
