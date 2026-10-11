"""Speed reading and run state for the Driving Empire acceleration timer."""

from dataclasses import dataclass, field
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageChops

# The speedometer crop is tiny; OpenCV's worker pool costs more than it saves.
cv2.setNumThreads(1)


REFERENCE = Path(__file__).with_name("zero-template.png")
BRIGHT = [255 if value > 165 else 0 for value in range(256)]
NEUTRAL = [255 if value < 70 else 0 for value in range(256)]


def white_mask(image: Image.Image) -> Image.Image:
    red, green, blue = image.convert("RGB").split()
    darkest = ImageChops.darker(ImageChops.darker(red, green), blue)
    lightest = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    bright = darkest.point(BRIGHT)
    neutral = ImageChops.subtract(lightest, darkest).point(NEUTRAL)
    return ImageChops.multiply(bright, neutral).convert("1")


def speed_shape(image: Image.Image):
    """Return full-height speed digits while discarding small HUD details."""
    mask = white_mask(image)
    width, height = mask.size
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        np.asarray(mask, dtype=np.uint8), connectivity=8)
    min_height = max(14, round(height * 0.45))
    digits = [(label, int(x), int(y), int(x + w), int(y + h))
              for label, (x, y, w, h, area) in enumerate(stats[1:], 1)
              if h >= min_height and w >= 5 and area >= min_height * 2]
    if not digits:
        return None
    tallest = max(digits, key=lambda component: component[4] - component[2])
    height = tallest[4] - tallest[2]
    center = (tallest[2] + tallest[4]) / 2
    digits = [component for component in digits
              if component[4] - component[2] >= height * 0.70
              and abs((component[2] + component[4]) / 2 - center) <= height * 0.25]
    digits.sort(key=lambda component: component[1])
    speed_digits = [digits[-1]]
    max_gap = max(6, round((digits[-1][4] - digits[-1][2]) * 0.30))
    for component in reversed(digits[:-1]):
        if speed_digits[-1][1] - component[3] > max_gap:
            break
        speed_digits.append(component)
    digits = speed_digits
    keep = np.zeros(count, dtype=np.uint8)
    keep[[component[0] for component in digits]] = 255
    cleaned = Image.fromarray(keep[labels]).convert("1")
    return cleaned.crop((min(component[1] for component in digits),
                         min(component[2] for component in digits),
                         max(component[3] for component in digits),
                         max(component[4] for component in digits)))


def is_zero(shape: Image.Image | None, reference: Image.Image) -> bool:
    if shape is None:
        return False
    ratio = shape.width / shape.height
    ref_ratio = reference.width / reference.height
    if not 0.65 * ref_ratio <= ratio <= 1.35 * ref_ratio:
        return False
    sample = shape.resize(reference.size, Image.Resampling.NEAREST)
    a = sample.load()
    b = reference.load()
    intersection = union = 0
    for y in range(reference.height):
        for x in range(reference.width):
            one, two = bool(a[x, y]), bool(b[x, y])
            intersection += one and two
            union += one or two
    return union > 0 and intersection / union >= 0.67


def speed_glyphs(shape: Image.Image | None, reference: Image.Image,
                 zero_size: tuple[int, int] | None = None):
    """Return three validated speed glyphs, or an empty list below 100."""
    if shape is None:
        return []
    # Require three separate full-height glyphs. Overall width alone can
    # mistake two digits plus unrelated white HUD pixels for 100.
    width, height = zero_size or reference.size
    pixels = shape.load()
    active = [sum(bool(pixels[x, y]) for y in range(shape.height)) >= 3
              for x in range(shape.width)]
    groups = []
    start = None
    for x, on in enumerate(active + [False]):
        if on and start is None:
            start = x
        elif not on and start is not None:
            groups.append((start, x))
            start = None
    if len(groups) != 3:
        return []
    heights = []
    for left, right in groups:
        rows = [y for y in range(shape.height)
                if any(pixels[x, y] for x in range(left, right))]
        heights.append(rows[-1] - rows[0] + 1 if rows else 0)
    if any(not 0.75 <= glyph_height / height <= 1.30 for glyph_height in heights):
        return []
    if not all(0.20 <= (right - left) / width <= 1.35
               for left, right in groups):
        return []
    return [shape.crop((left, 0, right, shape.height)) for left, right in groups]


def at_least_100(shape: Image.Image | None, reference: Image.Image,
                 zero_size: tuple[int, int] | None = None) -> bool:
    return bool(speed_glyphs(shape, reference, zero_size))


def speed_hundreds(shape: Image.Image | None, reference: Image.Image,
                   zero_size: tuple[int, int] | None = None) -> int:
    """Classify the leading HUD digit as 1, 2, or at least 3."""
    glyphs = speed_glyphs(shape, reference, zero_size)
    if not glyphs:
        return 0
    first = glyphs[0]
    typical_width = (glyphs[1].width + glyphs[2].width) / 2
    # Comparing only with the next two glyphs fails on 111: all three are
    # equally narrow. Compare with the calibrated 0 glyph as well.
    zero_aspect = reference.width / reference.height
    if (first.width < typical_width * 0.72
            or first.width / first.height < zero_aspect * 0.64):
        return 1

    # A 2 has a descending stroke through the lower-left middle of its
    # glyph. A 3 leaves that area empty until the bottom curve begins.
    left = max(0, round(first.width * 0.08))
    right = max(left + 1, round(first.width * 0.48))
    top = round(first.height * 0.55)
    bottom = max(top + 1, round(first.height * 0.69))
    pixels = first.load()
    ink = sum(bool(pixels[x, y]) for y in range(top, bottom)
              for x in range(left, right))
    return 2 if ink / ((right - left) * (bottom - top)) >= 0.08 else 3


TARGETS = (100, 200, 300)


@dataclass
class TimerState:
    status: str = "READY"
    started: float | None = None
    elapsed: float = 0.0
    splits: dict[int, float | None] = field(
        default_factory=lambda: {target: None for target in TARGETS})
    bests: dict[int, float | None] = field(
        default_factory=lambda: {target: None for target in TARGETS})
    zero_frames: int = 0
    zero_misses: int = 0
    w_was_down: bool = False

    def reset(self, w_down: bool = False, zero: bool = False):
        self.status = "ARMED" if zero else "READY"
        self.started = None
        self.elapsed = 0.0
        self.splits = {target: None for target in TARGETS}
        self.zero_frames = 2 if zero else 0
        self.zero_misses = 0
        self.w_was_down = w_down

    def update(self, now: float, w: bool, zero: bool, hundreds: int):
        w_pressed = w and not self.w_was_down
        if self.status in ("READY", "ARMED"):
            if zero:
                self.zero_frames = min(self.zero_frames + 1, 2)
                self.zero_misses = 0
            else:
                self.zero_misses += 1
                if self.zero_misses >= 3:
                    self.zero_frames = 0
                    self.status = "READY"
            if self.zero_frames >= 2:
                self.status = "ARMED"
            if w_pressed and (zero or self.status == "ARMED"):
                self.started = now
                self.status = "RUNNING"
                self.zero_frames = 0
                self.zero_misses = 0
        elif self.status == "RUNNING":
            self.elapsed = now - self.started
            for target in TARGETS:
                if hundreds * 100 >= target and self.splits[target] is None:
                    self.splits[target] = self.elapsed
                    if self.bests[target] is None or self.elapsed < self.bests[target]:
                        self.bests[target] = self.elapsed
            if self.splits[300] is not None:
                self.status = "FINISHED"
        self.w_was_down = w
