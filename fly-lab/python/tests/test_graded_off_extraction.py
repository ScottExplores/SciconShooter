"""Small graphs exercise directed boundary partitioning and preserved anatomy."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np

from scicon_fly.model import SparseGraph

_script = Path(__file__).resolve().parents[2] / "scripts/extract-graded-off-circuit.py"
_spec = importlib.util.spec_from_file_location("graded_off_extraction", _script)
extractor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(extractor)


class GradedOffExtractionTests(unittest.TestCase):
    def test_reordered_patch_retains_recurrence_autapse_weak_and_zero_sign_edges(self):
        # Global 0 -> 1, 0 -> 2; 1 -> 0, 1 -> 1, 1 -> 3;
        # 2 -> 1; 3 -> 2. Selected global 1, 0, in that order.
        graph = SparseGraph([101, 102, 103, 104], [0, 2, 5, 6, 7],
                            [1, 2, 0, 1, 3, 1, 2], [1, 4, 3, 2, 5, 6, 7],
                            [0, -1, 1, 1], {},
                            {"neuron_types": ["A", "B", "C", "C"],
                             "neurotransmitters": ["unknown", "gaba", "acetylcholine", "acetylcholine"]})
        internal, incoming, outgoing = extractor.extract_edges(graph, [1, 0])
        self.assertEqual(internal, [
            {"source": 0, "target": 0, "contacts": 2, "sourceSign": -1},
            {"source": 0, "target": 1, "contacts": 3, "sourceSign": -1},
            {"source": 1, "target": 0, "contacts": 1, "sourceSign": 0},
        ])
        self.assertEqual(incoming, [(2, 1, 6)])
        self.assertEqual(outgoing, [(0, 2, 4), (1, 3, 5)])
        summary = extractor.summarize(outgoing, incoming=False, graph=graph)
        self.assertEqual(summary["contacts"], 9)
        self.assertEqual(summary["distinctOutsideNeurons"], 2)
        self.assertEqual({r["sourceSign"] for r in summary["byOutsideTypeTransmitterAndSourceSign"]}, {-1, 0})

    def test_bad_selection_and_fractional_counts_fail(self):
        graph = SparseGraph([1, 2], [0, 1, 1], [1], [0.5], [1, 1], {})
        for selected in ([0, 0], [-1], [2]):
            with self.assertRaises(ValueError):
                extractor.extract_edges(graph, selected)
        with self.assertRaisesRegex(ValueError, "integers"):
            extractor.extract_edges(graph, [0])


if __name__ == "__main__":
    unittest.main()
