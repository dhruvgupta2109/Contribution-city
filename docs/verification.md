# Verification

This file separates verified behavior from checks that require a browser, token, or deployment.

## Completed checks

- Clean installation and production TypeScript/Vite build were run successfully.
- A production build with a harmless `GITHUB_TOKEN` probe leaves the probe absent from all five client output files. The local runtime token remains unconfigured; no token value was inspected or printed.
- Incremental resize checks preserve explored zoom, viewing direction, and the centre ground point while default framing still adapts to portrait/landscape bounds. This covers camera math; physical-device review remains pending.
- Light-surface text contrast was measured numerically. Muted notes, placeholder text, eyebrow text, token help, and hovered actions were darkened where their previous ratios were below 4.5:1. The muted text now measures 4.90:1 on the page background.
- Automated tests verify the data, camera math, instanced geometry, LOD, filtering, DOM actions, loading lifecycle, API limits/failures, public-calendar parsing, and Worker asset serving. The expanded virtual-window vertex and fragment shaders pass GLSL ES 3 syntax/scope checks; this is not actual GPU compilation. Use `npm test` for the current suite count.
- The running local `/api/city` successfully loaded `dhruvgupta2109` without a token. It returned exactly 365 days and every day's segment sum matched its daily total.
- An independent Python HTML parser compares every returned date against GitHub's public contribution-calendar tooltips. The recorded result is in [live-calendar.json](evidence/live-calendar.json).
- The connected GitHub app confirmed repository access and real REST author-date response structure. Its supported tools do not provide GraphQL contribution queries or website runtime credentials.
- Vercel CLI reported `Logged out`. The existing Sites project is owned by the user and allows only its owner; publication preserves that audience.

## Pending browser/GPU checks

The computer-use tool reports no connected apps or browsers. Automated tests do not prove these checks passed.

- Inspect the default city, close-up floors/windows/roof, white hover outline, legend isolation/recolouring, and PNG output on an actual WebGL 2 renderer.
- Exercise wheel zoom, orbit/tilt, both zoom limits, double-click, Shift/right pan, keyboard controls, and reduced motion.
- On a touch device, combine pinch and pan; verify taps keep a day tooltip visible and scrolling the legend does not move the city.
- Review desktop, tablet, and phone layouts, focus appearance, contrast, tooltip bounds, and all colour-picker states.
- Profile a representative mid-range laptop for at least 60 seconds after rise animation: inspect frame times, sustained 60 fps, draw calls, allocations, and repeated loads. The app caps pixel ratio at 2, shares instanced geometry, throttles picking, and bounds window allocations; these are implementation measures, not measured GPU performance evidence.
- On localhost, `window.cityDiagnostics()` returns draw calls, triangles, frame interval, instance counts, and graphics memory counts without credentials.
- Exercise extreme activity and review procedural windows beyond the instance budget. Exact heights and bounded allocations are tested, but both rendering paths and their visual transitions need GPU review.

## Pending authenticated checks

- Configure a server `GITHUB_TOKEN`, then compare GraphQL daily totals with the same GitHub graph, including zero and busiest days.
- Test the password-field visitor-token path against real GitHub and verify the token is cleared after success, failure, and cancellation.

The authenticated loader is covered by mocked HTTP responses, including invalid/unknown users, rate limits, duplicate commits, 409/404, timeouts, page caps, concurrency, UTC author timestamps, and count clamping. Mocked checks are not live authenticated evidence.

## Deployed release evidence

- Version 7 deployed successfully at <https://contribution-city-dusk.bushy-horse-2013.chatgpt.site>.
- Native saved-version provenance matches the pushed source commit and packaged archive.
- Anonymous HTML access returns 401; existing owner-authorized HTML, assets, and API return 200.
- The hosted API retains all 365 daily totals while preserving partial repository commits when GitHub's anonymous rate limit is reached.
- The current live check returned 1,136 contributions. GitHub's anonymous rate limit stopped repository discovery, so attributed commits are zero and the whole calendar is retained as Other activity with a notice. Every daily segment sum matches its total. Earlier live checks with available quota verified partial attribution; the local comparison verified 739 attributed commits.
- See [deployment.json](evidence/deployment.json) for IDs, source SHA, and results.

## Remaining release checks

- Completed: exact packaged source published; version/deployment IDs retained.
- Completed: deployed HTML/assets/API verified with existing owner-authorized access.
- Completed: deployed URL and native publication result recorded in Plan.md.
- Complete the browser and authenticated checks above before describing every original release acceptance check as verified.
