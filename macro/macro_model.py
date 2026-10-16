"""Recording format and validation. No Windows dependencies."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

FORMAT = "codex-windows-macro"
VERSION = 1
MAX_EVENTS = 500_000
MAX_FILE_BYTES = 80_000_000
MAX_DURATION_NS = 24 * 60 * 60 * 1_000_000_000
MAX_REPEAT = 1_000_000_000

BUTTONS = {"left", "right", "middle", "x1", "x2"}
EVENT_KINDS = {"key", "move", "button", "wheel"}


def new_recording(display: dict[str, int]) -> dict:
    return {
        "format": FORMAT,
        "version": VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "display": display,
        "events": [],
    }


def _integer(value: object, label: str, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"Invalid {label}.")
    return value


def validate_recording(data: object) -> dict:
    if not isinstance(data, dict) or data.get("format") != FORMAT or data.get("version") != VERSION:
        raise ValueError("This is not a supported Macro Recorder file (version 1).")
    display = data.get("display")
    if not isinstance(display, dict):
        raise ValueError("Missing display information.")
    for name in ("x", "y"):
        _integer(display.get(name), f"display {name}", -100_000, 100_000)
    for name in ("width", "height"):
        _integer(display.get(name), f"display {name}", 1, 100_000)
    events = data.get("events")
    if not isinstance(events, list) or not 0 < len(events) <= MAX_EVENTS:
        raise ValueError(f"A recording must contain 1 to {MAX_EVENTS:,} events.")
    previous = -1
    held_keys: set[tuple[int, int, bool]] = set()
    held_buttons: set[str] = set()
    for index, event in enumerate(events):
        if (not isinstance(event, dict) or not isinstance(event.get("kind"), str)
                or event["kind"] not in EVENT_KINDS):
            raise ValueError(f"Invalid event {index + 1}.")
        timestamp = _integer(event.get("t_ns"), "event timestamp", 0, MAX_DURATION_NS)
        if timestamp < previous:
            raise ValueError("Event timestamps must be in order.")
        previous = timestamp
        kind = event["kind"]
        if kind == "key":
            _integer(event.get("vk"), "virtual key", 1, 254)
            _integer(event.get("scan"), "scan code", 0, 65535)
            if event["vk"] == 0x7B:  # F12 is reserved for emergency stop.
                raise ValueError("F12 cannot appear in a recording.")
            if type(event.get("extended")) is not bool or type(event.get("down")) is not bool:
                raise ValueError("Invalid key flags.")
            identity = (event["vk"], event["scan"], event["extended"])
            if event["down"]:
                held_keys.add(identity)  # Repeated down events are valid key repeats.
            elif identity not in held_keys:
                raise ValueError("A key was released before it was pressed.")
            else:
                held_keys.remove(identity)
        elif kind == "move":
            _integer(event.get("x"), "mouse x", -100_000, 100_000)
            _integer(event.get("y"), "mouse y", -100_000, 100_000)
        elif kind == "button":
            if (not isinstance(event.get("button"), str) or event["button"] not in BUTTONS
                    or type(event.get("down")) is not bool):
                raise ValueError("Invalid mouse button event.")
            _integer(event.get("x"), "mouse x", -100_000, 100_000)
            _integer(event.get("y"), "mouse y", -100_000, 100_000)
            if event["down"]:
                if event["button"] in held_buttons:
                    raise ValueError("A mouse button was pressed twice without release.")
                held_buttons.add(event["button"])
            elif event["button"] not in held_buttons:
                raise ValueError("A mouse button was released before it was pressed.")
            else:
                held_buttons.remove(event["button"])
        elif kind == "wheel":
            if type(event.get("horizontal")) is not bool:
                raise ValueError("Invalid wheel direction.")
            _integer(event.get("delta"), "wheel delta", -32768, 32767)
            _integer(event.get("x"), "mouse x", -100_000, 100_000)
            _integer(event.get("y"), "mouse y", -100_000, 100_000)
    if held_keys or held_buttons:
        raise ValueError("The recording ends with a key or mouse button held down.")
    return data


def save_recording(path: str | Path, data: dict) -> None:
    validate_recording(data)
    destination = Path(path)
    temporary = destination.with_name(destination.name + f".{uuid4().hex}.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def load_recording(path: str | Path) -> dict:
    source = Path(path)
    if source.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("The file is too large to load safely.")
    with source.open("r", encoding="utf-8") as handle:
        return validate_recording(json.load(handle))


def duration_seconds(data: dict) -> float:
    return data["events"][-1]["t_ns"] / 1_000_000_000 if data["events"] else 0.0
