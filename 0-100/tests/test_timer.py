import unittest
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from timer import (REFERENCE, TimerState, at_least_100, is_zero, speed_glyphs,
                   speed_hundreds, speed_shape)


HERE = Path(__file__).parent / "fixtures"


class CalibrationTests(unittest.TestCase):
    def setUp(self):
        self.reference = Image.open(REFERENCE).convert("1")

    def test_uploaded_hud_shows_zero(self):
        sample = Image.open(HERE / "sample-hud.png")
        # The fixture begins at (1200, 680) in the uploaded screenshot.
        shape = speed_shape(sample.crop((15, 14, 169, 63)))
        self.assertEqual(shape.size, (35, 42))
        self.assertTrue(is_zero(shape, self.reference))
        self.assertFalse(at_least_100(shape, self.reference))

    def test_zero_with_bright_road_inside_capture_area(self):
        sample = Image.open(HERE / "sample-zero-obstructed.png")
        shape = speed_shape(sample)
        self.assertEqual(shape.size, (35, 42))
        self.assertTrue(is_zero(shape, self.reference))

    def test_zero_with_road_overlapping_speedometer(self):
        # These crops come from the two reported Driving Empire screenshots.
        for name in ("sample-zero-road-nearby.png", "sample-zero-road-blended.png"):
            with self.subTest(name=name):
                shape = speed_shape(Image.open(HERE / name), self.reference)
                self.assertIsNotNone(shape)
                self.assertTrue(is_zero(shape, self.reference))

    def test_bright_map_patch_does_not_replace_speed_digits(self):
        for name, hundreds in (("sample-zero-obstructed.png", 0),
                               ("sample-fast-trigger.png", 1),
                               ("sample-304.png", 3)):
            with self.subTest(name=name):
                sample = Image.open(HERE / name).convert("RGB")
                frame = Image.new("RGB", (sample.width + 75, sample.height))
                frame.paste(sample, (0, 0))
                ImageDraw.Draw(frame).polygon(
                    ((sample.width + 10, 0), (sample.width + 74, 0),
                     (sample.width + 74, sample.height - 1),
                     (sample.width + 30, sample.height - 1)), fill="white")
                shape = speed_shape(frame, self.reference)
                self.assertIsNotNone(shape)
                if hundreds == 0:
                    self.assertTrue(is_zero(shape, self.reference))
                else:
                    self.assertEqual(speed_hundreds(shape, self.reference), hundreds)

    def test_three_digits_with_leading_one(self):
        three_digits = Image.new("1", (99, 42))
        three_digits.paste(Image.new("1", (12, 42), 1), (0, 0))
        three_digits.paste(self.reference, (25, 0))
        three_digits.paste(self.reference, (64, 0))
        self.assertTrue(at_least_100(speed_shape(three_digits.convert("RGB")), self.reference))
        two_digits = Image.new("1", (75, 42))
        two_digits.paste(self.reference, (0, 0))
        two_digits.paste(self.reference, (40, 0))
        self.assertFalse(at_least_100(speed_shape(two_digits.convert("RGB")), self.reference))
        misleading_width = Image.new("1", (110, 42))
        misleading_width.paste(self.reference, (0, 0))
        misleading_width.paste(self.reference, (75, 0))
        self.assertFalse(at_least_100(speed_shape(misleading_width.convert("RGB")), self.reference))

    def test_three_digits_even_when_first_is_wide(self):
        three_digits = Image.new("1", (115, 42))
        for left in (0, 40, 80):
            three_digits.paste(self.reference, (left, 0))
        self.assertTrue(at_least_100(speed_shape(three_digits.convert("RGB")), self.reference))

    def test_real_fast_run_trigger(self):
        sample = Image.open(HERE / "sample-fast-trigger.png")
        self.assertTrue(at_least_100(speed_shape(sample), self.reference))
        self.assertEqual(speed_hundreds(speed_shape(sample), self.reference), 1)

    def test_real_111_is_still_below_200(self):
        sample = Image.open(HERE / "sample-111-false-200.png")
        # This fixture may be saved vertically by Windows Photo Viewer.
        if sample.height > sample.width:
            sample = sample.transpose(Image.Transpose.ROTATE_90)
        self.assertEqual(speed_hundreds(speed_shape(sample), self.reference), 1)

    def test_real_304_reaches_300(self):
        sample = Image.open(HERE / "sample-304.png")
        self.assertEqual(speed_hundreds(speed_shape(sample), self.reference), 3)

    def test_speed_band_separates_100_200_and_300(self):
        for font_name in ("arialbd.ttf", "seguisb.ttf"):
            font = ImageFont.truetype(f"C:/Windows/Fonts/{font_name}", 52)
            for speed, hundreds in ((126, 1), (249, 2), (350, 3)):
                with self.subTest(font=font_name, speed=speed):
                    image = Image.new("RGB", (190, 80))
                    ImageDraw.Draw(image).text((5, 5), str(speed),
                                               font=font, fill="white")
                    self.assertEqual(speed_hundreds(speed_shape(image), self.reference),
                                     hundreds)

    def test_200_with_the_games_actual_two_glyph(self):
        sample = Image.open(HERE / "sample-fast-trigger.png")
        shape = speed_shape(sample)
        actual_two = speed_glyphs(shape, self.reference)[1]
        zero = self.reference.resize((round(self.reference.width * actual_two.height
                                            / self.reference.height), actual_two.height),
                                     Image.Resampling.NEAREST)
        image = Image.new("1", (actual_two.width + 2 * zero.width + 14,
                                actual_two.height))
        image.paste(actual_two, (0, 0))
        image.paste(zero, (actual_two.width + 7, 0))
        image.paste(zero, (actual_two.width + zero.width + 14, 0))
        self.assertEqual(speed_hundreds(speed_shape(image.convert("RGB")),
                                        self.reference, self.reference.size), 2)


