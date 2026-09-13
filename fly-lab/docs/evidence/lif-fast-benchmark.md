# Optional preallocated LIF backend

The optional `FastLIFModel` retains every neuron, connection, floating-point
operation order, delay, refractory rule and delivery-time efficacy lookup in
the reference model. It replaces repeated dense temporary arrays and boolean
index copies with six reusable NumPy buffers. Additional persistent scratch
storage on the 166,700-neuron graph is 5,667,800 bytes (about 5.41 MiB).

The worker still uses `LIFModel`. Assays accept `backend="preallocated"` or
`--backend preallocated`; omitted selection remains `reference`. Reports name
the execution backend, version and implementation SHA256 separately from the
unchanged graph/physiology/mapping/criteria identity. No training gate changed.

## Recorded performance

Three trials per condition followed an equal same-condition warmup. Backend
order alternated. Each timed call integrated 200 steps of 0.1 ms; loading,
initialization, reset and correctness checks were outside that timing.

| 20 ms condition | Reference median | Candidate median | Measured ratio |
|---|---:|---:|---:|
| Actual graph, silent | 1.3615 s | 0.2647 s | 5.14× |
| Actual graph, first 16 exact L1 cells at 20 mV | 1.3417 s | 0.2686 s | 5.00× |
| Synthetic active 256-cell network | 0.01042 s | 0.00755 s | 1.38× |

The actual graph contains 166,700 neurons and 25,582,938 directed pairs. The L1
probe reproduces `full_graph_sanity`'s artificial stimulus; it produces 32
spikes in 16 neurons. It is not a calibrated sensory input. The timed benchmark
including setup and verification took 18.07 seconds. Concurrent background
Torch installation/disk writes may affect these small-sample timing ratios.
These are bounded numerical measurements, not predicted game or training
throughput. The candidate still took about 13.4 wall seconds per simulated
second on the stimulated probe; it does not establish real-time operation.

## Numerical checks

All measured final checkpoint fields matched by SHA256, with identical spike
count vectors. A separate 13.88-second actual-graph verification compared raw
bytes of voltage, conductance, last-spike index, delayed-spike queue and spike
bins at **every timestep** of both 20 ms probes. It also checked clock, total
spikes, efficacy and anatomical baseline. Every comparison matched.

Focused tests compare complete reference/candidate state on active synthetic
fixtures, including simultaneous excitation/inhibition, duplicate targets,
autapses, zero-sign edges, refractory arrivals, dynamic efficacy, silencing,
reset, checkpoint restoration, aliased input and three parameter regimes.
An independently specified Brian2 network matches voltage/conductance within
2e-10 mV and spike bins exactly. This is numerical validation of the implemented
equations, not evidence that these equations reproduce fly physiology.

The final focused command passed **14 tests** (9 optional-backend/assay tests
and 5 existing diagnostic tests). Brian2 emitted 26 upstream deprecation
warnings. Assay-selection tests also verify unchanged default behavior,
unknown-selection rejection, identical scientific results/criteria/identity,
and `trainingAllowed: false`.

## Reproduction

From `fly-lab`, after activating its pinned Python environment and setting
`PYTHONPATH=python`:

```text
python -m pytest python/tests/test_lif_fast.py python/tests/test_diagnostics.py -q --disable-warnings
python docs/evidence/lif-fast-benchmark.py
python docs/evidence/lif-fast-benchmark-trajectory.py
python -m scicon_fly.assays --graph data/compiled/v1.0/graph.npz --manifest data/compiled/v1.0/manifest.json --backend preallocated --modeled-ms 20 --stimulus-type L1 --nominated-count 16
```

The two benchmark scripts intentionally refuse to overwrite existing JSON
evidence. Reproduction should run in a separate checkout/output surface with
those result files absent; do not erase the original evidence. Their JSON
reports preserve exact source/graph hashes, neuron IDs, all trial timings and
state/trajectory hashes. The timing report predates the later assay-selection
tests; the unchanged backend and reference source hashes remain the numerical
implementation identity. `lif-fast-benchmark-assay.json` records the actual
CLI smoke test, including explicit backend/version and its unchanged blocked
retinal-validation result.
