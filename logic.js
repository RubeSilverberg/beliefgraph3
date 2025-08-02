console.log("Loaded logic.js");

// --- Helper Functions ---

export function propagateFromParents({ baseProb, parents, getProb, getWeight, saturationK }) {
  // Legacy, no longer used: for reference only
  let total = 0, totalWeight = 0;
  parents.forEach(e => {
    const prob = getProb(e);
    const weight = getWeight(e);
    total += prob * weight;
    totalWeight += Math.abs(weight);
  });
  if (totalWeight === 0) return baseProb;
  const raw = total / totalWeight;
  const saturated = 1 / (1 + Math.exp(-saturationK * (raw - 0.5)));
  return saturated;
}

export function getTopologicallySortedNodesWithParents() {
  const cy = window.cy;
  const nodes = cy.nodes().filter(n => n.incomers('edge').length > 0);
  // Simple Kahn's algorithm
  const sorted = [], visited = new Set();
  function visit(node) {
    if (visited.has(node.id())) return;
    visited.add(node.id());
    node.incomers('edge').forEach(e => visit(e.source()));
    sorted.push(node);
  }
  nodes.forEach(visit);
  return sorted;
}

export function syncNaiveBayesParents(node) {
  // Sets parentIds array
  const parents = node.incomers('edge').map(e => e.source().id());
  node.data('parentIds', parents);
}

export function clearBayesHighlights() {
  const cy = window.cy;
  cy.nodes().forEach(n => n.removeData('highlighted'));
}

export function highlightBayesNodeFocus(node) {
  node.data('highlighted', true);
}

// --- Robust Belief Propagation Logic ---

// FACT_PROB: Set high enough to avoid compounding precision loss in AND nodes
// 0.995² = 0.990 = 99% displayed vs 0.99² = 0.9801 = 98% displayed  
export const FACT_PROB = 0.995;

