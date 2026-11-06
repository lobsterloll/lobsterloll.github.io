"""Watch a visible MuMu window and click Driving Empire's red Exit button."""

import ctypes
import os
import time
import tkinter as tk
from ctypes import wintypes
from tkinter import ttk

import cv2
import numpy as np
from PIL import ImageGrab


user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
user32.SetProcessDPIAware()


class Point(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


class Rect(ctypes.Structure):
    _fields_ = [
        ("left", wintypes.LONG), ("top", wintypes.LONG),
        ("right", wintypes.LONG), ("bottom", wintypes.LONG),
    ]


user32.GetForegroundWindow.restype = wintypes.HWND
user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(Rect)]
user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(Point)]
user32.SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
user32.mouse_event.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, ctypes.c_size_t]
kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel32.OpenProcess.restype = wintypes.HANDLE
kernel32.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]


def foreground_mumu():
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return None
    title_buffer = ctypes.create_unicode_buffer(user32.GetWindowTextLengthW(hwnd) + 1)
    user32.GetWindowTextW(hwnd, title_buffer, len(title_buffer))
    process_id = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(process_id))
    executable = ""
    handle = kernel32.OpenProcess(0x1000, False, process_id.value)
    if handle:
        path_buffer = ctypes.create_unicode_buffer(32768)
        size = wintypes.DWORD(len(path_buffer))
        if kernel32.QueryFullProcessImageNameW(handle, 0, path_buffer, ctypes.byref(size)):
            executable = os.path.basename(path_buffer.value).lower()
        kernel32.CloseHandle(handle)
    identity = title_buffer.value.lower() + " " + executable
    if "mumu" not in identity and "nemu" not in identity:
        return None
    rect = Rect()
    origin = Point()
    if not user32.GetClientRect(hwnd, ctypes.byref(rect)):
        return None
    if not user32.ClientToScreen(hwnd, ctypes.byref(origin)):
        return None
    width, height = rect.right - rect.left, rect.bottom - rect.top
    if width < 500 or height < 300:
        return None
    return hwnd, (origin.x, origin.y, origin.x + width, origin.y + height)


def find_exit(image):
    """Find the red, white-lettered shop Exit button near the upper right."""
    height, width = image.shape[:2]
    left, right = int(width * 0.66), int(width * 0.98)
    top, bottom = int(height * 0.12), int(height * 0.39)
    region = image[top:bottom, left:right]
    red = region[:, :, 0].astype(np.int16)
    green = region[:, :, 1].astype(np.int16)
    blue = region[:, :, 2].astype(np.int16)
    red_mask = (red > 95) & (red > green * 1.55) & (red > blue * 1.55)
    mask = (red_mask.astype(np.uint8) * 255)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 7), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for contour in contours:
        x, y, button_width, button_height = cv2.boundingRect(contour)
        if not (width * 0.07 <= button_width <= width * 0.17):
            continue
        if not (height * 0.025 <= button_height <= height * 0.09):
            continue
        if not (3 <= button_width / button_height <= 6.5):
            continue
        if np.mean(red_mask[y:y + button_height, x:x + button_width]) < 0.55:
            continue
        button = region[y:y + button_height, x:x + button_width]
        letters = button[
            int(button_height * 0.12):int(button_height * 0.82),
            int(button_width * 0.25):int(button_width * 0.75),
        ]
        white = (np.min(letters, axis=2) > 160) & (np.ptp(letters, axis=2) < 70)
        white_fraction = float(np.mean(white))
        if not 0.025 <= white_fraction <= 0.32:
            continue
        count, _, stats, _ = cv2.connectedComponentsWithStats(white.astype(np.uint8))
        glyphs = sum(stats[i, cv2.CC_STAT_AREA] >= 3 for i in range(1, count))
        if not 3 <= glyphs <= 12:
            continue
        center_x = left + x + button_width // 2
        center_y = top + y + button_height // 2
        candidates.append((center_x, center_y, white_fraction))
    if not candidates:
        return None
    return max(candidates, key=lambda candidate: candidate[2])[:2]


def click_at(x, y):
    if not user32.SetCursorPos(x, y):
        raise OSError("Could not move the mouse.")
    user32.mouse_event(0x0002, 0, 0, 0, 0)
    time.sleep(0.04)
    user32.mouse_event(0x0004, 0, 0, 0, 0)


class Clicker:
    def __init__(self, root):
        self.root = root
        self.enabled = False
        self.previous = None
        self.matches = 0
        self.last_click = 0.0
        self.clicks = 0
        self.status = tk.StringVar(value="Off")
        self.detail = tk.StringVar(value="Open Driving Empire in MuMu, then press Start.")
        root.title("Driving Empire Exit Clicker")
        root.geometry("440x210")
        root.resizable(False, False)
        frame = ttk.Frame(root, padding=18)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="Driving Empire Exit Clicker", font=("Segoe UI", 15, "bold")).pack(anchor="w")
        ttk.Label(frame, text="Live screen detection for the car and helicopter shop.").pack(anchor="w", pady=(4, 14))
        controls = ttk.Frame(frame)
        controls.pack(anchor="w")
        self.start_button = ttk.Button(controls, text="Start", command=self.start)
        self.start_button.pack(side="left")
        self.stop_button = ttk.Button(controls, text="Stop", command=self.stop, state="disabled")
        self.stop_button.pack(side="left", padx=10)
        ttk.Label(controls, textvariable=self.status, font=("Segoe UI", 10, "bold")).pack(side="left", padx=12)
        ttk.Label(frame, textvariable=self.detail, wraplength=400).pack(anchor="w", pady=(17, 7))
        self.counter = ttk.Label(frame, text="Exits clicked: 0")
        self.counter.pack(anchor="w")
        root.after(450, self.scan)

    def start(self):
        self.enabled = True
        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.status.set("On")
        self.detail.set("Return to MuMu to begin watching.")

    def stop(self):
        self.enabled = False
        self.previous = None
        self.matches = 0
        self.start_button.configure(state="normal")
        self.stop_button.configure(state="disabled")
        self.status.set("Off")
        self.detail.set("Stopped.")

    def scan(self):
        try:
            if self.enabled:
                target = foreground_mumu()
                if target is None:
                    self.previous = None
                    self.matches = 0
                    self.detail.set("Waiting for MuMu to be the active window...")
                else:
                    hwnd, rect = target
                    image = np.asarray(ImageGrab.grab(bbox=rect, all_screens=True).convert("RGB"))
                    match = find_exit(image)
                    if match is None:
                        self.previous = None
                        self.matches = 0
                        self.detail.set("MuMu visible. Waiting for Exit...")
                    else:
                        if self.previous and abs(match[0] - self.previous[0]) < 20 and abs(match[1] - self.previous[1]) < 20:
                            self.matches += 1
                        else:
                            self.matches = 1
                        self.previous = match
                        self.detail.set("Exit detected.")
                        if self.matches >= 2 and time.monotonic() - self.last_click >= 2:
                            if foreground_mumu() == (hwnd, rect):
                                click_at(rect[0] + match[0], rect[1] + match[1])
                                self.last_click = time.monotonic()
                                self.clicks += 1
                                self.counter.configure(text=f"Exits clicked: {self.clicks}")
                                self.detail.set("Clicked Exit. Watching for the next menu...")
                                self.previous = None
                                self.matches = 0
        except Exception as exc:
            self.detail.set(f"Screen capture error: {exc}")
            self.previous = None
            self.matches = 0
        self.root.after(450, self.scan)


if __name__ == "__main__":
    window = tk.Tk()
    Clicker(window)
    window.mainloop()
