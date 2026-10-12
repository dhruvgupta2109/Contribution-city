# Contribution City — Phased implementation plan

## Current status

**Planning only. No implementation phase has started.**

The previous implementation has been removed from the working tree. The project will be rebuilt one phase at a time. Existing Git history is retained for recovery; it is not the basis of the new implementation.

The previously published private preview is separate from the local reset. It remains hosted because the available Sites tools do not provide deletion or unpublishing. No further publishing is part of this planning task.

## Goal

Turn a GitHub username's last 365 days of contributions into an interactive 3D city that matches the appearance and behaviour of `contribution-city-v3.html`.

Each day is a building. GitHub's contribution calendar determines its height. Repository commits determine the colours of its floors and windows; unmatched contributions appear as grey **Other activity**.

## How we will work

1. Start a phase only when explicitly requested.
2. Implement only that phase's deliverables and the prerequisites it lists.
3. Verify its acceptance checks and record the evidence here.
4. Present the result for review, including any gaps or decisions needed.
5. Stop at the phase boundary. Continue after the user requests the next phase.

Do not install dependencies, scaffold an app, write implementation code, or deploy while this plan is being reviewed. Do not reuse the discarded code by default. Do not claim a check passed without running it; unavailable browser, API, or performance checks remain pending.

## Technical direction

- Vite + TypeScript, with plain DOM controls and no UI framework.
- Three.js, with instanced meshes for buildings and windows.
- Static client plus one serverless function; Vercel is the proposed deployment target.
- GitHub GraphQL for the contribution calendar and REST for repository commit attribution.
- Server-side GitHub token for the normal flow; optional visitor-token fallback.
- Deterministic demo data so rendering can be developed independently of GitHub access.
- No token persistence, token logging, or secrets in client assets.

## Phase overview

| Phase | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| 0 | Reference reviewed and visual/data decisions recorded | Prototype available for comparison | Pending |
| 1 | Minimal project and deterministic demo data | 0 | Pending |
| 2 | A correctly laid out 3D city with authoritative heights | 1 | Pending |
| 3 | Repo floors, windows, roofs, rise animation, and LOD | 2 | Pending |
| 4 | Camera controls, picking, and day tooltips | 3 | Pending |
| 5 | Repo legend, live filtering/recolouring, and statistics | 4 | Pending |
| 6 | Real contribution calendar through the GitHub proxy | 5 | Pending |
| 7 | Repository attribution and resilient partial results | 6 | Pending |
| 8 | Complete responsive, accessible product flows | 7 | Pending |
| 9 | Performance verification, documentation, and deployment | 8 | Pending |

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

- [ ] The prototype has been reviewed, or the user has explicitly accepted proceeding from the written specification.
- [ ] Visual and interaction reference notes are recorded.
- [ ] Date boundaries, palette behaviour, and extreme-height handling are settled.
- [ ] No implementation has begun.

**Review checkpoint:** Agree on the reference and decisions before scaffolding.

## Phase 1 — Project foundation and demo data

**Outcome:** A small running app backed by predictable data.

### Deliverables

- Create the Vite + TypeScript project and add Three.js.
- Establish separate modules for data, layout/rendering, interaction, and DOM UI.
- Define types for contribution days, repos, per-day segments, warnings, and city metadata.
- Generate deterministic fake data for exactly 365 dates, including quiet days, busy days, multiple repos, and Other activity.
- Add a minimal labelled app shell and WebGL-unavailable message.

### Acceptance checks

- [ ] Development server and production build work.
- [ ] Demo data repeats consistently for a fixed date range and seed.
- [ ] Per-day segment totals equal the day's contribution count.
- [ ] No GitHub calls or secrets are needed to run the demo.

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

- [ ] Exactly 365 buildings/slabs are present.
- [ ] Weekday positions, four-week streets, and avenue placement are correct.
- [ ] Doubling a count doubles the activity portion of its building height.
- [ ] Empty days remain visible as slabs.
- [ ] Default composition and colours are compared with the prototype.

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
- [ ] Dark-window patterns stay stable across frames and reloads with the same seed.
- [ ] LOD switches cleanly without changing heights or repo ordering.
- [ ] Reduced-motion mode shows fully raised buildings immediately.

**Review checkpoint:** Compare a building close-up and default-distance lighting with the reference.

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
- [ ] Cursor/finger-centred zoom maintains the chosen ground point.
- [ ] Pinch and pan can be combined without jumping.
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
- [ ] Statistics are correct for known fixtures, including all-zero activity.

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
- [ ] There are exactly 365 normalized dates.
- [ ] A visitor can load a username without supplying a token when the server secret is configured.
- [ ] The optional token fallback works without storing the token.
- [ ] Errors are clear and retain the previous city.
- [ ] Built client assets contain no server token.

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

- [ ] Each day's segment sum equals its calendar count.
- [ ] Repo floors are ordered correctly and Other activity is last.
- [ ] The 15/40 limits and pagination boundaries are verified.
- [ ] 409s do not fail the city build.
- [ ] Rate limits preserve pages already fetched and display a clear notice.
- [ ] Filtering and recolouring work with real repo data.

**Review checkpoint:** Compare real repo breakdowns and simulate partial results.

## Phase 8 — Complete product flows and responsive polish

**Outcome:** The full experience works across screen sizes and input methods.

### Deliverables

- Match the prototype's header, form, optional token input, legend, tooltip, footer, and visual hierarchy.
- Add `?user=name` loading and update shareable URLs after a successful build.
- Export the current view as PNG, including the sky background.
- Finish mobile layouts, touch hit areas, legend scrolling, and tooltip positioning.
- Verify control labels, keyboard navigation, contrast, focus styles, and reduced-motion behaviour throughout the app.
- Handle resize, repeated city builds, resource disposal, and graphics failures cleanly.

### Acceptance checks

- [ ] A shared URL loads the requested username.
- [ ] PNG export matches the current camera view and includes the sky.
- [ ] Desktop, tablet, and phone layouts remain usable without unintended overflow.
- [ ] All controls can be reached and operated by keyboard where applicable.
- [ ] Repeated loads do not retain stale data, filters, or tokens.
- [ ] The full UI has been compared with the reference.

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
- [ ] README setup can be followed from a clean checkout.

**Review checkpoint:** Review release evidence and any remaining gaps before calling the project complete.

## Evidence log

Update this section after each phase. Previous implementation checks do not count toward the new build.

| Phase | Work completed | Checks and evidence | Open issues | Review outcome |
| --- | --- | --- | --- | --- |
| Planning | Phases and acceptance checks documented | Plan reviewed for coverage of the original brief | Prototype availability; hosted preview still exists | Awaiting review |

## Next action

Review this plan. When requested, begin **Phase 0** only; implementation starts with Phase 1 after the reference decisions are settled.
