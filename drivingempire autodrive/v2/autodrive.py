"""Experimental learned driver built on the Version 1 safety controls."""

import argparse
import csv
from datetime import datetime
import hashlib
import json
from pathlib import Path
import random
import sys
import time

import cv2
import mss
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import autodrive as v1


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
MODEL = ROOT / "model.npz"
STEERING_POLICY = ROOT / "steering_q.npz"
VISUAL_POLICY = ROOT / "road_goal_agent.npz"
FREE_POLICY = ROOT / "game_explorer_agent.npz"
SPEED_ZERO = cv2.imread(str(ROOT / "speed-zero.png"), cv2.IMREAD_GRAYSCALE)
HOG = cv2.HOGDescriptor((64, 32), (16, 16), (8, 8), (8, 8), 9)
AI_ACTIONS = (
    ("accelerate",),
    ("accelerate", "left"),
    ("accelerate", "right"),
    ("left",),
    ("right",),
    ("brake",),
    ("handbrake",),
)
FREE_ACTIONS = (
    AI_ACTIONS
    + tuple(("key", name) for name in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" if name not in "WASDL")
    + (("key", "SPACE"), ("key", "SHIFT"), ("key", "UP"), ("key", "DOWN"), ("key", "LEFT"), ("key", "RIGHT"))
    + tuple(("click", button, x, y) for button in ("left", "right") for x in (0.2, 0.4, 0.6, 0.8) for y in (0.22, 0.45, 0.68))
    + tuple(("wheel", direction, x, 0.5) for direction in (-120, 120) for x in (0.5, 0.85))
)
v1.user32.GetAsyncKeyState.argtypes = [v1.wintypes.INT]
v1.user32.GetAsyncKeyState.restype = v1.wintypes.SHORT
v1.user32.SetCursorPos.argtypes = [v1.wintypes.INT, v1.wintypes.INT]


def features(frame):
    height, width = frame.shape[:2]
    view = frame[int(height * 0.17):int(height * 0.60), int(width * 0.10):int(width * 0.90)]
    gray = cv2.cvtColor(cv2.resize(view, (64, 32)), cv2.COLOR_BGR2GRAY)
    vector = HOG.compute(gray).reshape(-1).astype(np.float32)
    return vector / (np.linalg.norm(vector) + 1e-6)


def physical_down(code):
    return bool(v1.user32.GetAsyncKeyState(code) & 0x8000)


def save_samples(vectors, labels):
    if len(labels) == 0:
        return None
    DATA.mkdir(exist_ok=True)
    path = DATA / f"drive-{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}.npz"
    np.savez_compressed(path, x=np.asarray(vectors, dtype=np.float32), y=np.asarray(labels, dtype=np.int8))
    return path


def record():
    settings, codes = v1.load_settings()
    hwnd = v1.find_game_window(settings["window_title"])
    if not hwnd:
        raise RuntimeError("Open Roblox before recording.")
    keys = v1.PhysicalKeys(codes)
    keys.start()
    vectors, labels = [], []
    saved = 0
    try:
        with mss.MSS() as capture:
            while not keys.stop.is_set():
                area = v1.client_capture_area(hwnd)
                if area and v1.user32.GetForegroundWindow() == hwnd:
                    left = physical_down(codes["left"])
                    right = physical_down(codes["right"])
                    moving = physical_down(codes["accelerate"])
                    if moving and not (left and right):
                        frame = np.asarray(capture.grab(area))[:, :, :3]
                        vectors.append(features(frame))
                        labels.append(int(right) - int(left))
                        if len(labels) >= 1000:
                            save_samples(vectors, labels)
                            saved += len(labels)
                            vectors.clear()
                            labels.clear()
                time.sleep(0.20)
    finally:
        keys.close()
    path = save_samples(vectors, labels)
    saved += len(labels)
    print(f"Saved {saved} driving examples" + (f"; last file: {path}" if path else "."))


def train():
    files = sorted(DATA.glob("drive-*.npz")) if DATA.exists() else []
    if not files:
        raise RuntimeError("No recordings yet. Run: python v2/autodrive.py record")
    rng = random.Random(7)
    buckets = {-1: [], 0: [], 1: []}
    counts = {-1: 0, 0: 0, 1: 0}
    for path in files:
        with np.load(path) as session:
            for vector, label in zip(session["x"], session["y"]):
                label = int(label)
                counts[label] += 1
                bucket = buckets[label]
                if len(bucket) < 1500:
                    bucket.append(vector)
                else:
                    slot = rng.randrange(counts[label])
                    if slot < 1500:
                        bucket[slot] = vector
    if min(counts.values()) < 20:
        raise RuntimeError(f"Record at least 20 examples of left, straight, and right driving. Current counts: {counts}")
    model_x = np.asarray([vector for label in (-1, 0, 1) for vector in buckets[label]], dtype=np.float32)
    model_y = np.asarray([label for label in (-1, 0, 1) for _ in buckets[label]], dtype=np.int8)
    np.savez_compressed(MODEL, x=model_x, y=model_y)
    print(f"Version 2 model saved: {len(model_y)} examples. Left/straight/right: {counts[-1]}/{counts[0]}/{counts[1]}")


def predict(vector, model_x, model_y):
    similarities = model_x @ vector
    nearest = np.argpartition(similarities, -7)[-7:]
    labels = model_y[nearest]
    votes = np.bincount(labels.astype(np.int32) + 1, minlength=3)
    direction = int(np.argmax(votes)) - 1
    confidence = float(np.max(similarities[nearest]))
    agreement = int(np.max(votes))
    return direction, confidence, agreement


def road_state(road, width, car_fraction):
    target, centers = road
    error = (target - width * car_fraction) / (width / 2)
    heading = (centers[-1][1] - centers[0][1]) / width
    state = (
        int(np.digitize(error, (-0.35, -0.22, -0.12, -0.04, 0.04, 0.12, 0.22, 0.35))),
        int(np.digitize(heading, (-0.12, -0.04, 0.04, 0.12))),
    )
    correction = 0.9 * error + 0.25 * heading
    baseline = 0 if abs(correction) < 0.04 else (1 if correction > 0 else -1)
    score = abs(error) + 0.5 * abs(heading)
    return state, score, baseline, error


def screen_road(frame, settings):
    height, width = frame.shape[:2]
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.int16)
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    sample = settings["road_sample_lab"]
    chroma = np.abs(lab[:, :, 1] - sample[1]) + np.abs(lab[:, :, 2] - sample[2])
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    texture = cv2.blur(cv2.magnitude(gx, gy), (15, 15))
    surface = np.uint8((chroma < 23) & (hsv[:, :, 1] < 80) & (hsv[:, :, 2] > 45) & (texture < 65)) * 255
    surface = cv2.morphologyEx(surface, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    anchor = width * float(settings["car_x_fraction"])
    centers = []
    for fraction in (0.60, 0.53, 0.46, 0.39):
        y = int(height * fraction)
        band = (surface[y - 3:y + 4].mean(axis=0) > 130).astype(np.int8)
        edges = np.diff(np.pad(band, (1, 1)))
        raw_runs = list(zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)))
        runs = []
        for left, right in raw_runs:
            if runs and left - runs[-1][1] <= 0.09 * width:
                runs[-1] = (runs[-1][0], right)
            else:
                runs.append((left, right))
        candidates = []
        for left, right in runs:
            road_width = right - left
            center = (left + right) / 2
            if not centers and not left - 0.04 * width <= anchor <= right + 0.04 * width:
                continue
            if centers and abs(center - anchor) > 0.08 * width:
                continue
            if 0.12 * width <= road_width <= 0.95 * width and abs(center - anchor) < 0.30 * width:
                candidates.append((center, road_width))
        if not candidates:
            continue
        center, _ = min(candidates, key=lambda item: abs(item[0] - anchor))
        centers.append((y, center))
        anchor = center
    if len(centers) < 2:
        return None
    return 0.65 * centers[0][1] + 0.35 * centers[-1][1], centers


