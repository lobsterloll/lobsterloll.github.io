"""One ViGEm Xbox 360 target, exposed through vgamepad."""

from .protocol import XboxState


def send_state(pad, vg, state: XboxState) -> None:
    names = {
        "A": "XUSB_GAMEPAD_A", "B": "XUSB_GAMEPAD_B",
        "X": "XUSB_GAMEPAD_X", "Y": "XUSB_GAMEPAD_Y",
        "LB": "XUSB_GAMEPAD_LEFT_SHOULDER", "RB": "XUSB_GAMEPAD_RIGHT_SHOULDER",
        "BACK": "XUSB_GAMEPAD_BACK", "START": "XUSB_GAMEPAD_START",
        "LS": "XUSB_GAMEPAD_LEFT_THUMB", "RS": "XUSB_GAMEPAD_RIGHT_THUMB",
        "GUIDE": "XUSB_GAMEPAD_GUIDE",
        "UP": "XUSB_GAMEPAD_DPAD_UP", "DOWN": "XUSB_GAMEPAD_DPAD_DOWN",
        "LEFT": "XUSB_GAMEPAD_DPAD_LEFT", "RIGHT": "XUSB_GAMEPAD_DPAD_RIGHT",
    }
    pad.reset()
    for name in state.buttons:
        pad.press_button(button=getattr(vg.XUSB_BUTTON, names[name]))
    pad.left_trigger_float(value_float=state.lt)
    pad.right_trigger_float(value_float=state.rt)
    pad.left_joystick_float(x_value_float=state.lx, y_value_float=state.ly)
    pad.right_joystick_float(x_value_float=state.rx, y_value_float=state.ry)
    pad.update()
