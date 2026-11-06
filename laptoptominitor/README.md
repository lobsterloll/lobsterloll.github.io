# LaptopLink — original video streaming MVP

Own and modify the supplied project under the MIT license. This implementation
uses no SysDVR source or binaries. Python, Pillow, PyAV and libnx remain separate
third-party dependencies with their own licenses. No Nintendo proprietary code
or keys are included. Nothing is published or uploaded by these scripts.

## Run on Windows now

Install Python 3.11 or newer, then open PowerShell in this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
powershell -ExecutionPolicy Bypass -File .\run-demo.ps1
```

Open http://127.0.0.1:6971 if the browser opens before the receiver is ready.
The moving green block is synthetic 1280x720 video, paced at 30 fps. Use the
fullscreen button to fill the laptop screen. Stop with Ctrl+C in PowerShell.
This demo needs no Switch, HDMI capture card, SD card reader, or console changes.
Dependencies install in `.venv` within this directory.

## What is implemented

| Component | State |
|---|---|
| Windows Python TCP receiver and local browser viewer | Implemented; see tests and validation report |
| 720p30 synthetic JPEG sender through real TCP | Implemented |
| Annex B H.264 decoding via PyAV | Implemented; synthetic encoder test |
| Capture-to-LAN C integration loop | Source scaffold only, uncompiled, no console test |
| Installable Atmosphère sysmodule / USB / audio | Not implemented |

The receiver shows frame count, image dimensions and connection status. It
accepts one source at a time. A disconnected source leaves the last image on
screen with a waiting status. The browser viewer recompresses decoded frames
to JPEG, adding CPU use and latency. This MVP is suitable for proving a video
path; responsiveness for real gameplay is unmeasured. There is no controller
forwarding or recording. Actual console streaming has not been demonstrated.

## Future console LAN session

```powershell
.\.venv\Scripts\python.exe receiver.py --listen 192.168.1.20
```

Replace that address with the laptop's private LAN address. Permit inbound TCP
6970 on the Windows private network if needed. The web viewer remains local on
6971. The future sender connects to that laptop address, not localhost. There
is no authentication or encryption; do not expose the receiver to the internet.
Separate simulator process: `python simulator.py --host 127.0.0.1 --frames 300`
(use the virtual environment's Python).

See [protocol](docs/PROTOCOL.md) and [Switch integration status](switch/README.md).
The console target is capture-enabled games at 720p30 on a compatible Atmosphère
setup. Stock firmware cannot run this sender. A patched HAC-001 does not gain
CFW support from this software; establish compatible CFW separately before
planning a hardware test. No console installation is required now.

## Verify and package

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
powershell -ExecutionPolicy Bypass -File .\package.ps1
```

The package is `outputs/LaptopLink-source.zip`, containing source and scripts.
It requires Python and dependency installation; it is not a standalone EXE or
a console binary. Build requirements for the untested C unit are in switch/README.md.

## Detailed guide: first-time laptop setup

**The Windows demo works now. Actual Nintendo gameplay streaming is not ready
to install.** The console code is an uncompiled integration unit; there is no
complete Switch application or Atmosphère sysmodule in this package.

The tested environment is Windows with **64-bit Python 3.14**, Pillow 12.0.0 and
PyAV 16.0.1. Although setup accepts Python 3.11 or newer, pinned dependencies may
not have installation wheels for every newer version or processor architecture.
Use 64-bit Python 3.14 to match the tested environment.

