"""Small Win32 input layer for Windows desktop sessions."""

from __future__ import annotations

import ctypes
import threading
from ctypes import wintypes

user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

PTR = ctypes.c_size_t
LRESULT = ctypes.c_ssize_t
WPARAM = PTR
LPARAM = LRESULT
HOOKPROC = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, WPARAM, LPARAM)

WH_KEYBOARD_LL = 13
WH_MOUSE_LL = 14
WM_QUIT = 0x0012
WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
WM_SYSKEYDOWN = 0x0104
WM_SYSKEYUP = 0x0105
WM_MOUSEMOVE = 0x0200
WM_LBUTTONDOWN = 0x0201
WM_LBUTTONUP = 0x0202
WM_LBUTTONDBLCLK = 0x0203
WM_RBUTTONDOWN = 0x0204
WM_RBUTTONUP = 0x0205
WM_RBUTTONDBLCLK = 0x0206
WM_MBUTTONDOWN = 0x0207
WM_MBUTTONUP = 0x0208
WM_MBUTTONDBLCLK = 0x0209
WM_MOUSEWHEEL = 0x020A
WM_XBUTTONDOWN = 0x020B
WM_XBUTTONUP = 0x020C
WM_XBUTTONDBLCLK = 0x020D
WM_MOUSEHWHEEL = 0x020E
VK_F12 = 0x7B
LLKHF_EXTENDED = 0x01
LLKHF_INJECTED = 0x10
LLMHF_INJECTED = 0x01
INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_SCANCODE = 0x0008
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_XDOWN = 0x0080
MOUSEEVENTF_XUP = 0x0100
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_HWHEEL = 0x1000
MOUSEEVENTF_VIRTUALDESK = 0x4000
MOUSEEVENTF_ABSOLUTE = 0x8000


class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


class RECT(ctypes.Structure):
    _fields_ = [("left", wintypes.LONG), ("top", wintypes.LONG),
                ("right", wintypes.LONG), ("bottom", wintypes.LONG)]


class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [("vkCode", wintypes.DWORD), ("scanCode", wintypes.DWORD),
                ("flags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", PTR)]


class MSLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [("pt", POINT), ("mouseData", wintypes.DWORD),
                ("flags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", PTR)]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG),
                ("mouseData", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD), ("dwExtraInfo", PTR)]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", PTR)]


class INPUT_UNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("data", INPUT_UNION)]


