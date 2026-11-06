# QA record

Current gate: P5 sprint race. P4 traffic acceptance and P2 final hero-vehicle art acceptance remain open; earlier checks are retained below.

## P0 exit criteria

| Check | Status | Evidence |
|---|---|---|
| UE 5.8.3 descriptor and engine root | Passed | `Tools/VerifyP0.ps1` checked engine `Build.version` and descriptor. |
| Standard Chaos Vehicles and Enhanced Input enabled | Passed | Descriptor, module rules and verifier. |
| Modular vehicle plugin absent from descriptor and source dependencies | Passed | Descriptor and verifier. |
| Game and editor targets build without compile errors | Passed | UBT reported `Result: Succeeded` for both. MSVC 14.51 emits an engine toolchain preference warning, not a compile error. |
| `L_P0Test` loads and Chaos vehicle proxy spawns | Passed | Final package runtime log excerpt below. |
| Windows Development package builds and launches | Passed | UAT `BUILD SUCCESSFUL`; final package window was responding in D3D12 SM6. |

Final package: `Packaged/Windows/RacingMVP.exe`. Runtime log: `Packaged/Windows/RacingMVP/Saved/Logs/RacingMVP.log`. The package was built and launched on 2026-10-01.

```text
UAT: BUILD SUCCESSFUL (BuildCookRun, Win64 Development)
LogRacingMVP: Display: P0 startup: pawn=RacingPlayerVehicle_2147482387, production Chaos wheeled movement=present, skeletal vehicle art/wheels pending P1
LogRacingMVP: Display: P0 Chaos vehicle proxy spawned: RacingPlayerVehicle_2147482387; movement=VehicleMovementComp
LogGlobalStatus: UEngine::LoadMap Load map complete /Game/RacingMVP/Maps/L_P0Test
```

No manual Unreal Editor setup is required for the P0 map or proxy. The later vehicle stage still needs final hero art and visual validation.

### P0 visual correction, 2026-10-01

The previous P0 exit record did not verify the rendered frame. A fresh Win64 Development `BuildCookRun` succeeded (`Saved/Logs/P0BuildCookRun.txt`), and the packaged executable launched and remained responsive. It loaded `/Game/RacingMVP/Maps/L_P0Test`; the runtime log (`Packaged/Windows/RacingMVP/Saved/Logs/RacingMVP.log`) reports `P0 visual check: ... production Chaos wheeled movement=present` and `P0 proxy visual=visible parts=6`. `Tools/VerifyP0.ps1` passed the UE 5.8.3, standard Chaos Vehicles, Enhanced Input, and forbidden Modular Vehicle checks. The captured frame [P0 daylight proxy](Evidence/P0_daylight_proxy.png) shows a blue sky, matte ground, and a blue body/cabin/wheel proxy centered in a chase view. No checkerboard material or black sky is visible in that frame. The test map and project defaults now point to P0. This is a visual smoke test, not P1 handling or final vehicle art approval.

## P1 exit criteria

P0 exit checks passed before P1 work began. The project was moved to `D:\chatgpt\Codex\unrealracinggame`; the old path is an empty directory held open by the desktop process.

| Check | Result | Evidence |
|---|---|---|
| UE 5.8.3 editor and Windows Development game build | Passed | UBT and UAT `BUILD SUCCESSFUL`, final cook 0 errors and 0 warnings. |
| Production Chaos Vehicles car, four wheels, automatic gears | Passed | Packaged log reports `SKM_SportsCar`, four wheel setup and automatic transmission. Moving car reached forward gears 1 and 2. |
| Keyboard W and S | Passed | Packaged telemetry showed positive speed with W and gear -1 with negative speed after S at rest. |
| Keyboard A and D | Passed | Final package telemetry showed steering -1.00 and +1.00 respectively. |
| Handbrake, reset, four camera modes | Passed | Packaged log showed handbrake=1, reset to spawn, and camera IDs 0 through 3 after C presses. |
| P1 test map and launch | Passed | `L_P1Test` generated and loaded in a responding packaged window. |

