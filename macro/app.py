"""Windows desktop macro recorder. Run with `py -3 app.py`."""

from __future__ import annotations

import queue
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from macro_model import (MAX_EVENTS, MAX_REPEAT, duration_seconds, load_recording,
                         new_recording, save_recording)
from win_input import (InputHooks, InputSender, VK_F12, WM_LBUTTONDBLCLK, WM_LBUTTONDOWN,
                       WM_LBUTTONUP, WM_MBUTTONDBLCLK, WM_MBUTTONDOWN, WM_MBUTTONUP,
                       WM_MOUSEHWHEEL, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_RBUTTONDBLCLK,
                       WM_RBUTTONDOWN, WM_RBUTTONUP, WM_XBUTTONDBLCLK, WM_XBUTTONDOWN,
                       WM_XBUTTONUP, display_geometry, is_own_window, set_dpi_aware,
                        top_level_window, user32, window_is_open, window_title)

BUTTON_MESSAGES = {
    WM_LBUTTONDOWN: ("left", True), WM_LBUTTONUP: ("left", False),
    WM_LBUTTONDBLCLK: ("left", True),
    WM_RBUTTONDOWN: ("right", True), WM_RBUTTONUP: ("right", False),
    WM_RBUTTONDBLCLK: ("right", True),
    WM_MBUTTONDOWN: ("middle", True), WM_MBUTTONUP: ("middle", False),
    WM_MBUTTONDBLCLK: ("middle", True),
}


class TargetWindowLost(RuntimeError):
    pass


class MacroApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Macro Recorder")
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.lock = threading.Lock()
        self.messages = queue.Queue()
        self.recording = False
        self.playing = False
        self.closed = False
        self.stop_playback = threading.Event()
        self.play_thread = None
        self.target_hwnd: int | None = None
        self.choosing_target = False
        self.recording_data = None
        self.path: Path | None = None
        self.dirty = False
        self.held_keys: dict[tuple[int, int, bool], dict] = {}
        self.held_buttons: dict[str, tuple[int, int]] = {}
        self.start_ns = 0
        self._build_gui()
        self.root.update_idletasks()
        self.root.geometry(f"{max(560, self.root.winfo_reqwidth())}x{self.root.winfo_reqheight()}")
        self.root.resizable(False, False)
        self.root.update()
        self.hwnd = top_level_window(self.root.winfo_id())
        self.hooks = InputHooks(self.on_key, self.on_mouse, self.hotkey_enabled, self.handle_f12)
        try:
            self.hooks.start()
        except Exception as exc:
            messagebox.showerror("Input listener unavailable", str(exc), parent=self.root)
            self.root.destroy()
            return
        self.root.after(50, self._poll)

    def _build_gui(self) -> None:
        frame = ttk.Frame(self.root, padding=16)
        frame.grid(sticky="nsew")
        self.root.columnconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)
        ttk.Label(frame, text="Macro Recorder", font=("Segoe UI", 17, "bold")).grid(
            row=0, column=0, sticky="w")
        ttk.Label(frame, text="Press F12 anywhere to start recording. Press F12 again to stop.",
                  font=("Segoe UI", 10, "bold"), wraplength=500).grid(
            row=1, column=0, sticky="w", pady=(4, 12))

        record_box = ttk.LabelFrame(frame, text="1. Record", padding=10)
        record_box.grid(row=2, column=0, sticky="ew", pady=(0, 10))
        record_box.columnconfigure((0, 1), weight=1, uniform="record")
        ttk.Label(record_box, text="Use F12 without moving your mouse back to this window.",
                  wraplength=490).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 8))
        self.record_button = ttk.Button(record_box, text="Start recording", command=self.start_recording)
        self.record_button.grid(row=1, column=0, sticky="ew", padx=(0, 6))
        self.stop_record_button = ttk.Button(record_box, text="Stop recording", command=self.stop_recording)
        self.stop_record_button.grid(row=1, column=1, sticky="ew")

        play_box = ttk.LabelFrame(frame, text="2. Play your macro", padding=10)
        play_box.grid(row=3, column=0, sticky="ew", pady=(0, 10))
        play_box.columnconfigure((0, 1), weight=1, uniform="play")
        ttk.Label(play_box, text="Choose a window first. After clicking Play macro, switch back to it before playback starts.",
                  wraplength=490).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 8))
        self.play_button = ttk.Button(play_box, text="Play macro", command=self.start_playback)
        self.play_button.grid(row=1, column=0, sticky="ew", padx=(0, 6))
        self.stop_play_button = ttk.Button(play_box, text="Stop macro (F12)", command=self.stop_playback_now)
        self.stop_play_button.grid(row=1, column=1, sticky="ew")
        self.choose_window_button = ttk.Button(play_box, text="Choose playback window",
                                               command=self.choose_window)
        self.choose_window_button.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(10, 0))
        ttk.Label(play_box, text="Click above, then switch to Roblox. After 3 seconds, the app selects that window.",
                  wraplength=490).grid(row=3, column=0, columnspan=2, sticky="w", pady=(5, 0))
        self.target_text = tk.StringVar(value="Playback window: none chosen")
        ttk.Label(play_box, textvariable=self.target_text, wraplength=490).grid(
            row=4, column=0, columnspan=2, sticky="w", pady=(5, 0))
        ttk.Label(play_box, text="The macro stops if you switch to another window.",
                  wraplength=490).grid(row=5, column=0, columnspan=2, sticky="w", pady=(3, 0))
        ttk.Label(play_box, text="How many times should it play?").grid(
            row=6, column=0, columnspan=2, sticky="w", pady=(12, 3))
        self.repeat_mode = tk.StringVar(value="1")
        ttk.Radiobutton(play_box, text="Once", value="1", variable=self.repeat_mode).grid(
            row=7, column=0, sticky="w")
        ttk.Radiobutton(play_box, text="Twice", value="2", variable=self.repeat_mode).grid(
            row=7, column=1, sticky="w")
        custom_row = ttk.Frame(play_box)
        custom_row.grid(row=8, column=0, columnspan=2, sticky="w", pady=(4, 0))
        ttk.Radiobutton(custom_row, text="Choose a number:", value="custom",
                        variable=self.repeat_mode).grid(row=0, column=0, sticky="w")
        self.repeat_entry = ttk.Spinbox(custom_row, from_=1, to=MAX_REPEAT, width=8)
        self.repeat_entry.set("3")
        self.repeat_entry.grid(row=0, column=1, sticky="w", padx=(8, 4))
        ttk.Label(custom_row, text="times").grid(row=0, column=2, sticky="w")
        ttk.Radiobutton(play_box, text="Keep playing until I press F12", value="infinite",
                        variable=self.repeat_mode).grid(row=9, column=0, columnspan=2, sticky="w", pady=(4, 0))
        self.repeat_mode.trace_add("write", lambda *_: self._refresh_repeat_input())
        self._refresh_repeat_input()

        file_box = ttk.LabelFrame(frame, text="3. Save or open a macro", padding=10)
        file_box.grid(row=4, column=0, sticky="ew", pady=(0, 8))
        for column in range(4):
            file_box.columnconfigure(column, weight=1, uniform="files")
        self.save_button = ttk.Button(file_box, text="Save", command=self.save)
        self.save_button.grid(row=0, column=0, sticky="ew", padx=(0, 5))
        self.save_as_button = ttk.Button(file_box, text="Save as…", command=self.save_as)
        self.save_as_button.grid(row=0, column=1, sticky="ew", padx=(0, 5))
        self.load_button = ttk.Button(file_box, text="Open…", command=self.load)
        self.load_button.grid(row=0, column=2, sticky="ew", padx=(0, 5))
        self.clear_button = ttk.Button(file_box, text="Clear", command=self.new)
        self.clear_button.grid(row=0, column=3, sticky="ew")

        self.file_text = tk.StringVar(value="No macro recorded yet")
        ttk.Label(frame, textvariable=self.file_text, wraplength=500).grid(
            row=5, column=0, sticky="w", pady=(5, 2))
        self.detail_text = tk.StringVar(value="Press F12 to start.")
        ttk.Label(frame, textvariable=self.detail_text).grid(row=6, column=0, sticky="w")
        self.status_text = tk.StringVar(value="Ready. Press F12 to start recording.")
        ttk.Label(frame, textvariable=self.status_text, foreground="#174b78", wraplength=500).grid(
            row=7, column=0, sticky="w", pady=(12, 3))
        ttk.Label(frame, text="Saved macros include every key you type, including passwords.",
                  foreground="#7a4b14", wraplength=500).grid(
            row=8, column=0, sticky="w")
        self._refresh_controls()

    def _refresh_repeat_input(self) -> None:
        self.repeat_entry.configure(state="normal" if self.repeat_mode.get() == "custom" else "disabled")

    def hotkey_enabled(self) -> bool:
        return not self.closed

    def _append(self, event: dict) -> None:
        if not self.recording or self.recording_data is None:
            return
        # Leave space to append releases for keys/buttons held when recording stops.
        if len(self.recording_data["events"]) >= MAX_EVENTS - 300:
            self._finish_recording_locked("Event limit reached")
            return
        event["t_ns"] = time.perf_counter_ns() - self.start_ns
        self.recording_data["events"].append(event)

    def on_key(self, vk: int, scan: int, extended: bool, down: bool) -> None:
        if vk == VK_F12 or not self.recording or is_own_window(self.hwnd):
            return
        identity = (vk, scan, extended)
        with self.lock:
            if down:
                event = {"kind": "key", "vk": vk, "scan": scan,
                         "extended": extended, "down": True}
                self._append(event)
                if self.recording:
                    self.held_keys[identity] = event
            elif identity in self.held_keys:
                self._append({"kind": "key", "vk": vk, "scan": scan,
                              "extended": extended, "down": False})
                self.held_keys.pop(identity, None)

    def on_mouse(self, message: int, x: int, y: int, mouse_data: int) -> None:
        if not self.recording or is_own_window(self.hwnd, x, y):
            return
        with self.lock:
            if message == WM_MOUSEMOVE:
                self._append({"kind": "move", "x": x, "y": y})
            elif message in (WM_MOUSEWHEEL, WM_MOUSEHWHEEL):
                delta = (mouse_data >> 16) & 0xFFFF
                if delta >= 0x8000:
                    delta -= 0x10000
                self._append({"kind": "wheel", "x": x, "y": y,
                              "delta": delta, "horizontal": message == WM_MOUSEHWHEEL})
            else:
                pair = BUTTON_MESSAGES.get(message)
                if message in (WM_XBUTTONDOWN, WM_XBUTTONUP, WM_XBUTTONDBLCLK):
                    xbutton = (mouse_data >> 16) & 0xFFFF
                    pair = ("x1" if xbutton == 1 else "x2", message != WM_XBUTTONUP)
                if pair:
                    button, down = pair
                    if down:
                        self._append({"kind": "button", "button": button,
                                      "down": True, "x": x, "y": y})
                        if self.recording:
                            self.held_buttons[button] = (x, y)
                    elif button in self.held_buttons:
                        self._append({"kind": "button", "button": button,
                                      "down": False, "x": x, "y": y})
                        self.held_buttons.pop(button, None)

    def handle_f12(self) -> None:
        if self.recording:
            with self.lock:
                self._finish_recording_locked("Recording stopped with F12")
        elif self.playing:
            self.stop_playback.set()
            self.messages.put(("status", "Emergency stop requested. Releasing held inputs…"))
        else:
            self.messages.put(("f12_toggle",))

    def start_recording(self) -> None:
        if self.recording or self.playing or self.choosing_target or not self._discard_or_save():
            return
        with self.lock:
            self.recording_data = new_recording(display_geometry())
            self.held_keys.clear()
            self.held_buttons.clear()
            self.path = None
            self.dirty = True
            self.start_ns = time.perf_counter_ns()
            self.recording = True
        self.status_text.set("Recording now. Press F12 again to stop.")
        self._refresh_controls()
        self._refresh_summary()

    def _finish_recording_locked(self, reason: str) -> None:
        if not self.recording:
            return
        end_ns = time.perf_counter_ns() - self.start_ns
        for (_, _, _), event in list(self.held_keys.items()):
            self.recording_data["events"].append({
                "kind": "key", "vk": event["vk"], "scan": event["scan"],
                "extended": event["extended"], "down": False, "t_ns": end_ns})
        for button, (x, y) in list(self.held_buttons.items()):
            self.recording_data["events"].append({
                "kind": "button", "button": button, "down": False,
                "x": x, "y": y, "t_ns": end_ns})
        self.held_keys.clear()
        self.held_buttons.clear()
        self.recording = False
        self.messages.put(("record_done", reason))

    def stop_recording(self) -> None:
        with self.lock:
            self._finish_recording_locked("Recording stopped")

    def _repeat_count(self) -> int | None:
        mode = self.repeat_mode.get()
        if mode == "infinite":
            return None
        if mode in ("1", "2"):
            return int(mode)
        try:
            count = int(self.repeat_entry.get().strip())
        except ValueError:
            raise ValueError("Enter how many times to play (1 or more).")
        if not 1 <= count <= MAX_REPEAT:
            raise ValueError(f"Choose a number from 1 to {MAX_REPEAT:,}.")
        return count

    def choose_window(self) -> None:
        if self.recording or self.playing or self.choosing_target:
            return
        self.choosing_target = True
        self._refresh_controls()
        self._target_countdown(3)

    def _target_countdown(self, seconds_left: int) -> None:
        if self.closed or not self.choosing_target:
            return
        if seconds_left == 0:
            self._capture_target_window()
            return
        self.status_text.set(f"Switch to Roblox or another window now. Selecting in {seconds_left}…")
        self.root.after(1000, lambda: self._target_countdown(seconds_left - 1))

    def _capture_target_window(self) -> None:
        self.choosing_target = False
        if self.closed:
            return
        hwnd = top_level_window(user32.GetForegroundWindow())
        if not window_is_open(hwnd) or hwnd == self.hwnd:
            self.status_text.set("No other window was selected. Click Choose playback window and try again.")
        else:
            self.target_hwnd = hwnd
            title = window_title(hwnd) or "Untitled window"
            self.target_text.set(f"Playback window: {title}")
            self.status_text.set(f"Selected {title}. Playback will stop if you switch away.")
        self._refresh_controls()

    def start_playback(self) -> None:
        if (self.recording or self.playing or self.choosing_target or not self.recording_data
                or not self.recording_data["events"]):
            return
        if not self.target_hwnd or not window_is_open(self.target_hwnd):
            self.target_hwnd = None
            self.target_text.set("Playback window: none chosen")
            self._refresh_controls()
            messagebox.showerror("Choose a window", "Click Choose playback window, then switch to Roblox or another window.",
                                 parent=self.root)
            return
        try:
            repeat = self._repeat_count()
        except ValueError as exc:
            messagebox.showerror("Invalid repeat count", str(exc), parent=self.root)
            return
        geometry = display_geometry()
        if geometry != self.recording_data["display"]:
            messagebox.showerror("Display layout changed",
                                 "The current virtual screen size or position differs from the recording. "
                                 "Restore the original monitor layout before playback.", parent=self.root)
            return
        self.stop_playback.clear()
        self.playing = True
        self.status_text.set("Macro starts in 3 seconds. Switch to the chosen window. Press F12 to stop.")
        self._refresh_controls()
        self.play_thread = threading.Thread(target=self._play_worker,
                                            args=(self.recording_data, repeat, geometry),
                                            name="Macro playback", daemon=True)
        self.play_thread.start()

    def _play_worker(self, data: dict, repeat: int | None, geometry: dict[str, int]) -> None:
        sender = InputSender(geometry)
        target_hwnd = self.target_hwnd
        pressed_keys: dict[tuple[int, int, bool], dict] = {}
        pressed_buttons: set[str] = set()
        completed = 0
        error = None
        note = None

        def require_target() -> None:
            if not window_is_open(target_hwnd or 0):
                raise TargetWindowLost("The chosen window was closed. Choose a window again.")
            if user32.GetForegroundWindow() != target_hwnd:
                raise TargetWindowLost("The chosen window lost focus. Macro stopped before the next action.")

        try:
            if self.stop_playback.wait(3):
                return
            require_target()
            while repeat is None or completed < repeat:
                start = time.perf_counter_ns()
                for event in data["events"]:
                    while True:
                        remaining = (start + event["t_ns"] - time.perf_counter_ns()) / 1_000_000_000
                        if remaining <= 0:
                            break
                        if self.stop_playback.wait(min(remaining, 0.05)):
                            return
                        require_target()
                    if self.stop_playback.is_set():
                        return
                    require_target()
                    kind = event["kind"]
                    if kind == "key":
                        sender.key(event)
                        identity = (event["vk"], event["scan"], event["extended"])
                        if event["down"]:
                            pressed_keys[identity] = event
                        else:
                            pressed_keys.pop(identity, None)
                    elif kind == "move":
                        sender.move(event["x"], event["y"])
                    elif kind == "button":
                        sender.move(event["x"], event["y"])
                        if self.stop_playback.is_set():
                            return
                        require_target()
                        sender.button(event["button"], event["down"])
                        if event["down"]:
                            pressed_buttons.add(event["button"])
                        else:
                            pressed_buttons.discard(event["button"])
                    else:
                        sender.move(event["x"], event["y"])
                        if self.stop_playback.is_set():
                            return
                        require_target()
                        sender.wheel(event["delta"], event["horizontal"])
                completed += 1
                if repeat is None or completed < repeat:
                    self.messages.put(("status", f"Completed {completed:,} playback cycle(s). F12 stops playback."))
                    elapsed = (time.perf_counter_ns() - start) / 1_000_000_000
                    if self.stop_playback.wait(max(0.0, 0.02 - elapsed)):
                        return
        except TargetWindowLost as exc:
            note = str(exc)
        except Exception as exc:
            error = str(exc)
        finally:
            for event in pressed_keys.values():
                try:
                    sender.key(event, down=False)
                except Exception:
                    pass
            for button in pressed_buttons:
                try:
                    sender.button(button, down=False)
                except Exception:
                    pass
            stopped = self.stop_playback.is_set()
            self.playing = False
            self.messages.put(("play_done", completed, stopped, error, note))

    def stop_playback_now(self) -> None:
        if self.playing:
            self.stop_playback.set()
            self.status_text.set("Stopping playback and releasing held inputs…")

    def _discard_or_save(self) -> bool:
        if not self.dirty or not self.recording_data or not self.recording_data["events"]:
            return True
        answer = messagebox.askyesnocancel("Unsaved recording",
            "Save the current recording before replacing or closing it?", parent=self.root)
        if answer is None:
            return False
        return self.save() if answer else True

    def save(self) -> bool:
        if self.recording or self.playing or not self.recording_data or not self.recording_data["events"]:
            return False
        if self.path is None:
            return self.save_as()
        try:
            save_recording(self.path, self.recording_data)
        except (OSError, ValueError) as exc:
            messagebox.showerror("Could not save recording", str(exc), parent=self.root)
            return False
        self.dirty = False
        self.status_text.set(f"Saved to {self.path}")
        self._refresh_summary()
        return True

    def save_as(self) -> bool:
        if self.recording or self.playing or not self.recording_data or not self.recording_data["events"]:
            return False
        choice = filedialog.asksaveasfilename(parent=self.root, title="Save macro",
            defaultextension=".macro.json", filetypes=[("Macro recording", "*.macro.json"), ("JSON", "*.json")])
        if not choice:
            return False
        old_path = self.path
        self.path = Path(choice)
        if self.save():
            return True
        self.path = old_path
        return False

    def load(self) -> None:
        if self.recording or self.playing or not self._discard_or_save():
            return
        choice = filedialog.askopenfilename(parent=self.root, title="Load macro",
            filetypes=[("Macro recording", "*.macro.json"), ("JSON", "*.json")])
        if not choice:
            return
        try:
            data = load_recording(choice)
        except (OSError, ValueError) as exc:
            messagebox.showerror("Could not load recording", str(exc), parent=self.root)
            return
        self.recording_data = data
        self.path = Path(choice)
        self.dirty = False
        self.status_text.set("Recording loaded. Choose repeat count, then play.")
        self._refresh_summary()
        self._refresh_controls()

    def new(self) -> None:
        if self.recording or self.playing or not self._discard_or_save():
            return
        self.recording_data = None
        self.path = None
        self.dirty = False
        self.status_text.set("Ready. Press F12 to start recording.")
        self._refresh_summary()
        self._refresh_controls()

    def _refresh_summary(self) -> None:
        data = self.recording_data
        if data is None:
            self.file_text.set("No macro recorded yet")
            self.detail_text.set("Press F12 to start.")
            return
        self.file_text.set((str(self.path) if self.path else "Unsaved recording") +
                           (" *" if self.dirty else ""))
        self.detail_text.set(f"{len(data['events']):,} recorded actions  ·  {duration_seconds(data):.2f} seconds")

    def _refresh_controls(self) -> None:
        has_events = bool(self.recording_data and self.recording_data["events"])
        idle = not self.recording and not self.playing and not self.choosing_target
        self.record_button.configure(state="normal" if idle else "disabled")
        self.stop_record_button.configure(state="normal" if self.recording else "disabled")
        self.play_button.configure(state="normal" if idle and has_events and self.target_hwnd else "disabled")
        self.stop_play_button.configure(state="normal" if self.playing else "disabled")
        self.choose_window_button.configure(state="normal" if idle else "disabled")
        for button in (self.save_button, self.save_as_button):
            button.configure(state="normal" if idle and has_events else "disabled")
        for button in (self.load_button, self.clear_button):
            button.configure(state="normal" if idle else "disabled")

    def _poll(self) -> None:
        if self.closed:
            return
        while True:
            try:
                item = self.messages.get_nowait()
            except queue.Empty:
                break
            if item[0] == "status":
                self.status_text.set(item[1])
            elif item[0] == "f12_toggle":
                if self.recording:
                    self.stop_recording()
                elif not self.playing:
                    self.start_recording()
            elif item[0] == "record_done":
                self.status_text.set(item[1] + ". Click Play macro or Save.")
                self._refresh_controls()
                self._refresh_summary()
            elif item[0] == "play_done":
                _, completed, stopped, error, note = item
                if error:
                    self.status_text.set(f"Playback stopped: {error}")
                    messagebox.showerror("Playback stopped", error, parent=self.root)
                elif note:
                    self.status_text.set(note)
                elif stopped:
                    self.status_text.set(f"Playback stopped after {completed:,} complete cycle(s).")
                else:
                    self.status_text.set(f"Playback finished: {completed:,} cycle(s).")
                self._refresh_controls()
        if self.recording:
            with self.lock:
                self._refresh_summary()
        self.root.after(50, self._poll)

    def close(self) -> None:
        self.stop_playback.set()
        if self.play_thread and self.play_thread.is_alive():
            self.play_thread.join(timeout=3)
        if self.recording:
            self.stop_recording()
        if not self._discard_or_save():
            return
        self.closed = True
        self.hooks.stop()
        self.root.destroy()


def main() -> None:
    set_dpi_aware()
    root = tk.Tk()
    if "vista" in ttk.Style(root).theme_names():
        ttk.Style(root).theme_use("vista")
    MacroApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
