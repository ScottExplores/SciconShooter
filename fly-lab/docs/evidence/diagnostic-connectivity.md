# Frozen MaleCNS sensory-boundary diagnosis

Post-screen diagnostic only. No parameters were fitted and no biological gate was passed.

The graph has 166,700 retained neurons, 25,582,938 directed pairs and 124,177,617 contacts.
The candidate directly drives 1,767 cells: {'L1': 1767}; modeled fast signs {'-1': 1767}.

| Edge policy | Input → visual KCs | Input → MBONs | Input → decoder | Ordered KC/MBON route |
|---|---:|---:|---:|---|
| anatomical | 335/335 (2–3 hops) | 97/97 (2–3 hops) | 97/97 (2–3 hops) | True |
| fast_nonzero | 335/335 (2–3 hops) | 97/97 (3–4 hops) | 97/97 (3–4 hops) | True |
| excitatory_only | 0/335 | 0/97 | 0/97 | False |

These are sparse shortest-path measurements, not predicted physiological responses. Inhibitory influence remains explicitly inhibitory in the fast-nonzero policy.

Direct visual-KC → MBON anatomy: {'directedPairs': 4407, 'contacts': 40114, 'contributingSources': 335, 'reachedTargets': 68}.
Decoder effective population: 97 cells; 97 overlap the MBON assay population. Readout entirely within that population: True. Overlap is a zero-hop software boundary, not a tested VNC motor pathway.

Sufficient quiescent-LIF barrier present: **True**. Under these conditions, undriven membrane potentials cannot exceed rest: nonpositive input cannot initiate downstream spikes. More simulated time alone cannot remove this barrier.

All saved stimuli have zero nominated visual-KC and MBON spikes: True. If the sufficient quiescent barrier holds, structural connections and a longer probe alone cannot create downstream excitation.

A new version needs evidence-based sensory transduction/graded visual physiology, resting activity and receptor effects, followed by new frozen assays. This diagnostic does not authorize changing signs or thresholds to obtain a positive result.

Reproduce with the command and file hashes in the companion JSON. That file also includes exact example body-ID paths, contact counts, hop distributions, timing bounds, source identities and measured resource use.
