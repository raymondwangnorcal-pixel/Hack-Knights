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
