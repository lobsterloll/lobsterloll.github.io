"""Original animated 1280x720 source, sent through the real TCP receiver."""
import argparse
import io
import socket
import time
from PIL import Image, ImageDraw
from protocol import JPEG, encode


def run(host='127.0.0.1', port=6970, frames=0):
    with socket.create_connection((host, port), timeout=5) as stream:
        start = time.monotonic()
        index = 0
        while not frames or index < frames:
            image = Image.new('RGB', (1280, 720), '#101b2b')
            draw = ImageDraw.Draw(image)
            for x in range(0, 1280, 80):
                draw.line((x, 0, x, 720), fill='#203149')
            x = (index * 12) % 1160
            draw.rounded_rectangle((x, 290, x + 120, 410), radius=24, fill='#52e0b0')
            draw.text((45, 45), 'LaptopLink | SIMULATED SOURCE | 1280 x 720 / 30 fps', fill='white', font_size=30)
            draw.text((45, 100), f'Frame {index}   Elapsed {time.monotonic() - start:.1f}s', fill='white', font_size=24)
            buffer = io.BytesIO()
            image.save(buffer, 'JPEG', quality=80)
            stream.sendall(encode(JPEG, index, int((time.monotonic() - start) * 1e6), buffer.getvalue()))
            index += 1
            time.sleep(max(0, start + index / 30 - time.monotonic()))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=6970)
    parser.add_argument('--frames', type=int, default=0)
    args = parser.parse_args()
    run(args.host, args.port, args.frames)
