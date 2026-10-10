"""Decode any upload (webm, mp4, m4a, amr, wav) to mono float32 at one fixed rate."""
import subprocess

import numpy as np

SAMPLE_RATE = 8000  # lowest rate in Abuzz; wingbeat band sits far below the 4 kHz Nyquist


class AudioDecodeError(Exception):
    pass


def decode(data: bytes | None = None, path: str | None = None, max_seconds: float | None = None) -> np.ndarray:
    """Return mono float32 samples in [-1, 1] at SAMPLE_RATE. Raises AudioDecodeError, never returns empty."""
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", path or "pipe:0"]
    if max_seconds:
        cmd += ["-t", str(max_seconds)]
    cmd += ["-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1"]
    proc = subprocess.run(cmd, input=data, capture_output=True, timeout=60)
    if proc.returncode != 0:
        raise AudioDecodeError(proc.stderr.decode(errors="replace").strip()[:500] or "ffmpeg failed")
    samples = np.frombuffer(proc.stdout, dtype=np.float32)
    if samples.size < SAMPLE_RATE // 2:
        raise AudioDecodeError(f"decoded only {samples.size} samples (<0.5 s of audio)")
    return samples


def frame_spectra(x: np.ndarray, win_s: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """Power spectrum per Hann window (50% hop). Returns (freqs_hz, power[frames, bins])."""
    n = int(SAMPLE_RATE * win_s)
    if x.size < n:
        x = np.pad(x, (0, n - x.size))
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[:: n // 2]
    p = np.abs(np.fft.rfft(frames * np.hanning(n), axis=1)) ** 2
    return np.fft.rfftfreq(n, 1 / SAMPLE_RATE), p


def spectrum(x: np.ndarray, win_s: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """Average power spectrum over all windows. Returns (freqs_hz, power)."""
    freqs, p = frame_spectra(x, win_s)
    return freqs, p.mean(axis=0)
