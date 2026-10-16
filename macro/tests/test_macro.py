import sys
import tempfile
import tkinter as tk
import ctypes
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
import app as app_module
from macro_model import load_recording, save_recording, validate_recording
from win_input import (InputHooks, KBDLLHOOKSTRUCT, WM_KEYDOWN, WM_KEYUP,
                       WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_MOUSEWHEEL)


root = tk.Tk()
root.withdraw()
application = app_module.MacroApp(root)
application.hwnd = 0  # Let synthetic callback data stand in for another app's input.
f12 = KBDLLHOOKSTRUCT(0x7B, 88, 0, 0, 0)
address = ctypes.addressof(f12)
assert application.hooks._keyboard(0, WM_KEYDOWN, address) == 1
assert application.hooks._keyboard(0, WM_KEYDOWN, address) == 1  # Holding F12 must not toggle twice.
application._poll()
assert application.recording
assert application.hooks._keyboard(0, WM_KEYUP, address) == 1
application.on_key(0x41, 30, False, True)
application.on_mouse(WM_MOUSEMOVE, 100, 120, 0)
application.on_mouse(WM_LBUTTONDOWN, 100, 120, 0)
application.on_mouse(WM_LBUTTONUP, 100, 120, 0)
application.on_mouse(WM_MOUSEWHEEL, 100, 120, 120 << 16)
application.on_key(0x41, 30, False, False)
assert application.hooks._keyboard(0, WM_KEYDOWN, address) == 1
assert not application.recording
assert application.hooks._keyboard(0, WM_KEYUP, address) == 1
data = validate_recording(application.recording_data)
assert [event["kind"] for event in data["events"]] == [
    "key", "move", "button", "button", "wheel", "key"]

with tempfile.TemporaryDirectory() as directory:
    file = Path(directory) / "test.macro.json"
    save_recording(file, data)
    restored = load_recording(file)
    assert restored == data

calls = []
class FakeSender:
    def __init__(self, geometry):
        pass
    def key(self, event, down=None):
        calls.append(("key", event["down"] if down is None else down))
    def move(self, x, y):
        calls.append(("move", x, y))
    def button(self, button, down):
        calls.append(("button", button, down))
    def wheel(self, delta, horizontal):
        calls.append(("wheel", delta, horizontal))

app_module.InputSender = FakeSender
focused = [1]
class FakeUser32:
    def GetForegroundWindow(self):
        return focused[0]
app_module.user32 = FakeUser32()
app_module.window_is_open = lambda hwnd: hwnd == 1
application.target_hwnd = 1
application._play_worker(data, 2, data["display"])
assert calls.count(("key", True)) == 2
assert calls.count(("key", False)) == 2
assert calls.count(("button", "left", True)) == 2
assert calls.count(("button", "left", False)) == 2
assert calls.count(("wheel", 120, False)) == 2

# F12 is intercepted even if recording/playback has already stopped before key-up.
stops = []
hooks = InputHooks(lambda *args: None, lambda *args: None,
                   lambda: True, lambda: stops.append(True))
assert hooks._keyboard(0, WM_KEYDOWN, address) == 1
assert hooks._keyboard(0, WM_KEYDOWN, address) == 1
assert hooks._keyboard(0, WM_KEYUP, address) == 1
assert len(stops) == 1

# A stop after key-down must send a matching key-up, even before the saved one.
interrupt_data = {**data, "events": [
    {"kind": "key", "vk": 0x41, "scan": 30, "extended": False,
     "down": True, "t_ns": 0},
    {"kind": "key", "vk": 0x41, "scan": 30, "extended": False,
     "down": False, "t_ns": 2_000_000_000},
]}
validate_recording(interrupt_data)
calls.clear()
class StopOnDown(FakeSender):
    def key(self, event, down=None):
        super().key(event, down)
        if down is None and event["down"]:
            application.stop_playback.set()
app_module.InputSender = StopOnDown
application.stop_playback.clear()
application._play_worker(interrupt_data, 1, data["display"])
assert calls == [("key", True), ("key", False)]

# Leaving the chosen window stops before the next recorded action.
focus_data = {**data, "events": [
    {"kind": "move", "x": 100, "y": 120, "t_ns": 0},
    {"kind": "move", "x": 110, "y": 130, "t_ns": 0},
]}
validate_recording(focus_data)
calls.clear()
class LoseFocusAfterMove(FakeSender):
    def move(self, x, y):
        super().move(x, y)
        focused[0] = 2
app_module.InputSender = LoseFocusAfterMove
application.stop_playback.clear()
application._play_worker(focus_data, 1, data["display"])
assert calls == [("move", 100, 120)]

application.dirty = False
application.close()
print("F12, recording, save/load, repeat, window focus stop, held-key release: OK")
