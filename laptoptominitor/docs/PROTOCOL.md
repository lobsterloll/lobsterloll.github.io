# LaptopLink v1

One sender connects to receiver TCP port 6970. No handshake, authentication,
encryption, discovery, or control channel. Use a trusted private LAN only.
Default receiver binds loopback; explicitly select a LAN interface for console use.
One connection per source session; sequence resets at connection and wraps at 2^32.
Receiver accepts the first sequence value and then requires consecutive records.

All integers are unsigned, big endian. Header is exactly 24 bytes; no C struct padding.

| Offset | Bytes | Value |
|---|---|---|
| 0 | 4 | ASCII LLNK |
| 4 | 1 | version 1 |
| 5 | 1 | kind: 1 JPEG, 2 H.264 Annex B |
| 6 | 2 | reserved, zero |
| 8 | 4 | sequence, increment per record |
| 12 | 8 | sender monotonic microseconds, informational |
| 20 | 4 | payload length, 1 through 2097152 |

JPEG is one complete image per record (simulator). H.264 is an ordered byte stream
of Annex B NAL units; record boundaries need not be frame boundaries. Send SPS,
PPS and an IDR for a fresh decoder; a receiver connecting midstream must wait
for them. The receiver keeps decoder state only for the current TCP connection.
Source time is not synchronized with the PC; it is not an end-to-end latency metric.
Target is at most 1280x720, 30 fps; frame rate is source paced, not negotiated.

TCP supplies ordering and backpressure. The browser retains only the latest
decoded JPEG; slow decoding or network can still accumulate latency in TCP.
There is no packet loss recovery beyond reconnect and next IDR. A stalled read
disconnects after 15 seconds. A partial record disconnect discards that session.
Audio records are not defined in v1.

USB is a design option only, with no implementation: a future libnx usb:ds bulk
device plus Windows WinUSB/libusb reader could carry these identical records.
It needs USB descriptors, an appropriate VID/PID, driver binding, endpoint and
disconnect handling. An ordinary USB cable cannot make this work on stock firmware.
