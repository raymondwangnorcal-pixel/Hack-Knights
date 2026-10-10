# AUTO-GENERATED: backend/app/features.py + scripts/colab_humbug_body.py. Paste this whole file into ONE Colab cell.
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

# ---- HumBugDB sample -> features (runs in Colab, ~1-3 min). Paste the WHOLE generated cell. ----
import io, os, glob, time, zipfile
import pandas as pd
import soundfile as sf

t0 = time.time()
rng = np.random.default_rng(0)
TARGET_WINDOWS_PER_CLASS = 700
MAX_FILES_PER_CLASS = 200

df = pd.read_csv('/content/humbug/neurips_2021_zenodo_0_0_1.csv')
df = df[(df.mic_type == 'phone') & df.sound_type.isin(['mosquito', 'background'])].copy()
print('phone-recorded rows by class and device:')
print(df.groupby(['sound_type', 'device_type']).size().to_string(), '\n')
assert set(df.sound_type) == {'mosquito', 'background'}, 'need both classes among phone recordings'

index = {}
for z in sorted(glob.glob('/content/humbug/humbugdb_neurips_2021_*.zip')):
    for n in zipfile.ZipFile(z).namelist():
        if n.lower().endswith('.wav'):
            index[os.path.splitext(os.path.basename(n))[0]] = (z, n)
df['key'] = df['id'].astype(str)
hit = df.key.isin(index).mean()
print(f'{len(index)} wav files in zips, e.g. {list(index)[:3]}; {hit:.0%} of phone rows matched by id')
assert hit > 0.9, 'zip file names do not match CSV ids: paste this output to Claude'
df = df[df.key.isin(index)]

zips = {}
X, y, groups, devices = [], [], [], []
for label, cls in ((1, 'mosquito'), (0, 'background')):
    rows = df[df.sound_type == cls]
    rows = rows.sample(n=min(MAX_FILES_PER_CLASS, len(rows)), random_state=0)
    per_file = int(np.clip(np.ceil(TARGET_WINDOWS_PER_CLASS / len(rows)), 1, 40))
    got = 0
    for _, r in rows.iterrows():
        z, member = index[r.key]
        zf = zips.setdefault(z, zipfile.ZipFile(z))
        audio, sr = sf.read(io.BytesIO(zf.read(member)), dtype='float32', always_2d=True)
        audio = audio.mean(axis=1)
        if sr != SR:
            import librosa
            audio = librosa.resample(audio, orig_sr=sr, target_sr=SR)
        for w in clip_windows(audio, per_file, 'random', rng):
            X.append(window_features(w)); y.append(label); groups.append(r.key); devices.append(r.device_type)
            got += 1
    print(f'{cls:<11} {len(rows)} files -> {got} windows')

X = np.stack(X)
assert np.isfinite(X).all(), 'non-finite features'
np.savez_compressed('/content/humbug_features.npz', X=X, y=np.array(y), groups=np.array(groups),
                    devices=np.array(devices), feature_version=FEATURE_VERSION)
print(f'\nsaved {X.shape} features in {time.time() - t0:.0f}s -> downloading humbug_features.npz')
from google.colab import files
files.download('/content/humbug_features.npz')
