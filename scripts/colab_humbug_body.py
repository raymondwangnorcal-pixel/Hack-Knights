# ---- HumBugDB sample -> features (runs in Colab, ~1-3 min). Paste the WHOLE generated cell. ----
import io, os, glob, time, zipfile, subprocess
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

# Some zip parts cannot be read by Python's zipfile (multi-part archive). Probe each zip with 3 spread-out
# members, try Python then the unzip tool, and keep only zips that actually deliver audio.
readers, zip_open = {}, {}
for z in sorted({z for z, _ in index.values()}):
    members = sorted(m for zz, m in index.values() if zz == z)
    probe = [members[0], members[len(members) // 2], members[-1]]
    zip_open[z] = zipfile.ZipFile(z)
    def py(m, z=z): return zip_open[z].read(m)
    def cli(m, z=z):
        r = subprocess.run(['unzip', '-p', z, m], capture_output=True)
        if r.returncode not in (0, 1) or not r.stdout:
            raise IOError(r.stderr[:200])
        return r.stdout
    status = 'UNREADABLE'
    for name, fn in (('python', py), ('unzip tool', cli)):
        try:
            for m in probe:
                sf.info(io.BytesIO(fn(m)))
            readers[z], status = fn, 'ok via ' + name
            break
        except Exception as e:
            last_err = f'{type(e).__name__}: {str(e)[:80]}'
    print(f'  {os.path.basename(z):<34}{len(members):>6} wavs  {status}' + ('' if z in readers else '  (' + last_err + ')'))
usable = {k for k, (z, _) in index.items() if z in readers}
assert usable, 'no readable zip parts: paste the lines above to Claude'
df = df[df.key.isin(usable)]
print(f'{len(df)} phone rows are usable from the readable zips')
assert set(df.sound_type) == {'mosquito', 'background'}, 'readable zips lack one class: paste the output above to Claude'

X, y, groups, devices = [], [], [], []
for label, cls in ((1, 'mosquito'), (0, 'background')):
    rows = df[df.sound_type == cls]
    rows = rows.sample(n=min(MAX_FILES_PER_CLASS, len(rows)), random_state=0)
    per_file = int(np.clip(np.ceil(TARGET_WINDOWS_PER_CLASS / len(rows)), 1, 40))
    got = 0
    for _, r in rows.iterrows():
        z, member = index[r.key]
        audio, sr = sf.read(io.BytesIO(readers[z](member)), dtype='float32', always_2d=True)
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