function propagateFromParentsRobust({ baseProb, parents, getProb, getWeight, epsilon = 0.01, saturationK = 1, debug = false }) {
  if (!parents || parents.length === 0) return baseProb;

  // Filter to valid parents (exclude edges whose parent prob is null/undefined/virgin)
  const validEdges = parents.filter(e => {
    const prob = getProb(e);
    return prob !== undefined && prob !== null;
  });

  if (debug) console.log(`    🧮 propagateFromParentsRobust: ${parents.length} input edges, ${validEdges.length} valid edges`);

  if (validEdges.length === 1) {
    const edge = validEdges[0];
    const prob = getProb(edge);
    const sign = edge.data('opposes') || edge.data('type') === 'opposes' ? -1 : 1;
    const effectiveWeight = getWeight(edge) * sign;
    if (debug) console.log(`    🔍 Single edge: prob=${prob}, weight=${getWeight(edge)}, sign=${sign}, effectiveWeight=${effectiveWeight}`);
    
    if (Math.abs(effectiveWeight) >= 0.99) {
      const result = effectiveWeight > 0 ? prob : 1 - prob;
      if (debug) console.log(`    ⚡ High weight (>= 0.99) single edge bypass: returning ${result}`);
      return result;
    }
  }

  // Standard propagation for blended/ambiguous/multiple edges
  const clampedBase = Math.min(Math.max(baseProb, epsilon), 1 - epsilon);
  const priorOdds = Math.log(clampedBase / (1 - clampedBase));
  const infos = parents.map(edge => {
    const prob = Math.min(Math.max(getProb(edge), epsilon), 1 - epsilon);
    const sign = edge.data('opposes') || edge.data('type') === 'opposes' ? -1 : 1;
    return {
      parent: edge,
      odds: Math.log(prob / (1 - prob)),
      weight: getWeight(edge) * sign
    };
  });
  
  if (debug) {
    console.log(`    📊 Edge details:`);
    infos.forEach((info, i) => {
      const edge = info.parent; // This is actually the EDGE, not the parent node
      const parentNode = edge.source(); // This is the actual parent node
      const parentProb = Math.min(Math.max(getProb(edge), epsilon), 1 - epsilon);
      const rawWeight = getWeight(edge);
      const opposes = edge.data('opposes'); // Read opposes from the EDGE, not the parent node
      const effectiveWeight = info.weight;
      const odds = info.odds;
      console.log(`      [${i+1}] Edge ${edge.id()}: parentNode=${parentNode.id()}, prob=${parentProb}, rawWeight=${rawWeight}, opposes=${opposes}, effectiveWeight=${effectiveWeight}, odds=${odds}`);
    });
  }
  
  const totalAbsW = infos.reduce((sum, x) => sum + Math.abs(x.weight), 0);
  let oddsDelta = 0;
  
  if (debug) console.log(`    🧮 Individual contributions:`);
  for (let i = 0; i < infos.length; ++i) {
    const { odds, weight } = infos[i];
    const contribution = weight * (odds - priorOdds);
    oddsDelta += contribution;
    if (debug) {
      const edge = infos[i].parent;
      const parentNode = edge.source();
      console.log(`      [${i+1}] ${parentNode.id()}: weight=${weight}, odds=${odds}, priorOdds=${priorOdds}, (odds-prior)=${odds-priorOdds}, contribution=${contribution}`);
    }
  }
  
  if (debug) console.log(`    📈 Raw oddsDelta before saturation: ${oddsDelta}`);
  
  // Apply global saturation to oddsDelta
  const saturation = 1 - Math.exp(-saturationK * totalAbsW);
  oddsDelta *= saturation;
  const updatedOdds = priorOdds + oddsDelta;
  const result = 1 / (1 + Math.exp(-updatedOdds));
  
  if (debug) console.log(`    🔢 Calculation: baseProb=${baseProb}, priorOdds=${priorOdds}, totalAbsW=${totalAbsW}, saturation=${saturation}, oddsDelta=${oddsDelta}, updatedOdds=${updatedOdds}, result=${result}`);
  
  return result;
}

export function convergeEdges({ cy, tolerance = 0.001, maxIters = 30 }) {
  cy.batch(() => {
    cy.edges().forEach(edge => edge.data('computedWeight', edge.data('weight')));
  });

  let converged = false;
  let finalDelta = 0;
  let iterations = 0;

  for (let iter = 0; iter < maxIters; iter++) {
    iterations = iter + 1;
    let deltas = [];
    let maxDelta = 0;

    cy.edges().forEach(edge => {
      const prev = edge.data('computedWeight');
      const targetNode = edge.target();
      let nw = prev;
      if (targetNode.data('type') === 'assertion') {
        nw = edge.data('weight');
      }
      deltas.push({ edge, prev, nw });
      const delta = Math.abs(nw - prev);
      if (delta > maxDelta) maxDelta = delta;
    });

    cy.batch(() => {
      deltas.forEach(({ edge, nw }) => edge.data('computedWeight', nw));
    });

    finalDelta = maxDelta;
    if (finalDelta < tolerance) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    console.warn(`convergeEdges: hit maxIters (${maxIters}) without converging (final delta=${finalDelta.toExponential(3)})`);
  }

  return { converged, iterations, finalDelta };
}

