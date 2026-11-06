# Build QA — 2026-10-06

## Vehicle P2

P2 remains open. The current Epic SportsCar is temporary art, as requested. Its four wheel meshes are attached to `Phys_Wheel_FL`, `Phys_Wheel_FR`, `Phys_Wheel_BL`, and `Phys_Wheel_BR` sockets on the animated Chaos vehicle mesh.

## Packaged build checks

- [x] Windows Development build, cook, stage, and archive succeeded after final code review (`Saved/Logs/P2VehicleBuildVerified.log`).
- [x] Packaged game loaded `L_CityBlockout` without missing sound asset warnings (`Packaged/Windows/RacingMVP/Saved/Logs/RacingMVP.log`).
- [x] HUD displayed live speed, gear, RPM, surface, and tire slip (`ScreenShot00045.png`, `ScreenShot00050.png`).
- [x] Turn-signal lamps and Z/X controls removed for P3 at the user's request. `ScreenShot00051.png` records the earlier version.
- [x] Reverse lamps lit in reverse (`ScreenShot00047.png`).
- [x] Brake lamps lit with handbrake (`ScreenShot00049.png`).
- [x] Driving from asphalt onto grass changed reported wheel surface and slip (`ScreenShot00050.png`). Asphalt friction is 1.1; grass friction is 0.55.
- [x] Final packaged build launched and showed the SportsCar and asphalt HUD (`ScreenShot00052.png`).
- [ ] Confirm audible balance of idle, high RPM, wind, tire skid, and collision sounds during a manual drive. Asset loading was checked; individual layers were not measured.
- [ ] Confirm headlamps and brake lights in night or low-light conditions.

Screenshots are in `Packaged/Windows/RacingMVP/Saved/Screenshots/Windows/`.

## Remaining P2 exit criteria

- [ ] Replace temporary art with an original or suitable licensed hero coupe with modeled interior, dashboard, steering wheel, pedals, mirrors, and exterior details. The current SportsCar has no usable modeled cockpit.
- [ ] Animate a separate steering wheel and in-world gauges from Chaos state. The current HUD displays live values, but no 3D dashboard exists.
- [ ] Add and test a gravel driving surface. The current city has asphalt and grass only.
- [ ] Add distinct gravel and grass rolling audio. Current skid audio changes with surface, but uses one tire sample.
- [ ] Measure texture streaming and memory during a sustained four-camera drive on the 16 GB target machine.

P2 does not pass its final art or performance exit criteria yet.

## P3 world and roads

- [x] The saved `L_CityBlockout` level covers a 1000 m by 1000 m footprint: about 0.94 km² of land plus a river gap, connected by the existing bridge (`Tools/BuildCity.py`).
- [x] Unique road centerlines total 4.86 km after rounding the outer route bends. Road geometry, lanes, and the minimap use the same route points (`Tools/BuildCity.py`).
- [x] All 196 directed lane segments are reachable, with no invalid lane references in the packaged game's runtime check (`Packaged/Windows/RacingMVP/Saved/Logs/RacingMVP.log`).
- [x] The map has downtown, mixed commercial, residential, and industrial building areas, an outer cruising loop, and a parking loop. Building art remains blockout quality.
- [x] Three junctions have 12 red/yellow/green signal heads. The phase schedule gives east-west and north-south movements separate green windows.
- [x] The Windows Development package built and launched after the road and steering changes (`Saved/Logs/P3SmoothedRoadPackage.log`). Runtime road validation reported 196 reachable lanes and zero invalid references (`Packaged/Windows/RacingMVP/Saved/Logs/RacingMVP.log`).
- [x] The packaged HUD shows roads and the vehicle position on a minimap (`ScreenShot00056.png`).
- [x] Lowering the ground 1 cm resolved the asphalt contact label at spawn and during the bridge crossing (`ScreenShot00056.png`, `ScreenShot00057.png`, `ScreenShot00058.png`).
- [x] A straight drive from the west boulevard through a signal junction and bridge to the east residential road stayed on asphalt at up to 150 km/h (`ScreenShot00057.png`, `ScreenShot00058.png`).
- [x] The old grass wedge at the north loop bend was replaced with a flat turn surface; the final packaged level shows the rounded bend and an asphalt contact label (`ScreenShot00078.png`, `ScreenShot00079.png`). A and D keyboard steering signs were corrected in `CityPlayerController.cpp` and rebuilt.
- [x] A controlled drive entered the north bend at 28 km/h and stayed on asphalt through 45 km/h (`ScreenShot00091.png` to `ScreenShot00094.png`). The scripted steering then oversteered onto the inside grass (`ScreenShot00095.png`), so this is only a partial route check.
- [ ] Drive the full north/south loops and parking loop in the final package to confirm smooth turns and no road gaps. Automated key sequences were not reliable for full route verification because the moving car coasted during screenshot inspection.
- [ ] An editor commandlet line-trace audit returned no hits, including over known ground, so it did not verify road collision (`Saved/Logs/P3CollisionTraceFinal.log`). Use a playable build for the remaining route check.
- [x] Stationary sun and sky, static city instances, and a city-sized Lightmass importance volume are saved in the level. CPU Lightmass Preview completed with no errors (`Saved/Logs/P3SmoothedRoadLightmass.log`); built lighting data is 106 MB. Four large window instance groups still produce lightmap size warnings.
- [ ] Complete the 1080p sustained driving and texture-streaming protocol on the 16 GB target machine; a 720p stationary baseline is recorded in `Docs/Profiling.md`.

P3 is not yet accepted until the remaining route drives pass. The current lighting is a Preview bake; production quality remains an art and performance follow-up.
