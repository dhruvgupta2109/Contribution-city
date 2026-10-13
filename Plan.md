# Contribution City — Phased implementation plan

## Current status

**Current goal: adapt the supplied Git City reference to a repository/commit city, with cars, traffic lights, parks, and the same smooth flight controls.** The earlier phase plan below remains the implementation history for the daily calendar view.

The user supplied `gitcity/git-city` and requested its city and flight experience. This supersedes the earlier calendar-first visual direction. Repository towers are now the default; **Days** retains the prior calendar. See `docs/gitcity-analysis.md` for the analysed reference files, exact flight tuning, geometry/palette mapping, and verification boundary.

On 13 October 2026 the user requested implementation of all remaining phases, emphasizing smooth zoom/rotation and a minimal, aesthetic interface. The user explicitly accepted the written specification and a new minimal design because `contribution-city-v3.html` is unavailable. This supersedes the earlier instruction to stop at individual phase boundaries.

The fresh implementation preserves the Vite/TypeScript/Three.js direction. It includes exact calendar geometry, instanced windows and LOD, smoothed pointer/touch/keyboard camera controls, picking, repository isolation/recolouring, statistics, GitHub GraphQL/REST loading, a token-free public-calendar fallback, responsive controls, sharing, PNG export, and both Vercel and Sites deployment adapters.

Public calendar data has been verified against live GitHub. A local headless Chrome 155 run on Apple M4 Metal now verifies map rendering and 60 seconds of flight; physical touch, reference-device feel, exact visual equivalence and live authenticated GraphQL remain pending. The existing owner-private Sites project is selected for release; Vercel support remains available, but its CLI is logged out.

## Goal

Turn a GitHub username's last 365 days of contributions into an interactive 3D city using the written requirements and the new minimal design accepted by the user.

Each day is a building. GitHub's contribution calendar determines its height. Repository commits determine the colours of its floors and windows; unmatched contributions appear as grey **Other activity**.

## How we will work

1. Continue across all phases as explicitly requested by the user.
2. Preserve each phase's deliverables and acceptance checks.
3. Record executed evidence and keep unavailable checks pending.
4. Keep the full objective active until the remaining release checks are resolved.

All implementation phases and their release work are now requested. Preserve the current private audience when publishing. Do not reuse the discarded code by default. Do not claim a check passed without running it; unavailable browser, API, or performance checks remain pending.

## Technical direction

- Vite + TypeScript, with plain DOM controls and no UI framework.
- Three.js, with instanced meshes for buildings and windows.
- Static client plus one serverless function; Vercel is the proposed deployment target.
- GitHub GraphQL for the contribution calendar and REST for repository commit attribution.
- Server-side GitHub token for the normal flow; optional visitor-token fallback.
- Deterministic demo data so rendering can be developed independently of GitHub access.
- No token persistence, token logging, or secrets in client assets.

## Phase overview

| Phase | Outcome                                                 | Depends on                      | Status                                                               |
| ----- | ------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| 0     | Reference reviewed and visual/data decisions recorded   | Written design accepted by user | Written specification accepted; decisions recorded                   |
| 1     | Minimal project and deterministic demo data             | 0                               | Implemented and automated checks pass                                |
| 2     | A correctly laid out 3D city with authoritative heights | 1                               | Implemented; browser verification pending                            |
| 3     | Repo floors, windows, roofs, rise animation, and LOD    | 2                               | Implemented; browser verification pending                            |
| 4     | Camera controls, picking, and day tooltips              | 3                               | Implemented; browser verification pending                            |
| 5     | Repo legend, live filtering/recolouring, and statistics | 4                               | Implemented; browser verification pending                            |
| 6     | Real contribution calendar through the GitHub proxy     | 5                               | Implemented; live public data verified, authenticated checks pending |
| 7     | Repository attribution and resilient partial results    | 6                               | Implemented; live public data verified, authenticated checks pending |
| 8     | Complete responsive, accessible product flows           | 7                               | Implemented; browser verification pending                            |
| 9     | Performance verification, documentation, and deployment | 8                               | Deployed privately; local M4 GPU pass, manual device/authenticated checks pending |

## Phase 0 — Review the reference and settle the specification

**Outcome:** A concrete reference checklist before any code is written.

### Deliverables

- Locate and inspect `contribution-city-v3.html`. It was not available in the supplied workspace during the previous attempt.
- Record its layout, typography, sky colours, camera angle, building proportions, lighting, animation timing, and control behaviour.
- Capture representative reference views: default city, close-up building, hover, repo isolation, and mobile layout where supported.
- Define how the rolling 365-day date range handles today and timezones so API data and labels agree.
- Resolve the palette limit: up to 15/40 repos cannot all have unique colours from only 12 fixed colours. Choose repeating colours or derived variations, keeping recolouring available.
- Record handling for extreme contribution counts without distorting building heights.
- Confirm the proposed static + Vercel function deployment structure.

