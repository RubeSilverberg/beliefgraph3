// do-calculus.js
// Lightweight, modular do-calculus utilities for Bayes Heavy mode only.
//
// Overview
// --------
// This module provides:
//  - Interventional queries via truncated factorization: P(V | do(X = x))
//  - Safe, transactional application of do-interventions that restores the graph
//  - Simple effect helpers (ATE/contrast)
//  - A d-separation utility (moralized ancestral graph test) and criterion checks
//
// Design notes
// ------------
//  - Heavy-mode propagation lives in bayes-logic.js and uses Cytoscape state.
//  - We simulate interventions by:
//      (1) Cutting all incoming edges to intervened nodes (structural surgery)
//      (2) Freezing those nodes to fixed probabilities for the duration
//  - We don’t persist any changes; state is restored even on error.
//  - Public API is attached to window.doCalc for easy console use and optional UI wiring.

import { propagateBayesHeavy } from './bayes-logic.js';

/**
 * Apply a do-intervention in a reversible transaction, run a function, and restore.
 *
 * @param {cytoscape.Core} cy - Cytoscape instance
 * @param {Object.<string, number>} doMap - map nodeId -> probability in [0,1] (use 1 or 0 for boolean do)
 * @param {Function} runner - function to execute while intervention is active
 * @returns {*} the runner() return value
 */
export function withIntervention(cy, doMap, runner) {
  const toIds = Object.keys(doMap || {});
  if (!toIds.length) return runner?.();
  const bayesMode = (window.getBayesMode && window.getBayesMode()) || 'lite';
  if (bayesMode !== 'heavy') {
    // Heavy-only contract: do() is a no-op outside heavy mode to avoid confusing state changes
    console.warn('[do-calculus] Interventions are only supported in Bayes Heavy mode. Current:', bayesMode, '\n→ Running provided function without any intervention.');
    return runner?.();
  }

  // Snapshot state for nodes and removed edges
  const nodeSnapshots = [];
  const removedEdgesJson = [];

  cy.startBatch();
  try {
    // 1) For each intervened node: snapshot + cut incoming edges + freeze prob
    toIds.forEach(id => {
      const node = cy.getElementById(id);
      if (!node || node.empty()) return;
      const doVal = clamp01(doMap[id]);
      // Snapshot relevant data
      nodeSnapshots.push({
        id,
        data: {
          heavyProb: node.data('heavyProb'),
          doFixed: node.data('doFixed'),
          doValue: node.data('doValue')
        }
      });

      // Remove incoming edges (structural cut)
      const incomers = node.incomers('edge');
      if (incomers && incomers.length > 0) {
        // Keep exact JSON so we can restore with same IDs
        removedEdgesJson.push(...incomers.jsons());
        cy.remove(incomers);
      }

      // Freeze this node for propagation
      node.data('doFixed', true);
      node.data('doValue', doVal);
      node.data('heavyProb', doVal);
    });

    // 2) Run heavy-mode propagation under intervention
    propagateBayesHeavy(cy);

    // 3) Execute caller-supplied function while intervention is active
    const result = runner?.();
    return result;
  } finally {
    // Restore graph
    try {
      // Restore removed edges first
      if (removedEdgesJson.length) cy.add(removedEdgesJson);
      // Restore node data
      nodeSnapshots.forEach(s => {
        const n = cy.getElementById(s.id);
        if (!n || n.empty()) return;
        const d = s.data || {};
        if (d.heavyProb === undefined) n.removeData('heavyProb'); else n.data('heavyProb', d.heavyProb);
        if (d.doFixed === undefined) n.removeData('doFixed'); else n.data('doFixed', d.doFixed);
        if (d.doValue === undefined) n.removeData('doValue'); else n.data('doValue', d.doValue);
      });
      // Recompute original heavy state
      propagateBayesHeavy(cy);
    } catch (e) {
      console.error('[do-calculus] Restore failed:', e);
    } finally {
      cy.endBatch();
    }
  }
}

/**
 * Compute interventional probabilities P(V | do(X=x)) and return a snapshot map.
 *
 * @param {cytoscape.Core} cy
 * @param {Object.<string, number>} doMap - nodeId -> prob (0..1)
 * @returns {{ probsById: Record<string, number>, getProb: (id:string)=>number|undefined }}
 */
export function computeDo(cy, doMap) {
  let snapshot = {};
  withIntervention(cy, doMap, () => {
    // Collect node probabilities under intervention
    const probs = {};
    cy.nodes().forEach(n => {
      const p = n.data('heavyProb');
      if (typeof p === 'number') probs[n.id()] = p;
    });
    snapshot = probs;
  });
  return {
    probsById: snapshot,
    getProb: (id) => snapshot[id]
  };
}

/**
 * Estimate causal effect on Y when setting X to 1 vs 0: P(Y|do(X=1)) - P(Y|do(X=0)).
 *
 * @param {cytoscape.Core} cy
 * @param {string} xId - treatment node id
 * @param {string} yId - outcome node id
 * @returns {{p1:number, p0:number, ate:number}}
 */
