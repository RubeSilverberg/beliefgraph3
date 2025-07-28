
// config.js

// --- NODE/EDGE TYPE CONSTANTS ---
export const NODE_TYPE_FACT = "fact";
export const NODE_TYPE_ASSERTION = "assertion";
export const NODE_TYPE_AND = "and";
export const NODE_TYPE_OR = "or";
export const NODE_TYPE_NOTE = "note";
export const EDGE_TYPE_SUPPORTS = "supports";
export const EDGE_TYPE_OPPOSES = "opposes";

export const ALLOWED_NODE_TYPES = [
  NODE_TYPE_FACT, NODE_TYPE_ASSERTION, NODE_TYPE_AND, NODE_TYPE_OR, NODE_TYPE_NOTE
];
export const ALLOWED_EDGE_TYPES = [EDGE_TYPE_SUPPORTS, EDGE_TYPE_OPPOSES];

// --- CONFIG ---
export const DEBUG = true;
export const WEIGHT_MIN = 0.01;

// --- LOGGING ---
export function logMath(nodeId, msg) {
  if (DEBUG) console.log(`[${nodeId}] ${msg}`);
}

// --- EDGE WEIGHT/LIKERT UTILITIES (FOR ASSERTION NODES ONLY) ---
export function likertToWeight(val) {
  const weights = [-1, -0.85, -0.60, -0.35, -0.15, 0.15, 0.35, 0.60, 0.85, 1];
  if (val < 0) return weights[val + 5];
  if (val > 0) return weights[val + 4];
  return 0.15;
}

export function weightToLikert(w) {
  const weights = [0.15, 0.35, 0.60, 0.85, 1];
  const absW = Math.abs(w);
  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < weights.length; ++i) {
    const diff = Math.abs(absW - weights[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx + 1; // 1–5
}

export function likertDescriptor(val) {
  switch (val) {
    case  1: return "Minimal";
    case  2: return "Small";
    case  3: return "Medium";
    case  4: return "Strong";
    case  5: return "Maximal";
    default: return `Custom (${val})`;
  }
}

export function saturation(aei, k = 1) {
  return 1 - Math.exp(-k * aei);
}
export const config = {
  bayesHeavyMode: false,
  epsilon: 0.01,
  // add more config fields as needed
};
