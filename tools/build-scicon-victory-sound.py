#!/usr/bin/env python3
"""Create the synchronized Scicon Victory Signet sound-design package.

Every sound is synthesized from oscillators and seeded noise, then layered,
filtered, reverberated, and mastered. The preview mix follows the GIF duration;
gameplay should trigger the individual cues listed in animation-manifest.json.
"""

from __future__ import annotations

import argparse
import json
import math
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


SAMPLE_RATE = 48_000
RNG = np.random.default_rng(0x5C1C0)


def sample_count(duration: float) -> int:
    return max(1, round(duration * SAMPLE_RATE))


def timeline(duration: float) -> np.ndarray:
    return np.arange(sample_count(duration), dtype=np.float64) / SAMPLE_RATE


def lowpass(signal: np.ndarray, cutoff_hz: float) -> np.ndarray:
    coefficient = math.exp(-2.0 * math.pi * cutoff_hz / SAMPLE_RATE)
    output = np.empty_like(signal)
    previous = 0.0
    feed = 1.0 - coefficient
    for index, value in enumerate(signal):
        previous = feed * value + coefficient * previous
        output[index] = previous
    return output


def highpass(signal: np.ndarray, cutoff_hz: float) -> np.ndarray:
    return signal - lowpass(signal, cutoff_hz)


def bandpass(signal: np.ndarray, low_hz: float, high_hz: float) -> np.ndarray:
    return highpass(lowpass(signal, high_hz), low_hz)


def sweep(frequency_start: float, frequency_end: float, duration: float, logarithmic: bool = True) -> np.ndarray:
    count = sample_count(duration)
    progress = np.linspace(0.0, 1.0, count, endpoint=False)
    if logarithmic:
        frequencies = frequency_start * np.power(frequency_end / frequency_start, progress)
    else:
        frequencies = frequency_start + (frequency_end - frequency_start) * progress
    phase = np.cumsum(2.0 * math.pi * frequencies / SAMPLE_RATE)
    return np.sin(phase)


def attack_release(count: int, attack: float, release: float, shape: float = 1.0) -> np.ndarray:
    attack_samples = max(1, round(attack * SAMPLE_RATE))
    release_samples = max(1, round(release * SAMPLE_RATE))
    envelope = np.ones(count, dtype=np.float64)
    attack_curve = np.linspace(0.0, 1.0, min(count, attack_samples), endpoint=False) ** shape
    envelope[: attack_curve.size] = attack_curve
    release_curve = np.linspace(1.0, 0.0, min(count, release_samples), endpoint=True) ** shape
    envelope[-release_curve.size :] = np.minimum(envelope[-release_curve.size :], release_curve)
    return envelope


def exponential_decay(count: int, decay_seconds: float) -> np.ndarray:
    return np.exp(-np.arange(count, dtype=np.float64) / (SAMPLE_RATE * decay_seconds))


def pan_mono(signal: np.ndarray, pan: float | np.ndarray = 0.0) -> np.ndarray:
    pan_values = np.clip(pan, -1.0, 1.0)
    angle = (pan_values + 1.0) * math.pi / 4.0
    return np.column_stack((signal * np.cos(angle), signal * np.sin(angle)))


def add_at(destination: np.ndarray, source: np.ndarray, start_seconds: float, gain: float = 1.0) -> None:
    start = max(0, round(start_seconds * SAMPLE_RATE))
    if start >= destination.shape[0]:
        return
    length = min(source.shape[0], destination.shape[0] - start)
    destination[start : start + length] += source[:length] * gain


def delay_reverb(signal: np.ndarray, wet: float = 0.25) -> np.ndarray:
    output = signal.copy()
    taps = ((0.037, 0.32), (0.061, 0.23), (0.089, 0.16), (0.131, 0.11))
    for delay_seconds, gain in taps:
        delay = round(delay_seconds * SAMPLE_RATE)
        if delay < signal.shape[0]:
            # Cross-channel reflections widen the sound without a synthetic echo.
            output[delay:, 0] += signal[:-delay, 1] * gain * wet
            output[delay:, 1] += signal[:-delay, 0] * gain * wet
    return output