export function convergeNodes({ cy, tolerance = 0.001, maxIters = 30 }) {
  let converged = false, finalDelta = 0, iterations = 0;

  for (let iter = 0; iter < maxIters; iter++) {
    iterations = iter + 1;
    let deltas = [];
    let maxDelta = 0;
    let changed = false;
    
    // Track probabilities calculated in this iteration to avoid stale data issues
    const currentIterProbs = new Map();

    cy.nodes().forEach(node => {
      const nodeType = node.data('type');
      let newProb;

      if (nodeType === 'fact') {
        currentIterProbs.set(node.id(), newProb);
      } else if (nodeType === 'and') {
        // Helper function to get current iteration probability
        const getCurrentIterProb = (node) => {
          return currentIterProbs.has(node.id()) ? currentIterProbs.get(node.id()) : node.data('prob');
        };
        
        const incomingEdges = node.incomers('edge');
        if (incomingEdges.length === 0 || incomingEdges.some(edge => typeof getCurrentIterProb(edge.source()) !== "number")) {
          newProb = undefined;
          node.data('isVirgin', true);
        } else {
          console.log('AND node calculation for:', node.id());
          newProb = incomingEdges.reduce((acc, edge) => {
            const parent = edge.source();
            let parentProb = getCurrentIterProb(parent);
            
            // Check if edge has inverse relationship (NOT) - check both lite mode (opposes) and heavy mode (cpt.inverse)
            const cpt = edge.data('cpt') || {};
            const opposes = edge.data('opposes');
            const isInverse = !!cpt.inverse || !!opposes;
            console.log(`  Edge ${edge.id()}: parent=${parent.id()}, parentProb=${parentProb}, inverse=${isInverse} (cpt.inverse=${!!cpt.inverse}, opposes=${!!opposes})`);
            if (isInverse) {
              parentProb = 1 - parentProb;
              console.log(`    After inverse: ${parentProb}`);
            }
            
            console.log(`    Multiplying ${acc} * ${parentProb} = ${acc * parentProb}`);
            return acc * parentProb;
          }, 1);
          console.log(`  Final AND result: ${newProb}`);
          node.removeData('isVirgin');
        }
        currentIterProbs.set(node.id(), newProb);
      } else if (nodeType === 'or') {
        // Helper function to get current iteration probability
        const getCurrentIterProb = (node) => {
          return currentIterProbs.has(node.id()) ? currentIterProbs.get(node.id()) : node.data('prob');
        };
        
        const incomingEdges = node.incomers('edge');
        if (incomingEdges.length === 0 || incomingEdges.some(edge => typeof getCurrentIterProb(edge.source()) !== "number")) {
          newProb = undefined;
          node.data('isVirgin', true);
        } else {
          let prod = 1;
          incomingEdges.forEach(edge => {
            const parent = edge.source();
            let parentProb = getCurrentIterProb(parent);
            
            // Check if edge has inverse relationship (NOT) - check both lite mode (opposes) and heavy mode (cpt.inverse)
            const cpt = edge.data('cpt') || {};
            const opposes = edge.data('opposes');
            const isInverse = !!cpt.inverse || !!opposes;
            if (isInverse) {
              parentProb = 1 - parentProb;
            }
            
            prod *= (1 - parentProb);
          });
          newProb = 1 - prod;
          node.removeData('isVirgin');
        }
        currentIterProbs.set(node.id(), newProb);
      } else if (nodeType === 'assertion') {
        // Helper function to get current iteration probability
        const getCurrentIterProb = (node) => {
          return currentIterProbs.has(node.id()) ? currentIterProbs.get(node.id()) : node.data('prob');
        };
        
        const incomingEdges = node.incomers('edge');
        // Filter for parent edges where the source has a defined prob AND edge has non-zero weight
        // CRITICAL FIX: Use current iteration probability, not stale data
        const validEdges = incomingEdges.filter(e => {
          const parentProb = getCurrentIterProb(e.source());
          const edgeWeight = e.data('weight');
          return typeof parentProb === "number" && edgeWeight && edgeWeight !== 0;
        });

        if (validEdges.length === 0) {
          newProb = undefined;
          node.data('isVirgin', true);
        } else {
          node.removeData('isVirgin');
          newProb = propagateFromParentsRobust({
            baseProb: 0.5,
            parents: validEdges,
            getProb: e => {
              const parent = e.source();
              if (parent.data('type') === 'fact') return FACT_PROB;
              return getCurrentIterProb(parent);
            },
            getWeight: e => e.data('computedWeight') || 0,
            epsilon: 0.01,
            saturationK: 1
          });
          console.log(
            'assertion node:', node.id(),
            'parents:', validEdges.map(e => e.source().id()),
            'weights:', validEdges.map(e => e.data('computedWeight')),
            'parent probs:', validEdges.map(e => getCurrentIterProb(e.source())),
            'computed newProb:', newProb
          );
        }
        currentIterProbs.set(node.id(), newProb);
      }

      deltas.push({ node, prev: node.data('prob'), newProb });
      // If newProb is different, mark as changed
      if (newProb !== node.data('prob')) {
        changed = true;
      }
      if (typeof newProb === "number" && typeof node.data('prob') === "number") {
        const delta = Math.abs(newProb - node.data('prob'));
        if (delta > maxDelta) maxDelta = delta;
      }
    });

    cy.batch(() => {
      deltas.forEach(({ node, newProb }) => node.data('prob', newProb));
    });

    finalDelta = maxDelta;
    if (!changed || finalDelta < tolerance) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    console.warn(`convergeNodes: hit maxIters (${maxIters}) without converging (final delta=${finalDelta.toExponential(3)})`);
  }

  return { converged, iterations, finalDelta };
}


