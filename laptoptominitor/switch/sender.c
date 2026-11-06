/* Untested integration unit, not an installable homebrew or sysmodule. */
#include <switch.h>
#include <sys/socket.h>
#include <stdint.h>
#include <stddef.h>

static int send_all(int fd, const void *data, size_t size) {
    const unsigned char *cursor = data;
    while (size) {
        int sent = send(fd, cursor, size, 0);
        if (sent <= 0) return -1;
        cursor += sent;
        size -= sent;
    }
    return 0;
}

/* Host owns socket setup, grcdInitialize/Exit and the ONE global grcdBegin.
   Call only on a worker: grcdTransfer may block indefinitely.
   Timestamp units from Horizon still need console verification, so the wire
   timestamp uses local monotonic time instead. */
int laptoplink_send_video(int connected_socket) {
    static unsigned char video[0x32000] __attribute__((aligned(0x1000)));
    uint32_t sequence = 0;
    for (;;) {
        u32 frames = 0, size = 0;
        u64 capture_timestamp = 0;
        Result rc = grcdTransfer(GrcStream_Video, video, sizeof(video),
                                &frames, &size, &capture_timestamp);
        if (R_FAILED(rc)) return -2;
        if (!size) continue;
        if (size > sizeof(video)) return -3;
        uint64_t stamp = armTicksToNs(armGetSystemTick()) / 1000;
        unsigned char header[24] = {'L','L','N','K', 1,2,0,0};
        for (int i = 0; i < 4; ++i) header[8+i] = sequence >> (24 - 8*i);
        for (int i = 0; i < 8; ++i) header[12+i] = stamp >> (56 - 8*i);
        for (int i = 0; i < 4; ++i) header[20+i] = size >> (24 - 8*i);
        if (send_all(connected_socket, header, sizeof(header)) ||
            send_all(connected_socket, video, size)) return -1;
        ++sequence;
    }
}