### Acceptance checks

- [x] The user explicitly accepted proceeding from the written specification and a new minimal design.
- [x] Visual and interaction design notes are recorded below; the missing prototype is not the selected reference.
- [x] Date boundaries, palette behaviour, and extreme-height handling are settled.
- [x] The original pre-implementation sequencing checkpoint was superseded by the user's explicit Phase 1 and subsequent all-phase requests.

**Review checkpoint:** Agree on the reference and decisions before scaffolding.

### Foundation decisions recorded during the requested Phase 1 work

- **Date boundaries:** Exactly 365 consecutive UTC calendar dates, including the end date and the previous 364 dates. Labels use UTC as well. The demo has a frozen end date of `2026-10-13` and seed `contribution-city-v1`, giving `2025-10-14` through `2026-10-13`; real rolling dates will be supplied explicitly in Phase 6.
- **Demo palette:** Five fixed repository colours and grey `#8c93a5` for Other activity. For later real-repo attribution, the proposed 12-colour palette will repeat by overall repo rank beyond 12 repos; its exact swatches remain subject to reference review.
- **Extreme heights:** Daily totals remain authoritative and uncapped. The future renderer will retain linear heights and adapt framing rather than truncate contributions. No height geometry is implemented in Phase 1.
- **Deployment:** Vercel static client plus one function remains supported. Release uses the existing owner-private Sites project through a portable Worker serving the same client and the one `/api/city` endpoint; this avoids requiring a separate Vercel account.
- **Visual/interaction design:** Off-white page, restrained system typography, compact dark controls, an unobstructed dusk city, dark asphalt, blue buildings, and mint/lavender/amber repository lights. Camera: 42° perspective, initial azimuth 0.18 radians (0.9 on portrait screens), polar angle 0.86 radians. Rise: 1.2-second staggered ease-out. Zoom eases logarithmic distance at 12/s; rotation/pivot use frame-rate-independent 14/s easing. Browser/GPU verification remains pending: the computer-use tool reports no connected browser.

## Phase 1 — Project foundation and demo data

**Outcome:** A small running app backed by predictable data.

### Deliverables

- Create the Vite + TypeScript project and add Three.js.
- Establish separate modules for data, layout/rendering, interaction, and DOM UI.
- Define types for contribution days, repos, per-day segments, warnings, and city metadata.
- Generate deterministic fake data for exactly 365 dates, including quiet days, busy days, multiple repos, and Other activity.
- Add a minimal labelled app shell and WebGL-unavailable message.

### Acceptance checks

- [x] Development server and production build work (HTTP serving, TypeScript, and production asset checks; live browser rendering remains pending).
- [x] Demo data repeats consistently for a fixed date range and seed.
- [x] Per-day segment totals equal the day's contribution count.
- [x] No GitHub calls or secrets are needed to run the demo.

### Implementation notes

- Vite + strict TypeScript + Three.js, with separate data, rendering, interaction, and DOM UI modules.
- Exactly 365 deterministic dates with quiet days, busy days, multiple repositories, and Other activity. Repository totals, segment ordering, and metadata totals are derived from the same data.
- Labelled shell with a reload button and a keyboard-accessible daily data inspector. WebGL 2 absence or initialization failure retains the readable dataset and displays a fallback message.
- Renderer sizing and cleanup are in place; buildings and calendar geometry remain Phase 2 work.
- README documents clean installation, scripts, architecture, data contracts, current limits, and troubleshooting.

**Review checkpoint:** Inspect the data model and running shell. Detailed UI styling comes later.

## Phase 2 — Calendar layout and basic city geometry

**Outcome:** A city whose positions and heights accurately represent the demo calendar.

### Deliverables

- Place one building per day, with weeks on X and Sunday–Saturday along the ground's second axis.
- Preserve weekday alignment for partial first and last weeks.
- Group four weeks per block, with streets approximately 1.1 cells wide.
- Place the avenue between Wednesday and Thursday.
- Render dark asphalt, lighter block lots, and dashed yellow street-centre markings.
- Render inactive days as low slabs.
- Use a linear height scale: each contribution adds one floor's height.
- Shade building faces differently, using a dark-blue body around `#1f2b5e` and a lighter roof.
- Render a dusk gradient and sparse stars inside the renderer.
- Establish the reference camera view without full interactive controls yet.

### Acceptance checks

