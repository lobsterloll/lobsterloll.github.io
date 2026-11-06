# Profiling record

P0 is a project and build smoke test. The spec's 60 FPS acceptance measurement applies to P6's complete packaged game on the specified Core Ultra 5 125H / Arc 7 Xe-core / 16 GB dual-channel device. No P0 frame-rate value is an MVP performance claim.

| Build | Scenario | Device | Result |
|---|---|---|---|
| P0 | Packaged project startup and proxy spawn | Core Ultra 5 125H, Intel Arc Graphics, 16 GB RAM, driver 32.0.101.8508 | Launched; `L_P0Test` loaded and Chaos proxy spawned. No frame-time capture or P6 performance claim. |
| P0 visual correction | Packaged daylight map and six-part proxy, 2026-10-01 | Same machine | Build and launch passed; screenshot in `Docs/Evidence/P0_daylight_proxy.png`. No frame-time capture or FPS claim. |
| P1 | Fresh Win64 Development package and keyboard smoke test, 2026-10-01 | Same machine | Built and launched; vehicle input, gears and four camera IDs verified from runtime telemetry. No frame-time capture or FPS claim. |
| P4 | Traffic pool and short live-drive smoke test, 2026-10-02 | Same machine | Packaged `L_P3TorontoCity` loaded with 68 lanes, 424 connections and 6 signals; manager kept a 20-car cap with near/mid/far grading and recycled out-of-range cars. Three player/traffic sensor contacts were logged. Not a 10-minute route or performance-gate result; no FPS, frame-time or CPU/GPU capture. |

For the future P6 gate: use a Windows Development package at 1920×1080 output, Baseline preset, three-minute warm-up and ten-minute capture per A/B/C route, three runs each. Record average FPS, 1% low, time below 30 FPS, GPU/Game/Render thread time, driver and thermals.