// Main convergence controller - handles both Lite and Heavy modes
// ARCHITECTURE: This unified convergence system ensures that structural changes 
// (node/edge additions/deletions) trigger proper recalculation in BOTH modes:
// - Lite mode: Uses iterative edge/node convergence with robust propagation
// - Heavy mode: Uses single-pass Bayes Heavy calculation (no convergence loop)
// - Topology changes: Only occur in Lite mode, Heavy mode reflects Lite's structure
// - Multi-pass: Only needed for Lite mode topology changes, Heavy mode is single-pass
export function clearVisualOnlyData(node, properties) {
  // Clear visual-only properties that don't affect logic state
  properties.forEach(prop => node.removeData(prop));
}

export function initializeNodeData(node, nodeType) {
  // Initialize node data based on type - handles all data clearing in logic system
  if (nodeType === 'fact') {
    // Facts should have high probability in both modes
    node.data('prob', FACT_PROB); // Lite mode: 0.995
    node.data('heavyProb', 1.0); // Heavy mode: 100%
  } else if (nodeType === 'assertion') {
    // Assertions should start virgin in lite mode, with 50% latent prior in heavy mode
    node.removeData('prob'); // Clear any existing lite mode probability to make it virgin
    node.data('isVirgin', true); // Mark as virgin for lite mode
    // Only set heavy mode default if not already calculated
    if (typeof node.data('heavyProb') !== 'number') {
      node.data('heavyProb', 0.5); // 50%
    }
  }
}

export function clearNodeDataForUnknownType(node) {
  // Clear all probability and state data for unknown node types
  node.removeData('robustness');
  node.removeData('robustnessLabel');
  node.removeData('hoverLabel');
  node.removeData('prob');
  node.removeData('heavyProb');
  node.removeData('isVirgin');
}

