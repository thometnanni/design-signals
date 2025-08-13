export function createNormalizer(maxAbs, type = "linear", param = 1) {
  const M = Math.max(1e-9, maxAbs);
  const p = Math.max(1e-9, +param || 1);

  if (type === "linear") {
    return (v) => clamp(v / M, -1, 1);
  }

  if (type === "symlog") {
    const maxA = Math.asinh(M / p);
    return (v) => clamp(Math.asinh(v / p) / maxA, -1, 1);
  }

  if (type === "pow") {
    const gamma = 1 / p;
    return (v) => {
      const s = Math.sign(v);
      const r = Math.min(1, Math.abs(v) / M);
      return s * Math.pow(r, gamma);
    };
  }

  return (v) => clamp(v / M, -1, 1);
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
