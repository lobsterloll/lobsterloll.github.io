# Desktop Ant Invasion — MVP

A portable Windows x64 C++20 application that paints 250 animated ants over the desktop. Launch the executable manually from any folder or USB drive. It requires no installation, administrator rights, browser extension, network access, or persistent files. Windows does not automatically run it when a USB drive is inserted.

## Build and run

Requirements: Windows 10/11 x64, Visual Studio 2022 or newer with the Desktop development with C++ workload, Windows SDK, and CMake 3.20 or newer. This workspace was built with Visual Studio 2026 and Windows SDK 10.0.26100.0.

```powershell
cmake -S . -B build -G "Visual Studio 18 2026" -A x64
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure
& .\build\Release\DesktopAntInvasion.exe
```

With Visual Studio 2022, change the generator to `Visual Studio 17 2022`. The Release executable uses the static MSVC runtime (`/MT`), so it can be copied by itself to a USB drive. Direct2D and Windows Imaging Component are supplied by Windows.

The app has no taskbar button. Right-click its notification area icon and choose **Exit Desktop Ant Invasion**, or press **Ctrl+Alt+Shift+Q**. For a non-visible rendering check, run `DesktopAntInvasion.exe --smoke-test`; exit code 0 means the renderer produced nontransparent pixels and updated a hidden layered window.

## MVP implementation plan and status

| Stage | Deliverable | Status |
|---|---|---|
| 1. Portable shell | Single Win32 process, full virtual-desktop overlay, tray exit and emergency hotkey | Implemented |
| 2. Ant behavior | Exactly 250 ants, wandering, local alignment/cohesion/separation, edge following | Implemented |
| 3. Cursor behavior | Sample the real OS pointer, seek, bite, attach, drag with it, detach on speed or timeout | Implemented |
| 4. Visual interaction | Read visible top-level window rectangles and paint edge crawling/nibble cues on the overlay | Implemented |
| 5. Verification | Release build, deterministic simulation tests, hidden rendering smoke test, manual acceptance checklist | Automated parts passed; manual checklist remains for the user desktop |

Future work after MVP: improve ant artwork with sprite or textured shading, adapt frame rate and render region for very high resolution displays, add a user settings panel, and add visual-only object movement effects where the captured screen can be composited safely. Browser integration is outside this configuration.

## Component specifications

| Component | Contract |
|---|---|
| `Simulation` (`src/simulation.*`) | Owns exactly 250 ants by default. Takes elapsed time, pointer position in virtual-screen coordinates, and read-only window rectangles. Produces ant positions, headings, animation phase, state, and edge contact. Seeded RNG makes tests repeatable. |
| Cursor state machine | One third of ants show cursor interest. A nearby ant enters a 0.20-second bite animation; if contact remains near a reasonably slow pointer, it attaches. Attached ants use the latest `GetCursorPos` sample plus a small fixed offset. A pointer speed above 900 px/s or a 3-second hold detaches them, followed by a 2-second reattach cooldown. |
| Neighborhood steering | Each ant senses others within 55 px and combines group center, heading alignment, and separation. This is silent, local behavioral communication; no microphone, sound output, or network activity. |
| Window sensing | Every 750 ms, `EnumWindows` and `GetWindowRect` collect up to 40 visible, non-minimized top-level window bounds. Ants near an edge steer toward and along it. The small nibble graphic is drawn only in the overlay. |
| Rendering | Direct2D draws shaded head, thorax, petiole, abdomen, six jointed legs, antennae, mandibles, and gait into a premultiplied BGRA WIC bitmap. `UpdateLayeredWindow` presents the bitmap at 30 timer ticks per second. Appearance is anatomical vector art, not photorealistic imagery. |
| Overlay and control | One transparent, topmost, no-activate, click-through window spans the virtual desktop, including multiple monitors. A notification area menu and global hotkey exit. Display changes resize the overlay and simulation. |
| Safety boundary | Reads pointer position and top-level window rectangles. Writes only its own overlay and tray icon. No `SendInput`, `SetCursorPos`, window moves, file operations, browser hooks, injection, persistence, or desktop/shell modification. Ants being “dragged” means their painted positions follow the real pointer; the app never controls the pointer. |

## Acceptance tests

| ID | Procedure | Pass condition | Current verification |
|---|---|---|---|
| A1 | Build Release and run `ctest` | All tests pass | Passed on this workspace |
| A2 | Run `--smoke-test` | Exit code 0 and at least one nontransparent rendered pixel | Passed on this workspace |
| A3 | Launch the EXE from a USB drive or arbitrary folder | Ants appear without install/admin prompt; no other file is required | Manual |
| A4 | Observe a full desktop and a second monitor if available | 250 anatomically detailed ants animate across the virtual desktop; underlying content remains visible | Count checked automatically; visual check manual |
| A5 | Hold the real pointer near ants, then move it slowly | Some ants seek, animate a bite, attach near the actual pointer, and follow its sampled position | State transition and drag offset checked automatically; visual check manual |
| A6 | Flick the pointer quickly, or wait 3 seconds after attachment | Attached ants detach and resume independent movement after cooldown | Fast-detach and timeout checked automatically; visual check manual |
| A7 | Open, move, or resize an ordinary app window | Ants crawl along its sensed edges and show subtle nibble cues; the real window does not move | Edge contact checked automatically; visual check manual |
| A8 | Click, type, drag a real window, and interact with the taskbar beneath ants | Input passes through; ordinary desktop behavior is unaffected | Manual |
| A9 | Change display arrangement or resolution | Overlay covers the new virtual desktop without a crash | Manual |
| A10 | Exit using the tray menu, then relaunch and exit using Ctrl+Alt+Shift+Q | All ants disappear immediately and the tray icon is removed; desktop state is unchanged | Manual |
| A11 | Inspect network/file activity while running | No app-generated network request, disk write, or browser integration | Source audit done; runtime audit optional |

## Verification notes and limits

The automated tests exercise count, repeatable initialization, bite, attach, pointer-following, fast and timed detach, edge contact, bounds, and resize. A hidden smoke test exercises Direct2D/WIC drawing and layered-window presentation. The interactive click-through behavior, frame rate on the target display, tray interactions, and full display-change behavior need a visible desktop session to verify. Secure desktops (lock screen and UAC prompts) are outside the overlay's scope.