- [x] Exactly 365 buildings/slabs are allocated; actual GPU view remains pending.
- [x] Weekday positions, four-week streets, and avenue placement pass layout checks.
- [x] Doubling a count doubles activity height; extreme totals remain uncapped.
- [x] Empty days have slab geometry; actual visual inspection remains pending.
- [ ] Default composition and colours are visually reviewed against the accepted written design.

**Review checkpoint:** Approve the city silhouette, ground layout, and default camera view.

## Phase 3 — Repository floors, windows, and animation

**Outcome:** Buildings reveal the repo activity that created them.

### Deliverables

- Stack floors by repo in descending overall commit-count order, with Other activity on top.
- Use instanced windows: three per visible face per floor, with enough faces to support orbiting.
- Light windows in their repo's colour; leave about 12% dark using a deterministic hash.
- Add a small glowing roof square in the top floor's colour.
- Animate buildings rising with ease-out timing.
- Disable rise animation under `prefers-reduced-motion`.
- Switch to repo tint bands when individual floors are only a few pixels tall; restore detailed windows when zoomed in.
- Keep instance data reusable for later filtering and recolouring.

### Acceptance checks

- [ ] A close-up shows distinct floors and three windows on each visible face.
- [ ] Floor ordering and colours agree with the day's segments.
- [x] Deterministic dark-window checks pass, with approximately 12% dark.
- [x] LOD restores detail without changing building matrices or data order; actual visual transition inspection remains pending.
- [ ] Reduced-motion mode shows fully raised buildings immediately.

**Review checkpoint:** Compare a building close-up and default-distance lighting with the accepted written design.

## Phase 4 — Camera interaction and day inspection

**Outcome:** The city can be explored comfortably on desktop and touch devices.

### Deliverables

- Horizontal drag rotates; vertical drag tilts within agreed limits.
- Slow auto-rotation resumes three seconds after interaction and pauses over a highlighted building.
- Mouse-wheel and two-finger pinch zoom toward the cursor or finger centre.
- Add +/− controls, a 1:1 reset, and double-click zoom by 2.2×.
- Clamp zoom to 0.4×–16×.
- Pan with Shift-drag, right-drag, and two-finger drag.
- Pick buildings on hover or mobile tap and draw a white outline.
- Show date, total contributions, and coloured per-repo counts in a tooltip.
- Provide keyboard camera controls and visible focus treatment.
- Disable auto-rotation under `prefers-reduced-motion`.

### Acceptance checks

- [ ] All desktop controls work at both zoom limits.
- [x] Cursor/finger-centred zoom maintains its ground anchor throughout easing in camera-math checks.
- [x] Combined pinch/pan anchor checks pass; physical-device feel remains pending.
- [ ] Tooltips show the picked day's exact data and remain inside the viewport.
- [ ] Auto-rotation pauses/resumes as specified.
- [ ] Keyboard controls and reduced-motion behaviour work.

**Review checkpoint:** Review desktop and mobile exploration before adding more UI.

## Phase 5 — Repository legend and city statistics

**Outcome:** Users can explore individual repositories and understand the year's activity.

### Deliverables

- Add the scrollable top-right legend with swatches, repo names, and commit totals.
- Include Other activity and its unmatched contribution total.
- Clicking a row isolates that repo; clicking it again clears the filter.
- Keep only the selected repo's windows lit and dim buildings without that repo's activity.
- Clicking a swatch opens a colour picker and immediately updates all matching windows, bands, roofs, and tooltip dots.
- Add footer totals, busiest day, longest streak, and repository count.
- Keep legend controls labelled and keyboard-operable.

### Acceptance checks

- [ ] Isolation lights only the selected repo's windows.
- [ ] Clearing a filter restores the original city.
- [ ] Recolouring updates every representation immediately, including while filtered.
- [ ] Long repo lists scroll without blocking city controls.
- [x] Statistics pass known streak/tie and all-zero fixtures.

**Review checkpoint:** Approve filtering, recolouring, statistics, and legend placement.

## Phase 6 — Real GitHub calendar and serverless proxy

**Outcome:** A real user's city has the same daily totals as GitHub's graph.

### Deliverables

- Add one serverless endpoint that queries `contributionsCollection.contributionCalendar` using a server-side token.
- Normalize the response to the agreed last-365-day date range.
- Connect the username field and Build city action to the endpoint.
- Preserve the demo until a username is loaded successfully.
- Add loading, cancellation, missing-token, unknown-user, invalid-token, network, and GraphQL rate-limit states.
- Preserve the existing city when a new calendar cannot be loaded.
- Add the optional password-field token fallback, with direct GitHub requests and no persistence or logging.
- At this stage, represent all real contributions as Other activity until repo attribution is added.

