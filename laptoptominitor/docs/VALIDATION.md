# Validation — 2026-11-06

Environment: Windows, Python 3.14, Pillow 12.0.0, PyAV 16.0.1.

`python -m unittest discover -s tests -v`: 3 tests passed.

- Byte-by-byte fragmented TCP record reconstructed correctly; clean EOF rejected.
- Bad magic, zero payload and oversized payload rejected before reading data.
- Twelve 1280x720 simulated JPEG frames traversed TCP and decoded.
- HTTP status returned expected dimensions; multipart HTTP yielded a valid JPEG.
- Synthetic libx264 Annex B data traversed a new TCP connection and decoded.
- A subsequent simulator connection succeeded after H.264 source disconnect.

Launch smoke check: started `receiver.py --demo` as a separate Windows process;
HTTP status reported 32 frames at 1280x720. Terminated that process afterward.
No browser rendering or fullscreen interaction was manually verified. Frame
pacing is configured to 30 fps; sustained throughput and latency were not benchmarked.

Switch: no devkitPro compiler or console test was performed. `switch/sender.c`
is an integration unit, not an installable sender. USB and audio are absent.
Real recorder output framing, SPS/PPS availability, permissions, global Begin
lifecycle, capture-disabled games and reconnect behavior need hardware validation.
