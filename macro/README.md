# Macro Recorder for Windows

A desktop app that records physical keyboard presses/releases, mouse movement, mouse button presses/releases, and vertical or horizontal scrolling. It replays each event at its recorded time and screen position. Recordings can be saved and loaded as local `.macro.json` files.

## Run

Double-click **MacroRecorder.exe** in this folder. It opens the GUI directly, without a command window or a Python installation.

To run the source instead, install Python 3.10 or newer and run `py -3 app.py` from this folder. The source uses only Python's standard library.

## Use

1. Press **F12** anywhere to start recording. You can also click **Start recording**. Mouse and keyboard actions inside Macro Recorder's own window are excluded.
2. Press **F12** again to stop recording, or click **Stop recording**.
3. Click **Choose playback window**, then switch to Roblox or the window you want the macro to control. After 3 seconds, the app selects the window you switched to.
4. Choose **Once**, **Twice**, **Choose a number**, or **Keep playing until I press F12**.
5. Click **Play macro** and switch back to the chosen window during the 3-second countdown. Playback follows the recorded timing and stops if another window becomes active. Press **F12** at any point to stop, including during the countdown. The **Stop macro** button also stops it.
6. Click **Save** or **Save as…** to keep the macro. **Open…** restores it later.

Playback requires the same virtual screen position and size as the recording. Restore your monitor arrangement and display resolution if the app reports a mismatch. Mouse positions are absolute screen coordinates; moving a target window may make the macro click the wrong place.

## Safety and privacy

- **F12 starts and stops recording, and stops playback immediately.** It is never stored in a recording. While Macro Recorder is open, F12 is reserved for this app. Test a new macro with **Once** before selecting repeated playback.
- The player releases any keys or mouse buttons it has held when it stops or encounters an error. A recording stopped while a key or button is held gets a matching release event.
- Saved macros are plain JSON and can contain passwords or other sensitive text you typed. Store them accordingly and avoid recording secrets.
- Playback requires the chosen window to be active. It checks focus before each action and stops when you switch away. The chosen window is not saved with the recording; choose it each time you open the app.
- Windows sends simulated keyboard and mouse input to the active desktop window. Choosing Roblox does not let its macro run in the background while you play another game on the same desktop. A focus change at the exact instant input is sent can still let an action reach the other window. See Microsoft's [keyboard focus](https://learn.microsoft.com/en-us/windows/win32/inputdev/about-keyboard-input) and [SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput) documentation.
- Windows limits synthesized input across privilege levels. A normal app may not control an elevated administrator app. If your trusted target truly requires administrator privileges, start Macro Recorder at the same privilege level. It cannot control UAC prompts or the secure desktop. See Microsoft's [SendInput documentation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput).
- Other software-generated input is ignored while recording, which prevents the recorder from capturing its own playback.
- Timing follows the recorded high-resolution timestamps as closely as Windows scheduling allows; it is not a hard real-time tool. Games using raw input, protected applications, remote desktops, and some special keys may behave differently.

## Files

- `MacroRecorder.exe` — double-clickable Windows app
- `app.py` — GUI, recorder, and player source
- `win_input.py` — Windows hooks and input injection
- `macro_model.py` — recording format, validation, save/load
- `tests/test_macro.py` — local behavior checks for the source checkout

The app does not send recordings over the network. Saving writes an adjacent temporary file and then replaces the destination to reduce the chance of a partial save.
