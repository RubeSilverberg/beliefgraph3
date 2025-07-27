
// --- MODIFIER UTILS ---
export function nudgeToBoundMultiplier(currentWeight, likert, bound = 0.99) {
  const L = Math.max(-5, Math.min(5, likert));
  const absWeight = Math.abs(currentWeight);
  if (absWeight === 0 || L === 0) return 1;
  const frac = Math.abs(L) / 5;
  let desired;
  if (L > 0) {
    desired = (1 - frac) * absWeight + frac * bound;
  } else {
    desired = (1 - frac) * absWeight;
  }
  let multiplier = desired / absWeight;
  if (!isFinite(multiplier)) multiplier = 1;
  return Math.round(multiplier * 1000) / 1000;
}

export function getModifiedEdgeWeight(cy, edge) {
  // Debug: log arguments and check if edge is a real Cytoscape edge object
  console.debug('[getModifiedEdgeWeight] cy:', cy, 'edge:', edge, 'edge.target:', typeof edge.target === 'function' ? edge.target() : edge.target);
  const node = cy.getElementById(edge.target().id());
  if (
    node.data("type") === NODE_TYPE_AND ||
    node.data("type") === NODE_TYPE_OR
  ) {
    return null;
  }
  let currentWeight = edge.data('weight');
  const mods = edge.data('modifiers') ?? [];
  mods.forEach(mod => {
    const mult = nudgeToBoundMultiplier(currentWeight, mod.likert, 0.99);
    currentWeight = currentWeight * mult;
  });
  if (Math.abs(currentWeight) < WEIGHT_MIN) currentWeight = WEIGHT_MIN * (currentWeight < 0 ? -1 : 1);
  if (edge.data('opposes')) currentWeight = -Math.abs(currentWeight);
  else currentWeight = Math.abs(currentWeight);
  return currentWeight;
}

export function updateEdgeModifierLabel(cy, edge) {
  const node = cy.getElementById(edge.target().id());
  if (
    node.data("type") === NODE_TYPE_AND ||
    node.data("type") === NODE_TYPE_OR
  ) {
    edge.data('weightLabel', '—');
    return;
  }
  const mods = edge.data('modifiers') ?? [];
  let baseLabel = '–';
  if (typeof edge.data('weight') === 'number' && !isNaN(edge.data('weight'))) {
    baseLabel = edge.data('weight').toFixed(2);
  }
  if (!mods.length) {
    edge.data('weightLabel', baseLabel);
  } else {
    edge.data('weightLabel', `${baseLabel} [${mods.length}]`);
  }
}
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
