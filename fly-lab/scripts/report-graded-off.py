"""Render descriptive plots from frozen traces, without rerunning or fitting."""
import argparse
import hashlib
import json
from pathlib import Path
import os
os.environ['MPLBACKEND'] = 'Agg'
import numpy as np
import matplotlib.pyplot as plt

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--record', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
record, output = args.record, args.output
checksums = json.loads((record / 'checksums.json').read_text())
for name, digest in checksums.items():
    with (record / name).open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != digest:
            raise ValueError('Artifact mismatch: ' + name)
output.mkdir(parents=True, exist_ok=False)
for name in ['results.json', 'metadata.json', 'status.json', 'checksums.json', 'specification.json', 'protocol-freeze.json']:
    (output / name).write_bytes((record / name).read_bytes())
types = np.array([cell['type'] for cell in json.loads((record / 'circuit.json').read_text())['neurons']])
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10})
fig, axes = plt.subplots(2, 2, figsize=(12, 7.8), constrained_layout=True)
colors = {'L2': '#2869b5', 'Tm1': '#d56b14', 'Tm2': '#368052'}
for ax, trial, title in zip(axes.flat, ['step_OFF__intact', 'step_ON__intact', 'step_OFF__block_L2_output', 'heldout_noise_86013__intact'],
                            ['Dark step: signal reaches downstream cells', 'Bright step: opposite response at this contrast',
                             'Block L2 outputs: downstream response disappears', 'Reserved flicker input: bounded responses']):
    with np.load(record / (trial + '.npz'), allow_pickle=False) as values:
        t = values['time_ms'] / 1000
        for name, color in colors.items():
            ax.plot(t, values['release'][:, types == name].mean(axis=1) - .25, color=color, label=name, linewidth=1.6)
        if 'step_' in trial:
            ax.axvspan(.4, 1.4, color='#999999', alpha=.12)
        ax.axhline(0, color='#555555', linewidth=.6)
        ax.set(title=title, xlabel='Simulated seconds', ylabel='Mean release change (model units)')
        ax.grid(alpha=.15); ax.legend(frameon=False, loc='best', fontsize=9)
fig.suptitle('57-cell MaleCNS circuit: engineering checks passed\nAssumed physiology and sensory input; biological vision and learning remain unvalidated', fontsize=15)
fig.savefig(output / 'responses.png', dpi=160)
plt.close(fig)
print(json.dumps({'output': str(output), 'sourceArtifactsVerified': len(checksums)}))
