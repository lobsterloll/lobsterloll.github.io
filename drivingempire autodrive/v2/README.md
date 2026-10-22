# Driving Empire learned driver — Version 2

Version 2 has three separate experiments. `record` / `train` / `drive` copies your manual steering. `self_train` is the earlier road-following steering table. **`self_train_auto` is a visual reinforcement-learning agent:** it chooses key presses from screenshots and learns from the result, without calling the road pathfinder or using the steering table. Version 1 remains in the parent folder.

An unfinished `v2/release/DrivingEmpire-V2.exe` from the cancelled packaging attempt is obsolete and contains the previous behavior. Run the Python command below for the visual AI.

## Setup

Use the project environment and dependencies from the Version 1 README. Close the Version 1 preview before trying Version 2, so F8 controls only one driver. From the project folder, with Roblox open in a window:

1. Run `./.venv/Scripts/python.exe v2/autodrive.py record`.
2. Focus Roblox and drive normally on varied roads, including left and right bends. The recorder saves a road-view feature and your steering choice about five times per second while **W** is physically held. It does not save full screenshots. Press **F9** to finish and save the session.
3. Run `./.venv/Scripts/python.exe v2/autodrive.py train`. Record more if it asks for left, straight, or right examples.
4. Run `./.venv/Scripts/python.exe v2/autodrive.py drive`. It starts paused. Focus Roblox and press **F8** to try the learned driver on a clear, empty road at low speed.

The model and recordings stay inside `v2/`. Each new recording can be included by running `train` again. Training keeps up to 1,500 examples of each steering choice in the active model, so recording for days does not make the model grow without limit.

## Self-training steering experiment

Run `./.venv/Scripts/python.exe v2/autodrive.py self_train`. No manual recording is required for this mode. It starts paused; focus Roblox and press **F8** on a clear, empty road. It tries brief left, straight, and right corrections, scores whether the visible road becomes better aligned with the car, and saves its steering table to `v2/steering_q.npz`. Later runs load that table. The preview displays how many steering decisions have been scored.

This is a **small online steering experiment**, not a map-learning or full reinforcement-learning driver. It keeps Version 1's fixed low throttle. It cannot tell whether a road choice reaches a destination, and its alignment score can be wrong when the road detector mistakes a sidewalk for a road. It pauses on lost road detection, focus loss, manual takeover, a large path error, or an apparently stuck car. When it pauses, you must inspect and reset the car before pressing F8 again. Do not leave this mode unattended for days yet.

## Visual AI experiment

Run `./.venv/Scripts/python.exe v2/autodrive.py self_train_auto`. Focus Roblox and press **F8** to start. The agent sees a reduced screenshot and whether the speed display shows movement. When the speed display is absent, it estimates movement from successive screenshots while a road remains visible. Every short step it chooses one of: **W**, **W+A**, **W+D**, **A**, **D**, **S**, or **Space**. Consecutive W choices keep acceleration held, with no artificial throttle cap. It chooses keys itself; the road detector only scores the result. The current goal is **drive on any road for as long as possible without getting stuck or needing recovery**. Movement earns a positive score only when the visible road is aligned with the car; driving without a detected aligned road, standing still, and losing the car receive penalties. A small network learns from these scores and saves to `v2/road_goal_agent.npz`. The earlier movement-only model remains at `v2/visual_agent.npz`.

At zero speed, it keeps trying driving actions for 20 seconds, with extra exploration to learn which actions can free it. If it is still stuck, it presses **F** to exit and **T** to open My Vehicles. If the speed display is already gone, it skips F; if the menu is already open, it skips both keys. When T opens only the vehicle category strip, it left clicks the car icon to open **Collections**. It then left clicks one of four visible car cards at random, holding the mouse button briefly, and presses **T** to close the menu if it stays open. It checks the speed display only after the menu closes and allows up to ten seconds for it to appear. It also tries this recovery after the speed display has been missing for one second. If it remains missing for 20 seconds, it opens Roblox's menu with **Esc**, chooses **Respawn** with **R**, and confirms with **Enter**, then tries to spawn a car again. This is intended to escape places such as the ocean where cars cannot spawn; the confirmation sequence and successful return to land still need a live test. If recovery fails, it releases its keys and retries instead of stopping. If Roblox loses focus or becomes unavailable, it releases its keys and resumes when the game is back in focus.

