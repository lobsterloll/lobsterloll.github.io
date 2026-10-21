# Driving Empire road follower — Version 1

A supervised, screen-only Windows prototype. It sees the Roblox window, estimates the center of the visible road, and sends short W/D/A key presses. It starts paused, never reads Roblox memory, and pauses when the road is unclear. It cannot choose a destination or reliably cross intersections.

## Setup

1. Install Python 3.11 or newer.
2. Open PowerShell in this folder and create a project-local Python environment:

   `py -m venv .venv`

   `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`

3. Open Driving Empire in a window. Use **V** to select a steady rear camera view like screenshots 1 and 2. Keep the window visible.
4. Run:

   `.\.venv\Scripts\python.exe autodrive.py`

The preview starts paused. Focus Roblox for a moment so the assistant captures a clear game frame, then return to the preview. Green dots should follow your lane ahead and the yellow line should pass near your car's forward position. If they do not, click a clean patch of gray asphalt *ahead of the car* in the preview. That color is saved in `settings.json`; grass and other strongly colored patches are rejected. Click Roblox to focus it, then press **F8** to start. Begin on a straight, empty road at low speed, with the car facing along the lane and the yellow center line to its left.

## Controls and safety

- **F8:** start or pause. Starting requires Roblox to be focused and a road sample.
- **F9:** immediately release every key the assistant is holding and pause.
- **Any physical W/S/Space/D/A press:** manual takeover and pause.
- **Q in the preview:** quit.

The stop hotkey cuts the assistant's inputs; it does not physically stop a coasting car. Keep control of the game and use your own brake or handbrake. The assistant also releases its keys if Roblox loses focus or road tracking fails. Its safety hotkeys depend on the program and Windows keyboard hook continuing to run.

The verified keybindings are W accelerate, S brake/reverse, Space handbrake, A left, D right. Edit the `keys` entries in `settings.json` if needed. The assistant uses W/A/D; S and Space are monitored for manual takeover. Do not assign the same key to two actions.

## Calibration

The included road color is measured from your recording. The game may render a different shade on your PC or at night. Click a plain asphalt patch in the preview when the green dots miss the roadway. The assistant uses visible lane markings when it finds a plausible pair. Otherwise it follows the sampled asphalt surface, including on wider roads without yellow lines. `color_tolerance` controls how different a pixel may be from the selected road color. Lower it if sidewalks are being selected; raise it if the road is missed. `car_x_fraction` is the horizontal position of your car, from 0 at the left edge to 1 at the right edge. `throttle_duty` limits how long W is held in each short cycle.

## Limits and next features

This is **local road following**, not route finding. The preview must show a stable chase camera and an unobstructed road. The assistant pauses at uncertain shapes, including many intersections, shadows, ramps, and traffic. It can mistake a sidewalk or parking lot for road when the colors match; supervise it and use F9 or a physical driving key immediately when the green path looks wrong. Digital key presses cannot give the same smoothness as analog steering. Running the program for hours does not train it: it has no saved examples, route labels, or feedback about successful driving.

To extend it:

1. **Routing:** Build a road graph from recorded mini-map views and user-checked junctions. Match the visible mini-map and landmarks to that graph, plan a route with A*, and stop whenever location or the next junction is uncertain. The mini-map in your screenshots makes this plausible, but no map or game coordinates are available to this external program yet.
2. **Steering:** Replace single-color road sampling with lane and curb detection across changing light, then track lane position over time. Use a look-ahead controller and estimated speed to choose steering and braking. Keyboard-only steering will still be less smooth than an analog controller.
3. **Camera:** Keep a fixed rear view for road tracking. Test the V views and any permitted mouse orbit separately; a cinematic mode could use those existing controls or frame a recording. It cannot set an arbitrary in-game camera position from outside Roblox.

For the staged learning and map plan, see [Architecture](ARCHITECTURE.md).