def scene_moving(previous, frame):
    if previous is None or previous.shape != frame.shape:
        return False
    height, width = frame.shape[:2]
    region = (slice(int(height * 0.25), int(height * 0.60)), slice(int(width * 0.20), int(width * 0.80)))
    before = cv2.cvtColor(cv2.resize(previous[region], (96, 48)), cv2.COLOR_BGR2GRAY)
    after = cv2.cvtColor(cv2.resize(frame[region], (96, 48)), cv2.COLOR_BGR2GRAY)
    return float(np.mean(np.abs(after.astype(np.int16) - before.astype(np.int16)))) > 5.0


def speed_moving(frame):
    height, width = frame.shape[:2]
    hud = cv2.cvtColor(frame[int(height * 0.94):, int(width * 0.72):], cv2.COLOR_BGR2HSV)
    blue_bar = cv2.inRange(hud, (80, 100, 100), (110, 255, 255))
    if cv2.countNonZero(blue_bar) < 50:
        return None
    left, right = int(width * 0.78), int(width * 0.94)
    top, bottom = int(height * 0.76), int(height * 0.96)
    hsv = cv2.cvtColor(frame[top:bottom, left:right], cv2.COLOR_BGR2HSV)
    white = np.uint8((hsv[:, :, 1] < 80) & (hsv[:, :, 2] > 190)) * 255
    count, _, components, _ = cv2.connectedComponentsWithStats(white)
    digits = []
    for x, y, digit_width, digit_height, area in components[1:count]:
        if (
            0.80 * width < x + left < 0.92 * width
            and 0.82 * height < y + top < 0.93 * height
            and 0.035 * height < digit_height < 0.07 * height
            and 0.008 * width < digit_width < 0.04 * width
            and area > 100 * (height / 1078) ** 2
        ):
            digits.append((x, y, digit_width, digit_height, area))
    if digits:
        reference_y = max(digits, key=lambda digit: digit[4])[1]
        digits = [digit for digit in digits if abs(digit[1] - reference_y) < 0.015 * height]
    if not 1 <= len(digits) <= 3:
        return None
    if len(digits) > 1:
        return True
    x, y, digit_width, digit_height, _ = digits[0]
    glyph = cv2.resize(white[y:y + digit_height, x:x + digit_width], (24, 32), interpolation=cv2.INTER_AREA)
    distance = np.abs(glyph.astype(np.int16) - SPEED_ZERO.astype(np.int16)).mean() / 255
    return bool(distance > 0.20)


