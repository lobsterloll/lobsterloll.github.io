"""Conservative, screen-only road follower for a windowed Roblox session."""

import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import threading
import time

import cv2
import mss
import numpy as np


if os.name != "nt":
    raise SystemExit("This assistant runs on Windows only.")

ROOT = Path(__file__).resolve().parent
SETTINGS_PATH = ROOT / "settings.json"
user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

ULONG_PTR = ctypes.c_size_t
LRESULT = ctypes.c_ssize_t
HOOKPROC = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)
ENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ("vkCode", wintypes.DWORD),
        ("scanCode", wintypes.DWORD),
        ("flags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    ]


class INPUTUNION(ctypes.Union):
    _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT), ("hi", HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", INPUTUNION)]


user32.SetWindowsHookExW.argtypes = [ctypes.c_int, HOOKPROC, ctypes.c_void_p, wintypes.DWORD]
user32.SetWindowsHookExW.restype = ctypes.c_void_p
user32.CallNextHookEx.argtypes = [ctypes.c_void_p, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM]
user32.CallNextHookEx.restype = LRESULT
user32.UnhookWindowsHookEx.argtypes = [ctypes.c_void_p]
user32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), ctypes.c_void_p, wintypes.UINT, wintypes.UINT]
user32.GetMessageW.restype = ctypes.c_int
user32.PostThreadMessageW.argtypes = [wintypes.DWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
user32.SendInput.restype = wintypes.UINT
user32.MapVirtualKeyW.argtypes = [wintypes.UINT, wintypes.UINT]
user32.MapVirtualKeyW.restype = wintypes.UINT
user32.EnumWindows.argtypes = [ENUMPROC, wintypes.LPARAM]
user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.IsIconic.argtypes = [wintypes.HWND]
user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
user32.GetForegroundWindow.restype = wintypes.HWND
kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
kernel32.GetModuleHandleW.restype = ctypes.c_void_p
kernel32.GetCurrentThreadId.restype = wintypes.DWORD


def virtual_key(name):
    name = name.upper()
    if len(name) == 1 and name.isascii() and name.isalnum():
        return ord(name)
    named = {
        "SPACE": 0x20,
        "UP": 0x26,
        "DOWN": 0x28,
        "LEFT": 0x25,
        "RIGHT": 0x27,
    }
    if name in named:
        return named[name]
    if name.startswith("F") and name[1:].isdigit() and 1 <= int(name[1:]) <= 12:
        return 0x70 + int(name[1:]) - 1
    raise ValueError(f"Unsupported key: {name}")


def load_settings():
    settings = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    codes = {name: virtual_key(key) for name, key in settings["keys"].items()}
    if len(set(codes.values())) != len(codes):
        raise ValueError("Every key in settings.json must be different.")
    return settings, codes


def find_game_window(title_fragment):
    matches = []

    @ENUMPROC
    def visit(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if not length:
            return True
        title = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, title, length + 1)
        if title.value.lower() == title_fragment.lower():
            matches.append(hwnd)
        return True

    user32.EnumWindows(visit, 0)
    return matches[0] if matches else None


def client_capture_area(hwnd):
    if user32.IsIconic(hwnd):
        return None
    rect = wintypes.RECT()
    if not user32.GetClientRect(hwnd, ctypes.byref(rect)):
        return None
    top_left = wintypes.POINT(0, 0)
    if not user32.ClientToScreen(hwnd, ctypes.byref(top_left)):
        return None
    width = rect.right - rect.left
    height = rect.bottom - rect.top
    if width < 400 or height < 300:
        return None
    return {"left": top_left.x, "top": top_left.y, "width": width, "height": height}


class KeyOutput:
    def __init__(self):
        self.pressed = set()

    def send(self, vk, down):
        scan = user32.MapVirtualKeyW(vk, 0)
        flags = 0x0008 | (0 if down else 0x0002)  # scan code, key up
        if vk in (0x25, 0x26, 0x27, 0x28):
            flags |= 0x0001
        event = INPUT(type=1, u=INPUTUNION(ki=KEYBDINPUT(0, scan, flags, 0, 0)))
        if user32.SendInput(1, ctypes.byref(event), ctypes.sizeof(INPUT)) != 1:
            raise ctypes.WinError(ctypes.get_last_error())

    def set_pressed(self, wanted):
        for vk in self.pressed - wanted:
            self.send(vk, False)
            self.pressed.remove(vk)
        for vk in wanted - self.pressed:
            self.send(vk, True)
            self.pressed.add(vk)

    def release_all(self):
        self.set_pressed(set())


class PhysicalKeys:
    def __init__(self, codes, stop_enabled=True):
        self.codes = codes
        self.stop_enabled = stop_enabled
        self.toggle = threading.Event()
        self.stop = threading.Event()
        self.takeover = threading.Event()
        self.ready = threading.Event()
        self.error = None
        self.thread_id = None
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.thread.start()
        if not self.ready.wait(3) or self.error:
            raise RuntimeError(self.error or "Keyboard safety hook did not start.")

    def _run(self):
        self.thread_id = kernel32.GetCurrentThreadId()
        driving_keys = {
            self.codes["accelerate"],
            self.codes["brake"],
            self.codes["handbrake"],
            self.codes["left"],
            self.codes["right"],
            0x1B,  # physical Esc opens the Roblox menu
        }
        physical_down = set()

        @HOOKPROC
        def callback(code, message, pointer):
            if code >= 0 and message in (0x100, 0x101, 0x104, 0x105):
                event = ctypes.cast(pointer, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
                if not event.flags & 0x10:  # ignore synthesized input
                    if message in (0x101, 0x105):
                        physical_down.discard(event.vkCode)
                    elif event.vkCode not in physical_down:
                        physical_down.add(event.vkCode)
                        if self.stop_enabled and event.vkCode == self.codes["stop"]:
                            self.stop.set()
                        elif event.vkCode == self.codes["toggle"]:
                            self.toggle.set()
                        elif event.vkCode in driving_keys:
                            self.takeover.set()
            return user32.CallNextHookEx(None, code, message, pointer)

        hook = user32.SetWindowsHookExW(13, callback, kernel32.GetModuleHandleW(None), 0)
        if not hook:
            self.error = ctypes.WinError(ctypes.get_last_error())
            self.ready.set()
            return
        self.ready.set()
        message = wintypes.MSG()
        while user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
            pass
        user32.UnhookWindowsHookEx(hook)

    def close(self):
        if self.thread_id:
            user32.PostThreadMessageW(self.thread_id, 0x0012, 0, 0)
            self.thread.join(timeout=1)


def road_center(frame, settings):
    height, width = frame.shape[:2]
    top = int(height * 0.17)
    bottom = int(height * 0.47)
    sample = np.asarray(settings["road_sample_lab"], dtype=np.int32)
    lab = cv2.cvtColor(frame[top:bottom], cv2.COLOR_BGR2LAB).astype(np.int32)
    hsv = cv2.cvtColor(frame[top:bottom], cv2.COLOR_BGR2HSV)
    distance = np.sum((lab - sample) ** 2, axis=2)
    tolerance = int(settings["color_tolerance"])
    mask = np.uint8((distance <= tolerance * tolerance) & (hsv[:, :, 1] < 90)) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))

    anchor = width * float(settings["car_x_fraction"])
    near_y = height * 0.44
    far_y = height * 0.36
    line_top = int(height * 0.20)
    markings = []
    yellow_present = False
    yellow_on_left = False
    yellow_to_right = False
    for color, lower, upper, min_support in (
        ("yellow", (12, 85, 115), (38, 255, 255), 3),
        ("white", (0, 0, 200), (179, 75, 255), 2),
    ):
        marking = cv2.inRange(hsv[line_top - top:], lower, upper)
        marking = cv2.morphologyEx(marking, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        lines = cv2.HoughLinesP(
            marking, 1, np.pi / 180, 20,
            minLineLength=max(30, int(height * 0.05)), maxLineGap=18,
        )
        positions = []
        if lines is not None:
            for x1, y1, x2, y2 in lines[:, 0]:
                y1 += line_top
                y2 += line_top
                if abs(y2 - y1) < height * 0.075:
                    continue
                near_x = x1 + (x2 - x1) * (near_y - y1) / (y2 - y1)
                far_x = x1 + (x2 - x1) * (far_y - y1) / (y2 - y1)
                if width * 0.1 < near_x < width * 0.9:
                    positions.append((near_x, far_x))
        clusters = []
        for position in sorted(positions):
            if clusters and position[0] - clusters[-1][-1][0] < width * 0.025:
                clusters[-1].append(position)
            else:
                clusters.append([position])
        for cluster in clusters:
            if len(cluster) >= min_support:
                position = np.median(cluster, axis=0)
                markings.append(position)
                if color == "yellow":
                    yellow_present = True
                    yellow_on_left |= position[0] < anchor - width * 0.02
                    yellow_to_right |= position[0] > anchor + width * 0.02

    left = [item for item in markings if item[0] < anchor]
    right = [item for item in markings if item[0] > anchor]
    if left and right and not yellow_to_right and (not yellow_present or yellow_on_left):
        left_mark = max(left, key=lambda item: item[0])
        right_mark = min(right, key=lambda item: item[0])
        near_width = right_mark[0] - left_mark[0]
        far_width = right_mark[1] - left_mark[1]
        near_lane = (left_mark[0] + right_mark[0]) / 2
        far_lane = (left_mark[1] + right_mark[1]) / 2
        road_checks = []
        for x, y in ((near_lane, near_y), (far_lane, far_y)):
            x, y = int(x), int(y) - top
            if not 10 <= x < width - 10:
                break
            road_checks.append(np.mean(mask[y - 5:y + 6, x - 10:x + 11] > 0))
        if (
            width * 0.08 <= near_width <= width * 0.42
            and width * 0.025 <= far_width <= near_width * 1.2
            and len(road_checks) == 2
            and min(road_checks) >= 0.5
        ):
            centers = [(int(near_y), near_lane), (int(far_y), far_lane)]
            return 0.65 * near_lane + 0.35 * far_lane, centers

    centers = []
    previous_width = None
    for fraction in (0.44, 0.38, 0.32, 0.26):
        y = int(height * fraction)
        band = (mask[y - top - 3:y - top + 4].mean(axis=0) > 150).astype(np.int8)
        edges = np.diff(np.pad(band, (1, 1)))
        raw_runs = list(zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)))
        runs = []
        for left, right in raw_runs:
            if runs and left - runs[-1][1] <= 0.025 * width:
                runs[-1] = (runs[-1][0], right)
            else:
                runs.append((left, right))
        candidates = []
        for left, right in runs:
            road_width = right - left
            center = (left + right) / 2
            if not centers and not (left <= width * settings["car_x_fraction"] <= right):
                continue
            if not centers and abs(center - anchor) > 0.24 * width:
                continue
            if 0.04 * width <= road_width <= 0.80 * width:
                if abs(center - anchor) <= 0.24 * width:
                    candidates.append((center, road_width))
        if not candidates:
            continue
        center, road_width = min(candidates, key=lambda item: abs(item[0] - anchor))
        if previous_width is not None and road_width > 1.7 * previous_width:
            continue
        centers.append((y, center))
        previous_width = road_width
        anchor = center

    if len(centers) < 3 or centers[0][0] - centers[-1][0] < 0.10 * height:
        return None
    near = centers[0][1]
    far = centers[-1][1]
    target = 0.35 * far + 0.65 * near
    return target, centers