### Acceptance checks

- [ ] For a real username, sampled daily totals match GitHub's graph, including zero and busiest days.
- [x] Exactly 365 normalized dates pass fixtures and the live public endpoint comparison.
- [ ] A visitor can load a username without supplying a token when the server secret is configured.
- [ ] The optional token fallback works without storing the token.
- [x] Errors retain the prior city; cancellation/stale-result lifecycle checks pass.
- [x] A production build with a harmless server-token probe contains none of that probe in any client asset.

**Review checkpoint:** Verify real contribution heights before adding attribution complexity.

## Phase 7 — Repository attribution and partial-data handling

**Outcome:** Real contributions are attributed to repos without changing calendar heights.

### Deliverables

- List the user's non-fork repos pushed in the last year.
- Cap discovery at 15 repos in normal mode and 40 with a visitor-supplied token.
- Fetch authored commits with `author` and `since`, using bounded pagination and concurrency.
- Count commits per day per repo, with the agreed commit-date policy and duplicate handling.
- Sort repos by commit count descending and assign colours using the agreed palette policy.
- Build per-day repo segments, followed by a single grey remainder for PRs, issues, reviews, private/omitted repos, and other unmatched activity.
- Clamp attribution to the authoritative daily count when GitHub eligibility or commit dates cause discrepancies.
- Handle empty repos (409), repo 404s, rate limits, timeouts, and pagination caps while retaining partial attribution.
- Show notices explaining incomplete attribution and preserve full calendar heights.

### Acceptance checks

- [x] Segment sums match all calendar counts in fixtures and the live public calendar comparison.
- [ ] Repo floors are ordered correctly and Other activity is last.
- [x] 15/40 repo limits, discovery and commit page caps, and concurrency are verified with HTTP fixtures.
- [x] 409s retain the full city; 404 and timeout partial results are checked too.
- [x] Rate-limit fixtures preserve fetched commits and produce a partial-result notice.
- [ ] Filtering and recolouring work with real repo data.

**Review checkpoint:** Compare real repo breakdowns and simulate partial results.

## Phase 8 — Complete product flows and responsive polish

**Outcome:** The full experience works across screen sizes and input methods.

### Deliverables

- Implement the header, form, optional token input, legend, tooltip, footer, and visual hierarchy using the accepted minimal design.
- Add `?user=name` loading and update shareable URLs after a successful build.
- Export the current view as PNG, including the sky background.
- Finish mobile layouts, touch hit areas, legend scrolling, and tooltip positioning.
- Verify control labels, keyboard navigation, contrast, focus styles, and reduced-motion behaviour throughout the app.
- Handle resize, repeated city builds, resource disposal, and graphics failures cleanly.

### Acceptance checks

- [x] Shared-URL loading and success-only URL updates pass application lifecycle checks; live browser flow remains pending.
- [ ] PNG export matches the current camera view and includes the sky.
- [ ] Desktop, tablet, and phone layouts remain usable without unintended overflow.
- [ ] All controls can be reached and operated by keyboard where applicable.
- [x] Stale-load cancellation and token clearing pass application checks; repeated GPU-resource profiling remains pending.
- [ ] The full UI is visually reviewed against the new minimal design accepted by the user.

**Review checkpoint:** Review the complete app before release verification.

## Phase 9 — Performance, documentation, and deployment

**Outcome:** A verified release deployed as static assets plus one function.

### Deliverables

- Profile the default 365-building view on a representative mid-range laptop.
- Verify a sustained 60 fps target and inspect draw calls, instance counts, and frame time.
- Exercise large activity totals, high zoom, resize, repeated loads, and mobile gestures.
- Fix measured bottlenecks while preserving exact heights and correct attribution.
- Run meaningful automated data/API checks, TypeScript checks, and the production build.
- Write README setup, server-token configuration, deployment, controls, limits, and troubleshooting instructions.
- Configure static hosting and the single proxy function with server-side secrets.
- Deploy only when explicitly requested at this phase; verify the live app after deployment.

### Acceptance checks

- [ ] Real-user heights match GitHub's graph.
- [ ] Close-up windows and floors are distinct.
- [ ] Repo isolation and live recolouring work correctly.
- [ ] Default-view performance meets the measured 60 fps target, or any remaining gap is documented for review.
- [ ] Mobile gestures and accessibility checks pass.
- [ ] The live app supports token-free visitors with a configured server token.
- [ ] PNG export, shareable links, and error states work in production.
- [x] README setup commands pass clean installation, automated checks, and production build; actual browser behavior remains pending.

