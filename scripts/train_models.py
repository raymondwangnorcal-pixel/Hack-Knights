"""Train the mosquito detector (HumBugDB features from Colab) and the genus/species classifier (Abuzz, local).

    .venv/bin/python scripts/train_models.py

Evaluation is honest by construction:
- Abuzz 'Raw' folders are uncut copies of the clipped recordings next to them, so they are dropped.
- Train/test splits never share a recording set (species x site/device folder) or, for HumBug, a source file.
- Scores are per clip (window probabilities averaged), which is what the app reports.
Writes backend/models/{detector,genus,species}.joblib and data/model_eval.json.
"""
import json, sys, time
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import balanced_accuracy_score, confusion_matrix, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.audio import AudioDecodeError, decode  # noqa: E402
from app.features import FEATURE_VERSION, clip_windows, window_features  # noqa: E402

ABUZZ = ROOT / "data/raw/species"
HUMBUG = ROOT / "data/humbug_features.npz"
MODELS = ROOT / "backend/models"
EXTS = {".wav", ".m4a", ".amr", ".mp4"}
WINDOWS_PER_CLIP = 6


def hgb():
    return HistGradientBoostingClassifier(max_iter=300, learning_rate=0.08, max_leaf_nodes=15,
                                          l2_regularization=1.0, class_weight="balanced", random_state=0)


def grouped_cv(X, y, groups, clip_ids, n_splits=5):
    """Out-of-fold class probabilities per window, then averaged per clip. Returns (clip_true, clip_proba, classes)."""
    classes = np.unique(y)
    proba = np.zeros((len(y), len(classes)))
    for tr, te in StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=0).split(X, y, groups):
        m = hgb().fit(X[tr], y[tr])
        p = m.predict_proba(X[te])
        for j, c in enumerate(m.classes_):           # a fold may lack a class in training
            proba[te, np.searchsorted(classes, c)] = p[:, j]
    clips = {}
    for i, cid in enumerate(clip_ids):
        clips.setdefault(cid, []).append(i)
    ct = np.array([y[ix[0]] for ix in clips.values()])
    cp = np.array([proba[ix].mean(axis=0) for ix in clips.values()])
    return ct, cp, classes


def report(name, ct, cp, classes):
    pred = classes[cp.argmax(axis=1)]
    bal, acc = balanced_accuracy_score(ct, pred), float((pred == ct).mean())
    majority = Counter(ct).most_common(1)[0][1] / len(ct)
    cm = confusion_matrix(ct, pred, labels=classes)
    recall = {str(c): float(cm[i, i] / cm[i].sum()) for i, c in enumerate(classes)}
    print(f"\n== {name}: {len(ct)} clips, held-out recording sets")
    print(f"   balanced accuracy {bal:.2f}   accuracy {acc:.2f}   (always-majority accuracy {majority:.2f}, "
          f"chance balanced {1 / len(classes):.2f})")
    w = max(len(str(c)) for c in classes) + 2
    print("   confusion (rows = true, cols = predicted):")
    print("   " + " " * w + "".join(f"{str(c)[:10]:>11}" for c in classes))
    for i, c in enumerate(classes):
        print(f"   {str(c):<{w}}" + "".join(f"{v:>11}" for v in cm[i]) + f"   recall {recall[str(c)]:.2f}")
    return {"clips": int(len(ct)), "balanced_accuracy": round(bal, 3), "accuracy": round(acc, 3),
            "majority_accuracy": round(majority, 3), "recall": recall,
            "classes": [str(c) for c in classes], "confusion": cm.tolist()}


def abuzz_features():
    X, genus, species, groups, clips = [], [], [], [], []
    files = sorted(f for f in ABUZZ.rglob("*") if f.suffix.lower() in EXTS and "Raw" not in f.parts)
    if not files:
        sys.exit(f"no Abuzz audio under {ABUZZ}")
    for f in files:
        sp = f.relative_to(ABUZZ).parts[0]                       # e.g. Anopheles_gambiae
        rec_set = sp + "/" + "/".join(p for p in f.parent.relative_to(ABUZZ / sp).parts if p != "Snipped")
        try:
            x = decode(path=str(f), max_seconds=60)
        except AudioDecodeError as e:
            print("   skip (decode):", f.name, str(e)[:80])
            continue
        for w in clip_windows(x, WINDOWS_PER_CLIP, "buzz"):
            X.append(window_features(w)); species.append(sp); genus.append(sp.split("_")[0].lower())
            groups.append(rec_set); clips.append(str(f))
    return np.stack(X), np.array(genus), np.array(species), np.array(groups), np.array(clips)


def save(name, model, classes, extra=None):
    MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "classes": [str(c) for c in classes], "feature_version": FEATURE_VERSION,
                 **(extra or {})}, MODELS / f"{name}.joblib")


def main():
    t0 = time.time()
    results = {"feature_version": FEATURE_VERSION}

    print("Abuzz: decoding and windowing (Raw folders excluded)...")
    X, genus, species, groups, clips = abuzz_features()
    n_sets = {g: len(set(groups[genus == g])) for g in np.unique(genus)}
    print(f"   {len(set(clips))} clips -> {len(X)} windows; recording sets per genus: {n_sets}")

    results["genus"] = report("GENUS classifier", *grouped_cv(X, genus, groups, clips))
    results["species"] = report("SPECIES classifier", *grouped_cv(X, species, groups, clips))
    save("genus", hgb().fit(X, genus), np.unique(genus))
    save("species", hgb().fit(X, species), np.unique(species))

    if HUMBUG.exists():
        d = np.load(HUMBUG)
        if str(d["feature_version"]) != FEATURE_VERSION:
            sys.exit(f"HumBug features are {d['feature_version']}, code is {FEATURE_VERSION}: re-run the Colab cell")
        Xd, yd, gd = d["X"], d["y"], d["groups"]
        print(f"\nHumBug: {len(Xd)} windows from {len(set(gd))} files "
              f"(mosquito {int((yd == 1).sum())}, background {int((yd == 0).sum())})")
        ct, cp, classes = grouped_cv(Xd, yd, gd, gd)
        det = report("DETECTOR (1 = mosquito)", ct, cp, classes)
        det["auc"] = round(float(roc_auc_score(ct, cp[:, 1])), 3)
        print(f"   ROC AUC {det['auc']:.2f}")
        final = hgb().fit(Xd, yd)
        # Cross-domain sanity check: share of Abuzz mosquito windows the detector calls mosquito.
        det["abuzz_flagged_as_mosquito"] = round(float((final.predict(X) == 1).mean()), 3)
        print(f"   on Abuzz buzz windows (all real mosquitoes, different recordings): "
              f"{det['abuzz_flagged_as_mosquito']:.0%} flagged as mosquito")
        results["detector"] = det
        save("detector", final, final.classes_)
    else:
        print(f"\nDETECTOR skipped: {HUMBUG.relative_to(ROOT)} not found (run the Colab cell, move the download there)")

    (ROOT / "data/model_eval.json").write_text(json.dumps(results, indent=2))
    print(f"\nsaved models to {MODELS.relative_to(ROOT)}/ and metrics to data/model_eval.json "
          f"in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
