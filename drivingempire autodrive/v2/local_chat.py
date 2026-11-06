"""Offline text chat with read-only Driving Empire progress context."""

import json
from pathlib import Path
import queue
import socket
import subprocess
import sys
import threading
import time
import tkinter as tk
from tkinter.scrolledtext import ScrolledText
import uuid
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import numpy as np


ROOT = Path(__file__).resolve().parent
SERVER = ROOT / "local_llm" / "llama-server.exe"
MODEL = ROOT / "local_llm" / "Qwen3-1.7B-Q4_K_M.gguf"
HISTORY = ROOT / "chat_history.json"
DRIVER_STATUS = ROOT / "driver_status.json"
DRIVER_MESSAGE = ROOT / "driver_message.json"


def read_driver_status():
    try:
        status = json.loads(DRIVER_STATUS.read_text(encoding="utf-8"))
        status["live"] = time.time() - DRIVER_STATUS.stat().st_mtime < 10
        return status
    except (OSError, ValueError, TypeError):
        return None


def driving_context():
    progress = {}
    for mode, name in (("road goal", "road_goal_agent.npz"), ("free exploration", "game_explorer_agent.npz")):
        path = ROOT / name
        if path.exists():
            with np.load(path) as saved:
                progress[mode] = {
                    "training_steps": int(saved["steps"]),
                    "best_detected_road_streak_seconds": round(float(saved["best_streak"]), 1),
                }
    status = read_driver_status()
    return json.dumps({"saved_progress": progress, "driver_status": status}, ensure_ascii=False)


def load_history():
    if not HISTORY.exists():
        return []
    try:
        messages = json.loads(HISTORY.read_text(encoding="utf-8"))
        return [item for item in messages if item.get("role") in ("user", "assistant") and isinstance(item.get("content"), str)][-40:]
    except (OSError, ValueError, TypeError, AttributeError):
        return []


