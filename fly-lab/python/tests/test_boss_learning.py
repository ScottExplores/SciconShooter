"""Causal mechanism and persistence tests; no claim of game improvement."""
import copy
import json
from pathlib import Path
import unittest

import numpy as np

from scicon_fly.boss_learning import BossLearningController, identity, encode_transport_checkpoint, decode_transport_checkpoint

CIRCUIT = Path(__file__).resolve().parents[2] / "configs/boss-learning-circuit-v1.json"
FEATURES = {"targetOffset": .2, "targetVisible": True, "playerX": .5}


class BossLearningTests(unittest.TestCase):
    def model(self, seed=1924, learning=True):
        return BossLearningController(CIRCUIT, seed, learning)

    def test_real_nomination_and_telemetry(self):
        c = self.model()
        self.assertEqual(c.n, 241)
        self.assertEqual(c.contacts.sum(), 2975)
        out = c.act(FEATURES)
        self.assertEqual(out["neural"]["neuronCount"], 250)
        self.assertLessEqual(len(out["neural"]["samples"]), 24)
        self.assertTrue(all(s["id"] in c.neurons for s in out["neural"]["samples"]))
        self.assertEqual(len({s["id"] for s in out["neural"]["samples"]}), len(out["neural"]["samples"]))

    def test_reward_changes_real_efficacies_and_future_decisions(self):
        c = self.model()
        initial = c.action_probabilities(FEATURES)[0]
        action = c.act(FEATURES)["action"]["movement"]
        a = ["W", "idle", "E"].index(action)
        c.reinforce(2, .2)
        after = c.action_probabilities(FEATURES)[0]
        self.assertGreater(after[a], initial[a])
        changed = c.weights < 1
        self.assertTrue(np.any(changed))
        self.assertTrue(np.all(c.groups[changed] == a))
        self.assertTrue(np.all(c.contacts[changed] > 0))

    def test_reward_free_behavior_has_no_target_tracking_bias(self):
        c = self.model()
        for x in np.linspace(-1, 1, 11):
            p = c.action_probabilities({**FEATURES, "targetOffset": float(x)})[0]
            np.testing.assert_allclose(p, np.ones(3)/3, rtol=0, atol=1e-15)

    def test_contacts_causally_affect_probes_and_learned_preference(self):
        c = self.model()
        c.weights[np.arange(c.n) % 3 == 0] = .4
        p0, _, raw0, _ = c.action_probabilities(FEATURES)
        c.contacts *= np.linspace(.1, 3, c.n)
        p1, _, raw1, _ = c.action_probabilities(FEATURES)
        self.assertFalse(np.allclose(raw0, raw1))
        self.assertFalse(np.allclose(p0, p1))

    def test_frozen_eval_never_changes_memory_or_eligibility(self):
        c = self.model()
        c.act(FEATURES)
        c.reinforce(2)
        c.reset(preserve_efficacy=True, learning=False, policy_seed=2027)
        before_w, before_e = c.weights.copy(), c.eligibility.copy()
        for _ in range(30):
            c.act(FEATURES, 0)
        np.testing.assert_array_equal(before_w, c.weights)
        np.testing.assert_array_equal(before_e, c.eligibility)
        with self.assertRaises(ValueError):
            c.act(FEATURES, 1)

    def test_full_checkpoint_exact_continuation_and_restore_atomicity(self):
        c = self.model()
        c.act(FEATURES)
        c.act(FEATURES, 1)
        checkpoint = json.loads(json.dumps(c.state_dict()))
        restored = self.model()
        restored.restore(checkpoint)
        self.assertEqual(c.act(FEATURES, .5), restored.act(FEATURES, .5))
        self.assertEqual(c.state_dict(), restored.state_dict())
        bad = copy.deepcopy(checkpoint)
        bad["state"]["weights"][0] = -.5
        before = restored.state_dict()
        with self.assertRaises(ValueError):
            restored.restore(bad)
        self.assertEqual(before, restored.state_dict())
        bad["sha256"] = identity(bad["state"])
        with self.assertRaises(ValueError):
            restored.restore(bad)
        self.assertEqual(before, restored.state_dict())

    def test_opaque_checkpoint_preserves_large_rng_integers_and_numeric_tokens(self):
        c = self.model()
        c.act(FEATURES)
        original = c.state_dict()
        self.assertGreater(original["state"]["rng"]["state"]["state"], 2**53)
        opaque = encode_transport_checkpoint(original)
        self.assertEqual(opaque["format"], "opaque-python-json-v1")
        self.assertTrue(all(isinstance(x, str) for x in opaque.values()))
        restored = decode_transport_checkpoint(json.loads(json.dumps(opaque)))
        self.assertEqual(original, restored)
        other = self.model(); other.restore(restored)
        for _ in range(20):
            self.assertEqual(c.act(FEATURES, .5), other.act(FEATURES, .5))

    def test_opaque_checkpoint_rejects_corrupt_bytes_and_legacy_transport(self):
        c = self.model()
        checkpoint = encode_transport_checkpoint(c.state_dict())
        bad = copy.deepcopy(checkpoint)
        bad["payload"] = "!invalid base64"
        with self.assertRaises(ValueError):
            decode_transport_checkpoint(bad)
        bad = copy.deepcopy(checkpoint)
        bad["sha256"] = "0"*64
        with self.assertRaises(ValueError):
            decode_transport_checkpoint(bad)
        with self.assertRaises(ValueError):
            decode_transport_checkpoint(c.state_dict())

    def test_bandit_positive_control_is_explicitly_synthetic(self):
        # This tests the mechanism using a synthetic choice reward. It is not
        # scored as evidence that the real pixel/game task is learned.
        c = self.model(seed=11)
        reward = 0
        p0 = c.action_probabilities(FEATURES)[0][2]
        for _ in range(600):
            out = c.act(FEATURES, reward, .2)
            reward = 2 if out["action"]["movement"] == "E" else 0
        self.assertGreater(c.action_probabilities(FEATURES)[0][2], p0+.1)

    def test_unknown_or_privileged_input_rejected(self):
        c = self.model()
        with self.assertRaises(ValueError):
            c.act({**FEATURES, "bossX": .4})
        with self.assertRaises(ValueError):
            c.act(FEATURES, 1)
        with self.assertRaises(ValueError):
            c.act({**FEATURES, "targetOffset": float("nan")})


if __name__ == "__main__":
    unittest.main()