**Review checkpoint:** Review release evidence and any remaining gaps before calling the project complete.

## Evidence log

Update this section after each phase. Previous implementation checks do not count toward the new build.

| Phase    | Work completed                                                                                                               | Checks and evidence                                                                                                                                                                    | Open issues                                                                                       | Review outcome                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| Planning | Phases and acceptance checks documented                                                                                      | Plan reviewed for coverage of the original brief                                                                                                                                       | Prototype availability; hosted preview still exists                                               | Awaiting review                   |
| 1        | Vite/TypeScript/Three.js foundation, deterministic demo generator, labelled shell, data inspector, graphics fallback, README | Clean `npm ci` succeeds; 18 automated data/DOM checks pass; TypeScript and production build pass; dev and production preview HTTP/asset checks pass; no GitHub API or secrets required | Reference review and actual browser/GPU checks pending; non-blocking Three.js bundle-size warning | Ready for review; stop at Phase 1 |

## All-phase implementation evidence

- `npm test`: 79 checks across the current source, server, and Worker modules pass. Tests are explicitly scoped to exclude the publication checkout and discarded implementation.
- TypeScript validates the frontend, Vercel adapter, shared server modules, Worker adapter, and build configuration. The Vite production build succeeds, with a separate Three.js engine bundle and its non-blocking size warning.
- The live public endpoint returned 365 dates for `dhruvgupta2109`; an independent parser compares each daily count with GitHub's public graph. See `docs/evidence/live-calendar.json` for the recorded range, totals, and samples.
- GitHub token flows use GraphQL calendar totals and REST attribution. HTTP fixtures exercise errors, caps, duplicates, author timestamps, clamping, partial results, and concurrency. No server token is configured, so live authenticated checks are still pending.
- Public-calendar fallback parses exact tooltip counts, covers both calendar years, and fails clearly on markup changes. It never estimates totals from colour levels.
- Responsive layouts, focus labels, native colour inputs, mobile hit areas, reduced-motion handling, URL sharing, PNG export, renderer resize/recovery, and disposal are implemented. Browser/GPU checks remain pending.
- Existing Sites project: `appgprj_6acd0af8fcd081919829766e050557f9`, known owner-private. Publication uses a separate `.site-publish/` checkout. GitHub's `origin` stays unchanged.
- Vercel CLI reports `Logged out`; Vercel configuration is included for future use. The user's connected GitHub app can access the repository but cannot supply a persistent website token or GraphQL contribution tool.

## Next action

The private release is live and the authorized endpoint is verified. Continue browser/GPU, authenticated GraphQL, physical-device interaction, and performance checks when their required access is available. Keep these requirements pending rather than calling the full release verified.

## Phase 9 publication evidence — 13 October 2026

- Published version **3** at https://contribution-city-dusk.bushy-horse-2013.chatgpt.site through the existing owner-private Sites workflow. Native deployment result: `succeeded`.
- Source provenance confirms commit `144db96dca0e05faca3657d52694bd6dd7490bad`; the archive was built from that pushed checkout.
- Anonymous access returns 401. Existing owner-authorized access returns 200 for HTML, all three referenced application assets, and `/api/city`.
- Live hosted API: 365 dates, 1,136 contributions, every daily segment sum correct. Explicit server User-Agent fixed discovery. GitHub's anonymous rate limit then stopped attribution after 72 commits; those results were retained and a clear notice was returned. Full calendar heights are unaffected.
- 71 automated checks pass. Clean `npm ci`, frontend TypeScript/Vite build, the self-contained Sites Worker build, Worker asset/API smoke checks, and whitespace checks pass. Server-token sentinel is absent from built artifacts.
- `docs/evidence/deployment.json` records the native version/deployment IDs, provenance, and HTTP evidence. `docs/verification.md` lists the remaining browser/GPU, physical touch, performance, and live authenticated gates.
- Current computer-use state has no connected browser. User was asked to connect Chrome or review the live site manually. No screenshot for this saved version is provided by Sites, so no visual check is claimed.

### Camera and accessibility follow-up

- Adaptive refits now ease across incremental resizes and preserve full default bounds on portrait and landscape screens; reduced motion applies the fit immediately.
- Right-drag pan still works when the cursor is over the sky near the horizon, at both zoom limits.
- 75 automated checks pass, including these camera cases. Actual browser/device feel remains pending.
- Light-surface text colours meet the measured 4.5:1 threshold. Frame diagnostics retain slow-frame intervals while camera simulation clamps its timestep; hidden-tab idle time is excluded.

### Large-history and day-detail follow-up