class LocalChat:
    def __init__(self, root):
        self.root = root
        self.root.title("Local AI Chat")
        self.root.geometry("760x600")
        self.events = queue.Queue()
        self.history = load_history()
        self.server = None
        self.driver_process = None
        self.port = None
        self.closed = threading.Event()
        self.last_driver_check = 0.0
        self.pending_message = None

        self.transcript = ScrolledText(root, wrap="word", state="disabled", font=("Segoe UI", 11))
        self.transcript.pack(fill="both", expand=True, padx=12, pady=(12, 6))
        self.entry = tk.Entry(root, font=("Segoe UI", 11))
        self.entry.pack(fill="x", padx=12, pady=4)
        self.entry.bind("<Return>", self.send)
        self.send_button = tk.Button(root, text="Send", command=self.send, state="disabled")
        self.send_button.pack(anchor="e", padx=12, pady=4)
        self.status = tk.Label(root, text="Loading local English model...", anchor="w")
        self.status.pack(fill="x", padx=12)
        self.driver_state = tk.Label(root, text="Driver: checking this project...", anchor="w")
        self.driver_state.pack(fill="x", padx=12)
        self.start_driver_button = tk.Button(root, text="Start connected driver (paused)", command=self.start_driver)
        self.start_driver_button.pack(anchor="w", padx=12, pady=(2, 10))
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        for message in self.history:
            self.append("You" if message["role"] == "user" else "AI", message["content"])
        self.root.after(100, self.poll)
        threading.Thread(target=self.start_server, daemon=True).start()

    def append(self, speaker, message):
        self.transcript.configure(state="normal")
        self.transcript.insert("end", f"{speaker}: {message}\n\n")
        self.transcript.see("end")
        self.transcript.configure(state="disabled")

    def start_driver(self):
        if self.driver_process is not None and self.driver_process.poll() is None:
            return
        python = Path(sys.executable).with_name("python.exe")
        try:
            self.driver_process = subprocess.Popen(
                [str(python), str(ROOT / "autodrive.py"), "self_train_auto"],
                cwd=ROOT.parent,
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
        except OSError as error:
            self.status.configure(text=f"Could not start the driver: {error}")
            return
        self.start_driver_button.configure(state="disabled")
        self.status.configure(text="Driver opened paused. Focus Roblox and press F8.")

    def start_server(self):
        if self.closed.is_set():
            return
        if not SERVER.exists() or not MODEL.exists():
            self.events.put(("error", "Local model files are missing. See v2/README.md."))
            return
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            self.port = listener.getsockname()[1]
        log_path = ROOT / "local_llm" / "server.log"
        try:
            with log_path.open("ab") as log:
                self.server = subprocess.Popen(
                    [str(SERVER), "-m", str(MODEL), "--host", "127.0.0.1", "--port", str(self.port),
                     "--ctx-size", "2048", "--threads", "4", "--parallel", "1",
                     "--n-gpu-layers", "0", "--cors-origins", "localhost"],
                    cwd=ROOT,
                    stdin=subprocess.DEVNULL,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
            if self.closed.is_set():
                self.server.terminate()
                return
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline and self.server.poll() is None and not self.closed.is_set():
                try:
                    with urlopen(f"http://127.0.0.1:{self.port}/health", timeout=2) as response:
                        if response.status == 200:
                            self.events.put(("ready", "Local model ready. Chat stays on this computer."))
                            return
                except (HTTPError, URLError, TimeoutError):
                    pass
                time.sleep(0.5)
            self.events.put(("error", "The local model did not start. See v2/local_llm/server.log."))
        except OSError as error:
            self.events.put(("error", f"Could not start the local model: {error}"))

    def send(self, _event=None):
        prompt = self.entry.get().strip()
        if not prompt or self.send_button["state"] != "normal":
            return
        self.entry.delete(0, "end")
        self.append("You", prompt)
        self.history.append({"role": "user", "content": prompt})
        self.send_button.configure(state="disabled")
        normalized = " ".join(prompt.casefold().strip(" .!?").split())
        words = set(normalized.split())
        driving_related = bool(words & {
            "driver", "drive", "driving", "road", "roads", "roblox", "game", "stuck",
            "spawn", "steer", "steering", "crash", "speedometer", "issue", "problem",
            "training", "train", "learning", "progress",
        }) or normalized in (
            "what are you doing", "what are you doign", "what's wrong",
            "what is going wrong", "what went wrong", "are you driving",
        )
        if normalized in ("pause", "pause driving", "stop driving", "please pause driving", "please stop driving"):
            action = "pause"
        elif normalized in ("resume", "resume driving", "start driving", "continue driving", "please resume driving"):
            action = "resume"
        else:
            action = "status"
        driving_related |= action != "status"
        driver = read_driver_status()
        if driving_related and driver and driver["live"] and driver.get("session_id"):
            message_id = uuid.uuid4().hex
            message = {
                "id": message_id,
                "session_id": driver["session_id"],
                "sent_at": time.time(),
                "text": prompt,
                "action": action,
            }
            try:
                temporary = DRIVER_MESSAGE.with_suffix(".tmp")
                temporary.write_text(json.dumps(message), encoding="utf-8")
                temporary.replace(DRIVER_MESSAGE)
            except OSError as error:
                self.events.put(("answer", f"I could not send that to the driver: {error}"))
                return
            self.pending_message = (message_id, time.monotonic(), driving_related)
            self.status.configure(text="Waiting for the driver to reply...")
            return
        self.status.configure(text="Thinking locally...")
        threading.Thread(target=self.answer, args=(self.history[-8:].copy(), None, driving_related), daemon=True).start()

    def answer(self, messages, driver_reply=None, driving_related=False):
        system = (
            "You are a friendly local AI chat companion. Have a natural conversation and respond to "
            "the user's actual words. Do not repeat earlier replies. /no_think"
        )
        if driving_related:
            system += (
                "\nYou speak for the separate Driving Empire driver in first person. "
                "The driver controls Roblox; you receive only its reports. Answer driving questions using those reports. "
                "Do not say you cannot drive at all: the connected driver program can drive. "
                "Only pause and resume are supported chat commands. Other requested game actions were not performed. "
                "For an unsupported command, explain that it was not implemented; do not blame the paused state. "
                "Do not claim an action happened without the driver's confirmation. Do not recite unrelated telemetry."
            )
            driver = read_driver_status()
            if driver:
                keys = ("live", "active", "roblox_focused", "issue", "status", "road_detected", "motion_signal")
                facts = {key: driver.get(key) for key in keys}
                question = next((item["content"].casefold() for item in reversed(messages) if item["role"] == "user"), "")
                if any(term in question for term in ("train", "learn", "progress", "best", "streak", "steps")):
                    facts["training"] = json.loads(driving_context())["saved_progress"]
                    facts["steps"] = driver.get("steps")
                    facts["best_road_streak_seconds"] = driver.get("best_road_streak_seconds")
                system += f"\nCurrent driver facts: {json.dumps(facts, ensure_ascii=False)}"
            else:
                system += "\nThe driver has no live status."
            if driver_reply:
                system += f"\nDriver's reply to this message: {driver_reply}"
            system += "\nAnswer the specific question in conversational English; mention only relevant facts."
        body = {
            "model": "local",
            "messages": [{"role": "system", "content": system}] + messages,
            "temperature": 0.7,
            "max_tokens": 300,
            "stream": False,
        }
        request = Request(
            f"http://127.0.0.1:{self.port}/v1/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=180) as response:
                result = json.load(response)
            reply = (result["choices"][0]["message"]["content"] or "").strip()
            if "</think>" in reply:
                reply = reply.split("</think>", 1)[1].strip()
            self.events.put(("answer", reply or "I could not form an answer. Please try again."))
        except (OSError, ValueError, KeyError, IndexError, TypeError, AttributeError) as error:
            self.events.put(("error", f"Local chat request failed: {error}"))

    def poll_driver(self):
        now = time.monotonic()
        if now - self.last_driver_check < 1.0:
            return
        self.last_driver_check = now
        driver = read_driver_status()
        if self.pending_message is not None:
            message_id, sent_at, driving_related = self.pending_message
            if driver and driver.get("last_message_id") == message_id:
                self.pending_message = None
                self.status.configure(text="Driver replied. Writing in English...")
                reply = driver.get("last_message_result") or "The driver acknowledged the message without details."
                threading.Thread(target=self.answer, args=(self.history[-8:].copy(), reply, driving_related), daemon=True).start()
            elif now - sent_at >= 10:
                self.pending_message = None
                self.events.put(("answer", "The driver did not acknowledge my message. Check that it is still open."))
        starting = self.driver_process is not None and self.driver_process.poll() is None
        connected = bool(driver and driver["live"])
        self.start_driver_button.configure(state="disabled" if starting or connected else "normal")
        if not driver or not driver["live"]:
            self.driver_state.configure(text="Driver: not running in this project")
            return
        if not driver.get("active"):
            self.driver_state.configure(text="Driver: paused")
            return
        if not driver.get("roblox_focused"):
            self.driver_state.configure(text="Driver: waiting for Roblox focus")
            return

        issue = str(driver.get("issue") or "")
        self.driver_state.configure(text=f"Driver: active | {issue or 'no issue reported'}")

    def poll(self):
        while not self.events.empty():
            kind, value = self.events.get_nowait()
            if kind == "ready":
                self.send_button.configure(state="normal")
                self.entry.focus_set()
            elif kind == "answer":
                self.append("AI", value)
                self.history.append({"role": "assistant", "content": value})
                self.history = self.history[-40:]
                try:
                    HISTORY.write_text(json.dumps(self.history, ensure_ascii=False, indent=2), encoding="utf-8")
                except OSError:
                    self.status.configure(text="Reply ready, but conversation history could not be saved.")
                    self.send_button.configure(state="normal")
                    continue
                self.send_button.configure(state="normal")
            elif kind == "error" and self.server is not None and self.server.poll() is None:
                self.send_button.configure(state="normal")
            self.status.configure(text=value if kind in ("ready", "error") else "Ready")
        self.poll_driver()
        self.root.after(100, self.poll)

    def close(self):
        self.closed.set()
        if self.server is not None and self.server.poll() is None:
            self.server.terminate()
        self.root.destroy()


if __name__ == "__main__":
    window = tk.Tk()
    LocalChat(window)
    window.mainloop()
