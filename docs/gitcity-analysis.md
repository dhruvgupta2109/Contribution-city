# Git City reference analysis and adaptation

Supplied reference: `gitcity/git-city`, upstream <https://github.com/srizzon/git-city>.

## Actual home scene

`home-client.tsx` and `city-snapshot-client.ts` default to `/maps/bay.json`, with San Francisco footprint candidates from `/maps/sf.json`. The earlier block-grid path in `city-layout-core.ts` is a fallback, not the default home scene.

The adaptation retains the reference's Bay Area geography, triangulated parks, blurred land-mask coastline, Catmull–Rom road/sidewalk ribbons, original Golden Gate and Bay Bridge geometry, animated water, Alcatraz/GitHub HQ landmarks and lighthouse beam. The two map assets are served locally as gzip and prepared in a Web Worker. It retains 25,000 radial footprint candidates, excluding roads, parks and the downtown plaza. Repository placement uses the source's spacing rule to prevent overlaps.

`SFMapLayers.tsx` supplies six Kenney tree models, deterministic park/street sampling, palette and material values, the ground relief shader and tree culling. The resulting map contains 1,017 park polygons and 11,001 trees. The reference artwork also shows dim background buildings around brighter data towers. This adaptation places up to 800 short, neutral buildings on unused nearby footprint candidates, without repo IDs or commit lighting; these are never counted or picked as user repositories. The 1.25 pixel-ratio cap, fog and tree culling follow the reference. Cars use its Kenney sedan/wheel assets on 48 nearby map road routes. Additional signal poles, zebra crossings, benches, lamps and fountains are instanced.

The map variant uses heights **10–360**, its power-1.3 composite score curve, and 4-unit floor/window spacing. The fallback block grid uses 35–600-unit towers, 6-unit floors, 4×4 lots, 153×129-unit blocks and 20-unit roads. Those fallback values are not the default map proportions.

`IntroColdOpen.tsx` and the orbit reset supply the home camera **[-800,700,-1000]** and target **[0,70,0]**. The main map uses FOV 55°, near/far 6/16,000, orbit distance 40–36,000, left/one-finger pan, right/Shift/Ctrl orbit, middle drag zoom, and two-finger dolly/rotate. Manual map interaction stops automatic rotation. This implementation retains its existing frame-independent eased controller and facade/ground cursor anchor.

## Flight

`CityCanvas.tsx` contains `VehicleFlight`; `FlyTune.tsx` provides cruise 55 u/s, throttle cap 10×, Shift boost 2.5×, speed easing 2.2/s, turn easing 9.5/s, climb easing 6.5/s, chase arm 74 u, height 24 u, yaw lag 6.3/s and height lag 4.2/s. These are copied into `flight.ts`.

Steering uses an 8% deadzone then a squared response. Wheel sets persistent throttle; Shift boosts; Q/Alt brakes; W/S climb; A/D turn; Space/P pauses; Escape pauses/exits; R points toward downtown. The chase camera eases yaw and height while keeping its arm attached at high speed. Boost adds an immediate 10° lens kick and subtle shake. Delayed frames are capped to 50 ms as in the reference; pause holds the current lens. The original paper-plane model, two point lights and 48-point fading contrail are retained.

The adaptation adds fixed 1/240-second simulation steps, smooth entry/resume, a touch joystick, throttle slider and held Boost/Brake buttons. Blur/visibility pauses and releases inputs. Flight remains an exploration camera without building collision physics, as in the reference.

## Data mapping

| Reference                          | Contribution City                                           |
| ---------------------------------- | ----------------------------------------------------------- |
| One profile per tower              | One discovered repository per tower                         |
| Profile contribution/star score    | Raw authored commits fetched, repo stars and size           |
| Ranked downtown profiles           | Active repositories assigned downtown footprints            |
| Random activity window atlas       | Temporal buckets covering 365 days of fetched repo activity |
| Generic scene decoration           | Original map/models plus moving, queued traffic and signals |
| Four theme palettes, sky and bloom | Adapted Emerald, Midnight, Sunset and Neon                  |

Raw fetched commits stay distinct from calendar-matched commits. The **Days** view preserves exact daily calendar heights. Repository heights are normalized scores, not one floor per commit. The catalog retains up to 500 public projects through REST; under anonymous API limits, up to 90 project names are recovered from public profile pages. Default-branch REST scans cover 15/40 projects and 300 commits each with bounded concurrency/time. Public commit-history pages can recover authored dates for up to 40 owned projects under the same 300-commit and server-time caps. Quiet and unscanned projects remain labelled. If the shared server quota interrupts scanning, an anonymous browser REST retry uses the visitor’s separate quota for five seconds after HTML recovery or twenty seconds otherwise. It selects the best available scan per repository and reapplies the verified calendar once, retaining server results on failure. Other calendar activity has its own labelled tower.

Accounts, purchases, leaderboards, multiplayer and driving-game services are outside this adaptation. The plain Vite/Three.js app reuses the scene/motion math without porting the reference's React/server service stack.

## Attribution and verification

Adapted code and the paper plane retain Git City's AGPL-3.0 attribution. The footer offers the complete adaptation source. Kenney models are CC0; map data is © OpenStreetMap contributors under ODbL; Silkscreen is OFL. See [NOTICE](../NOTICE).

Automated evidence covers full map geometry, a 500-project non-overlapping layout, traffic stop lines/turns/replay, flight at 30/60/120/144 Hz, orbit/input lifecycle, data boundaries, and expanded shader syntax. CPU preparation time is not a GPU frame-rate measurement.

The user chose manual live-site review. Local headless Chrome on Apple M4 Metal now supplies WebGL map/facade screenshots and a 60-second flight frame-interval sample. Exact appearance versus the reference on the user's device, physical touch, PNG appearance and mid-range performance remain manual checks before claiming visual equivalence. See [verification](verification.md).
