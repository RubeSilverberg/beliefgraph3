// --- Helper Functions ---

export function propagateFromParents({ baseProb, parents, getProb, getWeight, saturationK, epsilon }) {
  // Example: weighted sum with saturation
  let total = 0;
  let totalWeight = 0;
  parents.forEach(e => {
    const prob = getProb(e);
    const weight = getWeight(e);
    total += prob * weight;
    totalWeight += Math.abs(weight);
  });
  if (totalWeight === 0) return baseProb;
  // Saturation logic (simple sigmoid)
  const raw = total / totalWeight;
  const saturated = 1 / (1 + Math.exp(-saturationK * (raw - 0.5)));
  return saturated;
}

export function getTopologicallySortedNodesWithParents() {
  // Returns nodes with parents, sorted topologically
  const cy = window.cy;
  const nodes = cy.nodes().filter(n => n.incomers('edge').length > 0);
  // Simple Kahn's algorithm
  const sorted = [];
  const visited = new Set();
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
  // Syncs parent info for naive Bayes
  // Example: set parentIds array
  const parents = node.incomers('edge').map(e => e.source().id());
  node.data('parentIds', parents);
}

export function clearBayesHighlights() {
  // Remove highlight from all nodes
  const cy = window.cy;
  cy.nodes().forEach(n => n.removeData('highlighted'));
}

export function highlightBayesNodeFocus(node) {
  // Highlight a node for Bayes modal
  node.data('highlighted', true);
}
// logic.js
// All main graph logic and utility functions

export function convergeEdges({ cy, epsilon, maxIters }) {
  // No edge-level convergence yet; always "converges" for now
  return { converged: true };
}

export function convergeNodes({ cy, epsilon, maxIters }) {
  if (window.DEBUG) {
    console.log("[DEBUG] convergeNodes start");
    cy.nodes().forEach(node => {
      const id = node.id();
      const nodeType = node.data('type');
      console.log(`[DEBUG] ${id} prob at convergeNodes start:`, node.data('prob'));
      console.log(`[ROUTING] ${id} is ASSERTION? ${nodeType === window.NODE_TYPE_ASSERTION}`);
    });
  }

  let converged = false;
  let finalDelta = 0;
  let iterations = 0;

  for (let iter = 0; iter < maxIters; iter++) {
    iterations = iter + 1;
    let deltas = [];
    let maxDelta = 0;

    cy.nodes().forEach(node => {
      const nodeType = node.data('type');
      const id = node.id();
      let newProb;

      if (nodeType === window.NODE_TYPE_FACT) {
        newProb = window.FACT_PROB;
        node.removeData('isVirgin');
        console.log(`[SET PROB] ${id} | newProb=${newProb}`);
      } else if (nodeType === window.NODE_TYPE_AND) {
        const parents = node.incomers('edge').map(e => e.source());
        if (parents.length === 0) {
          newProb = undefined;
          console.log(`[SET PROB] ${id} | newProb=undefined (AND, no parents)`);
        } else {
          newProb = parents.reduce((acc, parent) => {
            const p = parent.data('prob');
            console.log(`[AND] ${id} parent ${parent.id()} prob=${p}`);
            return (typeof p === "number") ? acc * p : acc;
          }, 1);
          console.log(`[SET PROB] ${id} | newProb=${newProb} (AND)`);
        }
        node.removeData('isVirgin');
      } else if (nodeType === window.NODE_TYPE_OR) {
        const parents = node.incomers('edge').map(e => e.source());
        if (parents.length === 0) {
          newProb = undefined;
          console.log(`[SET PROB] ${id} | newProb=undefined (OR, no parents)`);
        } else {
          let prod = 1;
          parents.forEach(parent => {
            const p = parent.data('prob');
            console.log(`[OR] ${id} parent ${parent.id()} prob=${p}`);
            prod *= (typeof p === "number") ? (1 - p) : 1;
          });
          newProb = 1 - prod;
          console.log(`[SET PROB] ${id} | newProb=${newProb} (OR)`);
        }
        node.removeData('isVirgin');
      } else if (nodeType === window.NODE_TYPE_ASSERTION) {
        console.log(`[ROUTING] ${id} entering ASSERTION logic`);
        const incomingEdges = node.incomers('edge');
        const validEdges = incomingEdges.filter(e =>
          !e.data('isVirgin') &&
          !e.source().data('isVirgin')
        );
        console.log(`[UPDATE ASSERTION] ${id} | inEdges: ${incomingEdges.length} | validEdges: ${validEdges.length}`);
        if (validEdges.length === 0) {
          newProb = undefined;
          node.data('isVirgin', true);
          node.removeData('prob');
          node.removeData('robustness');
          node.removeData('robustnessLabel');
          console.log(`[SET PROB] ${id} | newProb=undefined (no valid edges)`);
        } else {
          newProb = window.propagateFromParents({
            baseProb: 0.5,
            parents: validEdges,
            getProb: e => {
              const parent = e.source();
              const parentProb = parent.data('type') === window.NODE_TYPE_FACT
                ? window.FACT_PROB
                : typeof parent.data('prob') === "number"
                  ? parent.data('prob')
                  : 0.5;
              if (typeof parent.data('prob') !== "number") {
                console.log(`[FALLBACK] ${parent.id()} | prob=0.5 (not set)`);
              }
              console.log(`[ASSERTION PARENT] ${id} <- ${parent.id()} | prob=${parentProb}`);
              return parentProb;
            },
            getWeight: e => e.data('computedWeight') || 0,
            saturationK: 1,
            epsilon
          });
          node.data('isVirgin', false);
          console.log(`[SET PROB] ${id} | newProb=${newProb} (ASSERTION)`);
        }
      } else {
        newProb = undefined;
        node.removeData('isVirgin');
      }
      deltas.push({ node, prev: node.data('prob'), newProb });
      const delta = Math.abs((typeof newProb === "number" && typeof node.data('prob') === "number") ? (newProb - node.data('prob')) : 0);
      if (delta > maxDelta) maxDelta = delta;
    });

    cy.batch(() => {
      deltas.forEach(({ node, newProb }) => {
        node.data('prob', newProb);
        console.log(`[SET PROB] ${node.id()} | newProb=${newProb} (batch)`);
      });
    });

    finalDelta = maxDelta;
    if (finalDelta < epsilon) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    console.warn(`convergeNodes: hit maxIters (${maxIters}) without converging (final delta=${finalDelta.toExponential(3)})`);
  }

  return { converged, iterations, finalDelta };
}