- Window allocations remain bounded to 180,000 instances. Buildings beyond the budget now use procedural windows on instanced repository bands, restoring close-up detail while retaining exact heights, filter states, colours, and the stable dark-window hash.
- Expanded vertex and fragment shaders pass GLSL ES 3 syntax/scope checks. Actual GPU compilation and appearance remain pending.
- Click/tap pins day details so long repository breakdowns can scroll. Escape or the close button dismisses details; pinned details pause automatic rotation.
- 78 automated checks pass, including shader parsing and pinned-detail dismissal.

### Publication — version 6

- Native deployment succeeded at https://contribution-city-dusk.bushy-horse-2013.chatgpt.site. Saved-version provenance matches pushed source `8b0d4b853c6d5333ee59a0f0aef5268f4c830db4` and its packaged Worker.
- Owner-authorized HTML and all three referenced application assets return 200. Anonymous access remains 401, preserving the private audience.
- `/api/city?user=dhruvgupta2109` returns 365 days and 1,136 contributions. All daily segment sums match; 207 fetched repository commits are retained when the anonymous GitHub rate limit is reached.
- Current release evidence is recorded in `docs/evidence/deployment.json`. Browser/GPU rendering, physical touch feel, sustained frame rate, and live authenticated token flows remain pending.

### Resize preservation follow-up

- Incremental viewport changes adapt the default framing, but retain explored zoom, orientation, tilt, and pan. This prevents phone browser-toolbar height changes from returning an explored city to its home view.
- The camera test exercises four consecutive aspect changes, checks that the camera never snaps, and verifies that zoom, viewing direction, and the centre ground point remain stable after easing. The full suite passes 79 checks.

### Current publication — version 7

- Native deployment succeeded; saved-version provenance matches pushed source `edd0195ccc4c09b40ba2d509dd3b9921573c5e64` and its packaged Worker.
- Owner-authorized HTML and all three current assets return 200; anonymous HTML remains 401.
- The API returns all 365 dates and 1,136 contributions, with correct segment sums. Anonymous GitHub quota is exhausted during discovery in this check; the response reports the limit and retains all totals as Other activity. Earlier attributed-commit evidence remains recorded above and in the independent local comparison.
- Browser inventory and a direct browser-open attempt both confirm that no browser is available. No local runtime GitHub token is configured, and the GitHub CLI is unavailable. Live GPU/touch/performance and authenticated-flow checks need an external access change.

## Git City adaptation — 13 October 2026

- [x] Analyse the supplied scene, layout, facade shaders, props, flight, tuning, themes, assets, and license.
- [x] Default to one repository tower per discovered project, using fetched authored commits and metadata. Keep raw commits distinct from calendar-matched attribution.
- [x] Retain quiet/unscanned projects; expose scan status and raw/matched totals in details and accessible tables.
- [x] Trace the actual home path and port its Bay Area map, SF footprint placement, road/sidewalk/park/coast geometry, water, bridges, landmarks, Kenney tree/car assets, map heights, home camera, navigation mappings and pixel-ratio/culling settings. Preserve the legacy grid only as a loading-error fallback.
- [x] Port the pixel facades, four themes, sky/fog and bloom.
- [x] Add moving cars, queued red/amber/green traffic signals, crossings, sidewalks, lamps, trees, benches, and a park fountain.
- [x] Adapt flight steering, persistent throttle, boost/brake, turn/climb easing, chase camera, bank/pitch, pause/resume, return-to-city and touch input.
- [x] Verify flight replay at 30/60/120/144 Hz, camera entry/resume, boundaries, hover and high-speed chase distance with meaningful simulation tests.
- [x] Keep the original Days view, share URLs, cancellation, repository colour/filter controls, and PNG export.
- [x] Preserve AGPL attribution/license and offer complete source; self-host maps/models/font and retain Kenney CC0, OpenStreetMap ODbL and Silkscreen OFL notices.
- [x] Current suite: 122 tests pass across 18 files; frontend TypeScript and production build pass.
- [x] Live local API for `dhruvgupta2109`: 365 dates, 1,140 graph contributions, 740 matched commits, 902 raw authored commits, 15 catalog projects, and 12 scanned repositories. Every daily segment sum matches the calendar. These are public-mode checks, not authenticated GraphQL evidence.
- [x] Publish the Git City adaptation privately from its exact source state. Models/maps/source return 200 and application assets match the build; Sites injects an HTML bootstrap.
- [x] Handle the hosted shared-IP GitHub quota: preserve exact calendar and HTML metadata, then retry anonymous public commits from the browser when the server fetched none.
- [x] Publish the public-retry follow-up as version 9, source `2440b6b4ec4998cebe461e09de8ca72c8c9fc0f0`. All 22 hosted files return 200; non-HTML files match the packaged bytes and HTML retains its mount/title/asset references. Anonymous access remains 401.
- [ ] User's manual browser review: reference appearance, actual fly/orbit feel, touch controls, lighting/bloom, readable layouts, PNG, and measured performance.

