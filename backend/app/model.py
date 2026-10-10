"""Clip -> (is it a mosquito?, which genus?, closest species).

1. Gate: wingbeat tonality of the clip's clearest 2 s window (share of sound energy on the wingbeat pitch and
   its 2x/3x overtones) must be >= GATE_CUTOFF. A rule, not a model: the trained detector did not transfer
   to other recordings. Validated: catches 79% of Abuzz mosquito clips, 12% false alarms on HumBugDB background.
2. Genus: trained gradient-boosted model (scripts/train_models.py), window probabilities averaged over the clip.
   Held-out recording sets: 0.73 balanced accuracy for Anopheles vs Aedes.
3. Species: same features, shown only as the closest match (held-out species accuracy is low).
"""
from pathlib import Path

import joblib
import numpy as np

from .features import FEATURE_VERSION, clip_windows, window_features

MODELS = Path(__file__).resolve().parent.parent / "models"
GATE_CUTOFF = 0.20
HARM = 50              # index of the wingbeat-tonality feature in window_features()
WINDOWS = 6


def _load(name):
    path = MODELS / f"{name}.joblib"
    if not path.exists():
        raise RuntimeError(f"missing {path}: run scripts/train_models.py")
    bundle = joblib.load(path)
    if bundle["feature_version"] != FEATURE_VERSION:
        raise RuntimeError(f"{name} model was trained on {bundle['feature_version']}, code is {FEATURE_VERSION}")
    return bundle


_genus = _load("genus")
_species = _load("species")
MODEL_VERSION = f"gate-harm{GATE_CUTOFF:.2f}+genus-hgb-{FEATURE_VERSION}"


def _species_name(folder: str) -> str:
    return folder.replace("_", " ")


def classify(x: np.ndarray) -> dict:
    windows = clip_windows(x, WINDOWS, "buzz")
    if not windows:
        return {"is_mosquito": False, "species": None, "genus": None, "confidence": None, "top3": [],
                "gate_score": 0.0, "model_version": MODEL_VERSION}
    F = np.stack([window_features(w) for w in windows])
    gate = float(F[:, HARM].max())
    if gate < GATE_CUTOFF:
        return {"is_mosquito": False, "species": None, "genus": None, "confidence": None, "top3": [],
                "gate_score": round(gate, 3), "model_version": MODEL_VERSION}

    gp = _genus["model"].predict_proba(F).mean(axis=0)
    gi = int(gp.argmax())
    sp = _species["model"].predict_proba(F).mean(axis=0)
    order = np.argsort(sp)[::-1][:3]
    top3 = [{"species": _species_name(_species["classes"][i]), "p": round(float(sp[i]), 3)} for i in order]
    return {"is_mosquito": True,
            "genus": _genus["classes"][gi],
            "confidence": round(float(gp[gi]), 3),          # genus confidence: the headline
            "species": top3[0]["species"],                   # closest match only
            "top3": top3,
            "genus_probs": {c: round(float(p), 3) for c, p in zip(_genus["classes"], gp)},
            "gate_score": round(gate, 3),
            "model_version": MODEL_VERSION}