The input probes sent key messages to the game window and inspected its telemetry log. Visual wheel animation, cockpit composition, handling quality and extended playtesting have not been assessed. No manual Editor action is needed to build or run the P1 prototype; later visual refinement may require Editor work.

### Fresh verification, 2026-10-01

`Tools/VerifyP0.ps1` passed against the current project. `RacingMVPEditor` built successfully, and a fresh Win64 Development `BuildCookRun` ended with `BUILD SUCCESSFUL` and exit code 0. The newly launched `Packaged/Windows/RacingMVP.exe` remained responsive and loaded `/Game/RacingMVP/Maps/L_P1Test`; its log reports the production Chaos pawn, `SKM_SportsCar`, four wheels and automatic transmission. Keyboard probes of the packaged window produced positive forward speed in gear 1, gear 2, negative speed in reverse gear -1, negative and positive steering, handbrake input, reset to spawn, and camera IDs 0, 1, 2 and 3. Evidence: `Packaged/Windows/RacingMVP/Saved/Logs/RacingMVP.log` (22:29–22:31 UTC). This confirms input and telemetry behavior; visual camera framing and sustained handling still need a human play pass. No Unreal Editor setup is required for this P1 prototype.

## P2 temporary vehicle presentation

The user approved UE's temporary `SKM_SportsCar` for this phase. The Windows package uses `L_P2VehicleTest`, a lit daylight test scene with a grass ground plane plus asphalt, gravel, and grass lanes. A six-part blue proxy is visible on this map because the loaded SportsCar mesh does not appear in the packaged chase-camera frame. The configured template mesh remains on the Chaos pawn for continued investigation and later replacement.

| Check | Status | Evidence |
|---|---|---|
| Vehicle test map, daylight, normal ground materials | Passed | `Docs/Evidence/P2_runtime.png`; packaged log loaded `L_P2VehicleTest`. |
| Chaos pawn, four-wheel setup, automatic transmission | Passed | Packaged log reports `SKM_SportsCar`, 4 wheels, automatic transmission. |
| Chase HUD reads speed, RPM, gear, wheel slip, and physical surface | Passed | Runtime capture shows live values; log recorded driving and speed changes. |
| Asphalt, gravel, and grass physical materials | Implemented; runtime contact seen on asphalt and grass | HUD reports surface IDs 1 and 3 while driving; compare the lanes manually to verify feel. |
| Four cameras, reset, keyboard drive | Passed in existing P1 packaged probes | P1 records above; P2 HUD lists the keyboard bindings. |
| Headlights, brake/reverse lights, indicators, generated audio loops | Implemented and packaged; sensory behavior not fully play-tested | `Source/RacingMVP/Vehicle/RacingPlayerVehicle.cpp`, `VehiclePresentationComponent.cpp`, and `Content/RacingMVP/Audio`. |
| Template SportsCar art, cockpit and animated wheel presentation | Open | Current P2 runtime frame uses the visible proxy; template mesh integration needs Unreal Editor review. |
| 16 GB memory-streaming and P2 handling acceptance | Not tested | Requires sustained play and profiling on target hardware. |

The Win64 Development editor target compiled successfully and `BuildCookRun` completed with `BUILD SUCCESSFUL`. The final package launched in a responding window. Evidence: [P2 runtime frame](Evidence/P2_runtime.png) and `Packaged/Windows/RacingMVP/Saved/Logs/RacingMVP.log` (2026-10-02 21:07–21:08 UTC). The frame verifies the daylight scene, visible proxy, and HUD; it does not close final art acceptance.

## P3 Toronto-inspired city and roads

The P3 map is a fictional Toronto-inspired North American district. It uses downtown Toronto and St. Lawrence Market map results as broad street-pattern references and the City of Toronto Annex architecture route as a residential facade reference; buildings are original blockout geometry, not copies. Google Maps' interactive Street View could not be opened in this run, so no street-level site walk is claimed.

