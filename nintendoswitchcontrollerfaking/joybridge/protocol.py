"""Pure Joy-Con packet decoding and pair mapping.

The offsets and calibration layout follow dekuNukem's public Joy-Con HID notes.
"""

from dataclasses import dataclass
from math import hypot


@dataclass(frozen=True)
class StickCalibration:
    center_x: int = 2048
    center_y: int = 2048
    minus_x: int = 1600
    minus_y: int = 1600
    plus_x: int = 1600
    plus_y: int = 1600


@dataclass(frozen=True)
class JoyState:
    side: str
    right_buttons: int
    shared_buttons: int
    left_buttons: int
    x: float
    y: float


@dataclass(frozen=True)
class XboxState:
    buttons: frozenset[str] = frozenset()
    lx: float = 0.0
    ly: float = 0.0
    rx: float = 0.0
    ry: float = 0.0
    lt: float = 0.0
    rt: float = 0.0


def unpack12(data: bytes) -> tuple[int, int]:
    if len(data) != 3:
        raise ValueError("a stick pair needs exactly three bytes")
    return data[0] | ((data[1] & 0x0F) << 8), (data[1] >> 4) | (data[2] << 4)


def parse_calibration(data: bytes, side: str) -> StickCalibration:
    if len(data) != 9 or side not in ("left", "right"):
        raise ValueError("invalid stick calibration")
    values = (*unpack12(data[:3]), *unpack12(data[3:6]), *unpack12(data[6:9]))
    if side == "left":
        px, py, cx, cy, mx, my = values
    else:
        cx, cy, mx, my, px, py = values
    if not (500 <= cx <= 3500 and 500 <= cy <= 3500):
        raise ValueError("invalid calibration center")
    if any(not 200 <= delta <= 2048 for delta in (mx, my, px, py)):
        raise ValueError("invalid calibration range")
    return StickCalibration(cx, cy, mx, my, px, py)


def normalize_axis(value: int, center: int, minus: int, plus: int) -> float:
    extent = plus if value >= center else minus
    return max(-1.0, min(1.0, (value - center) / extent))


def decode_report(packet: bytes, side: str, calibration: StickCalibration) -> JoyState | None:
    if side not in ("left", "right"):
        raise ValueError("side must be left or right")
    if len(packet) < 12 or packet[0] not in (0x21, 0x30, 0x31):
        return None
    raw_x, raw_y = unpack12(packet[6:9] if side == "left" else packet[9:12])
    x = normalize_axis(raw_x, calibration.center_x, calibration.minus_x, calibration.plus_x)
    y = normalize_axis(raw_y, calibration.center_y, calibration.minus_y, calibration.plus_y)
    # Radial dead zone suppresses small drift without changing the outer range.
    radius = hypot(x, y)
    if radius <= 0.12:
        x = y = 0.0
    elif radius:
        scale = min(1.0, (radius - 0.12) / (1.0 - 0.12)) / radius
        x, y = x * scale, y * scale
    return JoyState(side, packet[3], packet[4], packet[5], x, y)


def combine(left: JoyState, right: JoyState) -> XboxState:
    if left.side != "left" or right.side != "right":
        raise ValueError("expected one left and one right Joy-Con")
    lb, rb = left.left_buttons, right.right_buttons
    shared = left.shared_buttons | right.shared_buttons
    buttons: set[str] = set()
    # Match the printed Joy-Con letters to Xbox button labels.
    for mask, name in ((0x08, "A"), (0x04, "B"), (0x02, "X"), (0x01, "Y"),
                       (0x40, "RB")):
        if rb & mask:
            buttons.add(name)
    for mask, name in ((0x01, "DOWN"), (0x02, "UP"), (0x04, "RIGHT"),
                       (0x08, "LEFT"), (0x40, "LB")):
        if lb & mask:
            buttons.add(name)
    for mask, name in ((0x01, "BACK"), (0x02, "START"), (0x04, "RS"),
                       (0x08, "LS"), (0x10, "GUIDE")):
        if shared & mask:
            buttons.add(name)
    return XboxState(frozenset(buttons), left.x, left.y, right.x, right.y,
                     1.0 if lb & 0x80 else 0.0, 1.0 if rb & 0x80 else 0.0)