class TimerTests(unittest.TestCase):
    def test_press_w_at_zero_records_three_splits_and_keeps_bests(self):
        timer = TimerState()
        timer.update(1.0, False, True, 0)
        self.assertEqual(timer.status, "READY")
        timer.update(1.1, False, True, 0)
        self.assertEqual(timer.status, "ARMED")
        timer.update(1.2, True, True, 0)
        self.assertEqual(timer.status, "RUNNING")
        timer.update(4.32, True, False, 1)
        self.assertEqual(timer.status, "RUNNING")
        self.assertAlmostEqual(timer.splits[100], 3.12)
        self.assertIsNone(timer.splits[200])
        timer.update(6.2, True, False, 2)
        self.assertAlmostEqual(timer.splits[200], 5.0)
        timer.update(8.2, True, False, 3)
        self.assertEqual(timer.status, "FINISHED")
        self.assertAlmostEqual(timer.splits[300], 7.0)
        self.assertAlmostEqual(timer.bests[100], 3.12)
        timer.reset()
        self.assertIsNone(timer.splits[100])
        self.assertAlmostEqual(timer.bests[100], 3.12)
        self.assertAlmostEqual(timer.bests[200], 5.0)
        self.assertAlmostEqual(timer.bests[300], 7.0)

    def test_speed_jump_records_all_crossed_targets_once(self):
        timer = TimerState()
        timer.update(1, True, True, 0)
        timer.update(2, True, False, 1)
        timer.update(3, True, False, 3)
        self.assertEqual(timer.splits, {100: 1, 200: 2, 300: 2})
        timer.update(4, True, False, 3)
        self.assertEqual(timer.splits[300], 2)

    def test_w_held_during_record_again_needs_new_press(self):
        timer = TimerState()
        timer.reset(w_down=True, zero=True)
        timer.update(1, True, True, 0)
        self.assertEqual(timer.status, "ARMED")
        timer.update(2, False, True, 0)
        timer.update(3, True, True, 0)
        self.assertEqual(timer.status, "RUNNING")

    def test_w_does_not_start_away_from_zero(self):
        timer = TimerState()
        timer.update(1, True, False, 0)
        self.assertEqual(timer.status, "READY")

    def test_first_w_press_at_zero_starts(self):
        timer = TimerState()
        timer.update(1, True, True, 0)
        self.assertEqual(timer.status, "RUNNING")

    def test_first_three_digit_frame_records_100_only(self):
        timer = TimerState()
        timer.update(1, False, True, 0)
        timer.update(2, False, True, 0)
        timer.update(3, True, False, 0)
        timer.update(4, True, False, 1)
        self.assertEqual(timer.status, "RUNNING")
        self.assertEqual(timer.splits[100], 1)
        self.assertIsNone(timer.splits[200])


if __name__ == "__main__":
    unittest.main()