export function convergeAll({ cy, tolerance = 0.001, maxIters = 30 } = {}) {
  const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';
  
  if (bayesMode === 'heavy') {
    // Heavy mode: Single-pass calculation only, no topology changes, no convergence loops
    try {
      if (window.propagateBayesHeavy) {
        window.propagateBayesHeavy(cy);
      }
    } catch (err) {
      console.error('convergeAll: Error during heavy mode propagation:', err);
    }
    
    if (window.computeVisuals) window.computeVisuals(cy);
    return { totalPasses: 1, hasTopologyChanges: false, mode: bayesMode };
  }
  
  // Lite mode: Full convergence with topology change detection and multi-pass support
  let totalPasses = 0;
  let hasTopologyChanges = true;
  
  // Keep running until no more topology changes occur
  while (hasTopologyChanges && totalPasses < 3) { // Max 3 passes to prevent infinite loops
    totalPasses++;
    
    // Check for any node type changes (facts ↔ assertions)
    // This only applies to Lite mode since Heavy mode cannot change topology
    hasTopologyChanges = false;
    if (window.autoUpdateNodeTypes) {
      try {
        hasTopologyChanges = window.autoUpdateNodeTypes(cy, true); // Returns true if changes occurred
      } catch (err) {
        console.error('convergeAll: Error during node type update:', err);
      }
    }

    // Lite mode: Use edge and node convergence
    let edgeResult, nodeResult;
    try {
      edgeResult = convergeEdges({ cy, tolerance, maxIters });
      if (!edgeResult.converged) console.warn('convergeAll: Edge stage failed to converge');
    } catch (err) {
      console.error('convergeAll: Error during edge convergence:', err);
      edgeResult = { converged: false, error: err };
    }
    try {
      nodeResult = convergeNodes({ cy, tolerance, maxIters });
      if (!nodeResult.converged) console.warn('convergeAll: Node stage failed to converge');
    } catch (err) {
      console.error('convergeAll: Error during node convergence:', err);
      nodeResult = { converged: false, error: err };
    }
    
    if (hasTopologyChanges) {
      console.log(`convergeAll: Topology changes detected in ${bayesMode} mode, running additional pass ${totalPasses}`);
    }
  }
  
  if (totalPasses > 1) {
    console.log(`convergeAll: Completed after ${totalPasses} passes in ${bayesMode} mode`);
  }
  
  if (window.computeVisuals) window.computeVisuals(cy);
  return { totalPasses, hasTopologyChanges, mode: bayesMode };
}

// --- Cycle Check ---

export function wouldCreateCycle(cy, sourceId, targetId) {
  const visited = new Set();
  function dfs(nodeId) {
    if (nodeId === sourceId) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    const node = cy.getElementById(nodeId);
    const children = node.outgoers('edge').map(e => e.target().id());
    for (const childId of children) {
      if (dfs(childId)) return true;
    }
    return false;
  }
  return dfs(targetId);
}

// --- Bayes Time and CPT Logic ---
// [unchanged: finalizeBayesTimeCPT, getParentStateCombos, startBayesTimeSequence]

export function finalizeBayesTimeCPT(userCPT) {
  const cy = window.cy;
  Object.entries(userCPT).forEach(([nodeId, cpt]) => {
    const node = cy.getElementById(nodeId);
    node.data('cpt', cpt);
  });
  window.bayesHeavyMode = false;
  if (window.updateModeBadge) window.updateModeBadge();
  convergeAll({ cy });
  if (window.computeVisuals) window.computeVisuals(cy);
  alert('Bayes Time CPT entry complete.');
}

export function getParentStateCombos(parents) {
  if (parents.length === 0) return [[]];
  const combos = [];
  const total = 1 << parents.length;
  for (let i = 0; i < total; ++i) {
    const combo = [];
    for (let j = 0; j < parents.length; ++j) {
      combo.push((i >> j) & 1);
    }
    combos.push(combo);
  }
  return combos;
}