| Check | Status | Evidence |
|---|---|---|
| 1.1 km² daylight district with visible grass ground, asphalt, sidewalks and markings | Passed | Packaged frame `Evidence/P3_runtime.png`; bright sky and road materials render without material fallback warnings. |
| Residential rowhouses with window grids, storefronts, mid-rises and downtown towers | Passed for blockout | 8,174 instanced window details plus facade trims and 6 towers; shown in `Evidence/P3_runtime.png`. |
| Industrial edge, parking lot, short tunnel and tree-lined map boundary | Generated | Authored by `Tools/CreateP3TorontoCityMap.py`; not all zones are visible in the startup view. |
| Connected roads and lane graph | Passed | Runtime log reports `P3 road graph valid: lanes=68 connections=424 signals=6`; generated lanes carry spawn and safe U-turn tags. |
| Signal lane references and conflicting phases | Passed | The runtime network validator found no missing lane references or opposing signal conflicts. |
| Runtime minimap, build, package and launch | Passed | `Evidence/P3_runtime.png`; final Win64 Development BuildCookRun completed successfully, the packaged window responded, and the runtime log has no material fallback warnings. |
| P3 start location and basic drive check | Passed | Runtime log recorded 45.8 km/h with throttle input on the asphalt lane. |

The level is saved as `/Game/RacingMVP/Maps/L_P3TorontoCity` and is configured as the editor and game default. `Tools/VerifyP0.ps1` also passed after P3 integration, confirming UE 5.8.3, standard Chaos Vehicles and Enhanced Input are enabled, with no Chaos Modular Vehicle dependency.

## P4 traffic prototype

`URoadNetworkSubsystem` creates one `ATrafficManager` when the active map has a road graph. The manager creates at most 20 pooled `ATrafficVehicle` proxies on clear road spline samples near the player. It assigns Near/Mid/Far/Pooled update grades using 250 m, 650 m, and 700 m thresholds; pooled actors are reused on a three-second scan. Each proxy uses the temporary SportsCar mesh and an overlap-only traffic sensor.

The traffic brain implements Cruise, Follow, ApproachLight, StopAtLight, Wait, ChangeLane, Merge, and Recover states. It uses lane speed limits, same-lane gap following, red/yellow signal stopping, adjacent-lane gap checks, and connected-lane selection at segment ends. The manager logs pool/grade/overlap counts every ten seconds.

| Check | Status | Evidence |
|---|---|---|
| Editor and game targets compile | Passed | Win64 Development BuildCookRun completed successfully. |
| P3 map graph available to traffic | Passed | Packaged log: `P3 road graph valid: lanes=68 connections=424 signals=6`. |
| Pool cap and nearby placement | Passed for startup smoke test | Packaged log initialized 20 vehicles; health samples reported 18 near / 2 mid and later 14 near / 6 mid. |
| Vehicle visuals and road-spline movement | Implemented; visual and long-run movement need a dedicated gameplay pass | Temporary `SKM_SportsCar` mesh and kinematic lane movement are configured. |
| State machine, traffic lights, following, lane changes | Implemented; behavior acceptance is open | C++ state transitions and runtime updates are present; no exhaustive scenario run was performed. |
| Merge/exit route handling | Partial | Connected lanes are followed and tagged lanes select Merge state. The P3 city has no authored highway merge/exit test route. |
| Collision, lockup, pop-in and 10-minute 20-car run | Open | A short live drive logged 3 player/traffic sensor contacts. The sensor detects contact but does not provide physical collision response; no 10-minute route was run. |
| Performance gate record | Open | No controlled 10-minute frame-time or CPU/GPU capture has been recorded. |

No Unreal Editor wiring is needed to spawn the prototype on `L_P3TorontoCity`. A representative highway merge/exit route, Chaos-driven near-traffic behavior, and sustained acceptance run remain future work. P5 race flow is tracked below; P6 performance/polish has not started.

## Open world drive map revision, 2026-10-03