def master(signal: np.ndarray, peak: float = 0.92) -> np.ndarray:
    shaped = np.tanh(signal * 1.18) / math.tanh(1.18)
    maximum = float(np.max(np.abs(shaped)))
    if maximum > 0:
        shaped *= peak / maximum
    return shaped.astype(np.float32)


def make_drop() -> np.ndarray:
    duration = 0.68
    t = timeline(duration)
    noise = bandpass(RNG.normal(0.0, 1.0, t.size), 170.0, 5_300.0)
    whoosh_envelope = attack_release(t.size, 0.018, 0.44, 1.6) * np.exp(-t * 1.1)
    tonal = sweep(1_050.0, 92.0, duration) + 0.28 * sweep(2_120.0, 184.0, duration)
    body = (noise * 0.42 + tonal * 0.36) * whoosh_envelope
    moving_pan = np.linspace(-0.46, 0.34, t.size)
    stereo = pan_mono(body, moving_pan)
    sub = sweep(168.0, 49.0, duration) * attack_release(t.size, 0.025, 0.34) * np.exp(-t * 2.5)
    stereo += pan_mono(sub * 0.48, 0.0)
    return master(delay_reverb(stereo, 0.22))


def mechanical_click(frequency: float, pan: float) -> np.ndarray:
    duration = 0.115
    t = timeline(duration)
    noise = bandpass(RNG.normal(0.0, 1.0, t.size), 650.0, 6_800.0)
    ring = np.sin(2.0 * math.pi * frequency * t) + 0.38 * np.sin(2.0 * math.pi * frequency * 1.61 * t)
    signal = (noise * 0.62 + ring * 0.55) * exponential_decay(t.size, 0.026)
    return pan_mono(signal, pan)


def make_unfold() -> np.ndarray:
    duration = 0.82
    t = timeline(duration)
    noise = bandpass(RNG.normal(0.0, 1.0, t.size), 310.0, 4_900.0)
    modulation = 0.40 + 0.60 * (0.5 + 0.5 * np.sin(2.0 * math.pi * 27.0 * t))
    servo_phase = 2.0 * math.pi * (188.0 * t + 0.72 * np.sin(2.0 * math.pi * 5.1 * t))
    servo = np.sin(servo_phase) * 0.34 + noise * modulation * 0.24
    servo *= attack_release(t.size, 0.035, 0.19) * (0.72 + 0.28 * np.sin(math.pi * t / duration))
    stereo = pan_mono(servo, 0.26 * np.sin(2.0 * math.pi * 2.2 * t))
    energy = sweep(238.0, 1_160.0, duration) * attack_release(t.size, 0.08, 0.20) * 0.17
    stereo += pan_mono(energy, -0.10)
    for at, frequency, pan in ((0.08, 1_180.0, -0.66), (0.17, 1_330.0, 0.66), (0.39, 910.0, -0.58), (0.49, 1_040.0, 0.58)):
        add_at(stereo, mechanical_click(frequency, pan), at, 0.72)
    return master(delay_reverb(stereo, 0.18))


def make_impact() -> np.ndarray:
    duration = 0.75
    t = timeline(duration)
    thump = sweep(96.0, 34.0, duration) * exponential_decay(t.size, 0.17)
    thump += 0.32 * sweep(191.0, 67.0, duration) * exponential_decay(t.size, 0.12)
    metal = np.zeros(t.size)
    for frequency, amplitude, decay in ((164.0, 0.32, 0.23), (247.0, 0.24, 0.20), (371.0, 0.17, 0.15)):
        metal += np.sin(2.0 * math.pi * frequency * t + RNG.uniform(0.0, math.tau)) * amplitude * exponential_decay(t.size, decay)
    transient = bandpass(RNG.normal(0.0, 1.0, t.size), 900.0, 7_500.0) * exponential_decay(t.size, 0.018)
    stereo = pan_mono(thump * 0.84 + metal + transient * 0.48, 0.0)
    stereo += pan_mono(metal * 0.12, -0.42) + pan_mono(metal * 0.12, 0.42)
    return master(delay_reverb(stereo, 0.37))


