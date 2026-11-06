"""Create original, tileable pixel art for Stonefield's interface."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASES = [
    (83, 88, 86),    # dark stone panel
    (151, 155, 151), # raised stone frame
    (48, 53, 52),    # inset well
    (90, 142, 67),   # moss button
    (174, 177, 169), # stone button
    (104, 76, 51),   # earth trim
    (117, 139, 113), # muted header
    (216, 183, 75),  # selected slot
    (116, 84, 55),   # timber
    (59, 67, 64),    # slate
]


def main():
    atlas = Image.new("RGBA", (16 * len(BASES), 16))
    for tile, base in enumerate(BASES):
        for y in range(16):
            for x in range(16):
                n = (x * 37 + y * 61 + x * y * 13 + tile * 43) % 13 - 6
                if tile in (0, 1, 2, 4, 9):
                    n += -6 if (x + 3 * y + tile) % 13 < 2 else 0
                    n += 5 if (x * 5 + y * 7) % 17 == 0 else 0
                if tile in (3, 6):
                    n += 6 if (x * 3 + y * 5) % 11 < 3 else 0
                if tile in (5, 8):
                    n += 6 if x % 5 == 0 else -2
                if tile == 7:
                    n += 6 if (x + y) % 6 == 0 else 0
                if tile == 2:
                    n //= 3
                color = tuple(max(0, min(255, channel + n)) for channel in base)
                atlas.putpixel((tile * 16 + x, y), (*color, 255))
    out = ROOT / "assets"
    atlas.save(out / "ui_atlas.png")
    (out / "ui_atlas.rgba").write_bytes(atlas.tobytes())
    print("Generated 10 original UI texture tiles")


if __name__ == "__main__":
    main()
