from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from timer import speed_shape


shape = speed_shape(Image.open(Path(__file__).parents[1] / "sample-fast-trigger.png"))
active = [any(shape.getpixel((x, y)) for y in range(shape.height)) for x in range(shape.width)]
groups = []
start = None
for x, on in enumerate(active + [False]):
    if on and start is None:
        start = x
    elif not on and start is not None:
        groups.append((start, x))
        start = None
print("shape", shape.size, "groups", groups)
for index, (left, right) in enumerate(groups):
    glyph = shape.crop((left, 0, right, shape.height))
    print("glyph", index, glyph.size)
    scaled = glyph.resize((12, 16), Image.Resampling.NEAREST)
    for y in range(16):
        print("".join("#" if scaled.getpixel((x, y)) else " " for x in range(12)))

for font_name in ("arialbd.ttf", "seguisb.ttf", "verdanab.ttf"):
    font = ImageFont.truetype(str(Path("C:/Windows/Fonts") / font_name), 44)
    print("font", font_name)
    for digit in "123":
        canvas = Image.new("L", (60, 60))
        ImageDraw.Draw(canvas).text((0, 0), digit, font=font, fill=255)
        bbox = canvas.getbbox()
        glyph = canvas.crop(bbox).resize((12, 16), Image.Resampling.NEAREST)
        print(digit)
        for y in range(16):
            print("".join("#" if glyph.getpixel((x, y)) > 127 else " " for x in range(12)))
        lower_left = sum(glyph.getpixel((x, y)) > 127 for y in range(9, 14) for x in range(1, 6))
        print("lower_left", lower_left)
        print("diag", [sum(glyph.getpixel((x, y)) > 127 for x in range(1, 6)) for y in range(8, 13)])
