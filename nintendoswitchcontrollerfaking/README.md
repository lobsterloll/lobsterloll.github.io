# Joy-Con Pair → Xbox controller for Windows

This Windows command-line app combines an **original Nintendo Switch Joy-Con (L) and Joy-Con (R)** into one virtual Xbox 360/XInput controller. It reads the two paired Bluetooth HID devices, applies stick calibration, and sends one controller to Windows through ViGEmBus. It does not pair devices automatically or modify Joy-Con firmware.

## What you need

- Windows 10/11 with Bluetooth, two charged original Switch Joy-Cons (the left/blue and right/red pair), and Python 3.11 or newer.
- An eligible Xbox Cloud Gaming account/subscription in a supported region and a supported browser. [Forza Horizon 6 is listed for cloud play](https://forza.net/news/forza-horizon-6-now-available). In Canada, the [Xbox store page](https://www.xbox.com/en-CA/games/store/forza-horizon-6-standard-edition/9n431px143p8) says cloud play is included with Game Pass Ultimate; Essential or Premium requires buying the game. Your account's cloud page is the final availability check.
- **ViGEmBus 1.22.0**, installed by you from the [official Nefarius GitHub release](https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0). This is the final official installer; it removed the retired updater. The project is [end of life](https://docs.nefarius.at/projects/ViGEm/End-of-Life/). Do not download a driver from a mirror or accept an old bundled installer. Driver installation requires Windows administrator permission and writes system files; this project deliberately does not do that.

The app uses [hidapi](https://github.com/libusb/hidapi) to read Bluetooth HID reports and [vgamepad](https://github.com/yannbouteiller/vgamepad) to send the virtual Xbox controller. `setup.ps1` pins its Python dependencies and keeps its environment/cache/temp files in this folder. It sets the upstream option that prevents `vgamepad` from launching its old bundled ViGEmBus installer. Upstream says it tested `vgamepad` with ViGEmBus 1.17.333; compatibility with 1.22.0 must be checked on your PC.

## Set up

1. Install Python 3.11+ from [python.org](https://www.python.org/downloads/windows/) if needed. Enable the Python launcher (`py`).
2. In **Windows Settings → Bluetooth & devices → Add device → Bluetooth**, pair each Joy-Con separately. Hold the small **SYNC** button on the rail until its lights flash, then choose **Joy-Con (L)**. Repeat for **Joy-Con (R)**. Disconnect the Joy-Cons from the Switch while using them on the PC.
3. Download and install the official **ViGEmBus 1.22.0** release linked above. Reboot if the installer requests it.
4. Open PowerShell in this folder and run:

   ```powershell
   .\setup.ps1
   .\run.ps1 --list
   .\run.ps1
   ```

   If PowerShell blocks local scripts, use `powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1` and the same form for `run.ps1`. Review the scripts before doing so.
5. Leave the terminal running. Press **Win+R**, enter `joy.cpl`, and verify that **one Xbox 360 controller** responds to both Joy-Cons. Then open [Xbox Cloud Gaming](https://www.xbox.com/en-ca/play) in a browser and launch Forza Horizon 6. If the page was already open, reload it after the virtual controller appears. Press **Ctrl+C** in the terminal to stop.

If you have multiple Joy-Con pairs, `--list` shows indices; run `.\run.ps1 --left-index 1 --right-index 1` with the indices you want.

## Controls

| Joy-Con control | Virtual Xbox control |
| --- | --- |
| Left stick / right stick | Left stick / right stick |
| Left directional buttons | D-pad |
| Right **A / B / X / Y** | Xbox **A / B / X / Y** (same printed letters) |
| L / R | LB / RB |
| ZL / ZR | LT / RT, fully pressed or released |
| Minus / Plus | View (Back) / Menu (Start) |
| Left stick click / right stick click | LS / RS |
| HOME | Xbox Guide |

Capture, SL, and SR are unused. The Joy-Cons' ZL/ZR triggers are digital, so Forza acceleration and braking are **on/off**, without analog pedal control. Rumble and motion controls are not implemented.

## Verify and troubleshoot

- Run `.\run.ps1 --list`. Both sides should appear. If one does not, wake it, check Windows Bluetooth pairing, and retry. Switch 2 Joy-Con 2 controllers have a different protocol and are not supported.
- In `joy.cpl`, move each stick and press each button. If both Joy-Cons work there but the browser does not see them, reload the cloud page or restart the browser after starting the bridge. Close other controller remappers if they create duplicate virtual pads.
- If either Joy-Con stops reporting for half a second, the app releases all inputs and waits for both to report again. It sends a neutral keepalive every five seconds and retries a stalled Bluetooth HID connection. If Windows no longer shows a Joy-Con, wake or re-pair it. If factory stick calibration cannot be read, the app uses an approximate range; check for drift in `joy.cpl`.
- If the virtual controller cannot be created, confirm the official ViGEmBus installation in Windows **Installed apps**, then rerun `setup.ps1` and restart the app.
- You can run the packet/mapping tests without Joy-Cons or the driver: `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`.

The [Joy-Con Bluetooth report layout](https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/blob/master/bluetooth_hid_notes.md), [subcommand format](https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/blob/master/bluetooth_hid_subcommands_notes.md), and [factory stick calibration layout](https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/blob/master/spi_flash_notes.md) are documented by the Nintendo Switch reverse-engineering project.