The user chose manual live-site review rather than connecting a browser. Preserve that preference; no actual GPU or physical touch pass is claimed by the automated tests.

### Git City release — version 9

Native deployment succeeded at the existing private URL. Saved-version provenance matches the pushed source and its archive. The 100-file source ZIP passes CRC checks and includes the maps/models/licenses and public-retry implementation. Hosted public API: 365 dates, 1,140 calendar contributions, 15 recovered repository names, correct daily segment sums; its shared GitHub quota is exhausted. The browser-side retry is deployed and independently recovered 900 raw authored commits / 740 matched commits in Node HTTP testing against live public REST. Actual browser/GPU appearance, flight feel, touch, PNG and sustained performance remain for the user's chosen manual review.

### Git City partial-quota follow-up

- [x] Retry whenever the shared server GitHub quota interrupts discovery or attribution, including after some commits were fetched. Merge the best scan per repository and reallocate daily segments once against the exact calendar.
- [x] Verify overlapping and distinct partial repository scans, server-better results, cancellation, and a saved live-data replay (3 server raw + 902 browser raw → 902 unique raw, 740 matched, 365 valid days). The 115-test suite and TypeScript pass.
- [x] Publish this partial-quota follow-up as version 10 from source `c5b148e738cec7c9a1b7578fb746aeeb99efe5c5`. All 22 hosted files return 200; non-HTML files match the packaged bytes, HTML retains its app references, and anonymous access remains 401. Live API: 365 days, 1,140 contributions, 15 catalog projects, 23 fetched commits before GitHub limited the server.

### Flight fidelity follow-up

- [x] Match the reference's 50 ms delayed-frame cap, immediate boost FOV, paused lens behavior, and window-level flight keys after HUD controls receive focus. Preserve native slider/button keyboard use and Escape.
- [x] Verify the 30/60/120/144 Hz replay, focus and input lifecycle, delayed frames, pause, boost/brake and source tuning in 117 tests; TypeScript passes.
- [x] Publish the flight follow-up as version 11 from source `90ebdc0cd5131bd769018070cb53ad91dbb90184`. All 22 hosted files return 200, non-HTML files match build bytes, HTML retains its app references, and anonymous access remains 401.
- [ ] User's chosen manual browser review: map/facade/traffic visuals, fly and orbit feel, touch, PNG, responsive layout and sustained performance. No browser is connected to the computer-use tool.

### Git City release — version 11

Native deployment succeeded at the existing private URL. Saved-version provenance matches the pushed source and Worker archive. The 102-file AGPL source ZIP passes CRC checks. The hosted API returns 365 dates, 1,140 calendar contributions, 15 catalog projects and correct daily segment sums. It fetched 86 raw authored commits (69 calendar-matched) before the shared GitHub quota stopped it. A data replay merges that exact hosted partial response with the independently captured public REST response: 902 unique raw authored commits and 740 calendar-matched commits, without changing any of the 365 daily totals. No actual browser/GPU rendering or touch performance is claimed; the user elected manual live review and was asked for any remaining differences.

### Urban skyline follow-up

- [x] Fill unused, road/park-cleared downtown footprints with up to 800 dim scenery buildings. Keep lit/pickable towers and repository counts tied only to real data. Clarify the distinction in the viewport and README.
- [x] Verify deterministic placement, no overlap with user towers or other scenery, a bounded 6–23-unit height range, and an approximately 3 ms Node CPU layout for the 16-tower live example. The 118-test suite and TypeScript pass.
- [x] Publish this skyline follow-up as version 12 from source `9a8aacda467aa838c1dc18d7699876ebfadf4c18`. All 22 hosted files return 200; non-HTML files match the packaged build, HTML retains the app references, and anonymous access remains 401. The live API returns 365 exact dates, 1,140 contributions and 15 catalog projects; the shared anonymous quota stopped commit scans at zero on this request. The browser-retry merge replay recovers the separately fetched 902 raw/740 matched commits while preserving every calendar count.
- [ ] Review its appearance and frame rate in a connected browser or through the user's manual report.

### Flight steering follow-up

