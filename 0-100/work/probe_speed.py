from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from timer import REFERENCE, speed_hundreds, speed_shape

reference = Image.open(REFERENCE).convert("1")
for font_name in ("arialbd.ttf", "seguisb.ttf", "verdanab.ttf"):
    font = ImageFont.truetype(str(Path("C:/Windows/Fonts") / font_name), 52)
    for speed in (100, 126, 200, 249, 300, 350):
        image = Image.new("RGB", (190, 80))
        ImageDraw.Draw(image).text((5, 5), str(speed), font=font, fill="white")
        shape = speed_shape(image)
        print(font_name, speed, shape.size if shape else None,
              speed_hundreds(shape, reference))

sample = Image.open(Path(__file__).parents[1] / "sample-fast-trigger.png")
shape = speed_shape(sample)
print("real sample", speed_hundreds(shape, reference))
