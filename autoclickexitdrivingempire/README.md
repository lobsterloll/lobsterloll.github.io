# Driving Empire Exit Clicker

This Windows utility watches the visible MuMu emulator screen. It looks for the red, white-lettered Exit button near the upper right of the Driving Empire car or helicopter shop, then moves the Windows mouse to it and clicks. The selected Samsung phone model inside MuMu needs no setup.

## Use

1. Open MuMu and Roblox Driving Empire. Keep MuMu visible on screen.
2. Run `dist\DrivingEmpireExitClicker\DrivingEmpireExitClicker.exe`. If using the ZIP, extract the whole folder first.
3. Press **Start**, then switch back to MuMu. It begins watching only when MuMu is the active window.
4. Press **Stop** to pause, or close the utility to quit.

The program starts **Off**. It requires the Exit button to appear in two consecutive captures before clicking and waits two seconds between attempts. It cannot watch a minimized window.

## Build from source

On Windows with Python 3.14 installed, run `./build.ps1` in this folder. The script writes the EXE and its bundled libraries under `dist\DrivingEmpireExitClicker`. Keep that folder together when moving the EXE. To run directly from source, install `requirements.txt` and run `python exit_clicker.py`.

The original screenshot attachment is not stored in this D: project. Detection uses the button's red shape and white lettering seen in the reference rather than a pixel template. A live car and helicopter shop test is still needed to confirm the match on your MuMu display.
