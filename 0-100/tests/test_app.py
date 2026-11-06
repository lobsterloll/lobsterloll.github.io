"""Regression checks for reusing speed readings without losing input or timestamps."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from PIL import Image

from app import Overlay
from timer import TARGETS, TimerState


class CachedReadingTests(unittest.TestCase):
    def setUp(self):
        self.overlay = Overlay.__new__(Overlay)
        app = self.overlay
        app.capture_generation = 0
        app.capture_rate = app.displayed_capture_rate = 120
        app.root = MagicMock()
        app.fps_label = object()
        app.last_speed_pixels = app.last_speed_reading = None
        app.reference = Image.new("1", (2, 2))
        app.zero_size = None
        app.state = TimerState()
        app.last_clock_draw = 0
        app.show_text = MagicMock()
        app.status_label = MagicMock()
        app.time_label = object()
        app.split_labels = {target: MagicMock() for target in TARGETS}
        app.best_labels = {target: object() for target in TARGETS}
        app.split_highlight = {target: False for target in TARGETS}
        app.save_worker = MagicMock()
        app.save_settings = MagicMock()

    def test_identical_pixels_still_process_w_and_each_split_timestamp(self):
        app = self.overlay
        zero = Image.new("RGB", (2, 2), "black")
        shape = Image.new("1", (2, 2))
        with patch("app.speed_shape", return_value=shape) as read_shape, \
                patch("app.is_zero", side_effect=[True, False, False, False]), \
                patch("app.speed_hundreds", side_effect=[0, 1, 2, 3]):
            app.process_frame((zero, 1.0, False, 0))
            app.process_frame((zero.copy(), 2.0, False, 0))
            app.process_frame((zero.copy(), 3.0, True, 0))
            self.assertEqual(app.state.started, 3.0)
            for index, color in enumerate(("red", "green", "blue"), start=4):
                frame = Image.new("RGB", (2, 2), color)
                app.process_frame((frame, float(index), True, 0))
                app.process_frame((frame.copy(), index + 0.25, True, 0))
            self.assertEqual(read_shape.call_count, 4)
        self.assertEqual(app.state.splits, {100: 1.0, 200: 2.0, 300: 3.0})
        self.assertEqual(app.state.status, "FINISHED")

    def test_new_region_invalidates_cache_and_discards_old_frames(self):
        app = self.overlay
        pixels = Image.new("RGB", (2, 2), "black")
        with patch("app.speed_shape", return_value=None) as read_shape, \
                patch("app.is_zero", return_value=False), \
                patch("app.speed_hundreds", return_value=0):
            app.process_frame((pixels, 1, False, 0))
            app.capture_generation = 1
            app.process_frame((pixels, 2, False, 0))
            self.assertEqual(read_shape.call_count, 1)
            app.process_frame((pixels, 3, False, 1))
            self.assertEqual(read_shape.call_count, 2)

    def test_capture_rate_appears_inside_window_instead_of_title(self):
        app = self.overlay
        app.capture_rate = 117
        app.displayed_capture_rate = 0
        with patch("app.speed_shape", return_value=None), \
                patch("app.is_zero", return_value=False), \
                patch("app.speed_hundreds", return_value=0):
            app.process_frame((Image.new("RGB", (2, 2)), 1, False, 0))
        app.show_text.assert_any_call(app.fps_label, "117 fps")
        app.root.title.assert_not_called()


class RunHistoryTests(unittest.TestCase):
    def setUp(self):
        self.overlay = Overlay.__new__(Overlay)
        self.overlay.root = MagicMock()
        self.overlay.state = TimerState()
        self.overlay.region = [1, 2, 3, 4]
        self.overlay.history = []

    def test_save_run_keeps_reached_splits_and_vehicle_name(self):
        app = self.overlay
        app.state.splits[100] = 2.34567
        app.state.splits[200] = 5.1
        with tempfile.TemporaryDirectory() as folder:
            settings = Path(folder) / "settings.json"
            with patch("app.SETTINGS", settings), \
                    patch("app.simpledialog.askstring", return_value="  Lotus Emira  "), \
                    patch("app.messagebox.showinfo"):
                app.save_run()
                saved = app.load_settings()
        self.assertEqual(saved["history"][0]["vehicle"], "Lotus Emira")
        self.assertEqual(saved["history"][0]["times"], {"100": 2.346, "200": 5.1})
        self.assertEqual(len(app.history), 1)

    def test_save_run_requires_a_time_and_vehicle_name(self):
        app = self.overlay
        with patch("app.simpledialog.askstring", return_value=None) as ask, \
                patch("app.messagebox.showinfo"):
            app.save_run()
            ask.assert_not_called()
            app.state.splits[100] = 3.0
            app.save_run()
        self.assertEqual(app.history, [])


if __name__ == "__main__":
    unittest.main()
