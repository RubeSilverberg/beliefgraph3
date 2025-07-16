console.log("Loaded logic.js");

// --- Helper Functions ---

export function propagateFromParents({ baseProb, parents, getProb, getWeight, saturationK, epsilon }) {
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

// FACT_PROB: Never exactly 1 to avoid logit infinity (move to config if needed)
export const FACT_PROB = 0.99;

// Robust propagateFromParents for assertion nodes (logit odds, global saturation)
function propagateFromParentsRobust({ baseProb, parents, getProb, getWeight, epsilon = 0.01, saturationK = 1 }) {
  if (!parents || parents.length === 0) return baseProb;
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
  const totalAbsW = infos.reduce((sum, x) => sum + Math.abs(x.weight), 0);
  let oddsDelta = 0;
  for (let i = 0; i < infos.length; ++i) {
    const { odds, weight } = infos[i];
    oddsDelta += weight * (odds - priorOdds);
  }
  // Apply global saturation to oddsDelta
  const saturation = 1 - Math.exp(-saturationK * totalAbsW);
  oddsDelta *= saturation;
  const updatedOdds = priorOdds + oddsDelta;
  return 1 / (1 + Math.exp(-updatedOdds));
}

export function convergeEdges({ cy, epsilon = 0.01, maxIters = 30 }) {
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
        nw = window.getModifiedEdgeWeight
          ? window.getModifiedEdgeWeight(cy, edge)
          : edge.data('weight');
      }
      deltas.push({ edge, prev, nw });
      const delta = Math.abs(nw - prev);
      if (delta > maxDelta) maxDelta = delta;
    });

    cy.batch(() => {
      deltas.forEach(({ edge, nw }) => edge.data('computedWeight', nw));
    });

    finalDelta = maxDelta;
    if (finalDelta < epsilon) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    console.warn(`convergeEdges: hit maxIters (${maxIters}) without converging (final delta=${finalDelta.toExponential(3)})`);
  }

  return { converged, iterations, finalDelta };
}

export function convergeNodes({ cy, epsilon = 0.01, maxIters = 30 }) {
  let converged = false, finalDelta = 0, iterations = 0;

  for (let iter = 0; iter < maxIters; iter++) {
    iterations = iter + 1;
    let deltas = [];
    let maxDelta = 0;
    let changed = false;

    cy.nodes().forEach(node => {
      const nodeType = node.data('type');
      let newProb;

      if (nodeType === 'fact') {
        newProb = FACT_PROB;
        node.removeData('isVirgin');
      } else if (nodeType === 'and') {
        const parents = node.incomers('edge').map(e => e.source());
        if (parents.length === 0 || parents.some(parent => typeof parent.data('prob') !== "number")) {
          newProb = undefined;
          node.data('isVirgin', true);
        } else {
          newProb = parents.reduce((acc, parent) => acc * parent.data('prob'), 1);
          node.removeData('isVirgin');
        }
      } else if (nodeType === 'or') {
        const parents = node.incomers('edge').map(e => e.source());
        if (parents.length === 0 || parents.some(parent => typeof parent.data('prob') !== "number")) {
          newProb = undefined;
          node.data('isVirgin', true);
        } else {
          let prod = 1;
          parents.forEach(parent => {
            prod *= (1 - parent.data('prob'));
          });
          newProb = 1 - prod;
    node.removeData('isVirgin');
  }
} else if (nodeType === 'assertion') {
  const incomingEdges = node.incomers('edge');
  // Filter for parent edges where the source has a defined prob
  const validEdges = incomingEdges.filter(e =>
    typeof e.source().data('prob') === "number"
  );

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
        return parent.data('prob');
      },
      getWeight: e => e.data('computedWeight') || 0,
      saturationK: 1,
      epsilon
    });
  }
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
    if (!changed || finalDelta < epsilon) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    console.warn(`convergeNodes: hit maxIters (${maxIters}) without converging (final delta=${finalDelta.toExponential(3)})`);
  }

  return { converged, iterations, finalDelta };
}


// Main convergence controller
export function convergeAll({ cy, epsilon = 0.01, maxIters = 30 } = {}) {
  let edgeResult, nodeResult;
  try {
    edgeResult = convergeEdges({ cy, epsilon, maxIters });
    if (!edgeResult.converged) console.warn('convergeAll: Edge stage failed to converge');
  } catch (err) {
    console.error('convergeAll: Error during edge convergence:', err);
    edgeResult = { converged: false, error: err };
  }
  try {
    nodeResult = convergeNodes({ cy, epsilon, maxIters });
    if (!nodeResult.converged) console.warn('convergeAll: Node stage failed to converge');
  } catch (err) {
    console.error('convergeAll: Error during node convergence:', err);
    nodeResult = { converged: false, error: err };
  }
  if (window.computeVisuals) window.computeVisuals(cy);
  return { edgeResult, nodeResult };
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
      return;
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

export function autosave() {
  const cy = window.cy;
  try {
    const elements = cy.elements().jsons();
    localStorage.setItem('beliefGraphAutosave', JSON.stringify(elements));
    console.log('Autosaved graph to localStorage');
  } catch (err) {
    console.error('Autosave failed:', err);
  }
}

export function restoreAutosave() {
  const cy = window.cy;
  console.log('restoreAutosave called');
  const data = localStorage.getItem('beliefGraphAutosave');
  if (!data) {
    alert('No autosaved graph found.');
    console.log('restoreAutosave: No autosave data in localStorage');
    return;
  }
  if (!confirm('This will overwrite your current graph with the last autosaved version. Continue?')) {
    console.log('restoreAutosave: User cancelled restore');
    return;
  }
  try {
    cy.elements().remove();
    cy.add(JSON.parse(data));
    cy.nodes().forEach(n => {
      if (n.data('type') !== 'fact') {
        n.data('prob', n.data('initialProb'));
      }
    });
    convergeAll({ cy });
    window.computeVisuals?.(cy);
    window.resetLayout?.();
    console.log('restoreAutosave: Success, graph restored');
  } catch (err) {
    alert('Failed to restore autosave.');
    console.error('restoreAutosave: Failed to restore autosave:', err);
  }
}

export function exportToExcelFromModel() {
  const cy = window.cy;
  if (typeof window.XLSX === 'undefined' || typeof cy === 'undefined') {
    alert('Cannot export: Excel library or graph missing.');
    return;
  }
  const wb = window.XLSX.utils.book_new();
  const nodes = cy.nodes().map(n => ({
    id: n.id(),
    label: n.data('origLabel'),
    prob: n.data('prob')
  }));
  const edges = cy.edges().map(e => ({
    source: e.data('source'),
    target: e.data('target'),
    weight: e.data('weight')
  }));
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(nodes), 'Nodes');
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(edges), 'Edges');
  window.XLSX.writeFile(wb, 'graph.xlsx');
  console.log('Exported graph to Excel');
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
  setTimeout(() => { window.computeVisuals?.(cy); }, 0);
  console.log('Graph cleared');
}