def make_energy_bloom() -> np.ndarray:
    duration = 1.45
    t = timeline(duration)
    stereo = np.zeros((t.size, 2), dtype=np.float64)
    chord = ((293.66, -0.52), (369.99, -0.15), (440.00, 0.18), (587.33, 0.52))
    bloom_envelope = attack_release(t.size, 0.17, 0.48, 1.4) * (0.68 + 0.32 * np.sin(math.pi * t / duration))
    for frequency, pan in chord:
        cents = RNG.uniform(-3.5, 3.5)
        detuned = frequency * (2.0 ** (cents / 1_200.0))
        voice = np.sin(2.0 * math.pi * detuned * t)
        voice += 0.24 * np.sin(2.0 * math.pi * detuned * 2.005 * t + 0.8)
        voice += 0.08 * np.sin(2.0 * math.pi * detuned * 3.01 * t + 1.7)
        stereo += pan_mono(voice * bloom_envelope * 0.19, pan)
    riser = sweep(390.0, 2_350.0, duration) * attack_release(t.size, 0.08, 0.31) * 0.13
    air = highpass(RNG.normal(0.0, 1.0, t.size), 5_500.0) * attack_release(t.size, 0.12, 0.50) * 0.025
    stereo += pan_mono(riser, 0.0) + pan_mono(air, 0.0)
    return master(delay_reverb(stereo, 0.55))


def bell(frequency: float, duration: float, pan: float) -> np.ndarray:
    t = timeline(duration)
    partials = ((1.0, 0.55, 0.28), (2.01, 0.24, 0.17), (3.98, 0.11, 0.11), (6.13, 0.055, 0.075))
    signal = np.zeros(t.size)
    for ratio, amplitude, decay in partials:
        signal += np.sin(2.0 * math.pi * frequency * ratio * t + RNG.uniform(0.0, math.tau)) * amplitude * exponential_decay(t.size, decay)
    signal *= attack_release(t.size, 0.003, 0.22)
    return pan_mono(signal, pan)


def make_sparkles() -> np.ndarray:
    duration = 1.15
    stereo = np.zeros((sample_count(duration), 2), dtype=np.float64)
    notes = (
        (0.00, 1_174.66, -0.65),
        (0.12, 1_479.98, 0.58),
        (0.24, 1_319.51, -0.30),
        (0.39, 1_760.00, 0.32),
        (0.55, 2_093.00, 0.04),
    )
    for at, frequency, pan in notes:
        add_at(stereo, bell(frequency, 0.55, pan), at)
    return master(delay_reverb(stereo, 0.68))


def make_hover_loop() -> np.ndarray:
    duration = 1.28
    count = sample_count(duration)
    theta = math.tau * np.arange(count, dtype=np.float64) / count
    # Integer cycle counts make the loop phase-continuous without a crossfade.
    motor_left = np.sin(94.0 * theta + 0.12 * np.sin(2.0 * theta))
    motor_right = np.sin(94.0 * theta + 0.34 + 0.12 * np.sin(2.0 * theta + 0.5))
    harmonic_left = 0.22 * np.sin(188.0 * theta + 0.4) + 0.09 * np.sin(282.0 * theta + 1.2)
    harmonic_right = 0.22 * np.sin(188.0 * theta + 0.8) + 0.09 * np.sin(282.0 * theta + 1.6)
    shimmer_left = sum(0.012 * np.sin(cycle * theta + phase) for cycle, phase in ((421, 0.2), (557, 1.3), (691, 2.0)))
    shimmer_right = sum(0.012 * np.sin(cycle * theta + phase) for cycle, phase in ((433, 0.9), (569, 1.8), (707, 2.4)))
    breathing = 0.82 + 0.18 * np.sin(theta - math.pi / 2.0)
    stereo = np.column_stack(((motor_left * 0.18 + harmonic_left + shimmer_left) * breathing, (motor_right * 0.18 + harmonic_right + shimmer_right) * breathing))
    return master(stereo, 0.62)


