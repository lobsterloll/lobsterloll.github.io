"""Always-on-top Windows overlay for Roblox Driving Empire acceleration runs."""

import ctypes
import json
import os
import threading
import time
import tkinter as tk
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import mss
from PIL import Image

from timer import REFERENCE, TARGETS, TimerState, is_zero, speed_hundreds, speed_shape


ctypes.windll.user32.SetProcessDPIAware()
USER32 = ctypes.windll.user32
USER32.GetForegroundWindow.restype = ctypes.c_void_p
USER32.SetForegroundWindow.argtypes = [ctypes.c_void_p]
VK_W = 0x57
CAPTURE_FPS = 120
CAPTURE_INTERVAL = 1 / CAPTURE_FPS
DATA_DIR = Path(os.environ["LOCALAPPDATA"]) / "0-100timer"
DATA_DIR.mkdir(parents=True, exist_ok=True)
SETTINGS = DATA_DIR / "settings.json"
LAST_TRIGGER = DATA_DIR / "last-trigger.png"


def pressed(key):
    return bool(USER32.GetAsyncKeyState(key) & 0x8000)


class Overlay:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("0–300 timer")
        self.root.iconbitmap(str(Path(__file__).with_name("app.ico")))
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.root.attributes("-topmost", True)
        self.root.attributes("-alpha", 0.94)
        self.root.configure(bg="#17202b")
        self.root.geometry("340x380+80+140")
        self.reference = Image.open(REFERENCE).convert("1")
        self.zero_size = None
        self.last_zero = False
        self.last_speed_pixels = None
        self.last_speed_reading = None
        self.state = TimerState()
        self.settings = self.load_settings()
        stored_bests = self.settings.get("bests", {})
        self.state.bests = {target: stored_bests.get(str(target))
                            for target in TARGETS}
        if self.state.bests[100] is None:
            self.state.bests[100] = self.settings.get("best")
        width = USER32.GetSystemMetrics(0)
        height = USER32.GetSystemMetrics(1)
        self.region = self.settings.get("region") or [
            round(width * 1215 / 1535), round(height * 694 / 862),
            round(width * 1369 / 1535), round(height * 743 / 862)]
        self.frame_lock = threading.Lock()
        self.pending_frames = deque(maxlen=8)
        self.capture_error = False
        self.capture_rate = 0
        self.displayed_capture_rate = 0
        self.display_text = {}
        self.last_clock_draw = 0.0
        self.capture_generation = 0
        self.capture_stop = threading.Event()
        self.capture_thread = threading.Thread(target=self.capture_loop, daemon=True)
        self.save_worker = ThreadPoolExecutor(max_workers=1)
        self.game_window = None
        self.build_ui()
        self.capture_thread.start()
        self.root.after(1, self.poll)

    def load_settings(self):
        try:
            return json.loads(SETTINGS.read_text(encoding="utf-8"))
        except (FileNotFoundError, ValueError):
            return {}

    def save_settings(self):
        SETTINGS.write_text(json.dumps({"region": self.region,
                                        "bests": self.state.bests}, indent=2),
                            encoding="utf-8")

    def build_ui(self):
        self.time_label = tk.Label(self.root, text="Run 0.000 s", fg="white",
                                   bg="#17202b", font=("Segoe UI", 18, "bold"))
        self.time_label.pack()
        self.status_label = tk.Label(self.root, text="READY", fg="#76d6fb",
                                     bg="#17202b", font=("Segoe UI", 10))
        self.status_label.pack()
        self.split_labels = {}
        self.best_labels = {}
        for target in TARGETS:
            row = tk.Frame(self.root, bg="#243342")
            row.pack(fill="x", padx=12, pady=2)
            tk.Label(row, text=f"0–{target}", fg="#76d6fb", bg="#243342",
                     font=("Segoe UI", 11, "bold")).pack(side="left", padx=8)
            values = tk.Frame(row, bg="#243342")
            values.pack(side="right", padx=8)
            self.split_labels[target] = tk.Label(values, text="—", fg="white",
                                                  bg="#243342", font=("Segoe UI", 15, "bold"))
            self.split_labels[target].pack(anchor="e")
            self.best_labels[target] = tk.Label(values, text="Best: —", fg="#f4ce76",
                                                 bg="#243342", font=("Segoe UI", 8))
            self.best_labels[target].pack(anchor="e")
        tk.Button(self.root, text="Record again", command=self.reset,
                  bg="#2c9bd6", fg="white", activebackground="#167cb4",
                  font=("Segoe UI", 10, "bold"), bd=0).pack(fill="x", padx=16, pady=(5, 2))
        buttons = tk.Frame(self.root, bg="#17202b")
        buttons.pack(pady=2)
        tk.Button(buttons, text="Set speed area", command=self.select_region).pack(
            side="left", padx=4)
        tk.Button(buttons, text="Clear bests", command=self.clear_best).pack(side="left", padx=4)

    def show_text(self, label, value):
        if self.display_text.get(label) != value:
            label.config(text=value)
            self.display_text[label] = value

    def reset(self):
        self.capture_generation += 1
        self.state.reset(w_down=pressed(VK_W), zero=self.last_zero)
        if self.game_window:
            self.root.after(50, lambda: USER32.SetForegroundWindow(self.game_window))

    def clear_best(self):
        self.state.bests = {target: None for target in TARGETS}
        self.save_settings()
        self.reset()

    def select_region(self):
        self.root.withdraw()
        self.selector = tk.Toplevel(self.root)
        x = USER32.GetSystemMetrics(76)
        y = USER32.GetSystemMetrics(77)
        width = USER32.GetSystemMetrics(78)
        height = USER32.GetSystemMetrics(79)
        self.selector.overrideredirect(True)
        self.selector.geometry(f"{width}x{height}{x:+d}{y:+d}")
        self.selector.attributes("-topmost", True)
        self.selector.attributes("-alpha", 0.40)
        self.selector.configure(bg="black")
        canvas = tk.Canvas(self.selector, bg="black", highlightthickness=0,
                           cursor="crosshair")
        canvas.pack(fill="both", expand=True)
        canvas.create_text(20, 20, anchor="nw", fill="white",
                           text="Drag around speed DIGITS only, with room for 300. Esc cancels.",
                           font=("Segoe UI", 15, "bold"))
        start = [None]
        rectangle = [None]

        def down(event):
            start[0] = (event.x, event.y)
            rectangle[0] = canvas.create_rectangle(event.x, event.y, event.x,
                                                    event.y, outline="cyan", width=3)

        def move(event):
            if rectangle[0] is not None:
                canvas.coords(rectangle[0], *start[0], event.x, event.y)

        def finish(event):
            if start[0]:
                left, right = sorted((start[0][0] + x, event.x + x))
                top, bottom = sorted((start[0][1] + y, event.y + y))
                if right - left >= 70 and bottom - top >= 30:
                    self.region = [left, top, right, bottom]
                    self.zero_size = None
                    self.save_settings()
                    self.reset()
            cancel()

        def cancel(_event=None):
            self.selector.destroy()
            self.root.deiconify()

        canvas.bind("<ButtonPress-1>", down)
        canvas.bind("<B1-Motion>", move)
        canvas.bind("<ButtonRelease-1>", finish)
        self.selector.bind("<Escape>", cancel)
        self.selector.focus_force()

    def capture_loop(self):
        camera = None
        dxcam = None
        try:
            import dxcam
            camera = dxcam.create(output_color="RGB", processor_backend="cv2")
        except Exception:
            pass
        try:
            with mss.MSS() as fallback:
                next_capture = time.perf_counter()
                camera_retry_at = next_capture + 2
                rate_started = next_capture
                rate_frames = 0
                while not self.capture_stop.is_set():
                    generation = self.capture_generation
                    left, top, right, bottom = self.region
                    w_down = pressed(VK_W)
                    capture_started = time.perf_counter()
                    primary_region = (0 <= left < right <= USER32.GetSystemMetrics(0)
                                      and 0 <= top < bottom <= USER32.GetSystemMetrics(1))
                    # A display change must not leave us on CPU capture permanently.
                    if camera is None and dxcam is not None and primary_region and capture_started >= camera_retry_at:
                        camera_retry_at = capture_started + 2
                        try:
                            camera = dxcam.create(output_color="RGB", processor_backend="cv2")
                        except Exception:
                            pass
                        capture_started = time.perf_counter()
                    fast_capture = camera is not None and primary_region
                    if fast_capture:
                        try:
                            frame = camera.grab(region=(left, top, right, bottom),
                                                new_frame_only=False, copy=False)
                            if frame is None:
                                time.sleep(CAPTURE_INTERVAL)
                                continue
                            image = Image.frombytes("RGB", (right - left, bottom - top),
                                                    frame.tobytes())
                        except Exception:
                            try:
                                camera.release()
                            except Exception:
                                pass
                            camera = None
                            camera_retry_at = time.perf_counter() + 2
                            continue
                    else:
                        try:
                            shot = fallback.grab({"left": left, "top": top,
                                                  "width": right - left, "height": bottom - top})
                            image = Image.frombytes("RGB", shot.size, shot.rgb)
                        except (mss.exception.ScreenShotError, ValueError, OSError):
                            self.capture_error = True
                            self.capture_stop.wait(0.05)
                            continue
                    frame_time = (capture_started + time.perf_counter()) / 2
                    with self.frame_lock:
                        self.pending_frames.append((image, frame_time, w_down, generation))
                    self.capture_error = False
                    rate_frames += 1
                    if frame_time - rate_started >= 1:
                        self.capture_rate = round(rate_frames / (frame_time - rate_started))
                        rate_started = frame_time
                        rate_frames = 0
                    next_capture += CAPTURE_INTERVAL
                    now = time.perf_counter()
                    # Keep steady deadlines; resume immediately after a late capture.
                    if now > next_capture:
                        next_capture = now
                    # Python 3.11+ uses a high-resolution Windows waitable timer.
                    # Event.wait rounds these short waits up on some Windows systems.
                    if next_capture > now:
                        time.sleep(next_capture - now)
        except OSError:
            self.capture_error = True
        finally:
            if camera is not None:
                try:
                    camera.release()
                except Exception:
                    pass

    def poll(self):
        with self.frame_lock:
            frames = tuple(self.pending_frames)
            self.pending_frames.clear()
        if not frames:
            if self.capture_error:
                self.show_text(self.status_label, "Capture failed · set speed area")
            self.root.after(2, self.poll)
            return
        for frame in frames:
            self.process_frame(frame)
        self.root.after(2, self.poll)

    def process_frame(self, frame):
        image, frame_time, w_down, generation = frame
        if generation != self.capture_generation:
            return
        if self.capture_rate != self.displayed_capture_rate:
            self.displayed_capture_rate = self.capture_rate
            self.root.title(f"0–300 timer · {self.capture_rate} captures/s")
        try:
            pixels = (generation, image.size, image.tobytes())
            if pixels != self.last_speed_pixels:
                shape = speed_shape(image)
                zero = is_zero(shape, self.reference)
                if zero:
                    self.zero_size = shape.size
                hundreds = speed_hundreds(shape, self.reference, self.zero_size)
                self.last_speed_reading = (shape, zero, hundreds)
                self.last_speed_pixels = pixels
            shape, zero, hundreds = self.last_speed_reading
            self.last_zero = zero
            previous_status = self.state.status
            before_bests = self.state.bests.copy()
            before_splits = self.state.splits.copy()
            self.state.update(frame_time, w_down, zero, hundreds)
            if previous_status in ("READY", "ARMED") and self.state.status == "RUNNING":
                self.game_window = USER32.GetForegroundWindow()
            triggered = [target for target in TARGETS
                         if before_splits[target] is None and self.state.splits[target] is not None]
            if triggered:
                self.save_worker.submit(self.save_trigger_images, image.copy(), triggered)
            if before_bests != self.state.bests:
                self.save_settings()
            if self.state.status == "FINISHED":
                status = "FINISHED · click Record again"
            elif self.state.status == "ARMED":
                status = "READY · press W"
            elif self.state.status == "READY":
                status = "WAITING FOR 0 km/h" if shape else "Check speed area"
            else:
                next_target = next((target for target in TARGETS
                                    if self.state.splits[target] is None), 300)
                status = f"RUNNING · next {next_target} km/h"
            self.show_text(self.status_label, status)
            if self.state.status != "RUNNING" or frame_time - self.last_clock_draw >= 0.05:
                self.show_text(self.time_label, f"Run {self.state.elapsed:.3f} s")
                self.last_clock_draw = frame_time
            for target in TARGETS:
                split = self.state.splits[target]
                best = self.state.bests[target]
                self.show_text(self.split_labels[target], f"{split:.3f} s" if split is not None else "—")
                self.show_text(self.best_labels[target], f"Best: {best:.3f} s" if best is not None else "Best: —")
        except (mss.exception.ScreenShotError, ValueError, OSError):
            self.show_text(self.status_label, "Capture failed · set speed area")

    def save_trigger_images(self, image, targets):
        for target in targets:
            image.save(DATA_DIR / f"last-trigger-{target}.png")
        image.save(LAST_TRIGGER)

    def close(self):
        self.capture_stop.set()
        self.capture_thread.join(timeout=0.5)
        self.save_worker.shutdown(wait=False)
        self.root.destroy()


if __name__ == "__main__":
    Overlay().root.mainloop()