def car_tile(frame, choice=0):
    height, width = frame.shape[:2]
    left = int(width * 0.65)
    hsv = cv2.cvtColor(frame[:int(height * 0.45), left:], cv2.COLOR_BGR2HSV)
    purple = cv2.inRange(hsv, (125, 110, 85), (150, 255, 240))
    purple = cv2.morphologyEx(purple, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(purple, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        x, y, bar_width, bar_height = cv2.boundingRect(contour)
        x += left
        if not (
            x > width * 0.60
            and x + bar_width > width * 0.90
            and width * 0.08 < bar_width < width * 0.32
            and height * 0.025 < bar_height < height * 0.08
            and bar_width > 5 * bar_height
        ):
            continue
        cards = [
            (int(x + col * bar_width), int(y + row * bar_width))
            for row in (1.60, 2.16)
            for col in (0.22, 0.78)
            if y + row * bar_width < height * 0.88
        ]
        if cards:
            return cards[choice % len(cards)]
    return None


def car_category_icon(frame):
    height, width = frame.shape[:2]
    hsv = cv2.cvtColor(frame[:int(height * 0.75), int(width * 0.75):], cv2.COLOR_BGR2HSV)
    blue = cv2.inRange(hsv, (90, 120, 100), (125, 255, 255))
    contours, _ = cv2.findContours(blue, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        x, y, icon_width, icon_height = cv2.boundingRect(contour)
        x += int(width * 0.75)
        if (
            x + icon_width > width * 0.95
            and width * 0.03 < icon_width < width * 0.12
            and height * 0.05 < icon_height < height * 0.15
        ):
            return (x + icon_width // 2, int(y + 1.62 * icon_height))
    return None


def click_game(hwnd, area, point, keys, button="left"):
    if not v1.user32.SetCursorPos(area["left"] + point[0] - 10, area["top"] + point[1]):
        return False
    move = v1.INPUT(type=0, u=v1.INPUTUNION(mi=v1.MOUSEINPUT(10, 0, 0, 0x0001, 0)))
    if v1.user32.SendInput(1, v1.ctypes.byref(move), v1.ctypes.sizeof(v1.INPUT)) != 1:
        return False
    time.sleep(0.12)
    if v1.user32.GetForegroundWindow() != hwnd or keys.stop.is_set() or keys.takeover.is_set() or keys.toggle.is_set():
        return False
    down, up = (0x0002, 0x0004) if button == "left" else (0x0008, 0x0010)
    click = (v1.INPUT * 2)(
        v1.INPUT(type=0, u=v1.INPUTUNION(mi=v1.MOUSEINPUT(0, 0, 0, down, 0))),
        v1.INPUT(type=0, u=v1.INPUTUNION(mi=v1.MOUSEINPUT(0, 0, 0, up, 0))),
    )
    if v1.user32.SendInput(1, v1.ctypes.byref(click[0]), v1.ctypes.sizeof(v1.INPUT)) != 1:
        return False
    time.sleep(0.08)
    if v1.user32.SendInput(1, v1.ctypes.byref(click[1]), v1.ctypes.sizeof(v1.INPUT)) != 1:
        v1.user32.SendInput(1, v1.ctypes.byref(click[1]), v1.ctypes.sizeof(v1.INPUT))
        return False
    return True


def scroll_game(hwnd, area, point, keys, amount):
    if v1.user32.GetForegroundWindow() != hwnd or keys.stop.is_set() or keys.takeover.is_set() or keys.toggle.is_set():
        return False
    if not v1.user32.SetCursorPos(area["left"] + point[0], area["top"] + point[1]):
        return False
    wheel = v1.INPUT(type=0, u=v1.INPUTUNION(mi=v1.MOUSEINPUT(0, 0, amount & 0xFFFFFFFF, 0x0800, 0)))
    return v1.user32.SendInput(1, v1.ctypes.byref(wheel), v1.ctypes.sizeof(v1.INPUT)) == 1


def recover_car(capture, hwnd, keys, output, choice=0):
    output.release_all()
    if v1.user32.GetForegroundWindow() != hwnd or keys.stop.is_set() or keys.takeover.is_set() or keys.toggle.is_set():
        return False
    area = v1.client_capture_area(hwnd)
    if area is None:
        return False
    frame = np.asarray(capture.grab(area))[:, :, :3]
    if car_tile(frame) is None and car_category_icon(frame) is None:
        keys_to_open_menu = ("F", "T") if speed_moving(frame) is not None else ("T",)
    else:
        keys_to_open_menu = ()
    for name in keys_to_open_menu:
        code = v1.virtual_key(name)
        output.set_pressed({code})
        time.sleep(0.10)
        output.release_all()
        deadline = time.monotonic() + 3.0
        while time.monotonic() < deadline:
            if v1.user32.GetForegroundWindow() != hwnd or keys.stop.is_set() or keys.takeover.is_set() or keys.toggle.is_set():
                return False
            area = v1.client_capture_area(hwnd)
            if area is None:
                return False
            frame = np.asarray(capture.grab(area))[:, :, :3]
            ready = speed_moving(frame) is None if name == "F" else car_tile(frame) is not None or car_category_icon(frame) is not None
            if ready:
                break
            time.sleep(0.10)
        else:
            return False
    if v1.user32.GetForegroundWindow() != hwnd or keys.stop.is_set() or keys.takeover.is_set() or keys.toggle.is_set():
        return False
    area = v1.client_capture_area(hwnd)
    if area is None:
        return False
    frame = np.asarray(capture.grab(area))[:, :, :3]
    category = car_category_icon(frame) if car_tile(frame) is None else None
    if category is not None:
        if not click_game(hwnd, area, category, keys):
            return False
        deadline = time.monotonic() + 3.0
        while time.monotonic() < deadline:
            if v1.user32.GetForegroundWindow() != hwnd or keys.stop.is_set() or keys.takeover.is_set() or keys.toggle.is_set():
                return False
            area = v1.client_capture_area(hwnd)
            if area is None:
                return False
            frame = np.asarray(capture.grab(area))[:, :, :3]
            if car_tile(frame) is not None:
                break
            time.sleep(0.10)
        else:
            return False
    tile = car_tile(frame, choice)
    if tile is None:
        return False
    if not click_game(hwnd, area, tile, keys):
        return False
    clicked_at = time.monotonic()
    deadline = clicked_at + 10.0
    closed_menu = False
    hud_seen = 0
    while time.monotonic() < deadline:
        if v1.user32.GetForegroundWindow() != hwnd or keys.stop.is_set() or keys.takeover.is_set() or keys.toggle.is_set():
            return False
        area = v1.client_capture_area(hwnd)
        if area is None:
            return False
        frame = np.asarray(capture.grab(area))[:, :, :3]
        menu_open = car_tile(frame) is not None
        if not menu_open and (speed_moving(frame) is not None or time.monotonic() - clicked_at >= 1.0):
            hud_seen += 1
            if hud_seen >= 2:
                return True
        else:
            hud_seen = 0
        if menu_open and not closed_menu and time.monotonic() - clicked_at >= 0.7:
            output.set_pressed({v1.virtual_key("T")})
            time.sleep(0.10)
            output.release_all()
            closed_menu = True
        time.sleep(0.10)
    return False


def respawn_character(hwnd, keys, output):
    output.release_all()
    for code in (0x1B, ord("R"), 0x0D):  # Roblox menu, Respawn, confirmation
        if v1.user32.GetForegroundWindow() != hwnd or keys.stop.is_set() or keys.takeover.is_set() or keys.toggle.is_set():
            return False
        output.set_pressed({code})
        time.sleep(0.10)
        output.release_all()
        time.sleep(0.35)
    return True


def update_policy(q, visits, state, action, reward, next_state=None):
    index = state + (action + 1,)
    visits[index] += 1
    future = 0.8 * float(np.max(q[next_state])) if next_state is not None else 0.0
    q[index] += 0.2 * (reward + future - q[index])


def save_policy(q, visits):
    temporary = STEERING_POLICY.with_suffix(".tmp")
    with temporary.open("wb") as output:
        np.savez_compressed(output, q=q, visits=visits)
    temporary.replace(STEERING_POLICY)


def visual_state(frame, moving, full_view=False):
    height, width = frame.shape[:2]
    view = frame if full_view else frame[int(height * 0.12):int(height * 0.83), int(width * 0.08):int(width * 0.92)]
    gray = cv2.cvtColor(view, cv2.COLOR_BGR2GRAY)
    size = (128, 72) if full_view else (80, 45)
    pixels = cv2.resize(gray, size, interpolation=cv2.INTER_AREA).astype(np.float32) / 255 - 0.5
    return np.append(pixels.ravel(), np.float32(moving))


def visual_values(states, weights):
    hidden = np.maximum(states @ weights[0] + weights[1], 0)
    return hidden @ weights[2] + weights[3]


def train_visual(weights, target_weights, replay, rng):
    batch = rng.sample(replay, 32)
    states = np.stack([item[0] for item in batch])
    actions = np.asarray([item[1] for item in batch], dtype=np.int32)
    rewards = np.asarray([item[2] for item in batch], dtype=np.float32)
    next_states = np.stack([item[3] for item in batch])
    done = np.asarray([item[4] for item in batch], dtype=np.float32)

    hidden_input = states @ weights[0] + weights[1]
    hidden = np.maximum(hidden_input, 0)
    values = hidden @ weights[2] + weights[3]
    targets = rewards + 0.95 * (1 - done) * np.max(visual_values(next_states, target_weights), axis=1)
    error = np.clip(values[np.arange(32), actions] - targets, -1, 1)
    output_gradient = np.zeros_like(values)
    output_gradient[np.arange(32), actions] = error / 32
    hidden_gradient = output_gradient @ weights[2].T
    hidden_gradient[hidden_input <= 0] = 0
    gradients = (
        states.T @ hidden_gradient,
        np.sum(hidden_gradient, axis=0),
        hidden.T @ output_gradient,
        np.sum(output_gradient, axis=0),
    )
    for weight, gradient in zip(weights, gradients):
        weight -= 0.005 * np.clip(gradient, -1, 1)


def save_visual(weights, steps, best_streak, path=VISUAL_POLICY):
    temporary = path.with_suffix(".tmp")
    with temporary.open("wb") as output:
        np.savez_compressed(output, w1=weights[0], b1=weights[1], w2=weights[2], b2=weights[3], steps=steps, best_streak=best_streak)
    temporary.replace(path)


def drive(self_training=False):
    try:
        v1.user32.SetProcessDPIAware()
    except AttributeError:
        pass
    if self_training:
        q = np.zeros((9, 5, 3), dtype=np.float32)
        visits = np.zeros_like(q, dtype=np.int32)
        if STEERING_POLICY.exists():
            with np.load(STEERING_POLICY) as saved:
                q = saved["q"].astype(np.float32)
                visits = saved["visits"].astype(np.int32)
            if q.shape != (9, 5, 3) or visits.shape != q.shape:
                raise RuntimeError("The saved steering policy has an invalid shape.")
        rng = random.Random()
        last_state = None
        last_action = 0
        last_score = 0.0
        stuck_since = None
    else:
        if not MODEL.exists():
            raise RuntimeError("No model yet. Record your driving, then run the train command.")
        with np.load(MODEL) as model:
            model_x = model["x"].astype(np.float32)
            model_y = model["y"].astype(np.int8)
    settings, codes = v1.load_settings()
    hwnd = v1.find_game_window(settings["window_title"])
    if not hwnd:
        raise RuntimeError("Open Roblox before driving.")
    keys = v1.PhysicalKeys(codes)
    output = v1.KeyOutput()
    keys.start()
    active = False
    status = "V2 PAUSED - focus Roblox, then F8"
    last_prediction = 0.0
    direction = 0
    frame = None
    try:
        with mss.MSS() as capture:
            area = v1.client_capture_area(hwnd)
            if area is None:
                raise RuntimeError("Roblox is minimized or its game view is too small.")
            frame = np.asarray(capture.grab(area))[:, :, :3].copy()
            cv2.namedWindow("Driving Empire V2 preview", cv2.WINDOW_AUTOSIZE)
            while True:
                if keys.stop.is_set():
                    keys.stop.clear()
                    keys.toggle.clear()
                    active = False
                    output.release_all()
                    status = "V2 STOPPED - all keys released"
                if keys.takeover.is_set():
                    keys.takeover.clear()
                    keys.toggle.clear()
                    if self_training and active and last_state is not None:
                        update_policy(q, visits, last_state, last_action, -0.5)
                    active = False
                    output.release_all()
                    status = "V2 MANUAL TAKEOVER - F8 to resume"
                if keys.toggle.is_set():
                    keys.toggle.clear()
                    active = not active and v1.user32.GetForegroundWindow() == hwnd
                    if self_training:
                        last_state = None
                        stuck_since = None
                        last_prediction = 0.0
                    if not active:
                        output.release_all()
                    status = "V2 SELF-TRAINING" if active and self_training else ("V2 ACTIVE" if active else "V2 PAUSED - focus Roblox, then F8")
                area = v1.client_capture_area(hwnd)
                if area is None:
                    active = False
                    output.release_all()
                    status = "V2 PAUSED - Roblox unavailable"
                    time.sleep(0.1)
                    continue
                focused = v1.user32.GetForegroundWindow() == hwnd
                if focused:
                    frame = np.asarray(capture.grab(area))[:, :, :3].copy()
                road = v1.road_center(frame, settings)
                if active:
                    if not focused or road is None:
                        if self_training and focused and road is None and last_state is not None:
                            update_policy(q, visits, last_state, last_action, -1.0)
                            last_state = None
                        active = False
                        output.release_all()
                        status = "V2 PAUSED - focus or road lost"
                    else:
                        now = time.monotonic()
                        if self_training:
                            state, score, baseline, error = road_state(road, frame.shape[1], float(settings["car_x_fraction"]))
                            moving = speed_moving(frame)
                            if moving is None:
                                active = False
                                output.release_all()
                                status = "V2 PAUSED - speed display missing"
                            elif abs(error) > 0.75:
                                if last_state is not None:
                                    update_policy(q, visits, last_state, last_action, -0.5)
                                    last_state = None
                                active = False
                                output.release_all()
                                status = "V2 PAUSED - too far from road path"
                            else:
                                stuck_since = None if moving else (stuck_since or now)
                                if stuck_since is not None and now - stuck_since >= 5.0:
                                    if last_state is not None:
                                        update_policy(q, visits, last_state, last_action, -0.5)
                                        last_state = None
                                    output.release_all()
                                    active = False
                                    status = "V2 PAUSED - vehicle may be stuck"
                            if active and now - last_prediction >= 0.40:
                                if last_state is not None and moving:
                                    reward = 2.0 * (last_score - score) - 0.005 * abs(last_action)
                                    update_policy(q, visits, last_state, last_action, reward, state)
                                    if int(visits.sum()) % 50 == 0:
                                        save_policy(q, visits)
                                direction = baseline
                                if abs(error) < 0.35 and int(visits[state].sum()) >= 10:
                                    direction = int(np.argmax(q[state])) - 1
                                if abs(error) < 0.15 and rng.random() < 0.08:
                                    direction = rng.choice((-1, 0, 1))
                                last_state, last_action, last_score = state, direction, score
                                last_prediction = now
                        elif now - last_prediction >= 0.15:
                            direction, similarity, agreement = predict(features(frame), model_x, model_y)
                            last_prediction = now
                            if similarity < 0.85 or agreement < 5:
                                active = False
                                output.release_all()
                                status = "V2 PAUSED - unfamiliar view"
                        if active:
                            wanted = set()
                            if now % 0.8 < float(settings["throttle_duty"]) * 0.8:
                                wanted.add(codes["accelerate"])
                            steer_now = now - last_prediction < 0.08 if self_training else now % 0.5 < 0.08
                            if direction and steer_now:
                                wanted.add(codes["left"] if direction < 0 else codes["right"])
                            output.set_pressed(wanted)
                            if self_training:
                                status = f"V2 SELF-TRAINING - {int(visits.sum())} learned steps"
                            else:
                                status = f"V2 ACTIVE - learned steering: {('LEFT', 'STRAIGHT', 'RIGHT')[direction + 1]}"
                preview, _ = v1.draw_preview(frame, settings, road, status)
                cv2.imshow("Driving Empire V2 preview", preview)
                key = cv2.waitKey(20) & 0xFF
                if key == ord("q") or cv2.getWindowProperty("Driving Empire V2 preview", cv2.WND_PROP_VISIBLE) < 1:
                    break
    finally:
        output.release_all()
        keys.close()
        cv2.destroyAllWindows()
        if self_training:
            save_policy(q, visits)


def ai_drive(free_exploration=False, evaluation=False):
    try:
        v1.user32.SetProcessDPIAware()
    except AttributeError:
        pass
    rng = random.Random()
    initializer = np.random.default_rng()
    actions = FREE_ACTIONS if free_exploration else AI_ACTIONS
    policy_path = FREE_POLICY if free_exploration else VISUAL_POLICY
    if evaluation and not policy_path.exists():
        raise RuntimeError("Train this mode before evaluating its checkpoint.")
    input_size = 9217 if free_exploration else 3601
    weights = [
        (initializer.standard_normal((input_size, 64)) * np.sqrt(2 / input_size)).astype(np.float32),
        np.zeros(64, dtype=np.float32),
        (initializer.standard_normal((64, len(actions))) * np.sqrt(2 / 64)).astype(np.float32),
        np.zeros(len(actions), dtype=np.float32),
    ]
    steps = 0
    best_streak = 0.0
    if policy_path.exists():
        with np.load(policy_path) as saved:
            weights = [saved[name].astype(np.float32) for name in ("w1", "b1", "w2", "b2")]
            steps = int(saved["steps"])
            best_streak = float(saved["best_streak"])
        expected = ((input_size, 64), (64,), (64, len(actions)), (len(actions),))
        if any(weight.shape != shape for weight, shape in zip(weights, expected)):
            raise RuntimeError("The saved visual policy has an invalid shape.")
    checkpoint_hash = hashlib.sha256(policy_path.read_bytes()).hexdigest() if evaluation else None
    target_weights = [weight.copy() for weight in weights]
    replay = []
    replay_slot = 0
    seen_views = set()

    settings, codes = v1.load_settings()
    hwnd = v1.find_game_window(settings["window_title"])
    keys = v1.PhysicalKeys(codes, stop_enabled=not free_exploration)
    output = v1.KeyOutput()
    keys.start()
    active = False
    status = "VISUAL AI PAUSED - focus Roblox, then F8"
    last_state = None
    last_action = None
    lost_transition = None
    onroad_streak = 0.0
    action_since = 0.0
    cooldown_until = 0.0
    stuck_since = None
    missing_since = None
    retry_recovery_at = 0.0
    frame = None
    motion_frame = None
    motion_at = 0.0
    scene_motion = False
    last_road_at = None
    offroad_since = None
    evaluation_dir = None
    evaluation_file = None
    evaluation_writer = None
    evaluation_steps = 0
    road_seconds = 0.0
    unaligned_seconds = 0.0
    stopped_seconds = 0.0
    lost_events = 0
    recovery_attempts = 0

    def record_evaluation(action, current_frame, moving, alignment, reward, stuck, duration):
        nonlocal evaluation_steps, road_seconds, unaligned_seconds, stopped_seconds, lost_events
        evaluation_steps += 1
        if moving and alignment is not None and alignment <= 0.25:
            road_seconds += duration
        elif moving:
            unaligned_seconds += duration
        elif moving is False:
            stopped_seconds += duration
        else:
            lost_events += 1
        image_name = f"{evaluation_steps:06d}.jpg"
        image_width = 640
        image_height = round(current_frame.shape[0] * image_width / current_frame.shape[1])
        image = cv2.resize(current_frame, (image_width, image_height), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(evaluation_dir / "frames" / image_name), image, [cv2.IMWRITE_JPEG_QUALITY, 65])
        evaluation_writer.writerow((round(time.time(), 3), image_name, repr(actions[action]), moving,
                                    alignment, reward, stuck, round(duration, 3)))
        evaluation_file.flush()

    try:
        if evaluation:
            evaluation_dir = DATA / "evaluations" / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
            (evaluation_dir / "frames").mkdir(parents=True)
            evaluation_file = (evaluation_dir / "steps.csv").open("w", newline="", encoding="utf-8")
            evaluation_writer = csv.writer(evaluation_file)
            evaluation_writer.writerow(("time", "frame", "action", "moving", "road_alignment", "reward_proxy", "stuck", "seconds"))
        with mss.MSS() as capture:
            area = v1.client_capture_area(hwnd) if hwnd else None
            frame = np.zeros((720, 1280, 3), dtype=np.uint8)
            if area:
                try:
                    frame = np.asarray(capture.grab(area))[:, :, :3].copy()
                except (OSError, mss.exception.ScreenShotError):
                    pass
            cv2.namedWindow("Driving Empire visual AI", cv2.WINDOW_AUTOSIZE)
            while True:
                if keys.stop.is_set():
                    keys.stop.clear()
                    keys.toggle.clear()
                    active = False
                    output.release_all()
                    last_state = None
                    lost_transition = None
                    onroad_streak = 0.0
                    if not evaluation:
                        save_visual(weights, steps, best_streak, policy_path)
                    status = "VISUAL AI STOPPED - all keys released"
                if keys.takeover.is_set():
                    keys.takeover.clear()
                    keys.toggle.clear()
                    active = False
                    output.release_all()
                    last_state = None
                    lost_transition = None
                    onroad_streak = 0.0
                    if not evaluation:
                        save_visual(weights, steps, best_streak, policy_path)
                    status = "VISUAL AI MANUAL TAKEOVER - F8 to resume"
                if keys.toggle.is_set():
                    keys.toggle.clear()
                    active = not active and v1.user32.GetForegroundWindow() == hwnd
                    output.release_all()
                    last_state = None
                    lost_transition = None
                    onroad_streak = 0.0
                    stuck_since = None
                    missing_since = None
                    retry_recovery_at = 0.0
                    cooldown_until = 0.0
                    motion_frame = None
                    scene_motion = False
                    last_road_at = None
                    offroad_since = None
                    status = ("VISUAL AI EVALUATING" if evaluation else "VISUAL AI TRAINING") if active else "VISUAL AI PAUSED - focus Roblox, then F8"
                area = v1.client_capture_area(hwnd) if hwnd else None
                if area is None:
                    output.release_all()
                    last_state = None
                    lost_transition = None
                    onroad_streak = 0.0
                    stuck_since = None
                    missing_since = None
                    motion_frame = None
                    scene_motion = False
                    last_road_at = None
                    offroad_since = None
                    hwnd = v1.find_game_window(settings["window_title"]) or hwnd
                    status = "VISUAL AI WAITING - Roblox unavailable" if active else "VISUAL AI PAUSED - focus Roblox, then F8"
                    preview = cv2.resize(frame, None, fx=min(1.0, 1000 / frame.shape[1]), fy=min(1.0, 1000 / frame.shape[1]))
                    cv2.rectangle(preview, (0, 0), (preview.shape[1], 40), (0, 0, 0), -1)
                    cv2.putText(preview, status, (12, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                    cv2.imshow("Driving Empire visual AI", preview)
                    key = cv2.waitKey(20) & 0xFF
                    if (not free_exploration and key == ord("q")) or cv2.getWindowProperty("Driving Empire visual AI", cv2.WND_PROP_VISIBLE) < 1:
                        break
                    time.sleep(0.1)
                    continue
                focused = v1.user32.GetForegroundWindow() == hwnd
                if focused:
                    try:
                        frame = np.asarray(capture.grab(area))[:, :, :3].copy()
                    except (OSError, mss.exception.ScreenShotError):
                        output.release_all()
                        last_state = None
                        lost_transition = None
                        onroad_streak = 0.0
                        stuck_since = None
                        missing_since = None
                        motion_frame = None
                        scene_motion = False
                        last_road_at = None
                        offroad_since = None
                        status = "VISUAL AI WAITING - screen capture failed"
                        key = cv2.waitKey(20) & 0xFF
                        if (not free_exploration and key == ord("q")) or cv2.getWindowProperty("Driving Empire visual AI", cv2.WND_PROP_VISIBLE) < 1:
                            break
                        time.sleep(0.1)
                        continue
                elif active:
                    output.release_all()
                    last_state = None
                    lost_transition = None
                    onroad_streak = 0.0
                    stuck_since = None
                    missing_since = None
                    motion_frame = None
                    scene_motion = False
                    last_road_at = None
                    offroad_since = None
                    status = "VISUAL AI WAITING - focus Roblox to resume"
                preview_road = screen_road(frame, settings) if focused else None
                if active and focused:
                    now = time.monotonic()
                    menu_open = car_tile(frame) is not None or car_category_icon(frame) is not None
                    road = None if menu_open else preview_road
                    if now - motion_at >= 0.4:
                        scene_motion = scene_moving(motion_frame, frame)
                        motion_frame = frame.copy()
                        motion_at = now
                    if road is not None:
                        last_road_at = now
                    hud_motion = None if menu_open else speed_moving(frame)
                    moving = hud_motion
                    if moving is None and (free_exploration or (last_road_at is not None and now - last_road_at < 3.0)):
                        moving = scene_motion
                    if free_exploration and not menu_open and road is None and hud_motion is None:
                        offroad_since = offroad_since or now
                        if now - offroad_since >= 30.0 and now >= retry_recovery_at:
                            output.release_all()
                            recovery_attempts += int(evaluation)
                            respawn_character(hwnd, keys, output)
                            retry_recovery_at = time.monotonic() + 5.0
                            offroad_since = time.monotonic()
                            moving = None
                    else:
                        offroad_since = None
                    if moving is None:
                        output.release_all()
                        onroad_streak = 0.0
                        if last_state is not None and not menu_open:
                            lost_transition = (last_state, last_action)
                        last_state = None
                        stuck_since = None
                        missing_since = missing_since or now
                        if now - missing_since >= 0.6 and lost_transition is not None:
                            lost_state, lost_action = lost_transition
                            if evaluation:
                                record_evaluation(lost_action, frame, None, None, -3.0, True, now - action_since)
                            else:
                                transition = (lost_state, lost_action, -3.0, lost_state, True)
                                if len(replay) < 2000:
                                    replay.append(transition)
                                else:
                                    replay[replay_slot] = transition
                                replay_slot = (replay_slot + 1) % 2000
                                steps += 1
                            lost_transition = None
                            if not evaluation and len(replay) >= 32:
                                train_visual(weights, target_weights, replay, rng)
                            if not evaluation and steps % 200 == 0:
                                target_weights = [weight.copy() for weight in weights]
                            if not evaluation and steps % 100 == 0:
                                save_visual(weights, steps, best_streak, policy_path)
                        if now - missing_since >= 20.0 and now >= retry_recovery_at:
                            recovery_attempts += int(evaluation)
                            respawned = respawn_character(hwnd, keys, output)
                            missing_since = time.monotonic()
                            retry_recovery_at = missing_since + 5.0
                            status = "VISUAL AI RECOVERING - character respawn requested" if respawned else "VISUAL AI WAITING - focus Roblox"
                        elif now - missing_since >= 0.6 and now >= retry_recovery_at:
                            recovery_attempts += int(evaluation)
                            try:
                                recovered = recover_car(capture, hwnd, keys, output, rng.randrange(4))
                            except (OSError, mss.exception.ScreenShotError):
                                recovered = False
                            retry_recovery_at = time.monotonic() + (3.0 if recovered else 2.0)
                            status = "VISUAL AI TRAINING - car selected" if recovered else "VISUAL AI RETRYING - car selection failed"
                        else:
                            status = "VISUAL AI WAITING - selecting a car"
                    else:
                        missing_since = None
                        lost_transition = None
                    if moving is not None:
                        state = visual_state(frame, moving, free_exploration)
                        stuck_since = None if moving else (stuck_since or now)
                        stuck = stuck_since is not None and now - stuck_since >= 20.0
                        if last_state is not None and (now - action_since >= (0.60 if not moving else 0.25) or stuck):
                            visual_change = float(np.mean(np.abs(state[:-1] - last_state[:-1])))
                            alignment = road_state(road, frame.shape[1], settings["car_x_fraction"])[1] if road is not None else None
                            if moving and alignment is not None and alignment <= 0.25:
                                reward = 0.20 + 0.40 * (1 - alignment / 0.25) + min(0.10, 2 * visual_change)
                            else:
                                reward = -0.25 if moving else -0.20
                            if free_exploration:
                                small_view = cv2.resize(frame, (16, 9), interpolation=cv2.INTER_AREA)
                                signature = hash((small_view // 32).tobytes())
                                if signature not in seen_views:
                                    seen_views.add(signature)
                                    if len(seen_views) > 200000:
                                        seen_views.pop()
                                    reward += 0.30
                            if moving and alignment is not None and alignment <= 0.25:
                                onroad_streak += now - action_since
                                best_streak = max(best_streak, onroad_streak)
                            else:
                                onroad_streak = 0.0
                            if stuck:
                                reward = -2.0
                            if evaluation:
                                record_evaluation(last_action, frame, moving, alignment, reward, stuck, now - action_since)
                            else:
                                transition = (last_state, last_action, reward, state, stuck)
                                if len(replay) < 2000:
                                    replay.append(transition)
                                else:
                                    replay[replay_slot] = transition
                                replay_slot = (replay_slot + 1) % 2000
                                steps += 1
                                if len(replay) >= 32:
                                    train_visual(weights, target_weights, replay, rng)
                                if steps % 200 == 0:
                                    target_weights = [weight.copy() for weight in weights]
                                if steps % 100 == 0:
                                    save_visual(weights, steps, best_streak, policy_path)
                            last_state = None
                            cooldown_until = now
                        if stuck and now >= retry_recovery_at:
                            output.release_all()
                            recovery_attempts += int(evaluation)
                            try:
                                recovered = recover_car(capture, hwnd, keys, output, rng.randrange(4))
                            except (OSError, mss.exception.ScreenShotError):
                                recovered = False
                            if recovered:
                                stuck_since = None
                                retry_recovery_at = 0.0
                                cooldown_until = time.monotonic() + 0.5
                                status = "VISUAL AI TRAINING - car respawned"
                            else:
                                stuck_since = time.monotonic()
                                retry_recovery_at = stuck_since + 2.0
                                status = "VISUAL AI RETRYING - recovery failed"
                        elif last_state is None and now >= cooldown_until:
                            epsilon = 0.0 if evaluation else max(0.08, 0.40 - 0.32 * steps / 50000)
                            if free_exploration and not evaluation:
                                epsilon = max(epsilon, 0.25)
                            if not moving and not evaluation:
                                epsilon = max(epsilon, 0.65)
                            if rng.random() < epsilon:
                                action = rng.randrange(len(actions))
                            else:
                                action = int(np.argmax(visual_values(state, weights)))
                            if action < len(AI_ACTIONS):
                                output.set_pressed({codes[name] for name in AI_ACTIONS[action]})
                                names = "+".join(AI_ACTIONS[action]).upper()
                            else:
                                output.release_all()
                                kind, *details = actions[action]
                                if kind == "key":
                                    code = 0x10 if details[0] == "SHIFT" else v1.virtual_key(details[0])
                                    output.set_pressed({code})
                                    names = details[0]
                                else:
                                    point = (int(area["width"] * details[1]), int(area["height"] * details[2]))
                                    if kind == "click":
                                        click_game(hwnd, area, point, keys, details[0])
                                        names = f"{details[0].upper()} CLICK"
                                    else:
                                        scroll_game(hwnd, area, point, keys, details[0])
                                        names = "WHEEL UP" if details[0] > 0 else "WHEEL DOWN"
                            last_state = state
                            last_action = action
                            action_since = now
                            label = ("GAME EVALUATION" if evaluation else "GAME EXPLORER") if free_exploration else ("ROAD EVALUATION" if evaluation else "ROAD GOAL")
                            count = evaluation_steps if evaluation else steps
                            status = f"{label} - {count} steps | road {onroad_streak:.0f}s | best {best_streak:.0f}s | {names}"
                scale = min(1.0, 1000 / frame.shape[1])
                preview = cv2.resize(frame, None, fx=scale, fy=scale)
                if focused and preview_road is not None:
                    _, centers = preview_road
                    for y, x in centers:
                        cv2.circle(preview, (int(x * scale), int(y * scale)), 5, (0, 255, 0), -1)
                    road_label = "ROAD VISIBLE"
                else:
                    road_label = "NO ROAD DETECTED"
                cv2.rectangle(preview, (0, 0), (preview.shape[1], 70), (0, 0, 0), -1)
                cv2.putText(preview, status, (12, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                if free_exploration:
                    controls = "F8 start/pause | physical driving key takes over | close window to quit"
                else:
                    controls = "F8 start/pause | F9 stop | physical driving key takes over | Q quit"
                cv2.putText(preview, controls, (12, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                cv2.putText(preview, road_label, (12, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 0) if preview_road is not None else (0, 0, 255), 2)
                cv2.imshow("Driving Empire visual AI", preview)
                key = cv2.waitKey(20) & 0xFF
                if (not free_exploration and key == ord("q")) or cv2.getWindowProperty("Driving Empire visual AI", cv2.WND_PROP_VISIBLE) < 1:
                    break
    finally:
        output.release_all()
        keys.close()
        cv2.destroyAllWindows()
        if evaluation:
            if evaluation_file is not None:
                evaluation_file.close()
                summary = {
                    "checkpoint": str(policy_path),
                    "checkpoint_sha256": checkpoint_hash,
                    "steps": evaluation_steps,
                    "detected_road_moving_seconds": round(road_seconds, 2),
                    "moving_without_aligned_road_seconds": round(unaligned_seconds, 2),
                    "stopped_seconds": round(stopped_seconds, 2),
                    "lost_car_events": lost_events,
                    "recovery_attempts": recovery_attempts,
                }
                (evaluation_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
                print(f"Evaluation saved to {evaluation_dir}")
        else:
            save_visual(weights, steps, best_streak, policy_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Driving Empire Version 2 learning prototype")
    parser.add_argument("mode", choices=("record", "train", "drive", "self_train", "self_train_auto", "self_train_free", "evaluate_auto", "evaluate_free"))
    args = parser.parse_args()
    try:
        {"record": record, "train": train, "drive": drive, "self_train": lambda: drive(self_training=True),
         "self_train_auto": ai_drive, "self_train_free": lambda: ai_drive(free_exploration=True),
         "evaluate_auto": lambda: ai_drive(evaluation=True),
         "evaluate_free": lambda: ai_drive(free_exploration=True, evaluation=True)}[args.mode]()
    except (OSError, RuntimeError, ValueError, KeyError) as error:
        raise SystemExit(str(error)) from error
