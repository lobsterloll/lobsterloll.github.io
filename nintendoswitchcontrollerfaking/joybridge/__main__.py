"""Run with `python -m joybridge`."""

import argparse
import sys
import threading
import time

from .hardware import JoyCon, discover
from .output import send_state
from .protocol import XboxState, combine


class Reader(threading.Thread):
    def __init__(self, joycon: JoyCon, stop: threading.Event):
        super().__init__(name=f"{joycon.side}-joycon", daemon=True)
        self.joycon = joycon
        self.stop = stop
        self.lock = threading.Lock()
        self.state = None
        self.last_report = 0.0
        self.error = None

    def run(self):
        try:
            next_keepalive = time.monotonic() + 5.0
            next_reconnect = time.monotonic() + 3.0
            while not self.stop.is_set():
                try:
                    state = self.joycon.read_state()
                except OSError:
                    state = None
                    self.stop.wait(0.1)
                now = time.monotonic()
                if state is not None:
                    with self.lock:
                        self.state = state
                        self.last_report = now
                if now >= next_keepalive:
                    try:
                        self.joycon.send_neutral_rumble()
                    except OSError:
                        pass
                    next_keepalive = now + 5.0
                if self.last_report and now - self.last_report > 3.0 and now >= next_reconnect:
                    try:
                        if now - self.last_report < 8.0:
                            self.joycon.request_full_reports()
                            print(f"Requesting full reports from {self.joycon.side} Joy-Con.")
                        else:
                            self.joycon.reconnect()
                            print(f"{self.joycon.side} Joy-Con connection refreshed.")
                    except (OSError, TimeoutError):
                        print(f"Waiting for {self.joycon.side} Joy-Con to reconnect.")
                    next_reconnect = time.monotonic() + 5.0
        except Exception as exc:
            with self.lock:
                self.error = exc
            self.stop.set()

    def snapshot(self):
        with self.lock:
            return self.state, self.last_report, self.error


def run(args, stop=None, notify=None) -> int:
    def report(message, error=False):
        if notify is not None:
            notify(message)
        else:
            print(message, file=sys.stderr if error else sys.stdout)

    if sys.platform != "win32":
        report("This app requires Windows 10 or 11.", error=True)
        return 1
    try:
        import hid
    except ImportError:
        report("hidapi is missing. Run .\\setup.ps1 first.", error=True)
        return 1

    found = discover(hid)
    if args.list:
        for side in ("left", "right"):
            choices = found[side]
            if not choices:
                print(f"{side}: none detected")
            for index, choice in enumerate(choices):
                print(f"{side} [{index}]: {choice.label}")
        return 0

    for side, index in (("left", args.left_index), ("right", args.right_index)):
        if index >= len(found[side]):
            report(f"No {side} Joy-Con found. Wake or pair it in Windows Bluetooth settings.", error=True)
            return 1

    joycons = []
    if stop is None:
        stop = threading.Event()
    readers = []
    pad = None
    try:
        for side, index in (("left", args.left_index), ("right", args.right_index)):
            choice = found[side][index]
            joycon = JoyCon(hid, choice)
            joycons.append(joycon)
            report(f"{side}: {joycon.initialize()}")

        try:
            import vgamepad as vg
            pad = vg.VX360Gamepad()
        except Exception as exc:
            raise RuntimeError(
                "Could not create virtual Xbox controller. Install official ViGEmBus 1.22.0 "
                "and rerun setup.ps1."
            ) from exc

        readers = [Reader(joycon, stop) for joycon in joycons]
        for reader in readers:
            reader.start()
        report("Connected: one virtual Xbox controller is active. Open Xbox Cloud Gaming in Edge.")
        if notify is None:
            print("Press Ctrl+C here to disconnect it.")
        deadline = time.monotonic() + 2.0
        input_paused = False
        while not stop.is_set():
            left, left_at, left_error = readers[0].snapshot()
            right, right_at, right_error = readers[1].snapshot()
            if left_error or right_error:
                raise RuntimeError(f"Joy-Con reader failed: {left_error or right_error}")
            now = time.monotonic()
            if left is None or right is None:
                if now >= deadline:
                    raise TimeoutError("Both Joy-Cons must send full input reports. Try reconnecting them.")
                output = XboxState()
            elif now - left_at > 0.5 or now - right_at > 0.5:
                if not input_paused:
                    report("Waiting for both Joy-Cons to reconnect.")
                input_paused = True
                output = XboxState()
            else:
                if input_paused:
                    report("Connected: Joy-Con input resumed.")
                input_paused = False
                output = combine(left, right)
            send_state(pad, vg, output)
            time.sleep(1 / 60)
        for reader in readers:
            if reader.error:
                raise RuntimeError(f"Joy-Con reader failed: {reader.error}")
        return 0
    except KeyboardInterrupt:
        report("Stopping.")
        return 0
    except (OSError, RuntimeError, TimeoutError) as exc:
        report(f"Error: {exc}", error=True)
        return 1
    finally:
        stop.set()
        for reader in readers:
            reader.join(timeout=0.4)
        if pad is not None:
            try:
                send_state(pad, vg, XboxState())
            except Exception:
                pass
        for joycon in joycons:
            try:
                joycon.close()
            except Exception:
                pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Combine original Switch Joy-Cons into one virtual Xbox controller")
    parser.add_argument("--list", action="store_true", help="show paired Joy-Cons")
    parser.add_argument("--left-index", type=int, default=0, help="left Joy-Con index from --list")
    parser.add_argument("--right-index", type=int, default=0, help="right Joy-Con index from --list")
    args = parser.parse_args()
    if args.left_index < 0 or args.right_index < 0:
        parser.error("indices must be nonnegative")
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