export function estimateATE(cy, xId, yId) {
  const r1 = computeDo(cy, { [xId]: 1 });
  const r0 = computeDo(cy, { [xId]: 0 });
  const p1 = r1.getProb(yId);
  const p0 = r0.getProb(yId);
  return { p1, p0, ate: (isNum(p1) && isNum(p0)) ? (p1 - p0) : undefined };
}

// ------------------------
// d-Separation utilities
// ------------------------

/**
 * Check d-separation via moralized ancestral graph test.
 * Returns true if X and Y are d-separated by Z.
 *
 * @param {cytoscape.Core} cy
 * @param {string[]|string} X - source set
 * @param {string[]|string} Y - target set
 * @param {string[]|string} Z - conditioned set
 */
export function isDSeparated(cy, X, Y, Z) {
  const Xs = arr(X), Ys = arr(Y), Zs = new Set(arr(Z));
  // 1) Build ancestral set of X ∪ Y ∪ Z
  const needed = new Set([...Xs, ...Ys, ...Zs]);
  const parents = buildParentMap(cy);
  const children = buildChildMap(cy);
  const stack = [...needed];
  while (stack.length) {
    const v = stack.pop();
    (parents.get(v) || []).forEach(p => {
      if (!needed.has(p)) { needed.add(p); stack.push(p); }
    });
  }

  // 2) Build undirected moralized graph of the induced ancestral subgraph
  const undirected = new Map(); // id -> Set(neighbors)
  function addUndir(a,b){ if(a===b) return; if(!undirected.has(a)) undirected.set(a,new Set()); if(!undirected.has(b)) undirected.set(b,new Set()); undirected.get(a).add(b); undirected.get(b).add(a); }
  // Add all directed edges as undirected within induced set
  cy.edges().forEach(e => {
    const s = e.source().id();
    const t = e.target().id();
    if (needed.has(s) && needed.has(t)) addUndir(s,t);
  });
  // Marry parents: connect all co-parents of each child
  needed.forEach(v => {
    const ps = (parents.get(v) || []).filter(p => needed.has(p));
    for (let i=0;i<ps.length;i++) for (let j=i+1;j<ps.length;j++) addUndir(ps[i], ps[j]);
  });

  // 3) Remove Z nodes
  arr(Z).forEach(z => { undirected.delete(z); undirected.forEach(neigh => neigh.delete(z)); });

  // 4) Check connectivity between X and Y
  const visited = new Set();
  const q = [...Xs.filter(id => undirected.has(id))];
  while (q.length) {
    const v = q.shift();
    if (visited.has(v)) continue;
    visited.add(v);
    if (Ys.includes(v)) return false; // path exists, not d-separated
    (undirected.get(v) || []).forEach(n => { if (!visited.has(n)) q.push(n); });
  }
  return true; // no path => d-separated
}

/** Backdoor criterion: Z satisfies backdoor if it blocks all backdoor paths X <- ... -> Y */
export function satisfiesBackdoor(cy, X, Y, Z) {
  // A sufficient operational check: ensure X and Y are d-separated by Z after deleting all outgoing edges from X
  // (blocks front-door/forward paths and tests only backdoor connections)
  const deleted = [];
  cy.startBatch();
  try {
    const xIds = arr(X);
    cy.edges().forEach(e => {
      if (xIds.includes(e.source().id())) { deleted.push(e.json()); e.remove(); }
    });
    return isDSeparated(cy, X, Y, Z);
  } finally {
    try { if (deleted.length) cy.add(deleted); } catch(_){}
    cy.endBatch();
  }
}

// ------------------------
// Install helpers on window for console use
// ------------------------

export function installDoCalculus() {
  if (typeof window === 'undefined') return;
  window.doCalc = Object.freeze({
    withIntervention: (doMap, fn) => withIntervention(window.cy, doMap, fn),
    computeDo: (doMap) => computeDo(window.cy, doMap),
    ate: (xId, yId) => estimateATE(window.cy, xId, yId),
    isDSeparated: (X,Y,Z) => isDSeparated(window.cy, X, Y, Z),
    satisfiesBackdoor: (X,Y,Z) => satisfiesBackdoor(window.cy, X, Y, Z)
  });
  console.log('[do-calculus] Available on window.doCalc { computeDo, ate, isDSeparated, satisfiesBackdoor }');
}

// ------------------------
// Internal helpers
// ------------------------

function clamp01(x){ x = Number(x); if (isNaN(x)) return 0; return Math.max(0, Math.min(1, x)); }
function isNum(x){ return typeof x === 'number' && isFinite(x); }
function arr(x){ return Array.isArray(x) ? x.slice() : (x!=null ? [x] : []); }

function buildParentMap(cy){
  const m = new Map();
  cy.nodes().forEach(n => m.set(n.id(), []));
  cy.edges().forEach(e => { const s=e.source().id(), t=e.target().id(); if (m.has(t)) m.get(t).push(s); else m.set(t, [s]); });
  return m;
}
function buildChildMap(cy){
  const m = new Map();
  cy.nodes().forEach(n => m.set(n.id(), []));
  cy.edges().forEach(e => { const s=e.source().id(), t=e.target().id(); if (m.has(s)) m.get(s).push(t); else m.set(s, [t]); });
  return m;
}

// Auto-install for convenience
installDoCalculus();
