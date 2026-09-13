"""Bounded official FlyVis reference assay; never authorizes MaleCNS training.

Use the isolated vision-reference Python environment, not the lab environment.
Pretrained files must already be downloaded from the official source. No game,
wallet, reward optimization, reference-cache reuse or pretrained UMAP is used.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import threading
import time
import zipfile
import numpy as np

LAB_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SPEC = LAB_ROOT / 'configs/candidates/flyvis-reference-v1.json'


def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def install_windows_hdf5_writer():
    """Replace datamate's unlink-open-file path with the same array write.

    Datamate 1.0.0 opens mode='w', reads its now-missing 'data' dataset, and
    unlinks the open file in the exception handler. POSIX permits this; Windows
    does not. This isolated adapter preserves its write/truncate and SWMR
    semantics, and changes no connectome data, weights, or network dynamics.
    """
    if os.name != 'nt':
        return False
    import h5py
    import datamate.io
    import datamate.directory
    def write_array(path, value):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with h5py.File(path, libver='latest', mode='w') as stream:
            stream['data'] = np.asarray(value)
            stream.swmr_mode = True
            assert stream.swmr_mode
    datamate.io._write_h5 = write_array
    datamate.directory._write_h5 = write_array
    return True


def install_sparse_eye_renderer(output, spec):
    """Use upstream pixel geometry/rendering with bounded sparse reductions.

    Network input is float32. Dense-reference comparisons must be bit-identical
    at that precision before this adapter can be used in the reference assay.
    """
    import torch
    from scipy.sparse import csr_matrix, vstack
    from flyvis.datasets.rendering.eye import HexEye
    from flyvis.datasets.rendering.utils import hex_center_coordinates, is_inside_hex
    import importlib
    moving_bar = importlib.import_module('flyvis.datasets.moving_bar')
    block = spec['renderer']['geometryColumnBlock']
    class SparseHexEye(HexEye):
        def __init__(self, n_ommatidia=721, ppo=25, monitor_height_px=None, monitor_width_px=None,
                     device='cpu', dtype=torch.float16):
            if str(device) != 'cpu':
                raise ValueError('Sparse reference renderer requires CPU')
            circumference = 2 * (-.5 + np.sqrt(.25 - ((1 - n_ommatidia) / 3))) + 1
            if circumference % 1:
                raise ValueError('Eye must fill a regular hex grid')
            self.monitor_width_px = monitor_width_px or ppo * int(circumference)
            self.monitor_height_px = monitor_height_px or ppo * int(circumference)
            xc, yc, (dw, dh) = hex_center_coordinates(n_ommatidia, self.monitor_width_px, self.monitor_height_px)
            # Same product ordering as the upstream constructor: (x, y), with y fastest.
            x = np.repeat(np.arange(self.monitor_width_px), self.monitor_height_px)
            y = np.tile(np.arange(self.monitor_height_px), self.monitor_width_px)
            tx, ty = torch.tensor(y, dtype=dtype), torch.tensor(x, dtype=dtype)
            rows = []
            for start in range(0, n_ommatidia, block):
                _, mask = is_inside_hex(tx, ty, torch.tensor(xc[start:start + block], dtype=dtype),
                                       torch.tensor(yc[start:start + block], dtype=dtype),
                                       torch.tensor((dw + dh) / 4, dtype=dtype), torch.tensor(0, dtype=dtype),
                                       device='cpu', dtype=dtype)
                rows.append(csr_matrix(mask.numpy().T))
            self.sparse_mask = vstack(rows, format='csr')
            self.kernel_sum = np.asarray(self.sparse_mask.sum(axis=1)).ravel()
            if np.any(self.kernel_sum == 0):
                raise ValueError('Empty receptor pixel support')
            self.n_ommatidia, self.ppo, self.n_hex_circfer = n_ommatidia, ppo, circumference
            self.omm_width_rad = self.omm_height_rad = np.radians(5.8)
            self.device, self.dtype = 'cpu', dtype
        def __call__(self, stim, mode='mean', n_chunks=1):
            if mode not in ['mean', 'sum']:
                raise ValueError('This reference adapter only supports mean/sum')
            array = stim.detach().cpu().numpy().reshape(len(stim), -1)
            if array.shape[1] != self.monitor_width_px * self.monitor_height_px:
                raise ValueError('No resizing is allowed in the fixed reference renderer')
            result = np.asarray(self.sparse_mask @ array.T).T
            if mode == 'mean':
                result = result / self.kernel_sum
            return torch.from_numpy(result)
    dense, sparse = HexEye(7, 5, device='cpu'), SparseHexEye(7, 5)
    if not np.array_equal(dense.is_inside.numpy().T, sparse.sparse_mask.toarray()):
        raise ValueError('Sparse geometry differs from upstream dense geometry')
    dense_outputs, sparse_outputs = [], []
    for angle in spec['edge']['angles']:
        for intensity in [0, 1]:
            kwargs = dict(bar_width_rad=np.radians(180), bar_height_rad=np.radians(180), n_bars=1,
                          bar_intensity=intensity, bg_intensity=.5, moving_angle=angle,
                          bar_loc_theta=np.radians(80), bar_loc_phi=np.radians(90))
            dense_outputs.append(dense.render_bar(**kwargs).numpy())
            sparse_outputs.append(sparse.render_bar(**kwargs).numpy())
    actual, expected = np.stack(sparse_outputs), np.stack(dense_outputs)
    exact = np.array_equal(actual.astype(np.float32), expected.astype(np.float32))
    np.savez_compressed(output / 'renderer-small-dense-comparison.npz', upstream=expected, sparse=actual)
    if not exact:
        raise ValueError('Sparse rendering does not match upstream float32 network inputs')
    # Full-resolution geometry and pixel reductions are also checked at three
    # prespecified receptors, without constructing the 721-column dense product.
    full = SparseHexEye(721, 25)
    selected = np.array([0, 360, 720])
    xc, yc, (dw, dh) = hex_center_coordinates(721, 775, 775)
    xx, yy = np.repeat(np.arange(775), 775), np.tile(np.arange(775), 775)
    _, full_mask = is_inside_hex(torch.tensor(yy, dtype=torch.float16), torch.tensor(xx, dtype=torch.float16),
                                torch.tensor(xc[selected], dtype=torch.float16), torch.tensor(yc[selected], dtype=torch.float16),
                                torch.tensor((dw + dh) / 4, dtype=torch.float16), torch.tensor(0, dtype=torch.float16),
                                device='cpu', dtype=torch.float16)
    if not np.array_equal(full_mask.numpy().T, full.sparse_mask[selected].toarray()):
        raise ValueError('Full-resolution selected receptor geometry differs')
    from types import SimpleNamespace
    proxy = SimpleNamespace(monitor_width_px=775, monitor_height_px=775, is_inside=full_mask,
                            kernel_sum=full_mask.sum(dim=0))
    full_expected, full_actual = [], []
    for angle in [0, 30, 90, 180, 270]:
        for intensity in [0, 1]:
            kwargs = dict(bar_width_rad=np.radians(180), bar_height_rad=np.radians(180), n_bars=1,
                          bar_intensity=intensity, bg_intensity=.5, moving_angle=angle,
                          bar_loc_theta=np.radians(0), bar_loc_phi=np.radians(90))
            cartesian = full.render_bar(**kwargs, cartesian=True)
            tensor = torch.from_numpy(cartesian.ravel()[None])
            full_expected.append(HexEye.__call__(proxy, tensor).numpy())
            full_actual.append(full(tensor).numpy()[:, selected])
    full_expected, full_actual = np.stack(full_expected), np.stack(full_actual)
    full_exact = np.array_equal(full_expected.astype(np.float32), full_actual.astype(np.float32))
    np.savez_compressed(output / 'renderer-full-selected-dense-comparison.npz', upstream=full_expected,
                        sparse=full_actual, receptorIndices=selected)
    if not full_exact:
        raise ValueError('Full-resolution sparse rendering changes delivered float32 values')
    moving_bar.HexEye = SparseHexEye
    return {'smallEyeFloat32BitIdentical': exact, 'fullSelectedFloat32BitIdentical': full_exact,
            'smallEyeMaximumFloat64Difference': float(np.max(np.abs(actual - expected))),
            'fullSelectedMaximumFloat64Difference': float(np.max(np.abs(full_actual - full_expected))),
            'geometryColumnBlock': block, 'fullResolutionReceptorIndices': selected.tolist(),
            'upstreamGeometryAndBarRendering': True, 'scope': 'I/O and allocation adapter, not neural dynamics'}


def evaluate_screen(flash, flash_rows, edge, edge_rows, blank, repeats, cell_types, spec):
    """Pure analysis of every prespecified central cell, retaining failures."""
    c, dt = spec['criteria'], spec['dtSeconds']
    names = list(cell_types)
    targets = list(spec['preferredDirectionsDegrees'])
    arrays = [flash, edge, blank, *[item for pair in repeats for item in pair]]
    finite = all(np.isfinite(value).all() for value in arrays)
    if not finite:
        return {'status': 'FAIL', 'scope': spec['scope'], 'trainingAllowed': False,
                'gates': {'finite': {'status': 'FAIL'}}, 'reason': 'Nonfinite responses cannot support selectivity metrics.'}
    if len(set(names)) != len(names) or any(name not in names for name in [*targets, 'L1', 'L2']):
        raise ValueError('Unique nominated central cell types are required')
    if flash.ndim != 3 or edge.ndim != 3 or blank.ndim != 2:
        raise ValueError('Expected trial x frame x cell arrays and one blank frame x cell array')
    if len(flash_rows) != len(flash) or len(edge_rows) != len(edge):
        raise ValueError('Stimulus metadata does not match responses')
    if any(array.shape[-1] != len(names) for array in arrays):
        raise ValueError('Cell metadata does not match responses')
    before_flash = round(spec['flash']['t_pre'] / dt)
    before_edge = round(spec['edge']['t_pre'] / dt)
    baseline_bins = max(1, round(c['baselineWindowSeconds'] / dt))
    onset_bins = max(1, round(c['flashOnsetWindowSeconds'] / dt))
    if before_flash < baseline_bins or before_edge < baseline_bins:
        raise ValueError('Insufficient preregistered baseline window')
    if flash.shape[1] < before_flash + onset_bins or edge.shape[1] <= before_edge or blank.shape[0] <= before_edge:
        raise ValueError('Insufficient response duration for the preregistered windows')
    if any(a.shape != b.shape for a, b in repeats):
        raise ValueError('Repeated response shapes must match exactly')
    flash_delta = (flash[:, before_flash:before_flash + onset_bins].mean(axis=1)
                   - flash[:, before_flash - baseline_bins:before_flash].mean(axis=1))
    flash_metrics = {}
    for name in ['L1', 'L2']:
        idx = names.index(name)
        values = {}
        for intensity in [0, 1]:
            selected = [i for i, row in enumerate(flash_rows) if row['intensity'] == intensity and row['radius'] == 6]
            if len(selected) != 1:
                raise ValueError('One ON and OFF radius-six flash are required')
            values['on' if intensity else 'off'] = float(flash_delta[selected[0], idx])
        values['matches'] = values['on'] < -c['minimumResponse'] and values['off'] > c['minimumResponse']
        flash_metrics[name] = values
    amplitudes = []
    for i, row in enumerate(edge_rows):
        end = min(edge.shape[1], before_edge + round((float(row['t_stim']) + c['edgePostWindowSeconds']) / dt))
        if end <= before_edge:
            raise ValueError('Empty edge response window')
        baseline = edge[i, before_edge - baseline_bins:before_edge].mean(axis=0)
        amplitudes.append(np.maximum(0, edge[i, before_edge:end].max(axis=0) - baseline))
    amplitudes = np.asarray(amplitudes)
    tuning, cell_metrics = {}, {}
    eps = c['minimumResponse']
    angles = spec['edge']['angles']
    for name in targets:
        idx, preferred = names.index(name), spec['preferredDirectionsDegrees'][name]
        curves = {}
        for intensity in [0, 1]:
            values = []
            for angle in angles:
                selected = [i for i, row in enumerate(edge_rows) if row['intensity'] == intensity and row['angle'] == angle]
                if len(selected) != 1:
                    raise ValueError('Every preregistered edge angle/contrast must appear exactly once')
                values.append(float(amplitudes[selected[0], idx]))
            curves[str(intensity)] = values
        on, off = max(curves['1']), max(curves['0'])
        expected = '1' if name.startswith('T4') else '0'
        signed_contrast = (on - off) / max(on + off, eps)
        contrast = signed_contrast if expected == '1' else -signed_contrast
        pd = curves[expected][angles.index(preferred)]
        nd = curves[expected][angles.index((preferred + 180) % 360)]
        opponent = (pd - nd) / max(pd + nd, eps)
        weighted = np.asarray(curves[expected])
        vector = np.sum(weighted * np.exp(1j * np.deg2rad(angles)))
        dsi = abs(vector) / max(float(weighted.sum()), eps)
        tuning[name] = curves
        cell_metrics[name] = {'onPeak': on, 'offPeak': off, 'contrastIndexExpectedSign': float(contrast),
                              'expectedDirectionDegrees': preferred, 'preferredResponse': pd, 'opponentResponse': nd,
                              'preferredOpponentIndex': float(opponent), 'vectorDSI': float(dsi),
                              'nontrivial': max(on, off) > eps,
                              'contrastMatches': contrast >= c['minimumContrastIndex'],
                              'directionMatches': opponent >= c['minimumPreferredOpponentIndex']}
    repeat_metrics = [{'allClose': bool(np.allclose(a, b, atol=c['repeatAtol'], rtol=c['repeatRtol'])),
                       'maximumAbsoluteDifference': float(np.max(np.abs(a - b)))} for a, b in repeats]
    blank_range = float(np.ptp(blank[before_edge:], axis=0).max())
    contrast_matches = sum(row['contrastMatches'] for row in cell_metrics.values())
    direction_matches = sum(row['directionMatches'] for row in cell_metrics.values())
    decisions = {'finite': True, 'targetsNontrivial': all(row['nontrivial'] for row in cell_metrics.values()),
                 'l1L2FlashPolarity': all(row['matches'] for row in flash_metrics.values()),
                 'contrastSelectivity': contrast_matches >= c['minimumContrastMatches'],
                 'preferredVersusOpponent': direction_matches >= c['minimumDirectionMatches'],
                 'repeatDeterminism': len(repeats) == 2 and all(row['allClose'] for row in repeat_metrics),
                 'blankStability': blank_range <= c['maximumBlankRange']}
    return {'status': 'PASS' if all(decisions.values()) else 'FAIL', 'scope': spec['scope'], 'trainingAllowed': False,
            'gates': {name: {'status': 'PASS' if passed else 'FAIL'} for name, passed in decisions.items()},
            'flash': flash_metrics, 'cells': cell_metrics, 'tuning': tuning, 'repeats': repeat_metrics,
            'blankMaximumRange': blank_range, 'contrastMatches': contrast_matches, 'directionMatches': direction_matches,
            'interpretation': spec['criteriaInterpretation']}


def verify_pretrained(data_root, spec):
    archive = data_root / spec['archiveName']
    if file_hash(archive) != spec['archiveSha256']:
        raise ValueError('Pretrained archive does not match the official SHA256')
    prefix = spec['model'].rstrip('/') + '/'
    compared = {}
    with zipfile.ZipFile(archive) as package:
        entries = [entry for entry in package.infolist() if not entry.is_dir() and entry.filename.startswith(prefix)]
        if not entries:
            raise ValueError('Official archive has no declared model directory')
        for entry in entries:
            if '..' in Path(entry.filename).parts:
                raise ValueError('Unexpected archive traversal path')
            local = data_root / entry.filename
            expected = hashlib.sha256(package.read(entry)).hexdigest()
            if file_hash(local) != expected:
                raise ValueError('Extracted pretrained file mismatch: ' + entry.filename)
            compared[entry.filename] = expected
    return compared


def make_figures(output, flash, cell_types, spec, metrics):
    import matplotlib.pyplot as plt
    time_axis = np.arange(flash.shape[1]) * spec['dtSeconds'] - spec['flash']['t_pre']
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.7), constrained_layout=True)
    for ax, name in zip(axes, ['L1', 'L2']):
        idx = cell_types.index(name)
        for trial, label, color in [(0, 'OFF / dark spot', '#aa673d'), (1, 'ON / bright spot', '#267ba2')]:
            ax.plot(time_axis, flash[trial, :, idx], label=label, color=color)
        ax.axvspan(0, spec['flash']['t_stim'], color='gray', alpha=.12)
        ax.set(title=name + ' — graded model activity', xlabel='Seconds from flash onset', ylabel='Model activity units')
        ax.legend(fontsize=8)
    fig.suptitle('Official FlyVis model 000: measured simulation responses, not MaleCNS')
    fig.savefig(output / 'flash-responses.png', dpi=160); plt.close(fig)
    fig, axes = plt.subplots(2, 4, subplot_kw={'projection': 'polar'}, figsize=(12, 6), constrained_layout=True)
    angles = np.deg2rad([*spec['edge']['angles'], spec['edge']['angles'][0]])
    for ax, name in zip(axes.flat, spec['preferredDirectionsDegrees']):
        for intensity, label, color in [('1', 'ON', '#267ba2'), ('0', 'OFF', '#aa673d')]:
            values = metrics['tuning'][name][intensity]
            ax.plot(angles, [*values, values[0]], label=label, color=color)
        ax.set_title(name, fontsize=10)
        ax.tick_params(labelsize=7)
    axes[0, 0].legend(loc='lower left', bbox_to_anchor=(-.35, -.35), fontsize=8)
    fig.suptitle('Moving-edge tuning: peak increase from baseline; all prespecified directions')
    fig.savefig(output / 'edge-tuning.png', dpi=160); plt.close(fig)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--specification', type=Path, default=DEFAULT_SPEC)
    args = parser.parse_args(argv)
    data_root, output, spec_path = args.data_root.resolve(), args.output.resolve(), args.specification.resolve()
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    if spec['scope'] != 'PUBLISHED_FLYVIS_REFERENCE_SCREEN_NOT_MALECNS_VALIDATION' or spec['trainingAllowed'] is not False:
        raise ValueError('This script only supports explicitly separate reference screens')
    verified_files = verify_pretrained(data_root, spec)
    output.mkdir(parents=True, exist_ok=False)
    write_json(output / 'specification.json', spec)
    script_hash, spec_hash = file_hash(__file__), file_hash(spec_path)
    start = time.monotonic()
    # Importing flyvis normally searches ancestor .env files. Disable that behavior
    # and set an explicit isolated root before ANY flyvis/torch/matplotlib import.
    os.environ['PYTHON_DOTENV_DISABLED'] = '1'
    os.environ['MPLBACKEND'] = 'Agg'
    os.environ['FLYVIS_ROOT_DIR'] = str(data_root)
    os.environ['CUDA_VISIBLE_DEVICES'] = ''
    os.environ['OMP_NUM_THREADS'] = str(spec['threads'])
    os.environ['MKL_NUM_THREADS'] = str(spec['threads'])
    os.chdir(data_root)
    def timed_out():
        write_json(output / 'interrupted.json', {'status': 'NOT_RUN', 'reason': 'Reference wall-clock budget exhausted',
                                               'trainingAllowed': False, 'elapsedSeconds': time.monotonic() - start})
        os._exit(124)
    timer = threading.Timer(spec['maximumWallSeconds'], timed_out)
    timer.daemon = True; timer.start()
    memory_stop = threading.Event()
    def monitor_memory():
        import psutil
        process = psutil.Process()
        while not memory_stop.wait(.1):
            rss = process.memory_info().rss
            if rss > spec['maximumRssBytes']:
                write_json(output / 'interrupted.json', {'status': 'NOT_RUN', 'trainingAllowed': False,
                           'reason': 'Reference RSS budget exceeded', 'rssBytes': rss,
                           'maximumRssBytes': spec['maximumRssBytes'], 'elapsedSeconds': time.monotonic() - start})
                os._exit(125)
    threading.Thread(target=monitor_memory, daemon=True).start()
    try:
        import torch
        torch.set_num_threads(spec['threads']); torch.set_num_interop_threads(1)
        torch.use_deterministic_algorithms(True)
        import flyvis
        from flyvis import NetworkView
        from flyvis.datasets.flashes import Flashes
        from flyvis.datasets.moving_bar import MovingEdge
        windows_hdf5_adapter = install_windows_hdf5_writer()
        if importlib.metadata.version('flyvis') != spec['packageVersion']:
            raise ValueError('FlyVis version differs from the frozen specification')
        if str(flyvis.device) != 'cpu':
            raise ValueError('CPU execution was required')
        renderer_adapter = install_sparse_eye_renderer(output, spec)
        write_json(output / 'renderer-equivalence.json', renderer_adapter)
        # Official loader explicitly uses weights_only=False. The inference
        # experiment needs tensors only, so use PyTorch's restricted loader.
        def recover_safely(network, checkpoint):
            state = torch.load(checkpoint, map_location='cpu', weights_only=True)
            network.load_state_dict(state['network'], strict=True)
            return network
        view = NetworkView(data_root / spec['model'], recover_fn=recover_safely)
        checkpoint = Path(view.get_checkpoint('best'))
        network = view.init_network()
        network.eval()
        for parameter in network.parameters():
            parameter.requires_grad_(False)
        initial_parameters = {name: value.detach().clone() for name, value in network.state_dict().items()}
        centers = np.asarray(network.connectome.central_cells_index[:], dtype=np.int64)
        cell_types = np.asarray(network.connectome.nodes.type[:])[centers].astype('U').tolist()
        dt = spec['dtSeconds']
        flash_dataset = Flashes(**spec['flash'], dt=dt)
        edge_dataset = MovingEdge(**spec['edge'], dt=dt, device='cpu')
        rows, outputs, pixels = {}, {}, {}
        def simulate(name, stimulus, meta):
            stimulus = np.asarray(stimulus, dtype=np.float32)
            if stimulus.ndim != 2 or stimulus.shape[1] != 721 or not np.isfinite(stimulus).all():
                raise ValueError('Expected finite frame x 721 official hex stimulus')
            with torch.inference_mode():
                initial = network.steady_state(spec['initialGraySeconds'], dt, batch_size=1, value=.5)
                activity = network.simulate(torch.from_numpy(stimulus)[None, :, None, :], dt, initial_state=initial)
                response = activity[0].index_select(-1, torch.as_tensor(centers, dtype=torch.long)).detach().cpu().numpy().copy()
            if response.shape != (len(stimulus), len(centers)):
                raise ValueError('Unexpected central response shape')
            elapsed = time.monotonic() - start
            rows[name] = {**meta, 'frames': len(stimulus), 'elapsedSeconds': elapsed}
            np.savez_compressed(output / (name + '.npz'), stimulus=stimulus, response=response,
                                cellTypes=np.asarray(cell_types, dtype='U'), nodeIndices=centers,
                                timeSeconds=np.arange(len(stimulus)) * dt)
            write_json(output / (name + '.json'), rows[name])
            print(json.dumps({'trial': name, 'elapsedSeconds': round(elapsed, 2),
                              'finite': bool(np.isfinite(response).all())}), flush=True)
            return response
        for family, dataset in [('flash', flash_dataset), ('edge', edge_dataset)]:
            outputs[family], pixels[family] = [], []
            for index in range(len(dataset)):
                stimulus = dataset[index].detach().cpu().numpy()
                meta = json.loads(dataset.arg_df.iloc[index].to_json())
                name = f'{family}-{index:03d}'
                outputs[family].append(simulate(name, stimulus, meta))
                pixels[family].append(stimulus)
        blank = simulate('blank', np.full_like(pixels['edge'][0], .5), {'kind': 'uniform-gray-control', 'intensity': .5})
        repeats = []
        for family in ['flash', 'edge']:
            repeat = simulate('repeat-' + family, pixels[family][0], {'kind': 'fresh-state-repeat', 'of': family + '-000'})
            repeats.append((outputs[family][0], repeat))
        flash, edge = np.stack(outputs['flash']), np.stack(outputs['edge'])
        flash_rows = [rows[f'flash-{i:03d}'] for i in range(len(flash))]
        edge_rows = [rows[f'edge-{i:03d}'] for i in range(len(edge))]
        metrics = evaluate_screen(flash, flash_rows, edge, edge_rows, blank, repeats, cell_types, spec)
        unchanged = all(torch.equal(initial_parameters[name], value) for name, value in network.state_dict().items())
        sources_unchanged = file_hash(__file__) == script_hash and file_hash(spec_path) == spec_hash
        metrics['gates']['parametersUnchanged'] = {'status': 'PASS' if unchanged else 'FAIL'}
        metrics['gates']['sourcesUnchanged'] = {'status': 'PASS' if sources_unchanged else 'FAIL'}
        if not unchanged or not sources_unchanged:
            metrics['status'] = 'FAIL'
        metadata = {'createdAt': datetime.now(timezone.utc).isoformat(), 'scope': spec['scope'], 'trainingAllowed': False,
                    'sourceCommit': spec['sourceCommit'], 'archiveSha256': spec['archiveSha256'],
                    'verifiedExtractedModelFiles': verified_files, 'checkpoint': str(checkpoint.relative_to(data_root)),
                    'checkpointSha256': file_hash(checkpoint), 'scriptSha256': script_hash, 'specificationSha256': spec_hash,
                    'python': sys.version, 'packages': {key: importlib.metadata.version(key) for key in ['flyvis', 'torch', 'numpy', 'datamate']},
                    'device': 'cpu', 'threads': spec['threads'], 'seconds': time.monotonic() - start,
                    'windowsHdf5IoAdapter': windows_hdf5_adapter,
                    'rendererAdapter': renderer_adapter,
                    'observedCells': cell_types, 'nodeCount': int(len(network.connectome.nodes.type[:])),
                    'stimulusCount': len(rows), 'noGameStateOrReward': True,
                    'measurement': 'Graded central-cell model activity; not spikes, not living neurons, not MaleCNS body IDs.'}
        write_json(output / 'results.json', metrics); write_json(output / 'metadata.json', metadata)
        if 'tuning' in metrics:
            make_figures(output, flash, cell_types, spec, metrics)
        report = ['# Official FlyVis reference screen', '', '**Result: ' + metrics['status'] + '**', '',
                  'This is one frozen, optic-flow-trained FlyVis model on its own published visual connectome. '
                  'It does not validate the MaleCNS retinal mapping, decoder, conditioning or game-learning gates. '
                  'The weights were not trained on Scicon or changed for this experiment.', '',
                  '| Engineering criterion | Result |', '|---|---|']
        report += ['| ' + name + ' | ' + result['status'] + ' |' for name, result in metrics['gates'].items()]
        report += ['', spec['criteriaInterpretation'], '',
                   'All stimulus and central response arrays, source cell indices, parameters and runtime hashes are included. '
                   'The blank and repeated inputs are freshly simulated; no response-cache hit can satisfy determinism.', '',
                   '![Flash responses](flash-responses.png)', '![Edge tuning](edge-tuning.png)', '',
                   '[Official model and paper](' + spec['sources']['paper'] + ')',
                   '[Frozen source dynamics](' + spec['sources']['dynamics'] + ')']
        (output / 'report.md').write_text('\n'.join(report) + '\n', encoding='utf-8')
        write_json(output / 'checksums.json', {p.name: file_hash(p) for p in sorted(output.iterdir()) if p.is_file()})
        print(json.dumps({'status': metrics['status'], 'output': str(output), 'trainingAllowed': False}), flush=True)
        return 0
    except Exception as error:
        write_json(output / 'interrupted.json', {'status': 'NOT_RUN', 'reason': type(error).__name__ + ': ' + str(error),
                                               'trainingAllowed': False, 'elapsedSeconds': time.monotonic() - start})
        raise
    finally:
        timer.cancel()
        memory_stop.set()


if __name__ == '__main__':
    raise SystemExit(main())
