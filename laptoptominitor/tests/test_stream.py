import io
import socket
import threading
import time
import unittest
import urllib.request
import json
from http.server import ThreadingHTTPServer
import av
from PIL import Image
from protocol import HEADER, JPEG, H264, encode, receive
from receiver import Receiver
from simulator import run


class ProtocolTests(unittest.TestCase):
    def test_fragmented_tcp_and_truncation(self):
        left, right = socket.socketpair()
        with left, right:
            record = encode(JPEG, 3, 99, b'payload')
            def fragmented():
                for value in record:
                    left.sendall(bytes([value]))
                left.shutdown(socket.SHUT_WR)
            worker = threading.Thread(target=fragmented)
            worker.start()
            self.assertEqual(receive(right), (JPEG, 3, 99, b'payload'))
            with self.assertRaises(EOFError):
                receive(right)
            worker.join()

    def test_reject_header_before_reading_payload(self):
        for magic, size in [(b'BAD!', 10), (b'LLNK', 2097153), (b'LLNK', 0)]:
            left, right = socket.socketpair()
            with left, right:
                left.sendall(HEADER.pack(magic, 1, JPEG, 0, 0, 0, size))
                with self.assertRaises(ValueError):
                    receive(right)


class IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.receiver = Receiver()
        cls.listener = socket.socket()
        cls.listener.bind(('127.0.0.1', 0))
        cls.listener.listen(1)
        cls.port = cls.listener.getsockname()[1]
        threading.Thread(target=cls.receiver.ingest, args=(cls.listener,), daemon=True).start()
        cls.web = ThreadingHTTPServer(('127.0.0.1', 0), cls.receiver.handler())
        threading.Thread(target=cls.web.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.web.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.web.shutdown()
        cls.web.server_close()

    def wait_frames(self, target):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if self.receiver.status['frames'] >= target:
                return
            time.sleep(.02)
        self.fail(str(self.receiver.status))

    def test_stream_reconnect_and_h264(self):
        run(port=self.port, frames=12)
        self.wait_frames(12)
        with urllib.request.urlopen(self.url + '/status', timeout=5) as response:
            status = json.load(response)
        self.assertEqual((status['width'], status['height']), (1280, 720))
        with urllib.request.urlopen(self.url + '/video', timeout=5) as response:
            self.assertEqual(response.readline(), b'--frame\r\n')
            self.assertIn(b'image/jpeg', response.readline())
            length = int(response.readline().split(b':')[1])
            response.readline()
            image = Image.open(io.BytesIO(response.read(length)))
            self.assertEqual(image.size, (1280, 720))
        # Exercise the actual H.264 socket path with a new decoder session.
        codec = av.CodecContext.create('libx264', 'w')
        codec.width, codec.height = 1280, 720
        codec.pix_fmt = 'yuv420p'
        from fractions import Fraction
        codec.time_base = Fraction(1, 30)
        codec.options = {'preset': 'ultrafast', 'tune': 'zerolatency'}
        packets = []
        for i in range(6):
            frame = av.VideoFrame.from_image(Image.new('RGB', (1280, 720), 'green'))
            frame.pts = i
            packets.extend(codec.encode(frame))
        packets.extend(codec.encode(None))
        with socket.create_connection(('127.0.0.1', self.port), timeout=5) as stream:
            for i, packet in enumerate(packets):
                stream.sendall(encode(H264, i, i * 33333, bytes(packet)))
            self.wait_frames(16)  # Streaming parser may retain its last frame.
        run(port=self.port, frames=3)
        self.wait_frames(19)


if __name__ == '__main__':
    unittest.main()
