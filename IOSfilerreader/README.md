# Xbox Universal Launcher



Windows desktop MVP built with C# / .NET 10 / WPF and SQLite. Import disc images, browse their file paths, sizes and byte offsets, and launch supported images through your own xemu or Xenia installation.



## Performance optimizer

The optimizer only selects native (1x) emulator rendering. Compared with 2x on both axes, 1x renders one quarter as many pixels; this is not a measured FPS increase. The image may be less sharp. It does not patch games, change gameplay speed or frame limits, modify saves, change Windows settings, close other programs or delete caches. Close the emulator normally and relaunch to apply the change. Restore HD in Emulator settings. CPU-limited games and emulator compatibility problems may remain slow; no automatic FPS benchmark or hardware-specific tuning is performed.

## Run

### Game progress

Use each game's **Save** or autosave feature; on the next launch choose **Continue / Load** with the same game profile. The launcher now remembers the emulator save storage on first play and reuses it on later launches. Different games use the emulator's normal per-title saves. Removing library entries or moving an ISO does not delete or relocate save data. This is persistent in-game saving, not automatic save states or exact-point resume; unsaved progress cannot be restored.

For xemu, the launcher remembers the existing portable or default `xemu.toml` and keeps its configured hard disk. Saves live inside that virtual disk; back up the disk and configuration while xemu is closed. For Xenia, it remembers the existing portable emulator directory or the Windows Documents/Xenia storage directory and passes it using `--storage_root`. Xenia's configured `content_root` is preserved, including custom save locations. Back up that content folder and use the same profile. The **Game saves** button shows the remembered locations. If remembered storage disappears, launching stops with a restore message rather than silently starting with new storage. The launcher never resets or overwrites emulator save files. This cannot recover previously lost saves or guarantee saving in titles with emulator compatibility problems.

Games use **Native (1x rendering)** by default unless HD was explicitly selected. Click **Performance optimizer** to apply native resolution to future launches; it shows the tradeoff before applying and remembers your choice. Existing explicit HD selections remain until you change them. Choose **Emulator settings** to switch to **Native (1x)** for better performance or compatibility. Close the emulator and relaunch the game for changes to apply. This is a rendering multiplier, not a guaranteed 1920x1080 mode: a 640x480 Original Xbox game typically renders at 1280x960 with 2x, while a 1280x720 Xbox 360 game typically renders at 2560x1440. Games may use other base resolutions; menus, videos and textures may retain their original detail.

