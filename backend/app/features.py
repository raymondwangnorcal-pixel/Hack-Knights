"""Audio features shared by training (Colab + laptop) and the live service. Pure NumPy, 8 kHz mono input.

One feature vector per ~2 s window: the spectral *shape* across 24 log-spaced bands (gain-invariant, so phone
volume doesn't matter), how it varies over time, plus the wingbeat pitch and how tonal it is.
"""
import numpy as np

SR = 8000
N_FFT, HOP = 1024, 512
N_BANDS = 24
F_LO, F_HI = 100.0, 3900.0
WIN_S = 2.0
FEATURE_VERSION = "bands24-v1"

_freqs = np.fft.rfftfreq(N_FFT, 1 / SR)
_edges = np.geomspace(F_LO, F_HI, N_BANDS + 1)
_band_idx = [np.where((_freqs >= lo) & (_freqs < hi))[0] for lo, hi in zip(_edges[:-1], _edges[1:])]
assert all(len(b) for b in _band_idx), "empty frequency band"
_broad = (_freqs >= F_LO) & (_freqs <= F_HI)
_wing = (_freqs >= 300) & (_freqs <= 1000)
FEATURE_DIM = 2 * N_BANDS + 4


def _frame_power(x: np.ndarray) -> np.ndarray:
    if x.size < N_FFT:
        x = np.pad(x, (0, N_FFT - x.size))
    fr = np.lib.stride_tricks.sliding_window_view(x, N_FFT)[::HOP]
    return np.abs(np.fft.rfft(fr * np.hanning(N_FFT), axis=1)) ** 2


def window_features(x: np.ndarray) -> np.ndarray:
    """x: mono float32 at SR, about WIN_S long. Returns a FEATURE_DIM vector."""
    x = x.astype(np.float64) - x.mean()
    p = _frame_power(x)
    be = np.stack([p[:, i].sum(axis=1) for i in _band_idx], axis=1) + 1e-10
    lb = np.log10(be)
    shape = lb - lb.mean(axis=1, keepdims=True)          # gain-invariant spectral shape per frame
    tot = np.log10(be.sum(axis=1))
    mp = p.mean(axis=0)
    f0 = _freqs[_wing][np.argmax(mp[_wing])]
    broad = mp[_broad].sum() + 1e-12

    def bp(f, bw=20.0):
        m = (_freqs >= f - bw) & (_freqs <= f + bw)
        return mp[m].sum()

    harm = sum(bp(k * f0) for k in (1, 2, 3) if k * f0 < F_HI) / broad
    flat = np.exp(np.mean(np.log(mp[_broad] + 1e-12))) / (np.mean(mp[_broad]) + 1e-12)
    out = np.concatenate([shape.mean(0), shape.std(0), [tot.std(), f0 / 1000.0, harm, flat]])
    return out.astype(np.float32)


def wing_share(x: np.ndarray) -> float:
    """Share of 100-3900 Hz power that sits in the 300-1000 Hz wingbeat band."""
    mp = _frame_power(x - x.mean()).mean(axis=0)
    return float(mp[_wing].sum() / (mp[_broad].sum() + 1e-12))


def clip_windows(x: np.ndarray, n: int, mode: str = "random", rng=None) -> list[np.ndarray]:
    """Up to n windows of WIN_S. mode='buzz' picks the windows with the most wingbeat energy
    (a mosquito is rarely audible for a whole recording); 'random' picks uniformly. <1 s clips give nothing."""
    w = int(WIN_S * SR)
    if x.size < SR:
        return []
    if x.size <= w:
        return [x]
    starts = np.arange(0, x.size - w + 1, SR // 2)        # 0.5 s hop
    if mode == "buzz":
        scores = np.array([wing_share(x[s:s + w]) for s in starts])
        chosen = starts[np.argsort(scores)[::-1][:n]]
    else:
        rng = rng or np.random.default_rng(0)
        chosen = rng.choice(starts, size=min(n, len(starts)), replace=False)
    return [x[s:s + w] for s in chosen]