Created `L_OpenWorldDrive` as a separate first-pass map inspired by open-world driving games. The layout adds a wider six-lane arterial, highway sign gantries and lighting, a central showroom/car-meet hub, connected boulevard, and drag strip with paddock markings. The original P3 Toronto-inspired level remains available. The new map is set as the editor and game default, and the vehicle proxy map check includes it.

| Check | Result | Evidence |
|---|---|---|
| New map generated | Passed | `Tools/CreateOpenWorldDriveMap.py` completed and saved `/Game/RacingMVP/Maps/L_OpenWorldDrive`. |
| Road network loads | Passed | Packaged runtime log: 74 lanes, 506 connections and 6 signals. |
| Vehicle proxy appears and map loads | Passed for runtime smoke test | Packaged runtime log reports visible proxy and `Load map complete /Game/RacingMVP/Maps/L_OpenWorldDrive`. |
| Development package builds and launches | Passed | Win64 Development `BuildCookRun` succeeded; packaged window remained responsive. |
| Visual quality acceptance | Open | Current result is a procedural, stylized blockout. It needs user review and hands-on Editor iteration; no claim of a finished visual match is made. |

## P5 sprint race, 2026-10-03

The default `L_OpenWorldDrive` map now has a sprint offer near spawn, three ordered checkpoints and a finish on the six-lane route. `E` joins from free drive, with a 3–2–1 countdown and three Chaos vehicle AI opponents. The HUD shows race time, rank and checkpoint progress; the results panel lists finishing times and DNFs. `Esc` pauses/resumes the race, `T` restarts, and `M` leaves for free drive. The race timer stops while the race is paused. An unfinished racer cannot hold the result screen open indefinitely.

| Check | Result | Evidence |
|---|---|---|
| Win64 Development editor/game build, cook, package and launch | Passed | Final `BuildCookRun` ended `BUILD SUCCESSFUL`; packaged game loaded `L_OpenWorldDrive` and initialized the race offer without missing-material or runtime errors. |
| Offer and race HUD render | Passed for startup view | [P5 offer frame](Evidence/P5_offer.png) shows the prompt, vehicle and map in the packaged build. Gate and results visuals still need direct frame review. |
| Player race entry, countdown, ordered checkpoints and victory | Passed | Normal packaged launch logged player checkpoints 1–4, player finish at 31.45 s and first place on results. |
| Three Chaos opponents, racing line control and finishing | Passed for one race | Packaged telemetry showed all three moving forward with automatic gears; unattended run logged finishes at 35.80 s, 35.89 s and 39.74 s. |
| Player DNF and result timeout | Passed | Unattended run with idle player reached results after the 180 s race limit, `player_place=4` and `player_time=-1.00`. |
| AI nonfinish handling | Passed in player-win run | Results opened 12 s after the player finished although one opponent had not finished. That opponent is displayed as DNF. |
| Pause, restart and leave | Implemented; runtime transitions seen in an earlier package | Log recorded pause on/off, repeated restarts and return to free drive. The final build still needs a dedicated manual input pass for these controls and results-to-free-drive via `E`. |
| Long race and performance acceptance | Open | No controlled 10-minute frame-time capture or full collision review has been recorded. P4's traffic acceptance remains open. |

## Later phases

P6 performance remains outside this phase.

### P3 naturalized trees and safer road edges, 2026-10-03

Replaced the single-ball tree crowns with overlapping foliage clusters in three close green shades, cylindrical grounded trunks, and smaller visual-only branches. Kept only trunk collision. Raised sidewalks and curbs remain visible but are now visual-only collision layers, removing the hard curb hit that could throw the vehicle. Asphalt tops are 4.5 cm above the ground collision surface to keep road materials from z-fighting; the vehicle center of mass was lowered from 12 cm to 35 cm below its previous local reference for added rollover stability. The map regenerated without script errors; Win64 Development `BuildCookRun` succeeded and the packaged game launched. Runtime log confirms the P3 map, visible vehicle proxy and valid 68-lane road graph. `Tools/VerifyP0.ps1` passed. Evidence: [P3 runtime frame](Evidence/P3_runtime.png). P4 acceptance remains open.
