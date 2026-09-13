"""Visible, deterministic grayscale sampling; never infers a fake fly retina."""
import base64
import math
import numpy as np
from .model import canonical_hash


def validate_mapping(graph, manifest, kind, *, assay_only=False):
    if manifest.get("graphHash") != graph.identity:
        raise ValueError(f"{kind} manifest graph mismatch")
    if not graph.manifest.get("synthetic", False):
        validation = manifest.get("validation", {})
        if validation.get("status") != "PASS" or not validation.get("evidence"):
            candidate = manifest.get("candidate", {})
            if assay_only and candidate.get("assayOnly") is True and candidate.get("evidence"):
                return
            raise ValueError(f"Real MaleCNS {kind} requires an explicit validated evidence manifest; mapping is unavailable")


def decode_observation(observation):
    if set(observation) != {"grayBase64", "width", "height"}:
        raise ValueError("Observation accepts grayscale pixels and dimensions only")
    width, height = observation["width"], observation["height"]
    if type(width) is not int or type(height) is not int or not 1 <= width <= 4096 or not 1 <= height <= 4096 or width * height > 4_194_304:
        raise ValueError("Invalid observation dimensions")
    raw = base64.b64decode(observation["grayBase64"], validate=True)
    if len(raw) != width * height:
        raise ValueError("Grayscale observation byte length mismatch")
    return np.frombuffer(raw, dtype=np.uint8).reshape(height, width)


class VisualTransducer:
    def __init__(self, graph, manifest, *, assay_only=False):
        validate_mapping(graph, manifest, "visual mapping", assay_only=assay_only)
        self.graph, self.manifest = graph, manifest
        samples = manifest.get("samples", [])
        if not samples:
            raise ValueError("No anatomically referenced receptor samples supplied")
        self.neurons = np.array([graph.neuron_index(s["neuronId"]) for s in samples])
        if len(np.unique(self.neurons)) != len(self.neurons):
            raise ValueError("A receptor may appear only once")
        self.xy = np.array([[s["x"], s["y"]] for s in samples], dtype=float)
        self.gain = np.array([s.get("gain", 1) for s in samples], dtype=float)
        if not np.isfinite(self.xy).all() or np.any(self.xy < 0) or np.any(self.xy > 1) or not np.isfinite(self.gain).all() or np.any(self.gain < 0):
            raise ValueError("Invalid receptor geometry/gain")
        self.tau_ms = float(manifest.get("filterMs", 10))
        self.max_drive = float(manifest.get("maximumDriveMv", 30))
        self.half = float(manifest.get("halfSaturation", .02))
        if not all(math.isfinite(v) and v > 0 for v in (self.tau_ms, self.max_drive, self.half)):
            raise ValueError("Invalid transduction constants")
        self.identity = canonical_hash(manifest)
        self.filtered = np.zeros(len(samples))

    def reset(self):
        self.filtered[:] = 0

    def encode(self, frame, interval_ms):
        if frame.ndim != 2 or frame.dtype != np.uint8 or not math.isfinite(interval_ms) or interval_ms <= 0:
            raise ValueError("Expected uint8 grayscale frame and positive interval")
        h, w = frame.shape
        x, y = self.xy[:, 0] * (w - 1), self.xy[:, 1] * (h - 1)
        x0, y0 = x.astype(int), y.astype(int)
        x1, y1 = np.minimum(x0 + 1, w - 1), np.minimum(y0 + 1, h - 1)
        fx, fy = x - x0, y - y0
        luminance = ((1-fx)*(1-fy)*frame[y0, x0] + fx*(1-fy)*frame[y0, x1] + (1-fx)*fy*frame[y1, x0] + fx*fy*frame[y1, x1]) / 255.
        self.filtered += -math.expm1(-interval_ms / self.tau_ms) * (luminance - self.filtered)
        drive = np.zeros(self.graph.n)
        drive[self.neurons] = self.gain * self.max_drive * self.filtered / (self.half + self.filtered)
        return drive

    def state_dict(self):
        return {"filtered": self.filtered.copy()}

    def restore(self, state):
        a = state.get("filtered")
        if set(state) != {"filtered"} or a.shape != self.filtered.shape or a.dtype != self.filtered.dtype or not np.isfinite(a).all() or np.any(a < 0) or np.any(a > 1):
            raise ValueError("Invalid visual filter checkpoint")
        self.filtered[:] = a
