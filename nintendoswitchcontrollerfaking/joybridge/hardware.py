"""Windows Bluetooth HID transport for original Switch Joy-Cons."""

from dataclasses import dataclass
from time import monotonic

from .protocol import StickCalibration, decode_report, parse_calibration

VENDOR_ID = 0x057E
PRODUCT_IDS = {"left": 0x2006, "right": 0x2007}
NEUTRAL_RUMBLE = bytes.fromhex("00 01 40 40 00 01 40 40")


@dataclass(frozen=True)
class DeviceChoice:
    side: str
    path: bytes
    label: str


def discover(hid_module) -> dict[str, list[DeviceChoice]]:
    found: dict[str, list[DeviceChoice]] = {"left": [], "right": []}
    for entry in hid_module.enumerate(VENDOR_ID):
        for side, product_id in PRODUCT_IDS.items():
            if entry.get("product_id") == product_id and entry.get("path"):
                label = entry.get("product_string") or f"Joy-Con ({side[0].upper()})"
                found[side].append(DeviceChoice(side, entry["path"], label))
    return found


class JoyCon:
    def __init__(self, hid_module, choice: DeviceChoice):
        self.side = choice.side
        self.device = hid_module.device()
        self.device.open_path(choice.path)
        self.packet_number = 0
        self.calibration = StickCalibration()

    def close(self):
        self.device.close()

    def send_subcommand(self, command: int, data: bytes = b"") -> None:
        if len(data) > 53:
            raise ValueError("subcommand payload too long")
        report = bytearray(64)
        report[0] = 0x01
        report[1] = self.packet_number
        self.packet_number = (self.packet_number + 1) & 0x0F
        report[2:10] = NEUTRAL_RUMBLE
        report[10] = command
        report[11:11 + len(data)] = data
        written = self.device.write(bytes(report))
        if written <= 0:
            raise OSError("Joy-Con output report failed")

    def await_reply(self, command: int, seconds: float = 2.0) -> bytes:
        deadline = monotonic() + seconds
        while monotonic() < deadline:
            packet = bytes(self.device.read(64, 100))
            if len(packet) >= 15 and packet[0] == 0x21 and packet[14] == command:
                if not packet[13] & 0x80:
                    raise OSError(f"Joy-Con rejected subcommand 0x{command:02x}")
                return packet
        raise TimeoutError(f"Joy-Con did not acknowledge subcommand 0x{command:02x}")

    def read_spi(self, address: int, length: int) -> bytes:
        if not 1 <= length <= 0x1D:
            raise ValueError("SPI read length must be 1–29")
        self.send_subcommand(0x10, address.to_bytes(4, "little") + bytes([length]))
        reply = self.await_reply(0x10)
        if len(reply) < 20 + length or reply[15:19] != address.to_bytes(4, "little") or reply[19] != length:
            raise OSError("unexpected Joy-Con calibration reply")
        return reply[20:20 + length]

    def initialize(self) -> str:
        self.send_subcommand(0x03, b"\x30")  # Standard full reports at 60 Hz.
        self.await_reply(0x03)
        address = 0x603D if self.side == "left" else 0x6046
        try:
            self.calibration = parse_calibration(self.read_spi(address, 9), self.side)
            return "factory stick calibration loaded"
        except (TimeoutError, OSError, ValueError):
            return "factory calibration unavailable; using approximate stick range"

    def read_state(self):
        packet = bytes(self.device.read(64, 100))
        return decode_report(packet, self.side, self.calibration)
