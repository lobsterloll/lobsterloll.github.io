# P3 performance record — 2026-10-06

The reference target is a Core Ultra 5 125H, Intel Arc 7 Xe-core iGPU, and 16 GB shared memory at 1920×1080 output. The current P3 package was built in Windows Development configuration (`Saved/Logs/P3SmoothedRoadPackage.log`).

An idle downtown baseline was captured in the packaged game at its actual 1280×720 window size: `Packaged/Windows/RacingMVP/Saved/Profiling/CSV/Profile(20261006_084148).csv`. It contains 6000 frames. Excluding the first 1000 frames, average was 38.3 FPS, 1% low was 33.2 FPS (99th-percentile frame time), median frame time was 25.91 ms, and 0.0% of the retained frames exceeded 33.33 ms. Average Game/Render/GPU times were 4.19/26.09/23.87 ms. Texture streaming reported 100% of desired data loaded during those 5000 frames; the packaged process used about 1.6 GB working memory. `ScreenShot00081.png` shows the live stats view. The CSV capture included the profiling and stats overlays, which can affect timing.

The required 3-minute warmup plus 10-minute driven capture at 1920×1080 output has not been completed. The 60 FPS goal is not met by this 720p idle baseline; final performance acceptance remains open.

The P3 cook completed on the available 16 GB machine but reported low free physical memory and triggered garbage collection. Runtime profiling must distinguish cook pressure from packaged gameplay pressure.
