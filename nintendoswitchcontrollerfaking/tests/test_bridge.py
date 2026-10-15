import unittest
from types import SimpleNamespace

from joybridge.hardware import DeviceChoice, JoyCon, discover
from joybridge.output import send_state
from joybridge.protocol import (
    JoyState, StickCalibration, XboxState, combine, decode_report,
    parse_calibration, unpack12,
)


def pack12(x, y):
    return bytes((x & 255, ((x >> 8) & 15) | ((y & 15) << 4), y >> 4))


class ProtocolTests(unittest.TestCase):
    def test_stick_and_factory_calibration_layouts(self):
        self.assertEqual(unpack12(pack12(0x79F, 0x8A0)), (0x79F, 0x8A0))
        left = pack12(1200, 1100) + pack12(1951, 2208) + pack12(1250, 1150)
        right = pack12(1951, 2208) + pack12(1250, 1150) + pack12(1200, 1100)
        self.assertEqual(parse_calibration(left, "left"), parse_calibration(right, "right"))
        with self.assertRaises(ValueError):
            parse_calibration(b"\xff" * 9, "left")

    def test_full_reports_decode_and_dead_zone(self):
        cal = StickCalibration(2000, 2000, 1000, 1000, 1000, 1000)
        left = bytearray(49)
        left[0], left[5] = 0x30, 0x88  # left + ZL
        left[6:9] = pack12(1000, 3000)
        state = decode_report(left, "left", cal)
        self.assertEqual(state.left_buttons, 0x88)
        self.assertAlmostEqual(state.x, -0.7071, places=3)
        self.assertAlmostEqual(state.y, 0.7071, places=3)
        left[6:9] = pack12(2050, 1980)
        self.assertEqual((decode_report(left, "left", cal).x, decode_report(left, "left", cal).y), (0, 0))
        self.assertIsNone(decode_report(b"\x3f" + bytes(20), "left", cal))

    def test_pair_maps_matching_face_labels_and_digital_triggers(self):
        left = JoyState("left", 0, 0x09, 0xCA, -0.5, 0.25)
        right = JoyState("right", 0xCC, 0x16, 0, 0.5, -0.25)
        out = combine(left, right)
        self.assertEqual(out.buttons, frozenset({"A", "B", "LB", "RB", "LEFT", "UP", "BACK", "START", "LS", "RS", "GUIDE"}))
        self.assertEqual((out.lx, out.ly, out.rx, out.ry, out.lt, out.rt), (-0.5, 0.25, 0.5, -0.25, 1, 1))
        for mask, letter in ((0x08, "A"), (0x04, "B"), (0x02, "X"), (0x01, "Y")):
            one_button = JoyState("right", mask, 0, 0, 0, 0)
            self.assertEqual(combine(JoyState("left", 0, 0, 0, 0, 0), one_button).buttons, frozenset({letter}))


class FakeDevice:
    def __init__(self, reports):
        self.reports = list(reports)
        self.writes = []

    def open_path(self, path):
        self.path = path

    def write(self, packet):
        self.writes.append(packet)
        return len(packet)

    def read(self, size, timeout):
        return self.reports.pop(0) if self.reports else []

    def close(self):
        pass


class HardwareTests(unittest.TestCase):
    def test_discovery_filters_original_left_and_right_products(self):
        entries = [
            {"vendor_id": 0x057E, "product_id": 0x2006, "path": b"left", "product_string": "Joy-Con (L)"},
            {"vendor_id": 0x057E, "product_id": 0x2007, "path": b"right", "product_string": "Joy-Con (R)"},
            {"vendor_id": 0x057E, "product_id": 0x2009, "path": b"pro"},
        ]
        found = discover(SimpleNamespace(enumerate=lambda vendor: entries))
        self.assertEqual([x.path for x in found["left"]], [b"left"])
        self.assertEqual([x.path for x in found["right"]], [b"right"])

    def test_initialization_reads_calibration_without_spi_write(self):
        mode_reply = bytearray(64)
        mode_reply[0], mode_reply[13], mode_reply[14] = 0x21, 0x80, 0x03
        spi_reply = bytearray(64)
        spi_reply[0], spi_reply[13], spi_reply[14] = 0x21, 0x90, 0x10
        spi_reply[15:19] = (0x603D).to_bytes(4, "little")
        spi_reply[19] = 9
        spi_reply[20:29] = pack12(1200, 1100) + pack12(1951, 2208) + pack12(1250, 1150)
        device = FakeDevice([mode_reply, spi_reply])
        joycon = JoyCon(SimpleNamespace(device=lambda: device), DeviceChoice("left", b"left", "L"))
        self.assertIn("loaded", joycon.initialize())
        self.assertEqual(device.writes[0][10:12], b"\x03\x30")
        self.assertEqual(device.writes[1][10], 0x10)
        self.assertEqual(device.writes[1][11:15], (0x603D).to_bytes(4, "little"))
        self.assertEqual(joycon.calibration.center_x, 1951)


class FakePad:
    def __init__(self):
        self.pressed = []
        self.axes = []
        self.updated = False

    def reset(self):
        self.pressed = []

    def press_button(self, button):
        self.pressed.append(button)

    def left_trigger_float(self, value_float):
        self.axes.append(("lt", value_float))

    def right_trigger_float(self, value_float):
        self.axes.append(("rt", value_float))

    def left_joystick_float(self, x_value_float, y_value_float):
        self.axes.append(("left", x_value_float, y_value_float))

    def right_joystick_float(self, x_value_float, y_value_float):
        self.axes.append(("right", x_value_float, y_value_float))

    def update(self):
        self.updated = True


class OutputTests(unittest.TestCase):
    def test_output_resets_previous_inputs_and_sends_one_report(self):
        constants = SimpleNamespace(XUSB_GAMEPAD_A=1, XUSB_GAMEPAD_DPAD_UP=2)
        pad = FakePad()
        pad.pressed = [999]
        send_state(pad, SimpleNamespace(XUSB_BUTTON=constants), XboxState(frozenset({"A", "UP"}), lx=0.4, rt=1))
        self.assertEqual(set(pad.pressed), {1, 2})
        self.assertIn(("left", 0.4, 0.0), pad.axes)
        self.assertIn(("rt", 1), pad.axes)
        self.assertTrue(pad.updated)


if __name__ == "__main__":
    unittest.main()
