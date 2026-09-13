"""Focused equation/serialization tests, not evidence of fly learning."""
import copy
import json
from pathlib import Path
import unittest

import numpy as np

from scicon_fly.reduced_conditioning import ReducedRateCircuit, canonical, make_inputs


CONFIG = json.loads((Path(__file__).resolve().parents[2] / "configs/reduced-conditioning-v1.json").read_text())


class ReducedConditioningTests(unittest.TestCase):
    def test_analytic_no_reinforcement_filter(self):
        model = ReducedRateCircuit([2, 3], CONFIG)
        for _ in range(50):
            model.step([1, 0], 0)
        expected = CONFIG["kcDriveHz"] * (1-np.exp(-1/CONFIG["cellTimeConstantSeconds"]))
        self.assertAlmostEqual(model.kc[0], expected, places=12)
        self.assertEqual(model.kc[1], 0)
        np.testing.assert_array_equal(model.efficacy, [1, 1])

    def test_frozen_preserves_both_trace_and_efficacy(self):
        model = ReducedRateCircuit([2, 3], CONFIG)
        for _ in range(20):
            model.step([1, 0], 1)
        weights, trace = model.efficacy.copy(), model.eligibility.copy()
        for _ in range(20):
            model.step([0, 1], 1, frozen=True)
        np.testing.assert_array_equal(model.efficacy, weights)
        np.testing.assert_array_equal(model.eligibility, trace)

    def test_checkpoint_roundtrip_continuation_and_identity(self):
        model = ReducedRateCircuit([2, 3], CONFIG)
        for _ in range(20):
            model.step([1, 0], 1)
        checkpoint = json.loads(canonical(model.state_dict()))
        restored = ReducedRateCircuit([2, 3], CONFIG)
        restored.restore(checkpoint)
        model.step([0, 1], 0)
        restored.step([0, 1], 0)
        self.assertEqual(model.state_dict(), restored.state_dict())
        with self.assertRaisesRegex(ValueError, "anatomy mismatch"):
            ReducedRateCircuit([3, 2], CONFIG).restore(checkpoint)
        changed = dict(CONFIG, etaPerSecond=CONFIG["etaPerSecond"]*2)
        with self.assertRaisesRegex(ValueError, "model/anatomy mismatch"):
            ReducedRateCircuit([2, 3], changed).restore(checkpoint)
        corrupt = copy.deepcopy(checkpoint)
        corrupt["efficacy"][0] = float("nan")
        with self.assertRaises(ValueError):
            restored.restore(corrupt)

    def test_cue_assignment_is_seeded_sparse_disjoint_and_frozen(self):
        a, g = make_inputs(720, 1924, CONFIG)
        b, h = make_inputs(720, 1924, CONFIG)
        np.testing.assert_array_equal(a["A"], b["A"])
        np.testing.assert_array_equal(g, h)
        self.assertEqual(int(a["A"].sum()), 36)
        self.assertEqual(int(a["B"].sum()), 36)
        self.assertEqual(int(np.dot(a["A"], a["B"])), 0)


if __name__ == "__main__":
    unittest.main()
