"""Pitch-rule fallback classifier. The trained model later replaces `classify` with the same return shape."""
import numpy as np

from .audio import frame_spectra

MODEL_VERSION = "pitch-rule-v1"

# Female wingbeat fundamentals sit roughly 300-1000 Hz; below 300 is mostly hum and handling noise.
F0_MIN, F0_MAX = 300.0, 1000.0
HARMONIC_BW = 15.0               # Hz either side of each harmonic counted as "wingbeat energy"
BUZZ_FRAME_SHARE = 0.25          # average only the 25% of frames with the most wingbeat-band energy


def _bin_power(freqs, p, f, bw):
    m = (freqs >= f - bw) & (freqs <= f + bw)
    return float(p[m].sum()) if m.any() else 0.0


def features(x: np.ndarray) -> dict:
    """f0_hz: wingbeat fundamental. band_ratio: share of 100-4000 Hz power on f0, 2f0, 3f0,
    measured on the frames where the buzz is loudest (a mosquito is rarely audible for a whole clip)."""
    x = x - x.mean()
    freqs, pf = frame_spectra(x)
    wing = (freqs >= F0_MIN) & (freqs <= F0_MAX)
    broad = (freqs >= 100) & (freqs <= 4000)
    share = pf[:, wing].sum(axis=1) / (pf[:, broad].sum(axis=1) + 1e-12)
    k = max(1, int(round(len(share) * BUZZ_FRAME_SHARE)))
    p = pf[np.argsort(share)[-k:]].mean(axis=0)
    cand = np.where(wing)[0]
    scores = [p[i] + 0.7 * _bin_power(freqs, p, 2 * freqs[i], 3) + 0.5 * _bin_power(freqs, p, 3 * freqs[i], 3)
              for i in cand]
    f0 = float(freqs[cand[int(np.argmax(scores))]])
    total = float(p[(freqs >= 100) & (freqs <= 4000)].sum()) or 1e-12
    harm = sum(_bin_power(freqs, p, k * f0, HARMONIC_BW) for k in (1, 2, 3) if k * f0 < 4000)
    return {"f0_hz": f0, "band_ratio": harm / total, "rms": float(np.sqrt(np.mean(x ** 2)))}


# From scripts/calibrate_pitch.py on the 6 Abuzz species (274 clips):
# - band_ratio p10 per species was 0.05-0.19, so 0.05 keeps ~90% of real buzzes. Not yet checked
#   against background audio (needs HumBugDB), so false triggers are unmeasured.
# - Best 3-band pitch rule: balanced accuracy 0.49 vs 0.33 chance, in-sample. Pitch alone cannot
#   separate genera reliably, so this rule reports a genus at low confidence and never a species.
MIN_BAND_RATIO = 0.05
GENUS_BANDS = [("anopheles", 0, 320), ("culex", 320, 500), ("aedes", 500, 10_000)]
FALLBACK_CONFIDENCE = 0.35


def classify(x: np.ndarray) -> dict:
    ft = features(x)
    if ft["band_ratio"] < MIN_BAND_RATIO:
        return {"is_mosquito": False, "species": None, "genus": None, "confidence": None,
                "top3": [], "features": ft, "model_version": MODEL_VERSION}
    genus = next(g for g, lo, hi in GENUS_BANDS if lo <= ft["f0_hz"] < hi)
    return {"is_mosquito": True, "species": None, "genus": genus, "confidence": FALLBACK_CONFIDENCE,
            "top3": [{"genus": genus, "p": FALLBACK_CONFIDENCE}], "features": ft,
            "model_version": MODEL_VERSION}