user32.SetWindowsHookExW.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD]
user32.SetWindowsHookExW.restype = ctypes.c_void_p
user32.UnhookWindowsHookEx.argtypes = [ctypes.c_void_p]
user32.UnhookWindowsHookEx.restype = wintypes.BOOL
user32.CallNextHookEx.argtypes = [ctypes.c_void_p, ctypes.c_int, WPARAM, LPARAM]
user32.CallNextHookEx.restype = LRESULT
user32.GetMessageW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT, wintypes.UINT]
user32.GetMessageW.restype = wintypes.BOOL
user32.PostThreadMessageW.argtypes = [wintypes.DWORD, wintypes.UINT, WPARAM, LPARAM]
user32.PostThreadMessageW.restype = wintypes.BOOL
user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
user32.SendInput.restype = wintypes.UINT
user32.GetForegroundWindow.restype = ctypes.c_void_p
user32.IsWindow.argtypes = [ctypes.c_void_p]
user32.IsWindow.restype = wintypes.BOOL
user32.GetWindowTextLengthW.argtypes = [ctypes.c_void_p]
user32.GetWindowTextLengthW.restype = ctypes.c_int
user32.GetWindowTextW.argtypes = [ctypes.c_void_p, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowTextW.restype = ctypes.c_int
user32.GetAncestor.argtypes = [ctypes.c_void_p, wintypes.UINT]
user32.GetAncestor.restype = ctypes.c_void_p
user32.GetWindowRect.argtypes = [ctypes.c_void_p, ctypes.POINTER(RECT)]
user32.GetWindowRect.restype = wintypes.BOOL
user32.GetSystemMetrics.argtypes = [ctypes.c_int]
user32.GetSystemMetrics.restype = ctypes.c_int
kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
kernel32.GetModuleHandleW.restype = ctypes.c_void_p
kernel32.GetCurrentThreadId.restype = wintypes.DWORD


def set_dpi_aware() -> None:
    """Keep hook positions and playback coordinates in physical screen pixels."""
    try:
        fn = user32.SetProcessDpiAwarenessContext
        fn.argtypes = [ctypes.c_void_p]
        fn.restype = wintypes.BOOL
        if fn(ctypes.c_void_p(-4)):  # Per-monitor DPI awareness v2.
            return
    except (AttributeError, OSError):
        pass
    try:
        user32.SetProcessDPIAware()
    except (AttributeError, OSError):
        pass


def display_geometry() -> dict[str, int]:
    return {
        "x": user32.GetSystemMetrics(76), "y": user32.GetSystemMetrics(77),
        "width": user32.GetSystemMetrics(78), "height": user32.GetSystemMetrics(79),
    }


def top_level_window(hwnd: int) -> int:
    """Tk's winfo_id is a child HWND; foreground checks need its outer HWND."""
    return int(user32.GetAncestor(hwnd, 2) or hwnd)  # GA_ROOT = 2


def window_is_open(hwnd: int) -> bool:
    return bool(hwnd and user32.IsWindow(hwnd))


def window_title(hwnd: int) -> str:
    length = user32.GetWindowTextLengthW(hwnd)
    if length <= 0:
        return ""
    buffer = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buffer, len(buffer))
    return buffer.value


def is_own_window(hwnd: int, x: int | None = None, y: int | None = None) -> bool:
    if not hwnd or user32.GetForegroundWindow() != hwnd:
        return False
    if x is None or y is None:
        return True
    rect = RECT()
    return bool(user32.GetWindowRect(hwnd, ctypes.byref(rect))) and rect.left <= x < rect.right and rect.top <= y < rect.bottom


