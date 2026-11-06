# Switch integration — UNCOMPILED AND UNTESTED

`sender.c` implements only the capture-to-framed-socket loop. It has no entry
point, NPDM permissions, Atmosphère installation folder, NRO/NSP binary, or
automatic service initialization. Do not install it as a sysmodule.

The intended host is an Atmosphère background process with access to `grc:d`
and the required socket services. A normal foreground homebrew app can suspend
the game; that is not sufficient proof of background capture. A devkitA64/libnx
host must initialize sockets, connect to the PC's LAN IPv4 address on 6970, call
`grcdInitialize`, and coordinate `grcdBegin` exactly once for the global recorder
lifetime. Reopening a session or restarting this process does not prove that
Begin is safe again. Repeated Begin can assert the system recording service.
No automatic Begin is deliberately included in this integration unit.

Compile-only check when devkitPro and libnx are installed (shell syntax):

```sh
$DEVKITA64/bin/aarch64-none-elf-gcc -Wall -Wextra -Werror -march=armv8-a+crc+crypto -mtune=cortex-a57 -mtp=soft -I$DEVKITPRO/libnx/include -c sender.c -o sender.o
```

The function `int laptoplink_send_video(int connected_socket)` returns on a
capture/send error and blocks while streaming. A real host still needs a
cancelable capture worker, game lifecycle handling, shutdown, network reconnect,
and validated service permissions. Do not call it on a UI thread. Recovery after
game exit and interaction with the normal capture recorder need hardware tests.
No capture patches are supplied for games that disable recording.

The documented `grcdTransfer` video buffer is 0x32000 and carries H.264 NAL data.
Audio is documented as 48 kHz stereo PCM16 but is omitted from this video MVP.
720p30 is the target capture ceiling here, not a guarantee for every title.
Availability depends on firmware, permissions, capture-enabled title and recorder
state. It can block without a supported running game. A patched HAC-001 requires
an independently compatible CFW setup; this project does not provide an exploit
or make a stock console stream video. SD access is needed later to deploy a
completed host; no SD reader is needed for the Windows simulation.

Documentation used (API signatures only; no SysDVR code or binaries):

- https://switchbrew.org/wiki/GRC_services
- https://switchbrew.github.io/libnx/grc_8h.html
- https://github.com/switchbrew/libnx/blob/master/nx/include/switch/services/grc.h
- https://switchbrew.github.io/libnx/usbds_8h.html
- https://switch.hacks.guide/user_guide/modchip/index