Xenia receives `--draw_resolution_scale_x` and `--draw_resolution_scale_y` launch arguments. For xemu, the launcher changes only `surface_scale` in `[display.quality]` in the existing portable or default `%APPDATA%/xemu/xemu/xemu.toml` configuration and passes its path explicitly. A `.launcher-backup` copy is kept before the first change to an existing config. Firmware paths and other settings are preserved. Source references: [xemu configuration schema](https://github.com/xemu-project/xemu/blob/v0.8.139/config_spec.yml) and [Xenia rendering scaling](https://xenia.jp/updates/2022/01/29/presenting-the-presentation-update-amd-fidelityfx-fsr-fxaa-cas-vrr.html).

Double-click `outputs/setup/XboxUniversalLauncher-Setup.exe` for guided installation. Choose an empty installation folder, select xemu and/or Xenia (both selected by default), and click **Install**. Setup shows download progress, verifies pinned SHA-256 checksums, installs the launcher and emulators, saves their paths in the library settings, and launches the program if requested. Internet access is required for emulator downloads. Use a folder you can write to; no administrator rights are requested.

Setup downloads official xemu 0.8.139 and Xenia master 1.0.2844 releases directly from GitHub. Original archive contents, including license files, are retained. Firmware and games are not included; configure firmware in xemu before playing. No shortcuts or Apps & Features entry are created. To uninstall, close the programs and delete the installation folder; your library remains in LocalAppData. Updates currently require a new empty folder. A disk or permissions error during final copying can leave partial files; retry in an empty folder.

Build the launcher, test, and package setup with `./build-installer.ps1`. Publish the launcher first: the setup project embeds `outputs/win-x64/XboxUniversalLauncher.exe`. Both executables include the .NET runtime.



Use `outputs/win-x64/XboxUniversalLauncher.exe` when a packaged build is available. It contains the .NET runtime and needs no SDK. Windows 10/11 x64 is required. The executable is unsigned.



1. Click **Open ISO & Play…** and select your Xbox game ISO. The launcher checks the game and automatically chooses xemu for Original Xbox or Xenia for Xbox 360.

2. On first play, select the required emulator executable when prompted. Its location is remembered. Configure any firmware required by xemu in xemu first.

3. The game opens in the emulator window. It is also saved in your library; select it and click **Play selected** next time.



**Add games…** adds multiple games without starting them. **Game ISO file details** is an optional inspection panel. An ISO is the game file; gameplay is provided by the selected emulator, which must be installed separately. Successful process creation does not establish gameplay compatibility.



Removing an entry only changes the library database. No image is deleted or modified. The database and emulator paths are stored at `%LOCALAPPDATA%\XboxUniversalLauncher\library.db`. Titles come from filenames; game metadata is not downloaded.



## Format boundaries



| Image | Inspection | Launch |

| --- | --- | --- |

| Original Xbox XISO | XDVDFS directory listing; root `default.xbe` with `XBEH` signature | xemu |

| Original Xbox full-disc dump | Accessible XDVDFS partition listing | Unsupported; prepare an XISO externally |

| Xbox 360 image | XDVDFS directory listing; root `default.xex` with `XEX2` signature | Xenia |

| Standard ISO 9660 | Descriptor identification only | Unsupported |

| Xbox One / Series or unknown image | Generic unsupported status | Blocked |



XDVDFS uses a shared descriptor across generations. This reader probes partition offsets 0, 0xFB20, 0x20600, 0x2080000 and 0xFD90000; it distinguishes launchable generations using boot executable signatures rather than extension or disc size. Modern Xbox generation identification is **not implemented**: unknown images explicitly report that Xbox One / Series are unsupported. The app does not guess their generation. Encrypted, split and compressed images are unsupported. No extraction, conversion, mounting, decryption or DRM bypass is implemented.



Directory parsing limits: 100,000 entries, depth 64, 32 MiB per directory and 128 MiB total directory bytes. Invalid ranges, repeated directory sectors, node cycles and damaged descriptor markers are rejected. File contents are not fully validated; this is a structural inspector, not a disc authenticity verifier.



## Build and test



Install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) on Windows x64. NuGet access is needed for SQLite and test dependencies.



```powershell

dotnet restore XboxUniversalLauncher.slnx
dotnet publish src/Launcher.App -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -o outputs/win-x64

dotnet test XboxUniversalLauncher.slnx -c Release

dotnet run --project src/Launcher.App

dotnet publish src/Launcher.App -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -o outputs/win-x64

```



The single EXE extracts native runtime/SQLite components to the normal .NET bundle cache at startup. WPF trimming is not enabled. For this workspace, a local SDK is installed under `work/dotnet`; substitute `./work/dotnet/dotnet` for `dotnet` if needed.



Tests generate small synthetic images (including sparse partition-offset fixtures), with no proprietary game data. They cover boot signature detection, offsets, corrupt bounds and nodes, unsupported launches, argument boundaries and SQLite persistence. Actual gameplay requires your own compatible games and emulator setup and is not covered by these tests.



## Source references



- [xemu command-line documentation](https://xemu.app/docs/cli/): Original Xbox adapter passes `-dvd_path` followed by the image path.

- [Xenia disc reader](https://github.com/xenia-project/xenia/blob/master/src/xenia/vfs/devices/disc_image_device.cc): reference for XDVDFS partition candidates and directory field layout.

- [Xenia quickstart](https://github.com/xenia-project/xenia/wiki/Quickstart): emulator setup and compatibility requirements.



Adapters use separate process arguments, no shell, and the emulator's directory as its working directory. Xenia receives the image path as its positional argument. Emulators, firmware, keys and games are not bundled. Supply only content you are authorized to use.