1. Install Python if needed from the official
   [Python Windows downloads](https://www.python.org/downloads/windows/).
   Make the `python` command available during installation and reopen PowerShell.
2. Open **PowerShell**, or a PowerShell tab in **Windows Terminal**. Running the
   demo does not require administrator access.
3. Enter the project folder and check Python:

```powershell
Set-Location 'D:\github\lobsterloll\laptoptominitor'
python --version
```

4. Install the project's dependencies:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

Wait until installation finishes without an error. Setup creates `.venv` in this
folder. You do not need to activate it: the commands below use its Python directly.
The execution policy argument applies to that script process, not a permanent
machine policy change.

If `python` is unknown or opens Microsoft Store, finish installing Python and
reopen PowerShell. If `py -3.14 --version` works instead, use this alternative
to the setup script:

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --no-cache-dir -r requirements.txt
```

## Detailed guide: viewing on your laptop

From PowerShell in the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-demo.ps1
```

Keep PowerShell open. The script opens your default browser and starts the
receiver and simulator. If the browser opens too early, refresh after PowerShell
prints the listening address. You can also open
[the local viewer](http://127.0.0.1:6971) yourself.

You should see **LaptopLink**, a moving green block, an increasing frame count,
and **1280 x 720** in the status line. The picture identifies itself as
**SIMULATED SOURCE**. This is synthetic video, not Nintendo gameplay.

Click **Fullscreen** to fill the laptop display; press **Esc** to exit fullscreen.
No sound is expected because audio is not implemented. This program does not
turn the laptop's HDMI connector into a video input.

To stop, return to PowerShell and press **Ctrl+C**. Closing only the browser
does not stop the receiver. On another day, repeat the launch command; setup
only needs repeating if the environment needs rebuilding.

To start without automatically opening a browser:

```powershell
.\.venv\Scripts\python.exe receiver.py --demo
```

### Receiver and simulator in separate windows

Stop the combined demo first, so TCP port 6970 is free. This mode lets you test
disconnect and reconnect behavior.

In PowerShell window A:

```powershell
Set-Location 'D:\github\lobsterloll\laptoptominitor'
.\.venv\Scripts\python.exe receiver.py
```

In PowerShell window B:

```powershell
Set-Location 'D:\github\lobsterloll\laptoptominitor'
.\.venv\Scripts\python.exe simulator.py --host 127.0.0.1 --frames 300
```

Open [the viewer](http://127.0.0.1:6971). The source sends 300 frames, roughly
ten seconds, then exits. The receiver retains its final picture and reports
that it is waiting for reconnect. Repeat the simulator command to reconnect.
Omit `--frames 300` to send continuously until Ctrl+C in window B.

## Detailed guide: LAN reception on the laptop

These steps support a simulator on a second computer today and prepare the
laptop for a future completed Switch sender. They do not complete the console code.

1. Connect the receiving laptop and source device to the same trusted private
   network. Guest Wi-Fi and client isolation can prevent communication.
2. Run `ipconfig` on the laptop. Find **IPv4 Address** under its active Wi-Fi or
   Ethernet adapter. Ignore disconnected and unrelated virtual adapters.
3. Stop any existing receiver. Start the LAN receiver using that address.
   Replace the example `192.168.1.20` with your laptop's actual address:

```powershell
.\.venv\Scripts\python.exe receiver.py --listen 192.168.1.20
```

Do not add `--demo` here. The bundled demo connects to loopback, whereas this
command binds specifically to the LAN address.

4. If Windows asks about firewall access, allow it on your trusted **Private**
   network. If traffic remains blocked, open **Windows Defender Firewall with
   Advanced Security**, select **Inbound Rules > New Rule > Port > TCP**, specify
   local port **6970**, allow the connection, and select **Private** only. Name
   the rule `LaptopLink TCP 6970`. Firewall changes may require administrator
   access. Remove the rule when you no longer need LAN access.
5. On the receiving laptop, open
   [http://127.0.0.1:6971](http://127.0.0.1:6971).

The source connects to the laptop's LAN IPv4 address on TCP **6970**. TCP **6971**
is the browser viewer and remains local to the laptop; other devices cannot view
it remotely with this implementation. There is no authentication or encryption
on the source connection. Use a trusted network and do not forward ports on your
router. Recheck the laptop address if the network changes.

### Check the LAN path with another computer

Extract this project on the second Windows computer and run setup there to
create that computer's own `.venv`. From its project folder, run:

```powershell
.\.venv\Scripts\python.exe simulator.py --host 192.168.1.20 --frames 300
```

The receiving laptop should show the animation. This proves a PC LAN path,
not console capture. Only connect one source at a time. Prevent the receiving
laptop from sleeping during a session.

## Detailed guide: applying this to Nintendo Switch

**There is currently no LaptopLink executable to copy to the Switch and launch.**
`switch/sender.c` lacks an application entry point, complete build project,
permissions manifest, installation directory and NRO/NSP binary. Copying the C
file onto microSD, or renaming it, does not make it executable.

The intended completed arrangement is:

```text
Capture-enabled game on compatible Atmosphère CFW
  -> background LaptopLink sender (still needs implementation)
  -> private LAN / TCP 6970
  -> Windows receiver
  -> local browser on laptop / port 6971
```

### Requirements before a console test

- A Switch with a separately established, compatible Atmosphère CFW setup.
  Stock Nintendo firmware cannot run this sender.
- A game supported by the continuous recording path used by `grc:d`. Capture
  can block without a compatible running game. No patches to enable recording
  in unsupported titles are supplied.
- A completed background sender with validated service permissions. Ordinary
  foreground homebrew can suspend the game, so launching an arbitrary homebrew
  application does not demonstrate background capture.
- A way to write the eventual sender package to the console's microSD storage.
  With no SD reader today, defer this step. An already working CFW environment
  may have its own file transfer method; LaptopLink does not supply one.
- A private LAN shared with the receiving laptop.

**Patched HAC-001:** the model label alone does not establish compatibility.
Patched consoles do not support the original unpatched RCM exploit. This project
does not install CFW or provide an exploit; a compatible existing CFW entry
method is required. Consult the maintained
[NH Switch Guide hardware information](https://switch.hacks.guide/user_guide/modchip/index)
before planning console setup. Installing Python or attaching USB does not change
the console's firmware compatibility.

The target is **720p30 video**, with no sound in this MVP. Actual title compatibility,
quality and gameplay latency remain unmeasured on hardware. USB transport is only
a design option; attaching a USB-C cable alone does not enable it. The planned
LAN path does not use HDMI capture hardware.

### Development needed before installing on the console

This checklist describes unfinished engineering work, not a ready installation
procedure. See [Switch integration notes](switch/README.md) for the C interface
and compile-only command.

1. Set up devkitPro/devkitA64 and libnx, then compile the integration unit.
   An object file is not a launchable application.
2. Implement the Atmosphère background host, entry point, build configuration,
   service permissions and installation package. No validated program ID or
   installation directory has been selected here.
3. Initialize networking and connect a TCP socket to the laptop's private IPv4
   address on port 6970. The C unit takes an already connected socket; it has no
   configuration file or discovery feature.
4. Acquire `grc:d` through libnx and coordinate the recorder lifecycle. The
   documented Begin operation must not be repeated indiscriminately; it can
   assert the recording service. The scaffold deliberately does not call Begin.
5. Run `laptoplink_send_video(connected_socket)` on a suitable worker. Add
   cancellation, game exit handling, shutdown and reconnect behavior. The
   capture call can block indefinitely. Verify H.264 SPS/PPS and IDR arrival
   so a fresh Windows decoder can start displaying video.
6. Produce a complete package and document its exact installation and removal
   paths before copying anything to the console. No such package exists yet.
7. Once the sender is completed and installed on compatible CFW, start the
   laptop's LAN receiver, run a supported game, and start the background sender
   according to that completed package's instructions. Confirm console frames
   arrive, then check stability and measure latency.

Until those steps are implemented and verified, use the simulator. This README
does not invent console menu options, title IDs or installation paths.

## Troubleshooting

| Symptom | What to check |
|---|---|
| `Run setup.ps1 first` | Run setup from the project folder and wait for it to finish. |
| Python missing or Store opens | Install Python, reopen PowerShell and check `python --version`; try the `py -3.14` setup alternative above. |
| Pillow or PyAV installation fails | Match the tested 64-bit Python 3.14 environment; check internet access and the installation error. |
| Browser connection refused | Keep the receiver running, refresh after startup and check the printed web port. |
| Waiting for source | Start the simulator or a future completed console sender. The receiver cannot fetch video from stock firmware. |
| Frozen final image | Read the status and sender terminal. The receiver intentionally keeps the last image after disconnect. |
| Address in use / WinError 10048 | Stop the earlier receiver with Ctrl+C or select unused ports below. |
| Invalid address / WinError 10049 | Use the laptop's currently assigned IPv4 address from `ipconfig`. |
| LAN connection times out | Check laptop IP, `--listen`, TCP 6970 firewall access and Wi-Fi client isolation. |
| No sound | Audio transport and playback are not implemented. |
| Console file will not launch | No installable console binary is included. Read the Nintendo section above. |
| Video feels delayed | Decoding, browser JPEG conversion and TCP buffering add latency; console gameplay latency is untested. |

For a combined demo using different ports:

```powershell
.\.venv\Scripts\python.exe receiver.py --demo --port 6980 --web-port 6981
```

Then open [http://127.0.0.1:6981](http://127.0.0.1:6981). With a separate simulator,
pass it `--port 6980` as well. A future console sender must match the receiver's
TCP ingest port. Press Ctrl+C to stop.

## Moving to another laptop and checking your installation

To check the implementation:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

The tests check framing, invalid headers, TCP ingest, HTTP JPEG output, H.264
decoding and reconnect. All three passed in the recorded Windows run. See
[the validation report](docs/VALIDATION.md) for the exact limits.

To refresh the distributable source package:

```powershell
powershell -ExecutionPolicy Bypass -File .\package.ps1
```

Extract `outputs/LaptopLink-source.zip` on another laptop, open PowerShell in
the extracted folder, and repeat setup and launch. Substitute that folder for
this repository's path in the examples. Recreate `.venv` on each computer rather
than copying it between computers.

The ZIP includes source, scripts and documentation, not Python, dependencies,
a standalone Windows EXE or a Switch executable. Dependency installation needs
internet access; the installed local demo does not need internet access.

Technical references: [Switchbrew GRC services](https://switchbrew.org/wiki/GRC_services)
documents stream formats and blocking behavior, and the
[libnx GRC API](https://switchbrew.github.io/libnx/grc_8h.html) describes the
capture calls used by the untested C unit.

## GitHub uploads and Git LFS

The source ZIP is approximately 22 KB. The much larger `.venv` folder contains
installed dependencies and should not be uploaded. `.gitignore` excludes it,
Python caches and the generated Graft graph. If you upload using GitHub's website,
choose the source files or `outputs/LaptopLink-source.zip`; dragging the entire
working folder into the browser can include ignored files because browser uploads
do not apply your local Git ignore rules.

`.gitattributes` configures `outputs/LaptopLink-source.zip` for Git LFS, and
`.gitignore` permits that specific package. LFS uses the Git client workflow;
dragging a ZIP into GitHub's website does not run the local LFS filter.

**Local repository boundary:** inspection found that this folder currently belongs
to the parent Git repository at `D:\github\lobsterloll`, rather than having its own
Git repository. LFS is installed on this computer, but its repository hooks and
configuration were not initialized by this change because that would write outside
the authorized project folder. No commit, push or history migration was performed.

When this project is in the intended Git checkout, initialize LFS there before
adding the package. The following commands assume LaptopLink is the repository
root; do not run them against the shared parent repository by accident:

```powershell
git rev-parse --show-toplevel
git lfs install --local
git add .gitattributes .gitignore README.md
git add outputs/LaptopLink-source.zip
git lfs ls-files
git commit -m "Track LaptopLink source package with Git LFS"
git push
```

Confirm the first command reports your intended repository root before continuing.
`git lfs ls-files` should list the source ZIP after staging it. Add the application
source and other required project files explicitly when publishing a new repository;
the commands above stage only this LFS configuration and package. Never force-add
`.venv`. If a large file already exists in published Git history, adding a tracking
rule does not remove that historical blob; history migration needs separate review.

See [GitHub's LFS configuration instructions](https://docs.github.com/en/repositories/working-with-files/managing-large-files/configuring-git-large-file-storage)
for the client workflow.
