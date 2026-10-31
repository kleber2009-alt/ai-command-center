"""Prepare a new HeyGen take for the reel: cut pauses, grade, loudnorm, transcribe,
and re-time the existing words.json (same word indices) to the new take.

usage: python3 -I prep_face.py <raw.mp4> <project_dir>
"""
import difflib, json, re, subprocess, sys, wave
import numpy as np
from faster_whisper import WhisperModel

raw, proj = sys.argv[1], sys.argv[2]
work = proj + '/prep'
subprocess.run(['mkdir', '-p', work], check=True)

def wav16(src, dst):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '16000', dst], check=True)
    w = wave.open(dst)
    return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768

model = WhisperModel('small', device='cpu', compute_type='int8')
def words_of(a):
    segs, _ = model.transcribe(a, language='ru', word_timestamps=True, beam_size=5)
    return [{'text': x.word.strip(), 'start': x.start, 'end': x.end} for s in segs for x in s.words]

# 1. cut pauses: keep speech with 0.08 s margins, merge gaps shorter than 0.12 s
a = wav16(raw, work + '/raw16.wav')
dur = len(a) / 16000
keep = []
for wd in words_of(a):
    s, e = max(0, wd['start'] - 0.08), min(dur, wd['end'] + 0.08)
    if keep and s - keep[-1][1] < 0.12:
        keep[-1][1] = max(keep[-1][1], e)
    else:
        keep.append([s, e])
v, au, lab = [], [], ''
for i, (s, e) in enumerate(keep):
    v.append(f'[0:v]trim={s:.3f}:{e:.3f},setpts=PTS-STARTPTS[v{i}]')
    au.append(f'[0:a]atrim={s:.3f}:{e:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.015,afade=t=out:st={e - s - 0.015:.3f}:d=0.015[a{i}]')
    lab += f'[v{i}][a{i}]'
fc = ';'.join(v + au) + (f';{lab}concat=n={len(keep)}:v=1:a=1[vc][ac];'
      '[vc]fps=30,colorbalance=rs=0.06:gs=-0.04:bs=-0.06:rm=0.05:gm=-0.03:bm=-0.05:rh=0.03:bh=-0.03,'
      'eq=saturation=0.92:contrast=1.04,vignette=PI/5[vo];[ac]loudnorm=I=-14:TP=-1.5:LRA=9[ao]')
face = proj + '/public/face.mp4'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-filter_complex', fc, '-map', '[vo]', '-map', '[ao]',
                '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', face], check=True)

# 2. transcribe the cut take and align to the old word list by normalised text
new = words_of(wav16(face, work + '/face16.wav'))
old = json.load(open(proj + '/src/words.json'))
norm = lambda t: re.sub(r'[^a-zа-я0-9]', '', t.lower().replace('ё', 'е'))
sm = difflib.SequenceMatcher(a=[norm(x['text']) for x in old], b=[norm(x['text']) for x in new], autojunk=False)
f_of = {}
for blk in sm.get_matching_blocks():
    for k in range(blk.size):
        f_of[blk.a + k] = round(new[blk.b + k]['start'] * 30)
# unmatched old words: interpolate between matched neighbours
idx = sorted(f_of)
for i in range(len(old)):
    if i in f_of:
        continue
    lo = max([j for j in idx if j < i], default=None)
    hi = min([j for j in idx if j > i], default=None)
    if lo is None:
        f_of[i] = 0
    elif hi is None:
        f_of[i] = f_of[lo] + (i - lo) * 6
    else:
        f_of[i] = round(f_of[lo] + (f_of[hi] - f_of[lo]) * (i - lo) / (hi - lo))
retimed = [{'text': old[i]['text'], 'f': f_of[i]} for i in range(len(old))]
# keep frames monotonic
for i in range(1, len(retimed)):
    retimed[i]['f'] = max(retimed[i]['f'], retimed[i - 1]['f'] + 1)
json.dump(retimed, open(proj + '/src/words.json', 'w'), ensure_ascii=False)

fdur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', face],
                            capture_output=True, text=True).stdout)
json.dump({'frames': int(fdur * 30)}, open(proj + '/src/meta.json', 'w'))
print(f'cut {dur:.2f}s -> {fdur:.2f}s, segments {len(keep)}, matched {len(idx)}/{len(old)} words, frames {int(fdur * 30)}')