The preview draws green points where it sees the road and says **NO ROAD DETECTED** when it finds none. It shows the current uninterrupted stretch of detected road driving and the best stretch saved in the policy. That is a useful progress signal, while the step count only counts updates. The detector uses road color and surface texture as well as lane markings, so it can score roads without painted center lines, but it can still mistake sidewalks or unusual pavement for a road. It does not label cars or buildings as separate object classes; a missing road ahead is an obstacle cue, not proof of what the obstacle is. The agent does not yet recognize a destination or prove it completed a fixed route. To judge improvement, start from a comparable place and watch whether road-driving stretches increase and recoveries decrease. A single best stretch can also improve by luck, so repeat the test. Keep **F9** ready.

### Evaluate a saved checkpoint

Run `py -3 v2/autodrive.py evaluate_auto` for the road-goal model or `py -3 v2/autodrive.py evaluate_free` for the game explorer. Focus Roblox and press **F8** to start. These modes load the matching saved model, choose its highest-valued actions without random exploration, and do not update or save its weights. Start each comparison from the same road and camera view, and stop after a similar amount of time.

Each run writes `steps.csv`, a `frames/` folder, and `summary.json` under `v2/data/evaluations/<timestamp>/`. The CSV pairs each chosen action with its outcome frame, movement estimate, road alignment, and current reward. The summary reports time spent moving with a detected aligned road, time moving without one, stopped time, lost-car events, and recovery attempts. These are **screen-derived estimates**, not verified distance or collision measurements. Inspect the frames to check whether the car really advanced along the route; compare several runs before deciding that a checkpoint improved. Once those estimates agree with what the frames show, they can guide a better training reward.

## Game exploration experiment

Run `./.venv/Scripts/python.exe v2/autodrive.py self_train_free`. This mode starts a separate model at `v2/game_explorer_agent.npz`. It sees a reduced image of the whole Roblox window and tries 72 actions: the driving combinations, individual letter and number keys except L, Space, Shift and arrows, left and right clicks at positions across the game view, and wheel scrolling up and down. Random exploration samples all 72 actions evenly and remains at least 25% of choices, so mouse and keyboard actions continue to get tried as it learns. It still rewards detected road driving and also gives a small one-time reward for a new-looking screenshot, so it can explore menus and camera changes. W stays held when it chooses acceleration on consecutive steps; there is no programmed speed cap.

All mouse positions stay inside the Roblox game view and above its bottom quarter. The action list excludes Esc, L (the Roblox Leave shortcut), Alt, Windows keys, F8, F9, the Roblox menu area, and chat controls. It cannot issue Alt+F4 or click the window's Close button. Pressing physical Esc or a driving key pauses the assistant; close the preview window to quit. Trying many inputs is not the same as understanding the game: this model has no labeled car or building detector, and novelty can reward a menu change that does not help driving. Its best road streak remains the useful driving measure. Supervise exploratory runs.

## Controls

- **F8:** start or pause learned driving.
- **F9:** release assistant keys and pause in `drive`, `self_train`, `self_train_auto`, and `evaluate_auto`; in `record`, finish and save. Ignored in `self_train_free` and `evaluate_free`.
- **Physical W/A/S/D/Space during learned driving:** take control and pause.
- **Q in the preview:** quit `drive`, `self_train`, `self_train_auto`, or `evaluate_auto`. In `self_train_free` and `evaluate_free`, close the preview window to quit.

If the preview says **MANUAL TAKEOVER**, the agent is paused because you pressed a driving key. It will not attempt recovery while paused. Press **F8** when you want it to resume from the current game view.

The game must stay focused while driving or recording. The assistant releases its keys when focus is lost. In `self_train_auto`, it waits for Roblox to regain focus and then continues without another F8 press. The older `drive` and `self_train` modes still pause when road tracking is lost. In modes where F9 is enabled, it releases assistant input but does not brake a coasting car. Settings and keybindings come from the parent `settings.json`.

## What this version can learn

The manual-example mode is imitation learning: it finds similar road views from your recordings and copies the steering choice you made there. More varied, correctly driven examples can improve it after retraining. It can also make mistakes on unfamiliar views; low similarity or uncertain votes pause the driver. This mode and `self_train` still use Version 1's road check, so intersections and some unusual roads will pause them.

The visual AI can update its own network from its actions, but hours alone cannot make it a complete driver. Its road score is a screenshot-based estimate, not a collision detector or a map. It does not learn routes or cinematic camera control. Supervise every test, and use a physical driving key to pause whenever the behavior is wrong.