def make_futuristic_open() -> np.ndarray:
    """A restrained pressure-door/servo opening with no reward chimes."""
    duration = 0.86
    stereo = np.zeros((sample_count(duration), 2), dtype=np.float64)
    add_at(stereo, make_drop(), 0.0, 0.28)
    add_at(stereo, make_unfold(), 0.055, 0.52)
    return master(stereo, 0.74)


def make_soft_lock() -> np.ndarray:
    """Short, weighty latch confirmation kept below the opening mechanism."""
    source = make_impact()
    return (source * 0.48).astype(np.float32)


def make_power_settle() -> np.ndarray:
    """Subtle energy pressure release; intentionally non-melodic."""
    duration = 0.78
    t = timeline(duration)
    air = bandpass(RNG.normal(0.0, 1.0, t.size), 420.0, 4_800.0)
    air *= attack_release(t.size, 0.08, 0.38, 1.4) * np.exp(-t * 1.4)
    core = sweep(116.0, 184.0, duration) * attack_release(t.size, 0.12, 0.30) * np.exp(-t * 1.1)
    modulation = 0.78 + 0.22 * np.sin(2.0 * math.pi * 3.0 * t)
    stereo = pan_mono((air * 0.16 + core * 0.25) * modulation, 0.0)
    return master(delay_reverb(stereo, 0.18), 0.46)


def make_quiet_hover_loop() -> np.ndarray:
    return (make_hover_loop() * 0.27).astype(np.float32)


def gif_duration_seconds(gif_path: Path) -> float:
    with Image.open(gif_path) as animation:
        total_ms = 0
        for frame_index in range(animation.n_frames):
            animation.seek(frame_index)
            total_ms += int(animation.info.get("duration", 40))
    return total_ms / 1_000.0


def make_preview_mix(cues: dict[str, np.ndarray], duration: float) -> np.ndarray:
    mix = np.zeros((sample_count(duration), 2), dtype=np.float64)
    schedule = (
        ("open", 0.000, 0.82),
        ("lock", 0.620, 0.74),
        ("power-settle", 0.700, 0.62),
    )
    for name, at, gain in schedule:
        add_at(mix, cues[name], at, gain)
    loop_start = 1.120
    loop_cursor = loop_start
    while loop_cursor < duration:
        add_at(mix, cues["hover-loop"], loop_cursor, 0.16)
        loop_cursor += cues["hover-loop"].shape[0] / SAMPLE_RATE
    return master(mix, 0.76)


def write_wav(path: Path, signal: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(signal, -1.0, 1.0)
    pcm = np.round(pcm * 32_767.0).astype("<i2")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())


