"""LAN ingest and local browser display. Video only MVP."""
import argparse
import io
import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image
from protocol import JPEG, receive

PAGE = b'''<!doctype html><html lang="en"><meta charset="utf-8"><title>LaptopLink</title>
<style>body{background:#101b2b;color:#eee;font:18px system-ui;margin:24px}img{width:100%;max-height:80vh;object-fit:contain}button{padding:10px}p{color:#52e0b0}</style>
<h1>LaptopLink</h1><p id="status">Waiting for source</p><button onclick="document.querySelector('img').requestFullscreen()">Fullscreen</button>
<img src="/video" alt="Waiting for video"><script>setInterval(async()=>{let s=await(await fetch('/status')).json();document.getElementById('status').textContent=`${s.state} | ${s.frames} decoded frames | ${s.width} x ${s.height}`},1000)</script></html>'''


class Receiver:
    def __init__(self):
        self.condition = threading.Condition()
        self.jpeg = None
        self.status = dict(state='Waiting for source', frames=0, width=0, height=0)

    def publish(self, image):
        if image.width > 1280 or image.height > 720:
            raise ValueError('MVP accepts at most 1280x720')
        output = io.BytesIO()
        image.convert('RGB').save(output, 'JPEG', quality=85)
        with self.condition:
            self.jpeg = output.getvalue()
            self.status.update(frames=self.status['frames'] + 1, width=image.width, height=image.height)
            self.condition.notify_all()

    def ingest(self, listener):
        while True:
            stream, address = listener.accept()
            self.status['state'] = f'Connected: {address[0]}'
            decoder = None
            previous = None
            try:
                with stream:
                    stream.settimeout(15)
                    while True:
                        kind, seq, stamp, payload = receive(stream)
                        if previous is not None and seq != (previous + 1) & 0xffffffff:
                            raise ValueError('Nonsequential source records')
                        previous = seq
                        if kind == JPEG:
                            with Image.open(io.BytesIO(payload)) as image:
                                self.publish(image)
                        else:
                            import av
                            if decoder is None:
                                decoder = av.CodecContext.create('h264', 'r')
                            for packet in decoder.parse(payload):
                                for frame in decoder.decode(packet):
                                    self.publish(frame.to_image())
            except Exception as error:
                self.status['state'] = f'Waiting for reconnect: {type(error).__name__}: {error}'
                print(self.status['state'], flush=True)

    def handler(self):
        receiver = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                if self.path == '/':
                    content, mime = PAGE, 'text/html; charset=utf-8'
                elif self.path == '/status':
                    content, mime = json.dumps(receiver.status).encode(), 'application/json'
                elif self.path == '/video':
                    self.send_response(200)
                    self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    previous = None
                    try:
                        while True:
                            with receiver.condition:
                                receiver.condition.wait_for(lambda: receiver.jpeg is not previous)
                                jpeg = receiver.jpeg
                            self.wfile.write(b'--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ' + str(len(jpeg)).encode() + b'\r\n\r\n' + jpeg + b'\r\n')
                            previous = jpeg
                    except (ConnectionError, OSError):
                        return
                else:
                    self.send_error(404)
                    return
                self.send_response(200)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(content)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(content)

        return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--listen', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=6970)
    parser.add_argument('--web-port', type=int, default=6971)
    parser.add_argument('--demo', action='store_true')
    args = parser.parse_args()
    receiver = Receiver()
    with socket.socket() as listener:
        listener.bind((args.listen, args.port))
        listener.listen(1)
        threading.Thread(target=receiver.ingest, args=(listener,), daemon=True).start()
        if args.demo:
            from simulator import run
            threading.Thread(target=run, args=('127.0.0.1', args.port), daemon=True).start()
        print(f'Open http://127.0.0.1:{args.web_port} | TCP {args.listen}:{args.port}', flush=True)
        with ThreadingHTTPServer(('127.0.0.1', args.web_port), receiver.handler()) as server:
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass


if __name__ == '__main__':
    main()