export function startBayesTimeSequence() {
  const cy = window.cy;
  cy.nodes().forEach(node => window.syncNaiveBayesParents?.(node));
  window.bayesHeavyMode = true;
  window.updateModeBadge?.();
  const nodes = window.getTopologicallySortedNodesWithParents?.();
  let nodeIdx = 0;
  let parentIdx = 0;
  const userNaiveBayes = {};
  function advance() {
    parentIdx++;
    const node = nodes[nodeIdx];
    const parents = node.incomers('edge').map(e => e.source());
    if (parentIdx >= parents.length) {
      nodeIdx++;
      parentIdx = 0;
    }
    showNextModal();
  }
  function retreat() {
    parentIdx--;
    if (parentIdx < 0) {
      nodeIdx--;
      if (nodeIdx < 0) {
        nodeIdx = 0;
        parentIdx = 0;
      } else {
        const node = nodes[nodeIdx];
        const parents = node.incomers('edge').map(e => e.source());
        parentIdx = parents.length - 1;
      }
    }
    showNextModal();
  }
  function showNextModal() {
    if (nodeIdx >= nodes.length) {
      nodes.forEach(node => {
        if (userNaiveBayes[node.id()]) {
          node.data('naiveBayes', userNaiveBayes[node.id()]);
          node.removeData('cpt');
        }
      });
      convergeAll({ cy });
      if (window.computeVisuals) window.computeVisuals(cy);
      alert('Naive Bayes entry complete.');
    }
    const node = nodes[nodeIdx];
    const parents = node.incomers('edge').map(e => e.source());
    if (parents.length === 0) {
      nodeIdx++;
      parentIdx = 0;
      showNextModal();
      return;
    }
    if (!userNaiveBayes[node.id()]) userNaiveBayes[node.id()] = {};
    window.clearBayesHighlights?.();
    window.highlightBayesNodeFocus?.(node);
    window.openCPTModalTwoPerParent?.({
      node,
      parentId: parents[parentIdx].id(),
      existing: userNaiveBayes[node.id()][parents[parentIdx].id()] || { p0: null, p1: null },
      onSave: (result) => {
        userNaiveBayes[node.id()][parents[parentIdx].id()] = result;
        node.data('naiveBayes', userNaiveBayes[node.id()]);
        convergeAll({ cy });
        if (window.computeVisuals) window.computeVisuals(cy);
        advance();
      },
      onPrev: (nodeIdx > 0 || parentIdx > 0) ? retreat : null
    });
  }
  showNextModal();
}

// --- Save/Load/Autosave/Restore ---

