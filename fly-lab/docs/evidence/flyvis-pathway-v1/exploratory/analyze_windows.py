"""Post hoc time-window analysis of an already sealed causal diagnostic.

This runs no neural simulations and changes no gates or original result files.
"""
from pathlib import Path
import hashlib
import json
import numpy as np

HERE = Path(__file__).resolve().parent
RUN = HERE.parent / 'pathway-v1-20260913-first'
REFERENCE = HERE.parent / 'reference-v1-20260913-fourth'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def array_hash(array):
    return hashlib.sha256(memoryview(np.ascontiguousarray(array))).hexdigest()


checksums = json.loads((RUN / 'checksums.json').read_text())
assert all(digest(RUN / name) == expected for name, expected in checksums.items())
results = json.loads((RUN / 'results.json').read_text())
reports, curves = [], {}
for name in ['flash-000', 'flash-001', 'edge-006', 'edge-007']:
    with np.load(RUN / (name + '-original.npz'), allow_pickle=False) as data:
        original = data['wholeNetworkActivity']
        motion_indices = data['centralMotionNodeIndices']
        time = data['timeSeconds']
    with np.load(RUN / (name + '-sham.npz'), allow_pickle=False) as data:
        sham = data['wholeNetworkActivity']
    original_hash, sham_hash = array_hash(original), array_hash(sham)
    assert original.dtype == sham.dtype and original.shape == sham.shape and original_hash == sham_hash
    del sham
    with np.load(RUN / (name + '-block-L1-L2-output.npz'), allow_pickle=False) as data:
        lesion = data['wholeNetworkActivity']
    with np.load(REFERENCE / (name + '.npz'), allow_pickle=False) as data:
        original_central_hash = array_hash(original[:, data['nodeIndices']])
        reference_central_hash = array_hash(data['response'])
    assert original_central_hash == reference_central_hash
    difference = np.abs(lesion - original)
    whole_curve = difference.max(axis=1)
    motion_curve = difference[:, motion_indices].max(axis=1)
    metadata = json.loads((REFERENCE / (name + '.json')).read_text())
    stimulus_duration = metadata.get('t_stim', 1.0)
    masks = {'earlyPreStimulus': time < .2, 'latePreStimulus': (time >= .8) & (time < 1),
             'stimulus': (time >= 1) & (time < 1 + stimulus_duration),
             'postStimulus': time >= 1 + stimulus_duration, 'last200ms': time >= time[-1] - .2}
    row = {'input': name, 'originalWholeNetworkRawSha256': original_hash, 'shamWholeNetworkRawSha256': sham_hash,
           'originalShamRawBytesIdentical': True, 'originalCentralRawSha256': original_central_hash,
           'priorReferenceCentralRawSha256': reference_central_hash,
           'originalMatchesPriorReferenceRawBytes': True,
           'maximumWholeNetworkDifferenceAtFirstFrame': float(whole_curve[0]),
           'maximumWholeNetworkDifferenceAtStimulusOnset': float(whole_curve[np.flatnonzero(time >= 1)[0]]),
           'maximumMotionCellDifferenceAtFirstFrame': float(motion_curve[0]),
           'windows': {key: {'wholeNetworkMaximumAbsoluteDifference': float(whole_curve[mask].max()),
                             'centralT4T5MaximumAbsoluteDifference': float(motion_curve[mask].max())}
                       for key, mask in masks.items()},
           'modelUnits': 'Graded activity, not millivolts or measured biological firing'}
    reports.append(row)
    curves[name + '_timeFromStimulusOnset'] = time - 1
    curves[name + '_wholeNetworkMaxDifference'] = whole_curve
    curves[name + '_centralT4T5MaxDifference'] = motion_curve
    del original, lesion, difference

output = {'scope': 'EXPLORATORY_POST_HOC_WINDOWS_OF_SEALED_DIAGNOSTIC', 'trainingAllowed': False,
          'sourceResultsSha256': digest(RUN / 'results.json'), 'sourceManifestSha256': digest(RUN / 'checksums.json'),
          'analysisSha256': digest(Path(__file__)), 'verifiedSourceFiles': len(checksums),
          'timing': 'Recorded time0 follows a separate one-second gray initialization. Visual stimulus starts at recorded second1. The lesion applied throughout both periods.',
          'interpretation': 'These windows were chosen after observing that the maximum difference occurred at the first recorded frame. They describe an initialization carryover and cannot by themselves identify a biological mechanism or show ongoing L1/L2 transmission.',
          'records': reports}
(HERE / 'results.json').write_text(json.dumps(output, indent=2, allow_nan=False) + '\n')
np.savez_compressed(HERE / 'difference-curves.npz', **curves)
import os
os.environ['MPLBACKEND'] = 'Agg'
import matplotlib.pyplot as plt
fig, axes = plt.subplots(2, 2, figsize=(10, 6), constrained_layout=True)
for ax, name in zip(axes.flat, ['flash-000', 'flash-001', 'edge-006', 'edge-007']):
    for suffix, label in [('wholeNetworkMaxDifference', 'Whole network'), ('centralT4T5MaxDifference', 'Central T4/T5')]:
        ax.semilogy(curves[name + '_timeFromStimulusOnset'], np.maximum(curves[name + '_' + suffix], 1e-8), label=label)
    ax.axvline(0, color='gray', linestyle='--')
    ax.set(title=name, xlabel='Seconds from visual stimulus onset', ylabel='Maximum activity difference')
    ax.legend(fontsize=8)
fig.suptitle('Exploratory follow-up: effects of blocking L1/L2 output, including during initialization')
fig.savefig(HERE / 'difference-windows.png', dpi=140)
plt.close(fig)
(HERE / 'checksums.json').write_text(json.dumps({p.name: digest(p) for p in sorted(HERE.iterdir()) if p.is_file() and p.name != 'checksums.json'}, indent=2) + '\n')
print(json.dumps({'verifiedFiles': len(checksums), 'allRawByteComparisonsPass': True, 'records': reports}, indent=2))