def draw_preview(frame, settings, result, status):
    height, width = frame.shape[:2]
    car_x = int(width * float(settings["car_x_fraction"]))
    cv2.line(frame, (car_x, int(height * 0.17)), (car_x, int(height * 0.48)), (0, 255, 255), 2)
    if result:
        target, centers = result
        for y, x in centers:
            cv2.circle(frame, (int(x), y), 7, (0, 255, 0), -1)
        cv2.line(frame, (car_x, int(height * 0.44)), (int(target), centers[-1][0]), (0, 255, 0), 2)
    cv2.rectangle(frame, (0, 0), (width, 72), (0, 0, 0), -1)
    cv2.putText(frame, status, (15, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(
        frame,
        "Click road to calibrate | F8 start/pause | F9 stop | physical driving key takes over | Q quit",
        (15, 58),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (255, 255, 255),
        1,
    )
    scale = min(1.0, 1000 / width)
    return cv2.resize(frame, None, fx=scale, fy=scale), scale


def main():
    settings, codes = load_settings()
    try:
        user32.SetProcessDPIAware()
    except AttributeError:
        pass
    hwnd = find_game_window(settings["window_title"])
    if not hwnd:
        raise RuntimeError(f'No visible window contains "{settings["window_title"]}". Open Roblox first.')

    physical = PhysicalKeys(codes)
    output = KeyOutput()
    physical.start()
    active = False
    status = "PAUSED - click a clear patch of road to calibrate"
    steering = 0.0
    pending_click = None
    current_frame = None
    preview_scale = 1.0

    def click(event, x, y, _flags, _data):
        nonlocal pending_click
        if event == cv2.EVENT_LBUTTONDOWN:
            pending_click = (x, y)

    try:
        with mss.MSS() as capture:
            area = client_capture_area(hwnd)
            if area is None:
                raise RuntimeError("Roblox is minimized or its game view is too small.")
            current_frame = np.asarray(capture.grab(area))[:, :, :3].copy()
            cv2.namedWindow("Driving Empire road preview", cv2.WINDOW_AUTOSIZE)
            cv2.setMouseCallback("Driving Empire road preview", click)
            while True:
                if physical.stop.is_set():
                    physical.stop.clear()
                    physical.toggle.clear()
                    active = False
                    output.release_all()
                    status = "STOPPED - all assistant keys released"
                if physical.takeover.is_set():
                    physical.takeover.clear()
                    physical.toggle.clear()
                    active = False
                    output.release_all()
                    status = "MANUAL TAKEOVER - F8 to resume"
                if physical.toggle.is_set():
                    physical.toggle.clear()
                    if active:
                        active = False
                        output.release_all()
                        status = "PAUSED"
                    elif settings["road_sample_lab"] is None:
                        status = "CALIBRATE FIRST - click a clear patch of road"
                    elif user32.GetForegroundWindow() != hwnd:
                        status = "FOCUS ROBLOX, THEN PRESS F8"
                    else:
                        active = True
                        steering = 0.0
                        status = "ACTIVE"

                area = client_capture_area(hwnd)
                if area is None:
                    active = False
                    output.release_all()
                    status = "PAUSED - game window unavailable"
                    time.sleep(0.1)
                    continue
                if user32.GetForegroundWindow() == hwnd:
                    current_frame = np.asarray(capture.grab(area))[:, :, :3].copy()

                if pending_click:
                    x = int(pending_click[0] / preview_scale)
                    y = int(pending_click[1] / preview_scale)
                    pending_click = None
                    if 8 <= x < area["width"] - 8 and 8 <= y < area["height"] - 8:
                        patch = current_frame[y - 8:y + 9, x - 8:x + 9]
                        active = False
                        output.release_all()
                        saturation = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)[:, :, 1]
                        if np.median(saturation) >= 90:
                            status = "NOT ROAD - click plain gray asphalt"
                        else:
                            lab = cv2.cvtColor(patch, cv2.COLOR_BGR2LAB)
                            settings["road_sample_lab"] = np.median(lab.reshape(-1, 3), axis=0).astype(int).tolist()
                            SETTINGS_PATH.write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
                            status = "CALIBRATED - focus Roblox and press F8"

                result = None
                if settings["road_sample_lab"] is not None:
                    result = road_center(current_frame, settings)
                if active:
                    if user32.GetForegroundWindow() != hwnd:
                        active = False
                        output.release_all()
                        status = "PAUSED - Roblox lost focus"
                    elif result is None:
                        active = False
                        output.release_all()
                        status = "PAUSED - road unclear or intersection"
                    else:
                        target, centers = result
                        width = current_frame.shape[1]
                        car_x = width * float(settings["car_x_fraction"])
                        error = (target - car_x) / (width / 2)
                        road_heading = (centers[-1][1] - centers[0][1]) / width
                        command = np.clip(0.9 * error + 0.25 * road_heading, -0.45, 0.45)
                        steering = 0.7 * steering + 0.3 * command
                        turn = abs(steering)
                        throttle_duty = float(settings["throttle_duty"])
                        if turn > 0.12:
                            throttle_duty *= 0.5
                        wanted = set()
                        now = time.monotonic()
                        if now % 0.8 < throttle_duty * 0.8:
                            wanted.add(codes["accelerate"])
                        if turn > 0.04 and now % 0.5 < min(max(turn * 0.5, 0.05), 0.12):
                            wanted.add(codes["left"] if steering < 0 else codes["right"])
                        output.set_pressed(wanted)

                preview, preview_scale = draw_preview(current_frame, settings, result, status)
                cv2.imshow("Driving Empire road preview", preview)
                key = cv2.waitKey(20) & 0xFF
                if key == ord("q") or cv2.getWindowProperty("Driving Empire road preview", cv2.WND_PROP_VISIBLE) < 1:
                    break
    finally:
        output.release_all()
        physical.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except (OSError, RuntimeError, ValueError, KeyError) as exc:
        raise SystemExit(str(exc)) from exc
