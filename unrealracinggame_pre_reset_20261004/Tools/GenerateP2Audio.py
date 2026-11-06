"""Generate original prototype vehicle loops for import into UE 5.8."""
import math
import os
import random
import struct
import wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Content", "RacingMVP", "Audio", "Sources"))
RATE = 22050
DURATION = 3.0


def write_wave(name, samples):
    os.makedirs(ROOT, exist_ok=True)
    path = os.path.join(ROOT, name + ".wav")
    pcm = bytearray()
    peak = max(max(abs(value) for value in samples), 1e-6)
    scale = 0.82 / peak
    for value in samples:
        pcm.extend(struct.pack("<h", int(max(-1.0, min(1.0, value * scale)) * 32767)))
    with wave.open(path, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm)
    return path


count = int(RATE * DURATION)
engine = []
for index in range(count):
    phase = 2.0 * math.pi * 92.0 * index / RATE
    engine.append(sum(math.sin(phase * harmonic) / harmonic for harmonic in (1, 2, 3, 4, 6)))
write_wave("SW_EngineLoop", engine)

rng = random.Random(58210709)
noise = [rng.uniform(-1.0, 1.0) for _ in range(count)]
def filtered_noise(cutoff):
    result = []
    state = 0.0
    coefficient = min(0.98, cutoff / RATE)
    for value in noise:
        state += coefficient * (value - state)
        result.append(state)
    return result

write_wave("SW_TireLoop", filtered_noise(2600))
wind = filtered_noise(7000)
write_wave("SW_WindLoop", wind)
gravel = filtered_noise(4300)
write_wave("SW_GravelLoop", gravel)
print("Generated P2 vehicle loops:", ROOT)
