"""Double-clickable window for the Joy-Con bridge."""

import ctypes
import queue
import threading
import tkinter as tk
from types import SimpleNamespace
from tkinter import messagebox, ttk

from joybridge.__main__ import run


def main():
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.argtypes = (ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p)
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    mutex = kernel32.CreateMutexW(None, False, "Local\\JoyConBridge")
    if not mutex:
        raise ctypes.WinError(ctypes.get_last_error())
    if ctypes.get_last_error() == 183:
        messagebox.showinfo("Joy-Con Bridge", "Joy-Con Bridge is already open.")
        return

    window = tk.Tk()
    window.title("Joy-Con Bridge")
    window.geometry("420x190")
    window.resizable(False, False)

    status = tk.StringVar(value="Starting...")
    updates = queue.Queue()
    stop = threading.Event()
    worker = None
    current_attempt = None

    frame = ttk.Frame(window, padding=20)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="Joy-Con → Xbox", font=("Segoe UI", 16, "bold")).pack(anchor="w")
    ttk.Label(frame, textvariable=status, wraplength=380).pack(anchor="w", pady=(12, 14))
    button = ttk.Button(frame, text="Stop")
    button.pack(anchor="w")
    ttk.Label(frame, text="Keep this window open while playing.").pack(anchor="w", pady=(12, 0))

    def start():
        nonlocal worker
        if worker is not None and worker.is_alive():
            return
        stop.clear()
        status.set("Connecting to both Joy-Cons...")
        button.configure(text="Stop", command=stop_bridge, state="normal")

        def bridge():
            nonlocal current_attempt
            args = SimpleNamespace(list=False, left_index=0, right_index=0)
            while not stop.is_set():
                last_message = ""
                current_attempt = threading.Event()

                def report(message):
                    nonlocal last_message
                    last_message = message
                    updates.put(("status", message))

                try:
                    result = run(args, stop=current_attempt, notify=report)
                except Exception as exc:
                    report(f"Error: {exc}")
                    result = 1
                current_attempt = None
                if stop.is_set():
                    result = 0
                    break
                if result == 0 or "Joy-Con" not in last_message:
                    break
                updates.put(("status", "Waiting for Joy-Cons. Press a button on each to reconnect."))
                if stop.wait(3):
                    break
            if stop.is_set():
                result = 0
            updates.put(("done", result))

        worker = threading.Thread(target=bridge, name="joycon-bridge", daemon=True)
        worker.start()

    def stop_bridge():
        stop.set()
        if current_attempt is not None:
            current_attempt.set()
        status.set("Stopping...")
        button.configure(state="disabled")

    def drain_updates():
        try:
            while True:
                kind, value = updates.get_nowait()
                if kind == "status":
                    status.set(value)
                else:
                    if value == 0:
                        status.set("Stopped.")
                    button.configure(text="Start", command=start, state="normal")
        except queue.Empty:
            pass
        window.after(100, drain_updates)

    def close():
        stop.set()
        if current_attempt is not None:
            current_attempt.set()
        if worker is not None and worker.is_alive():
            window.after(100, close)
        else:
            window.destroy()

    window.protocol("WM_DELETE_WINDOW", close)
    window.after(100, start)
    window.after(100, drain_updates)
    window.mainloop()


if __name__ == "__main__":
    main()