def load_font(size: int) -> ImageFont.ImageFont:
    for path in (Path(r"C:\Windows\Fonts\segoeuib.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf")):
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def draw_waveform_timeline(cues: dict[str, np.ndarray], destination: Path) -> None:
    width, height = 1_200, 520
    image = Image.new("RGB", (width, height), (5, 10, 28))
    draw = ImageDraw.Draw(image)
    font = load_font(21)
    small_font = load_font(16)
    draw.text((28, 18), "SCICON VICTORY SIGNET — SYNCHRONIZED SOUND CUES", font=font, fill=(238, 245, 250))
    colors = ((66, 218, 255), (244, 175, 65), (255, 90, 87), (178, 92, 255), (255, 230, 95), (87, 239, 189))
    rows = (("drop", 0), ("unfold", 180), ("impact", 620), ("energy-bloom", 680), ("sparkles", 920), ("hover-loop", 1_120))
    chart_left, chart_right = 190, width - 34
    duration_ms = 2_200
    for row_index, ((name, start_ms), color) in enumerate(zip(rows, colors)):
        center_y = 92 + row_index * 66
        draw.text((28, center_y - 11), name.upper(), font=small_font, fill=color)
        draw.line((chart_left, center_y, chart_right, center_y), fill=(42, 59, 85), width=1)
        signal = cues[name]
        mono = np.max(np.abs(signal), axis=1)
        start_x = chart_left + round((start_ms / duration_ms) * (chart_right - chart_left))
        available = max(1, chart_right - start_x)
        bins = min(available, mono.size)
        edges = np.linspace(0, mono.size, bins + 1, dtype=int)
        peaks = np.array([np.max(mono[edges[index] : max(edges[index] + 1, edges[index + 1])]) for index in range(bins)])
        for offset, peak in enumerate(peaks):
            amplitude = round(float(peak) * 24)
            draw.line((start_x + offset, center_y - amplitude, start_x + offset, center_y + amplitude), fill=color)
        marker_x = chart_left + round((start_ms / duration_ms) * (chart_right - chart_left))
        draw.line((marker_x, center_y - 28, marker_x, center_y + 28), fill=color, width=2)
        draw.text((marker_x + 5, center_y + 19), f"{start_ms} ms", font=small_font, fill=(155, 174, 193))
    draw.text((28, height - 35), "Separate runtime cues • 48 kHz stereo WAV • preview mix synchronized to the gallery GIF", font=small_font, fill=(139, 240, 189))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio-root", type=Path, default=Path("public/audio/ui/victory-signet"))
    parser.add_argument("--animation-root", type=Path, default=Path("public/game-art/generated/ui/animations/victory-signet"))
    args = parser.parse_args()
    audio_root = args.audio_root.resolve()
    animation_root = args.animation_root.resolve()
    audio_root.mkdir(parents=True, exist_ok=True)

    cues = {
        "open": make_futuristic_open(),
        "lock": make_soft_lock(),
        "power-settle": make_power_settle(),
        "hover-loop": make_quiet_hover_loop(),
    }
    gif_path = animation_root / "previews/scicon-victory-signet-animation.gif"
    preview_duration = gif_duration_seconds(gif_path)
    preview_mix = make_preview_mix(cues, preview_duration)

    output_names = {}
    for name, signal in cues.items():
        filename = f"victory-signet-{name}.wav"
        write_wav(audio_root / filename, signal)
        output_names[name] = filename
    preview_filename = "victory-signet-preview-mix.wav"
    write_wav(audio_root / preview_filename, preview_mix)

    metadata = {
        "id": "scicon-victory-signet-sound-design",
        "sampleRate": SAMPLE_RATE,
        "channels": 2,
        "sampleFormat": "PCM signed 16-bit little-endian",
        "authorship": "Original procedural synthesis; no third-party samples used.",
        "previewDurationSeconds": preview_duration,
        "previewMix": preview_filename,
        "cues": [
            {"name": name, "file": output_names[name], "durationSeconds": round(signal.shape[0] / SAMPLE_RATE, 3)}
            for name, signal in cues.items()
        ],
    }
    (audio_root / "sound-design-manifest.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(cues)} runtime cues plus the {preview_duration:.2f}s synchronized preview mix")
    for name, signal in cues.items():
        print(f"{name:14s} {signal.shape[0] / SAMPLE_RATE:5.2f}s  peak={np.max(np.abs(signal)):.3f}  rms={np.sqrt(np.mean(signal**2)):.3f}")
    print(f"preview-mix    {preview_mix.shape[0] / SAMPLE_RATE:5.2f}s  peak={np.max(np.abs(preview_mix)):.3f}  rms={np.sqrt(np.mean(preview_mix**2)):.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