class InputHooks:
    """The callback thread only records data and signals F12; it never runs the GUI."""

    def __init__(self, on_key, on_mouse, hotkey_enabled, on_f12):
        self.on_key = on_key
        self.on_mouse = on_mouse
        self.hotkey_enabled = hotkey_enabled
        self.on_f12 = on_f12
        self._ready = threading.Event()
        self._thread = None
        self._thread_id = 0
        self._error = None
        self._f12_down = False

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="Win32 input hooks", daemon=True)
        self._thread.start()
        if not self._ready.wait(5):
            raise RuntimeError("Input hooks did not start.")
        if self._error:
            raise self._error

    def stop(self) -> None:
        if self._thread_id:
            user32.PostThreadMessageW(self._thread_id, WM_QUIT, 0, 0)
        if self._thread:
            self._thread.join(timeout=2)

    def _keyboard(self, code, wparam, lparam):
        try:
            if code >= 0:
                item = ctypes.cast(lparam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
                if not item.flags & LLKHF_INJECTED:
                    down = wparam in (WM_KEYDOWN, WM_SYSKEYDOWN)
                    up = wparam in (WM_KEYUP, WM_SYSKEYUP)
                    if item.vkCode == VK_F12 and (self.hotkey_enabled() or self._f12_down):
                        if down and not self._f12_down:
                            self._f12_down = True
                            self.on_f12()
                        elif up:
                            self._f12_down = False
                        return 1
                    if down or up:
                        self.on_key(int(item.vkCode), int(item.scanCode),
                                    bool(item.flags & LLKHF_EXTENDED), down)
        except Exception:
            pass  # Never let a Python exception break the Windows hook chain.
        return user32.CallNextHookEx(None, code, wparam, lparam)

    def _mouse(self, code, wparam, lparam):
        try:
            if code >= 0:
                item = ctypes.cast(lparam, ctypes.POINTER(MSLLHOOKSTRUCT)).contents
                if not item.flags & LLMHF_INJECTED:
                    self.on_mouse(int(wparam), int(item.pt.x), int(item.pt.y), int(item.mouseData))
        except Exception:
            pass
        return user32.CallNextHookEx(None, code, wparam, lparam)

    def _run(self) -> None:
        keyboard_hook = mouse_hook = None
        try:
            self._thread_id = kernel32.GetCurrentThreadId()
            self._keyboard_proc = HOOKPROC(self._keyboard)
            self._mouse_proc = HOOKPROC(self._mouse)
            module = kernel32.GetModuleHandleW(None)
            keyboard_hook = user32.SetWindowsHookExW(WH_KEYBOARD_LL, self._keyboard_proc, module, 0)
            if not keyboard_hook:
                raise ctypes.WinError(ctypes.get_last_error())
            mouse_hook = user32.SetWindowsHookExW(WH_MOUSE_LL, self._mouse_proc, module, 0)
            if not mouse_hook:
                raise ctypes.WinError(ctypes.get_last_error())
            self._ready.set()
            message = wintypes.MSG()
            while user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
                user32.TranslateMessage(ctypes.byref(message))
                user32.DispatchMessageW(ctypes.byref(message))
        except Exception as exc:
            self._error = exc
            self._ready.set()
        finally:
            if mouse_hook:
                user32.UnhookWindowsHookEx(mouse_hook)
            if keyboard_hook:
                user32.UnhookWindowsHookEx(keyboard_hook)
            self._thread_id = 0


class InputSender:
    def __init__(self, geometry: dict[str, int]):
        self.geometry = geometry

    @staticmethod
    def _send(item: INPUT) -> None:
        if user32.SendInput(1, ctypes.byref(item), ctypes.sizeof(INPUT)) != 1:
            raise OSError(ctypes.get_last_error(), "Windows did not accept playback input; check the target app's permissions")

    def key(self, event: dict, down: bool | None = None) -> None:
        is_down = event["down"] if down is None else down
        scan = event["scan"]
        flags = (KEYEVENTF_EXTENDEDKEY if event["extended"] else 0) | (0 if is_down else KEYEVENTF_KEYUP)
        if scan:
            flags |= KEYEVENTF_SCANCODE
        item = INPUT()
        item.type = INPUT_KEYBOARD
        item.data.ki = KEYBDINPUT(0 if scan else event["vk"], scan, flags, 0, 0)
        self._send(item)

    def move(self, x: int, y: int) -> None:
        g = self.geometry
        if not (g["x"] <= x < g["x"] + g["width"] and g["y"] <= y < g["y"] + g["height"]):
            raise ValueError("A recorded mouse position is outside the current display.")
        dx = round((x - g["x"]) * 65535 / max(1, g["width"] - 1))
        dy = round((y - g["y"]) * 65535 / max(1, g["height"] - 1))
        item = INPUT()
        item.type = INPUT_MOUSE
        item.data.mi = MOUSEINPUT(dx, dy, 0,
                                  MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, 0, 0)
        self._send(item)

    def button(self, button: str, down: bool) -> None:
        flags = {
            "left": (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
            "right": (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
            "middle": (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
            "x1": (MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP),
            "x2": (MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP),
        }
        mouse_data = 1 if button == "x1" else 2 if button == "x2" else 0
        item = INPUT()
        item.type = INPUT_MOUSE
        item.data.mi = MOUSEINPUT(0, 0, mouse_data, flags[button][0 if down else 1], 0, 0)
        self._send(item)

    def wheel(self, delta: int, horizontal: bool) -> None:
        item = INPUT()
        item.type = INPUT_MOUSE
        item.data.mi = MOUSEINPUT(0, 0, delta & 0xFFFFFFFF,
                                  MOUSEEVENTF_HWHEEL if horizontal else MOUSEEVENTF_WHEEL, 0, 0)
        self._send(item)