export function saveGraph() {
  const cy = window.cy;
  if (typeof cy === 'undefined') {
    alert('Graph not loaded.');
    return;
  }
  try {
    const elements = cy.elements().jsons();
    const dataStr = JSON.stringify(elements, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graph.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('Graph downloaded as graph.json');
  } catch (err) {
    console.error('Save to file failed:', err);
  }
}

export function loadGraph() {
  const cy = window.cy;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const elements = JSON.parse(evt.target.result);
        cy.elements().remove();
        cy.add(elements);
        convergeAll({ cy });
        cy.layout({ name: 'preset' }).run();
        window.computeVisuals?.(cy);
        cy.fit();
        cy.resize();
        window.resetLayout?.();
        console.log(`Graph loaded from file: ${file.name}`);
      } catch (err) {
        console.error('Failed to load graph:', err);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// --- Smart Multi-Interval Backup System ---

// Backup storage: three tiers of snapshots
let recentSnapshots = [];     // Last 6 snapshots (10s intervals, 1 minute total)
let mediumSnapshots = [];     // Last 10 snapshots (1min intervals, 10 minutes total)  
let longTermSnapshots = [];   // Last 6 snapshots (10min intervals, 1 hour total)

let lastMediumSnapshot = 0;   // Timestamp of last medium snapshot
let lastLongTermSnapshot = 0; // Timestamp of last long-term snapshot

export function createSnapshot() {
  const cy = window.cy;
  if (!cy) return null;
  
  try {
    const elements = cy.elements().jsons();
    return {
      data: JSON.stringify(elements),
      timestamp: Date.now()
    };
  } catch (err) {
    console.error('Failed to create snapshot:', err);
    return null;
  }
}

export function smartAutosave() {
  const snapshot = createSnapshot();
  if (!snapshot) return;
  
  const now = Date.now();
  
  // Always add to recent snapshots (10-second interval)
  recentSnapshots.push(snapshot);
  if (recentSnapshots.length > 6) {
    recentSnapshots.shift(); // Keep only last 6 (1 minute)
  }
  
  // Add to medium snapshots every minute
  if (now - lastMediumSnapshot >= 60 * 1000) {
    mediumSnapshots.push(snapshot);
    if (mediumSnapshots.length > 10) {
      mediumSnapshots.shift(); // Keep only last 10 (10 minutes)
    }
    lastMediumSnapshot = now;
  }
  
  // Add to long-term snapshots every 10 minutes
  if (now - lastLongTermSnapshot >= 10 * 60 * 1000) {
    longTermSnapshots.push(snapshot);
    if (longTermSnapshots.length > 6) {
      longTermSnapshots.shift(); // Keep only last 6 (1 hour)
    }
    lastLongTermSnapshot = now;
  }
}

export function getAvailableRestorePoints() {
  const now = Date.now();
  const points = [];
  
  // Add recent snapshots with cleaner labels
  recentSnapshots.forEach((snapshot, index) => {
    const secondsAgo = Math.round((now - snapshot.timestamp) / 1000);
    if (secondsAgo >= 10) { // Don't show very recent ones
      // Round to nearest 10 seconds for cleaner display
      const roundedSeconds = Math.round(secondsAgo / 10) * 10;
      points.push({
        label: `${roundedSeconds} seconds ago`,
        data: snapshot.data,
        timestamp: snapshot.timestamp,
        type: 'recent'
      });
    }
  });
  
  // Add medium snapshots
  mediumSnapshots.forEach(snapshot => {
    const minutesAgo = Math.round((now - snapshot.timestamp) / (60 * 1000));
    if (minutesAgo >= 2) { // Don't overlap with recent
      points.push({
        label: `${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago`,
        data: snapshot.data,
        timestamp: snapshot.timestamp,
        type: 'medium'
      });
    }
  });
  
  // Add long-term snapshots
  longTermSnapshots.forEach(snapshot => {
    const minutesAgo = Math.round((now - snapshot.timestamp) / (60 * 1000));
    if (minutesAgo >= 15) { // Don't overlap with medium
      points.push({
        label: `${minutesAgo} minutes ago`,
        data: snapshot.data,
        timestamp: snapshot.timestamp,
        type: 'long-term'
      });
    }
  });
  
  // Sort by timestamp (most recent first) and remove duplicates
  const uniquePoints = [];
  const seenLabels = new Set();
  
  points.sort((a, b) => b.timestamp - a.timestamp).forEach(point => {
    if (!seenLabels.has(point.label)) {
      seenLabels.add(point.label);
      uniquePoints.push(point);
    }
  });
  
  return uniquePoints;
}

export function showRestoreMenu() {
  const points = getAvailableRestorePoints();
  
  if (points.length === 0) {
    alert('No restore points available yet. The system needs to run for at least 10 seconds to create restore points.');
    return;
  }
  
  // Create a simple menu with better formatting
  let message = 'Choose a restore point:\n\n';
  points.forEach((point, index) => {
    message += `${index + 1}. ${point.label}\n`;
  });
  message += '\nEnter a number (1-' + points.length + ') or 0 to cancel:';
  
  const choice = prompt(message);
  if (choice === null) { // User clicked Cancel
    console.log('Restore cancelled by user');
    return;
  }
  
  const choiceNum = parseInt(choice.trim());
  
  if (choiceNum === 0) {
    console.log('Restore cancelled by user');
    return;
  }
  
  if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > points.length) {
    alert(`Invalid choice "${choice}". Please enter a number between 1 and ${points.length}.`);
    return;
  }
  
  const selectedPoint = points[choiceNum - 1];
  
  if (!confirm(`This will restore your graph to ${selectedPoint.label}. Current work will be lost. Continue?`)) {
    console.log('Restore cancelled by user');
    return;
  }
  
  restoreFromSnapshot(selectedPoint.data);
}

function restoreFromSnapshot(snapshotData) {
  const cy = window.cy;
  try {
    cy.elements().remove();
    cy.add(JSON.parse(snapshotData));
    cy.nodes().forEach(n => {
      if (n.data('type') !== 'fact') {
        n.data('prob', n.data('initialProb'));
      }
    });
    convergeAll({ cy });
    window.computeVisuals?.(cy);
    window.resetLayout?.();
    console.log('Graph successfully restored from snapshot');
    alert('Graph restored successfully!');
  } catch (err) {
    alert('Failed to restore from snapshot.');
    console.error('Failed to restore from snapshot:', err);
  }
}

// Legacy functions for compatibility
export function autosave() {
  // Keep the old function but redirect to new system
  smartAutosave();
}

export function restoreAutosave() {
  // Replace old restore with new menu system
  showRestoreMenu();
}

// --- Layout and Clear ---

export function resetLayout() {
  const cy = window.cy;
  if (cy.nodes().length > 1) {
    cy.fit(undefined, 50);
  } else {
    cy.zoom(2);
    cy.center();
  }
}

export function clearGraph() {
  const cy = window.cy;
  if (!confirm('Are you sure you want to clear the graph?')) return;
  cy.elements().remove();
  if (window.computeVisuals) window.computeVisuals(cy);
  console.log('Graph cleared');
}

export function addNote() {
  const cy = window.cy;
  if (typeof cy === 'undefined') {
    alert('Graph not loaded.');
    return;
  }
  
  // Add note node to center of current viewport
  const viewport = cy.extent();
  const centerX = (viewport.x1 + viewport.x2) / 2;
  const centerY = (viewport.y1 + viewport.y2) / 2;
  
  const newNode = cy.add({
    group: 'nodes',
    data: {
      id: 'note' + Date.now(),
      label: 'New Note',
      origLabel: 'New Note',
      type: 'note',
      width: 120,
      height: 40
    },
    position: { x: centerX, y: centerY }
  });
  
  console.log(`Created note node with type: ${newNode.data('type')}`);
  
  // Trigger visuals update and automatically open edit dialog
  if (window.computeVisuals) window.computeVisuals(cy);
  console.log('Note added');
  
  // Auto-open edit dialog for immediate editing
  if (window.openEditNodeLabelModal) {
    window.openEditNodeLabelModal(newNode);
  }
}

export function addStatement() {
  const cy = window.cy;
  if (typeof cy === 'undefined') {
    alert('Graph not loaded.');
    return;
  }
  
  // Add assertion node to center of current viewport
  const viewport = cy.extent();
  const centerX = (viewport.x1 + viewport.x2) / 2;
  const centerY = (viewport.y1 + viewport.y2) / 2;
  
  const newNode = cy.add({
    group: 'nodes',
    data: {
      id: 'assertion' + Date.now(),
      label: 'New Fact',
      origLabel: 'New Fact',
      type: 'assertion',
      width: 60,
      height: 36
    },
    position: { x: centerX, y: centerY }
  });
  
  console.log(`Created assertion node with type: ${newNode.data('type')}`);
  
  // Trigger visuals update and automatically open edit dialog
  if (window.computeVisuals) window.computeVisuals(cy);
  console.log('Statement added');
  
  // Auto-open edit dialog for immediate editing
  if (window.openEditNodeLabelModal) {
    window.openEditNodeLabelModal(newNode);
  }
}

// Ensure convergeAll and related functions are always available globally for all modules
if (typeof window !== 'undefined') {
  window.convergeAll = convergeAll;
  window.convergeEdges = convergeEdges;
  window.convergeNodes = convergeNodes;
  window.initializeNodeData = initializeNodeData;
  window.clearNodeDataForUnknownType = clearNodeDataForUnknownType;
  window.clearVisualOnlyData = clearVisualOnlyData;
  
  // Add debug helper functions to window for easy console access
  window.debugConvergeAll = () => convergeAll({ cy: window.cy, debug: true });
  window.convergeAllDebug = true; // Flag to enable debug by default if needed
}