export function convergeAll({ cy, epsilon = window.config?.epsilon, maxIters = 30 } = {}) {
  if (window.DEBUG) console.log('convergeAll triggered');
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

export function wouldCreateCycle(cy, sourceId, targetId) {
  // Simple cycle check: DFS from target to source
  const visited = new Set();
  function dfs(nodeId) {
    if (nodeId === sourceId) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    const node = cy.getElementById(nodeId);
    const parents = node.incomers('edge').map(e => e.source().id());
    for (const parentId of parents) {
      if (dfs(parentId)) return true;
    }
    return false;
  }
  return dfs(targetId);
}

export function finalizeBayesTimeCPT(userCPT) {
  const cy = window.cy;
  Object.entries(userCPT).forEach(([nodeId, cpt]) => {
    const node = cy.getElementById(nodeId);
    node.data('cpt', cpt);
  });
  window.bayesHeavyMode = false;
  if (window.updateModeBadge) window.updateModeBadge();
  convergeAll({ cy });
  cy.nodes().forEach(node => {
    if (
      node.data('type') === window.NODE_TYPE_ASSERTION &&
      node.data('isVirgin') &&
      typeof node.data('prob') === 'number' &&
      node.incomers('edge').length > 0
    ) {
      node.removeData('isVirgin');
    }
  });
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
      cy.nodes().forEach(node => {
        if (
          node.data('type') === window.NODE_TYPE_ASSERTION &&
          node.data('isVirgin') &&
          typeof node.data('prob') === 'number' &&
          node.incomers('edge').length > 0
        ) {
          node.removeData('isVirgin');
        }
      });
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
        cy.nodes().forEach(node => {
          if (
            node.data('type') === window.NODE_TYPE_ASSERTION &&
            node.data('isVirgin') &&
            typeof node.data('prob') === 'number' &&
            node.incomers('edge').length > 0
          ) {
            node.removeData('isVirgin');
          }
        });
        if (window.computeVisuals) window.computeVisuals(cy);
        advance();
      },
      onPrev: (nodeIdx > 0 || parentIdx > 0) ? retreat : null
    });
  }
  showNextModal();
}

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
    cy.nodes().forEach(node => {
      if (
        node.data('type') === window.NODE_TYPE_ASSERTION &&
        node.data('isVirgin') &&
        typeof node.data('prob') === 'number' &&
        node.incomers('edge').length > 0
      ) {
        node.removeData('isVirgin');
      }
    });
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
