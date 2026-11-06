"""LaptopLink v1: bounded records over one TCP connection."""
import struct

HEADER = struct.Struct('!4sBBHIQI')
MAX_PAYLOAD = 2 * 1024 * 1024
JPEG, H264 = 1, 2


def encode(kind, sequence, timestamp_us, payload):
    if kind not in (JPEG, H264) or not 0 < len(payload) <= MAX_PAYLOAD:
        raise ValueError('Invalid record type or length')
    return HEADER.pack(b'LLNK', 1, kind, 0, sequence, timestamp_us, len(payload)) + payload


def read_exact(stream, size):
    data = bytearray()
    while len(data) < size:
        chunk = stream.recv(size - len(data))
        if not chunk:
            raise EOFError('Source disconnected')
        data.extend(chunk)
    return bytes(data)


def receive(stream):
    magic, version, kind, flags, sequence, stamp, size = HEADER.unpack(read_exact(stream, HEADER.size))
    if magic != b'LLNK' or version != 1 or flags or kind not in (JPEG, H264):
        raise ValueError('Unsupported protocol header')
    if not 0 < size <= MAX_PAYLOAD:
        raise ValueError('Payload exceeds protocol limit')
    return kind, sequence, stamp, read_exact(stream, size)
