# P0/P1 build record

## Fixed toolchain

- Project: `RacingMVP.uproject`, `EngineAssociation=5.8`; descriptor description pins **Unreal Engine 5.8.3**, changelist **58210709**.
- Engine root: `D:\Workplaces\UE_5.8`. The engine source is not changed by this project.
- Visual Studio Community 2026 18.10.2; MSVC toolset 14.51.36231, `cl.exe` 19.51.36260.0.
- Windows SDK: 10.0.26100.0.
- Windows RHI target: DirectX 12, SM6. Test GPU: Intel Arc Graphics, driver 32.0.101.8508.
- Required runtime plugin/module: Epic `ChaosVehiclesPlugin` / `ChaosVehicles` (the standard `AWheeledVehiclePawn` and `UChaosWheeledVehicleMovementComponent` path). `EnhancedInput` and `UMG` are enabled as module dependencies. The modular vehicle plugin is absent from the descriptor and source dependencies. `PythonScriptPlugin` and `EditorScriptingUtilities` are editor-only for creating the P0 map.
- The editor target also requires a .NET Framework SDK (4.6 or newer) for Unreal's `SwarmInterface`. This machine's Visual Studio installation lacked it. The verified local build used Microsoft .NET Framework 4.8 Developer Pack SDK headers and libraries extracted into the ignored `.toolchain` directory, with `UE_SDKS_ROOT` set for the build process. For a clean machine, install the .NET Framework 4.8 SDK component through Visual Studio Installer.

## Build and package

From PowerShell in the project root:

```powershell
.\Tools\VerifyP0.ps1
$localSdk = 'D:\chatgpt\Codex\unrealracinggame\.toolchain'
if (Test-Path $localSdk) { $env:UE_SDKS_ROOT = $localSdk }
& 'D:\Workplaces\UE_5.8\Engine\Build\BatchFiles\Build.bat' RacingMVPEditor Win64 Development 'D:\chatgpt\Codex\unrealracinggame\RacingMVP.uproject' -WaitMutex -NoHotReload
& 'D:\Workplaces\UE_5.8\Engine\Build\BatchFiles\RunUAT.bat' BuildCookRun -project='D:\chatgpt\Codex\unrealracinggame\RacingMVP.uproject' -platform=Win64 -clientconfig=Development -build -cook -stage -pak -archive -archivedirectory='D:\chatgpt\Codex\unrealracinggame\Packaged' -noP4 -utf8output
```

If the open-world map is absent, run its editor-only generator after the editor target builds:

```powershell
& 'D:\Workplaces\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe' 'D:\chatgpt\Codex\unrealracinggame\RacingMVP.uproject' -run=pythonscript -script='D:\chatgpt\Codex\unrealracinggame\Tools\CreateOpenWorldDriveMap.py' -unattended -nop4
```

The packaged executable is `Packaged\Windows\RacingMVP.exe`. The P2 test map `L_P2VehicleTest` remains available. Generate it with `Tools\CreateP2VehicleMap.py`; generate/import the original prototype audio with `Tools\GenerateP2Audio.py` and `Tools\ImportP2Audio.py`. The approved UE SportsCar mesh remains configured, but its appearance needs Editor review. See `Docs/QA.md` for phase status and remaining checks.

To run the packaged build, start `Packaged\Windows\RacingMVP.exe`. To open the project in the editor, start `D:\Workplaces\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe` with `RacingMVP.uproject` as its first argument.

## Open world drive map

The editor and game defaults point to `L_OpenWorldDrive`. Generate it with `Tools\CreateOpenWorldDriveMap.py`; it builds a wider multi-lane arterial, a showroom and car-meet hub, a connected drag strip and paddock, roadside lighting, and highway signs. The original `L_P3TorontoCity` remains available as a separate map. See `Docs/WorldLayout.md` for opening and editing the new level in Unreal Editor.

## P5 sprint race

The packaged game starts in free drive near the orange sprint marker. Drive close and press **E** to enter. The car moves to the highway grid with three Chaos vehicle opponents. After the countdown, pass the three orange gates in order and cross the finish gate. The race HUD shows the timer, position and checkpoint count. **Esc** pauses or resumes the race, **T** restarts it, and **M** leaves for free drive. On the results screen, **E** returns to free drive and **T** retries.

For an unattended Development-build smoke test, launch the packaged executable with `-P5AutoStart`. This starts the race without pressing E; normal builds do not auto-start it.