- [x] Match Git City's window-wide mouse steering so movement across HUD controls continues to steer smoothly instead of freezing or resetting the pointer input. Keep touch joystick capture scoped to the city surface.
- [x] Add a regression that moves from the canvas onto a HUD button and verifies turn direction changes; all 119 tests and TypeScript pass.
- [x] Publish this steering follow-up as version 13 from source `68b91656adb1c3198d8bf7e8db822c50cf640a8c`. All 22 hosted files return 200; non-HTML files match the build bytes, HTML retains the app references, anonymous access remains 401, and the site remains owner-private. The API returns 365 exact days, 1,140 contributions and 15 catalog projects; shared anonymous quota stopped commit scanning on this request.
- [ ] Confirm mouse and touch feel in the user's manual live-site review.

### Token-free commit-history follow-up

- [x] Parse GitHub's public commit-history records, authored dates, repository/author identity and cursor pagination when the shared anonymous REST quota is exhausted. Bound scans to 40 owned projects, 300 commits each, and the server execution budget. Preserve exact calendar totals and the better of REST/HTML partial scans.
- [x] Verify the full local token-free flow against live public GitHub while REST is limited: 365 dates, 1,140 contributions, 15 projects, 902 raw authored commits and 740 calendar-matched commits in about 10 seconds. Compare all repository daily counts with independently captured REST results; only the 300-commit-capped project differs at its scan boundary. See `docs/evidence/html-commit-fallback.json`.
- [x] Keep browser REST retry available with a five-second budget after public history recovery; retain the original 20-second budget when the server has no recovered history. The 122-test suite and TypeScript pass.
- [x] Publish this fallback as version 14 from source `628a6c905345ec5e451a1e47429f86f0599290fd`. All 22 hosted files return 200; non-HTML files match the build bytes, HTML keeps the app references, anonymous access remains 401, and the audience remains owner-private. The live hosted API recovered 902 raw authored commits and 740 calendar-matched commits for `dhruvgupta2109` while REST remained rate-limited, with 365 exact days, 1,140 contributions and 15 catalog projects. Merging the hosted result with independent live REST data does not double-count commits.
- [ ] Review the rendered repo skyline and flight feel in the user's chosen manual browser check.

### Broader public-profile follow-up

- [x] Check a second live public profile under the exhausted anonymous REST quota. `gaearon` returned 365 exact days, 865 contributions and 90 catalog projects. Raising the bounded public-history scan from 15 to 40 owned projects increased completed scans from 14 to 28 in under nine seconds; 140 raw authored commits and 127 calendar-matched commits remained stable, with all daily sums valid. See `docs/evidence/second-profile.json`.
- [x] Publish the broader scan as version 15 from source `f6360362b5353146b8cfc7e512dffe9bcdeaaa5d`. All 22 hosted files return 200; non-HTML assets match the build bytes, HTML keeps app references, anonymous access remains 401, and owner-private access is unchanged. The original profile still returns 365 days, 1,140 contributions, 902 raw/740 matched commits. A second hosted profile returned 365 days, 865 contributions, 301 catalog projects, 61 scan-complete projects, 140 raw/127 matched commits and valid daily sums; partial REST discovery enlarged its catalog before the shared limit stopped it.
- [ ] Review the rendered city and flight controls on a device.

### Browser map and flight follow-up

- [x] Fix map decoding for Vite's `Content-Encoding: gzip` response. Fetch already inflates that response, while the Sites Worker serves raw `.gz` bytes. The worker now handles both modes; two regression tests cover them.
- [x] Render the real `dhruvgupta2109` city in local Chrome 155 on Apple M4 Metal: 16 repository/Other towers, 800 dim scenery buildings, 96 cars, 14 traffic heads and 1,017 mapped parks. Capture map, focused tower, flight and 390×844 responsive views; the mobile document has no horizontal overflow.
- [x] Sample a 60-second headless Metal flight with steering, Shift boost and W climb. Twelve five-second samples showed 16.66–16.67 ms frame-interval EMA, 60–63 draw calls and 2.6–2.7 million triangles; speed rose 55→137 u/s and altitude 676→900 u. This is one high-end GPU, not a mid-range or physical-touch pass. See `docs/evidence/headless-flight.json`.
- [x] Correct the idle Fly button's text color over lime. Computed contrast is 11.96:1 in Chrome; mobile viewport width and document scroll width are both 390 CSS pixels.
- [x] Publish version 16 from source `8350711bce4706ca4de45c33b46640ff183e6920`. All 22 hosted files return 200, non-HTML files match build bytes, anonymous access remains 401, and the owner-private audience is unchanged. The hosted map is valid raw gzip matching the build; local Vite's decoded response was verified in Chrome. The real-user API returns 365 days, 1,140 contributions, 902 raw authored commits and 740 calendar-matched commits with valid daily sums.
- [ ] User's manual comparison with Git City and physical touch/flight feel on their device.
