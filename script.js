// script.js

/*
All belief and modifier propagation uses a single centralized function (`propagateFromParents`),
run modifiers→edges to convergence first, then nodes→nodes to convergence, with all logic modular
and no cycles between layers.
*/
/*
Belief Graph Refactor – SECTION 1: CONFIG & UTILITIES
PHASE 1 (2024-07): Node/Edge constants and utility logic are refactored per Lite spec.
- Four node types allowed: FACT, ASSERTION, AND, OR
- Two edge types allowed: SUPPORTS, OPPOSES
- No node probabilities are ever set manually (not even at creation)—fact nodes are fixed, assertions are latent/naive 0.5 until propagation
- Edge weights/modifiers apply ONLY to assertion nodes; ignored for AND/OR nodes
- CPT/Bayes utilities are for future/Phase 2 (leave, but flag at top)
- All replaced code is commented, not deleted, with rationale marker
*/

import {
  registerVisualEventHandlers,
  computeVisuals,
  drawModifierBoxes,
  showNodeHoverBox,
  removeNodeHoverBox,
  showModifierBox,
  removeModifierBox,
  robustnessToLabel
} from './visuals.js';

import {
  NODE_TYPE_FACT,
  NODE_TYPE_ASSERTION,
  NODE_TYPE_AND,
  NODE_TYPE_OR,
  EDGE_TYPE_SUPPORTS,
  EDGE_TYPE_OPPOSES,
  ALLOWED_NODE_TYPES,
  ALLOWED_EDGE_TYPES,
  DEBUG,
  logMath,
  likertToWeight,
  weightToLikert,
  likertDescriptor,
  saturation,
  config,
  WEIGHT_MIN,
  getModifiedEdgeWeight,
  updateEdgeModifierLabel,
  nudgeToBoundMultiplier
} from './config.js';

const menu = document.getElementById('menu');
const list = document.getElementById('menu-list');
let pendingEdgeSource = null;

function hideMenu() {
  menu.style.display = 'none';
  list.innerHTML = '';
}
// Prevent browser right-click menu from showing on Cytoscape canvas
document.getElementById('cy').addEventListener('contextmenu', e => e.preventDefault());

// --- Edge connection stub (required by convergeAll) ---
function convergeEdges({ cy, epsilon, maxIters }) {
  // No edge-level convergence yet; always "converges" for now
  return { converged: true };
}

// ...all unchanged code up to convergeNodes...
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: [],
    style: [
   {
      selector: 'node',
      style: {
        'background-color': '#888',
        'label': 'data(label)',
        'text-valign': 'center',
        'color': '#222',
        'font-size': 14,
        'width': 50,
        'height': 50,
        'border-width': 2,
        'border-color': '#444'
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 4,
        'line-color': '#bbb',
        'target-arrow-color': '#bbb',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(weightLabel)'
      }
    },
    // Optional: specific node shapes
    {
      selector: 'node[type="fact"]',
      style: { 'shape': 'rectangle', 'background-color': '#ffe082' }
    },
    {
      selector: 'node[type="assertion"]',
      style: { 'shape': 'ellipse', 'background-color': '#b3e5fc' }
    },
    {
      selector: 'node[type="and"]',
      style: { 'shape': 'diamond', 'background-color': '#b2dfdb' }
    },
    {
      selector: 'node[type="or"]',
      style: { 'shape': 'ellipse', 'background-color': '#d1c4e9' }
    }
  ],
  layout: { name: 'preset' }
});
/*
  Node convergence:
  - Updates node probabilities using new spec for all types.
  - Uses type field for all logic.
*/
function convergeNodes({ cy, epsilon, maxIters }) {
  if (DEBUG) {
    console.log("[DEBUG] convergeNodes start");
    cy.nodes().forEach(node => {
      const id = node.id();
      const nodeType = node.data('type');
      console.log(`[CONVERGE] ${id} | type=${nodeType} | prob PRE: ${node.data('prob')}`);
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

      if (nodeType === NODE_TYPE_FACT) {
        // Fact node: always fixed
        newProb = FACT_PROB;
        node.removeData('isVirgin'); // Facts are always active
        console.log(`[CONVERGE] ${id} | prob POST: ${newProb}`);
      } else if (nodeType === NODE_TYPE_AND) {
        // AND node: product of parent probabilities
        const parents = node.incomers('edge').map(e => e.source());
        if (parents.length === 0) {
          newProb = undefined; // latent; not set/displayed
        } else {
          newProb = parents.reduce((acc, parent) => {
            const p = parent.data('prob');
            console.log(`[CONVERGE] ${id} | AND parent ${parent.id()} prob=${p}`);
            return (typeof p === "number") ? acc * p : acc;
          }, 1);
        }
        node.removeData('isVirgin'); // Logic nodes always active
        console.log(`[CONVERGE] ${id} | prob POST: ${newProb}`);
      } else if (nodeType === NODE_TYPE_OR) {
        // OR node: sum-minus-product of parent probabilities
        const parents = node.incomers('edge').map(e => e.source());
        if (parents.length === 0) {
          newProb = undefined; // latent
        } else {
          let prod = 1;
          parents.forEach(parent => {
            const p = parent.data('prob');
            console.log(`[CONVERGE] ${id} | OR parent ${parent.id()} prob=${p}`);
            prod *= (typeof p === "number") ? (1 - p) : 1;
          });
          newProb = 1 - prod;
        }
        node.removeData('isVirgin'); // Logic nodes always active
        console.log(`[CONVERGE] ${id} | prob POST: ${newProb}`);
      } else if (nodeType === NODE_TYPE_ASSERTION) {
        // Assertion: Only non-virgin edges *from* non-virgin parents count
        const incomingEdges = node.incomers('edge');
        const validEdges = incomingEdges.filter(e =>
          !e.data('isVirgin') &&
          !e.source().data('isVirgin')
        );

        if (validEdges.length === 0) {
          newProb = undefined;
          node.data('isVirgin', true);
          node.removeData('prob');
          node.removeData('robustness');
          node.removeData('robustnessLabel');
          console.log(`[CONVERGE] ${id} | prob POST: undefined (no valid edges)`);
        } else {
          newProb = propagateFromParents({
            baseProb: 0.5,
            parents: validEdges,
            getProb: e => {
              const parent = e.source();
              const parentProb = parent.data('type') === NODE_TYPE_FACT
                ? FACT_PROB
                : typeof parent.data('prob') === "number"
                  ? parent.data('prob')
                  : 0.5;
              console.log(`[SET PROB] ${parent.id()} | usedProb=${parentProb}`);
              return parentProb;
            },
            getWeight: e => e.data('computedWeight') || 0,
            saturationK: 1,
            epsilon
          });
          node.data('isVirgin', false);
          console.log(`[CONVERGE] ${id} | prob POST: ${newProb}`);
        }
      } else {
        // Unknown node type
        newProb = undefined;
        node.removeData('isVirgin');
        console.log(`[CONVERGE] ${id} | prob POST: undefined (unknown type)`);
      }
      deltas.push({ node, prev: node.data('prob'), newProb });
      const delta = Math.abs((typeof newProb === "number" && typeof node.data('prob') === "number") ? (newProb - node.data('prob')) : 0);
      if (delta > maxDelta) maxDelta = delta;
    });

    // Apply all new probabilities in one batch
    cy.batch(() => {
      deltas.forEach(({ node, newProb }) => {
        node.data('prob', newProb);
        console.log(`[SET PROB] ${node.id()} | newProb=${newProb}`);
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

/*
  Full graph convergence:
  - Runs edge convergence, then node convergence, with error handling.
*/
function convergeAll({ cy, epsilon = config.epsilon, maxIters = 30 } = {}) {
  if (DEBUG) console.log('convergeAll triggered');
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

  // Remove the unnecessary global edge virginity reset here
  computeVisuals(cy);
  return { edgeResult, nodeResult };

/*
  Full graph convergence:
  - Runs edge convergence, then node convergence, with error handling.
*/


computeVisuals(cy); // draws visuals with old isVirgin state
  return { edgeResult, nodeResult };
}

// ===============================
// 🖱️ SECTION 6: Right-Click Menus — Unified Handler
// ===============================

cy.on('cxttap', evt => {
  evt.originalEvent.preventDefault();
  if (menu.offsetParent !== null) return;
  list.innerHTML = '';
  const pos = evt.renderedPosition;
  const rect = cy.container().getBoundingClientRect();
  const x = rect.left + pos.x;
  const y = rect.top + pos.y;


  // ---------- REGULAR MENU BELOW THIS LINE ----------
if (evt.target === cy) {
  ([
    { label: 'Add Assertion or Fact Node Here', action: () => {
cy.add({
  group: 'nodes',
  data: {
    id: 'node' + Date.now(),
    origLabel: 'New Belief',
    label: 'New Belief',
    type: NODE_TYPE_ASSERTION,
    isVirgin: true,
    userSize: 80 // (or whatever default you set in the style)
  },
  position: evt.position
});
        setTimeout(() => { convergeAll({ cy }); computeVisuals(cy); }, 0);
      }
    },
    { label: 'Add logic', action: () => {
        cy.add({
          group: 'nodes',
          data: {
            id: 'node' + Date.now(),
            origLabel: 'Logic node',
            type: NODE_TYPE_AND
          },
          position: evt.position
        });
        setTimeout(() => { convergeAll({ cy }); computeVisuals(cy); }, 0);
      }
    }
    // Optionally: Center Graph menu item if useful.
  ]).forEach(({ label, action }) => {
    const li = document.createElement('li');
    li.textContent = label;
    li.onclick = () => { action(); hideMenu(); };
    list.appendChild(li);
  });

  } else if (evt.target.isNode && evt.target.isNode()) {
    const node = evt.target;
    const nodeType = node.data('type');

    // Connect menu
    const startEdge = document.createElement('li');
    startEdge.textContent = 'Connect to...';
    startEdge.onclick = () => { pendingEdgeSource = node; hideMenu(); };
    list.appendChild(startEdge);

    // Node type toggle menu
    if (nodeType === NODE_TYPE_ASSERTION || nodeType === NODE_TYPE_FACT) {
      const toggleFact = document.createElement('li');
      toggleFact.textContent = nodeType === NODE_TYPE_FACT ? 'Swap to Assertion' : 'Swap to Fact';
      toggleFact.onclick = () => {
        const newType = nodeType === NODE_TYPE_FACT ? NODE_TYPE_ASSERTION : NODE_TYPE_FACT;
        node.data({ type: newType });
        // If converting Fact → Assertion, clear the probability
        if (nodeType === NODE_TYPE_FACT && newType === NODE_TYPE_ASSERTION) {
          node.removeData('prob');
        }
        setTimeout(() => { convergeAll({ cy }); computeVisuals(cy); }, 0);
        hideMenu();
      };
      list.appendChild(toggleFact);
    }
    if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
      const toggleLogic = document.createElement('li');
      toggleLogic.textContent = nodeType === NODE_TYPE_AND ? 'Convert to OR Node' : 'Convert to AND Node';
      toggleLogic.onclick = () => {
        const newType = nodeType === NODE_TYPE_AND ? NODE_TYPE_OR : NODE_TYPE_AND;
        node.data({ type: newType });
        setTimeout(() => { convergeAll({ cy }); computeVisuals(cy); }, 0);
        hideMenu();
      };
      list.appendChild(toggleLogic);
    }

    // REMOVE THIS BLOCK:
    // const setSizeItem = document.createElement('li');
    // setSizeItem.textContent = 'Set Node Size';
    // setSizeItem.onclick = () => {
    //   const input = prompt('Enter node size in pixels (20-160):', node.data('userSize') || 80);
    //   if (input !== null) {
    //     let size = parseInt(input);
    //     if (isNaN(size) || size < 20) size = 20;
    //     if (size > 160) size = 160;
    //     node.data('userSize', size);
    //     setTimeout(() => computeVisuals(), 0);
    //   }
    //   hideMenu();
    // };
    // list.appendChild(setSizeItem);

    // Instead, keep only the Visual Signals modal:
    const visualSignalsItem = document.createElement('li');
    visualSignalsItem.textContent = 'Visual Signals...';
    visualSignalsItem.onclick = () => {
      openVisualSignalsModal(node);
      hideMenu();
    };
    list.appendChild(visualSignalsItem);

    const notesItem = document.createElement('li');
    notesItem.textContent = 'View/Edit Notes...';
    notesItem.onclick = () => {
      openNotesModal(node);
      hideMenu();
    };
    list.appendChild(notesItem);

    // [2024-07 REMOVED: Node rationales replaced by notes per new spec]
// const rationaleItem = document.createElement('li');
// rationaleItem.textContent = 'View/Edit Rationale...';
// rationaleItem.onclick = () => {
//   openRationaleModal(node, "node");
//   hideMenu();
// };
// list.appendChild(rationaleItem);

    // Delete always available
    const del = document.createElement('li');
    del.textContent = 'Delete Node';
    del.onclick = () => { node.remove(); setTimeout(() => { convergeAll({ cy }); computeVisuals(cy); }, 0); hideMenu(); };
    list.appendChild(del);

  } else if (evt.target.isEdge && evt.target.isEdge()) {
    const edge = evt.target;
    const targetNode = edge.target();
    const targetType = targetNode.data('type');

    // Rationale and delete always available
    const rationaleItem = document.createElement('li');
    rationaleItem.textContent = 'View/Edit Rationale...';
    rationaleItem.onclick = () => {
      openRationaleModal(edge, "edge");
      hideMenu();
    };
    list.appendChild(rationaleItem);

    const del = document.createElement('li');
del.textContent = 'Delete This Edge';
del.onclick = () => { 
  edge.remove(); 
  setTimeout(() => { 
    convergeAll({ cy }); 
    cy.nodes().forEach(node => {
      const inc = node.incomers('edge').filter(e => !e.data('isVirgin'));
      if (node.data('type') === NODE_TYPE_ASSERTION && inc.length === 0) {
        node.removeData('prob');
        node.removeData('robustness');
        node.removeData('robustnessLabel');
      }
    });
    computeVisuals(cy); 
  }, 0); 
  hideMenu(); 
};

    list.appendChild(del);

// Modifiers (disabled in Lite mode)
// if (targetType === NODE_TYPE_ASSERTION) {
//   const addMod = document.createElement('li');
//   addMod.textContent = 'Add Modifier (Label & Likert)';
//   addMod.onclick = () => { addModifier(edge.id()); hideMenu(); };
//   list.appendChild(addMod);

//   const editMods = document.createElement('li');
//   editMods.textContent = 'Edit Modifiers';
//   editMods.onclick = () => {
//     if (window.bayesHeavyMode) return;
//     openEditModifiersModal(edge); 
//     hideMenu();
//   };
//   list.appendChild(editMods);
// }

  }

  if (list.childNodes.length) {
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
    requestAnimationFrame(() => {
      document.addEventListener('click', () => hideMenu(), { once: true });
    });
  }
});



// ===============================
// ✏️ SECTION 7: Interaction (Double-Tap + Edge Creation)
// ===============================

// Edge tap for editing influence/modifier — only for assertion node edges
cy.on('tap', 'edge', evt => {
  if (window.bayesHeavyMode) return;
  const edge = evt.target;
  const now = Date.now();
  const id = edge.id();
  const targetNode = edge.target();
  const targetType = targetNode.data('type');

  if (id === lastTappedEdge && now - lastEdgeTapTime < 300) {
    const prevModal = document.getElementById('modifier-modal');
    if (prevModal) prevModal.remove();

    const modal = document.createElement('div');
    modal.className = 'modifier-modal';

    const label = document.createElement('div');
    label.textContent = 'Set baseline influence:';
    label.className = "modifier-modal-title";
    label.style.marginBottom = '10px';
    modal.appendChild(label);
    makeDraggable(modal, ".modifier-modal-title");

    // Opposing checkbox (always present)
    const opposesContainer = document.createElement('div');
    opposesContainer.style.marginBottom = '8px';
    const opposesCheckbox = document.createElement('input');
    opposesCheckbox.type = 'checkbox';
    opposesCheckbox.id = 'opposes-checkbox';
    opposesCheckbox.checked = !!edge.data('opposes');
    const opposesLabel = document.createElement('label');
    opposesLabel.textContent = "Opposing ('not') influence";
    opposesLabel.htmlFor = 'opposes-checkbox';
    opposesContainer.appendChild(opposesCheckbox);
    opposesContainer.appendChild(opposesLabel);
    modal.appendChild(opposesContainer);

    // Only create Likert select for assertion node edges
    let select;
    if (targetType === NODE_TYPE_ASSERTION) {
      select = document.createElement('select');
      const options = [
        { label: "Maximal", value: 1 },
        { label: "Strong", value: 0.85 },
        { label: "Moderate", value: 0.60 },
        { label: "Small", value: 0.35 },
        { label: "Minimal", value: 0.15 }
      ];
      const currentAbs = Math.abs(edge.data('weight') ?? 0.15);
      options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (Math.abs(currentAbs - opt.value) < 0.01) o.selected = true;
        select.appendChild(o);
      });
      modal.appendChild(select);
    }

    const btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.style.margin = '10px 5px 0 0';
    btn.onclick = function () {
      const opposes = opposesCheckbox.checked;

      if (targetType === NODE_TYPE_ASSERTION && select) {
        const prevWeight = edge.data('weight');
        const val = parseFloat(select.value);
        edge.data('weight', val);

        if (prevWeight !== val) {
          edge.removeData('isVirgin');
        }
      } else {
        // Logic edges: always clear isVirgin after edit
        edge.removeData('isVirgin');
      }

      if (opposes) {
        edge.data('opposes', true);
        edge.data('type', 'opposes');
      } else {
        edge.removeData('opposes');
        edge.data('type', 'supports');
      }

      document.body.removeChild(modal);
      setTimeout(() => {
        convergeAll({ cy });
          // Sweep to clear isVirgin for assertion nodes with a defined prob and at least one parent
  cy.nodes().forEach(node => {
    if (
      node.data('type') === NODE_TYPE_ASSERTION &&
      node.data('isVirgin') &&
      typeof node.data('prob') === 'number' &&
      node.incomers('edge').length > 0
    ) {
      node.removeData('isVirgin');
    }
  });
        computeVisuals(cy);
      }, 0);
    };

    modal.appendChild(btn);

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.onclick = function () {
      document.body.removeChild(modal);
    };
    modal.appendChild(cancel);

  document.body.appendChild(modal);
centerModal(modal);   // <-- add this right after appending modal


    if (select) select.focus();

    lastTappedEdge = null;
    lastEdgeTapTime = 0;
  } else {
    lastTappedEdge = id;
    lastEdgeTapTime = now;
  }
});

// Edge creation (unchanged except no isVirgin)
cy.on('tap', evt => {
  if (window.bayesHeavyMode) return;
  if (!pendingEdgeSource) return;
  const target = evt.target;
  if (!target.isNode() || target.id() === pendingEdgeSource.id()) {
    pendingEdgeSource = null;
    return;
  }

  // Cycle prevention
  const sourceId = pendingEdgeSource.id();
  const targetId = target.id();
  if (wouldCreateCycle(cy, sourceId, targetId)) {
    alert('Adding this edge would create a cycle (closed loop), which is not allowed.');
    pendingEdgeSource = null;
    return;
  }

  // Determine target node type
  const targetType = target.data('type');
  let edgeData = {
    source: sourceId,
    target: targetId,
    rationale: ""
  };

// Only assertion node edges have weights
if (targetType === NODE_TYPE_ASSERTION) {
  edgeData.weight = WEIGHT_MIN;
  edgeData.isVirgin = true;
  edgeData.type = "supports";
}

cy.add({ group: 'edges', data: edgeData });
pendingEdgeSource = null;
setTimeout(() => {
  convergeAll({ cy });
    // Sweep to clear isVirgin for assertion nodes with a defined prob and at least one parent
  cy.nodes().forEach(node => {
    if (
      node.data('type') === NODE_TYPE_ASSERTION &&
      node.data('isVirgin') &&
      typeof node.data('prob') === 'number' &&
      node.incomers('edge').length > 0
    ) {
      node.removeData('isVirgin');
    }
  });
  computeVisuals(cy);
}, 0);
});

// Node double-tap: Edit label modal (not probability or logic)
// Two quick taps (within 300ms)
cy.on('tap', 'node', evt => {
  if (window.bayesHeavyMode) return;
  const node = evt.target;
  const now = Date.now();
  const id = node.id();

if (id === lastTappedNode && now - lastNodeTapTime < 300) {
  openEditNodeLabelModal(node);
  lastTappedNode = null;
  lastNodeTapTime = 0;
} else {
  lastTappedNode = id;
  lastNodeTapTime = now;
}

});

// ===============================
// 🧰 SECTION 8: Not currently used
// ===============================

// ===============================
// ⚙️ SECTION 9: Control Functions
// ===============================

function resetLayout() {
  if (cy.nodes().length > 1) {
    cy.fit(undefined, 50); // 50px padding
  } else {
    cy.zoom(2);
    cy.center();
    
  }
}

function clearGraph() {
  // Prompt before clearing
  if (!confirm('Are you sure you want to clear the graph?')) return;
  cy.elements().remove();
  setTimeout(() => { computeVisuals(cy); }, 0);
  console.log('Graph cleared');
}

function exportToExcelFromModel() {
  // Export nodes and edges to Excel using SheetJS
  if (typeof XLSX === 'undefined' || typeof cy === 'undefined') {
    alert('Cannot export: Excel library or graph missing.');
    return;
  }
  const wb = XLSX.utils.book_new();
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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nodes), 'Nodes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(edges), 'Edges');
  XLSX.writeFile(wb, 'graph.xlsx');
  console.log('Exported graph to Excel');
}

function saveGraph() {
  // Download current graph as JSON file
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

function loadGraph() {
  // Open file picker and load graph JSON
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

// Force layout and rendering, then apply visuals
cy.layout({ name: 'preset' }).run();
computeVisuals(cy);
cy.fit();
cy.resize();
resetLayout();
console.log(`Graph loaded from file: ${file.name}`);

      } catch (err) {
        console.error('Failed to load graph:', err);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function activateBayesTime() {
  // Trigger propagation
  setTimeout(() => { convergeAll({ cy }); computeVisuals(cy); }, 0);
  console.log('Bayes Time triggered');
}

// ===============================
// 🔄 SECTION 9b: Autosave & Restore
// ===============================

// Save the graph to localStorage every 5 minutes
function autosave() {
  try {
    const elements = cy.elements().jsons();
    localStorage.setItem('beliefGraphAutosave', JSON.stringify(elements));
    console.log('Autosaved graph to localStorage');
  } catch (err) {
    console.error('Autosave failed:', err);
  }
}

// Restore from autosave (manual, with confirmation)
function restoreAutosave() {
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
  // [PHASE1 REMOVED 2024-07: isFact logic replaced by type check per spec – see design doc]
  if (n.data('type') !== 'fact') {
    n.data('prob', n.data('initialProb'));
  }
});

    convergeAll({ cy });
      // Sweep to clear isVirgin for assertion nodes with a defined prob and at least one parent
  cy.nodes().forEach(node => {
    if (
      node.data('type') === NODE_TYPE_ASSERTION &&
      node.data('isVirgin') &&
      typeof node.data('prob') === 'number' &&
      node.incomers('edge').length > 0
    ) {
      node.removeData('isVirgin');
    }
  });
    computeVisuals(cy);
    resetLayout();
    console.log('restoreAutosave: Success, graph restored');
  } catch (err) {
    alert('Failed to restore autosave.');
    console.error('restoreAutosave: Failed to restore autosave:', err);
  }
}

// Start autosave timer (every 5 minutes)
setInterval(autosave, 5 * 60 * 1000);

// ===============================
// 🖱️ SECTION 10: Button Event Hookup
// ===============================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnRestoreAutosave').addEventListener('click', restoreAutosave);
  document.getElementById('btnResetLayout')  .addEventListener('click', resetLayout);
  document.getElementById('btnClearGraph')   .addEventListener('click', clearGraph);
  document.getElementById('btnExportExcel')  .addEventListener('click', exportToExcelFromModel);
  document.getElementById('btnSaveGraph')    .addEventListener('click', saveGraph);
  document.getElementById('btnLoadGraph')    .addEventListener('click', loadGraph);
  document.getElementById('btnBayesTime').addEventListener('click', startBayesTimeSequence);
});
// ===============================
// 🔇 QUIET MODE — filter out known plugin/deprecation errors
// ===============================
;(function(){
  const origError = console.error;
  const origWarn  = console.warn;

  console.error = function(...args) {
    const msg = args[0] + '';
    // ignore the plugin ghost errors
    if (msg.includes('layoutBase') || msg.includes('memoize')) {
      return;
    }
    origError.apply(console, args);
  };

  console.warn = function(...args) {
    const msg = args[0] + '';
    // ignore the deprecated label width/height warnings
    if (msg.includes('The style value of `label` is deprecated')) {
      return;
    }
    origWarn.apply(console, args);
  };
})();

// ===============================
// 🧩 SECTION 11: Bayes Time Modal Controller
// ===============================

/*
  Controls the step-by-step CPT entry modal sequence for Bayes Heavy mode.
  - Topologically walks through nodes with parents.
  - For each node, walks through all parent state combinations.
  - Handles navigation and storing entries in node.data('cpt').
*/

function finalizeBayesTimeCPT(userCPT) {
  // Store all entered CPTs into each node’s data, or perform further actions

  Object.entries(userCPT).forEach(([nodeId, cpt]) => {
    const node = cy.getElementById(nodeId);
    node.data('cpt', cpt);
  });
  // Exit Bayes Heavy, etc.
  bayesHeavyMode = false;
  updateModeBadge();
  convergeAll({ cy });
    // Sweep to clear isVirgin for assertion nodes with a defined prob and at least one parent
  cy.nodes().forEach(node => {
    if (
      node.data('type') === NODE_TYPE_ASSERTION &&
      node.data('isVirgin') &&
      typeof node.data('prob') === 'number' &&
      node.incomers('edge').length > 0
    ) {
      node.removeData('isVirgin');
    }
  });
  computeVisuals(cy);
  alert('Bayes Time CPT entry complete.');
}
// Enumerate all possible parent state combinations (assume binary for now: 0=No, 1=Yes)
function getParentStateCombos(parents) {
  if (parents.length === 0) return [[]];
  const combos = [];
  const total = 1 << parents.length; // 2^n
  for (let i = 0; i < total; ++i) {
    const combo = [];
    for (let j = 0; j < parents.length; ++j) {
      combo.push((i >> j) & 1); // 0 or 1 for each parent
    }
    combos.push(combo);
  }
  return combos;
}




// Now plug UI into the modal sequence controller:

function startBayesTimeSequence() {
  cy.nodes().forEach(node => syncNaiveBayesParents(node));
  bayesHeavyMode = true;
  window.bayesHeavyMode = true;
  updateModeBadge();

  const nodes = getTopologicallySortedNodesWithParents();
  let nodeIdx = 0;
  let parentIdx = 0;
  const userNaiveBayes = {}; // Store per-parent probabilities here

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
      // Save all .naiveBayes data to nodes
      nodes.forEach(node => {
        if (userNaiveBayes[node.id()]) {
          node.data('naiveBayes', userNaiveBayes[node.id()]);
          // Clear old CPT data if any

          node.removeData('cpt');
        }
      });
      convergeAll({ cy });
        // Sweep to clear isVirgin for assertion nodes with a defined prob and at least one parent
  cy.nodes().forEach(node => {
    if (
      node.data('type') === NODE_TYPE_ASSERTION &&
      node.data('isVirgin') &&
      typeof node.data('prob') === 'number' &&
      node.incomers('edge').length > 0
    ) {
      node.removeData('isVirgin');
    }
  });
      computeVisuals(cy);
      alert('Naive Bayes entry complete.');
      return;
    }

    const node = nodes[nodeIdx];
    const parents = node.incomers('edge').map(e => e.source());

    // No parents? Skip
    if (parents.length === 0) {
      nodeIdx++;
      parentIdx = 0;
      showNextModal();
      return;
    }

    if (!userNaiveBayes[node.id()]) userNaiveBayes[node.id()] = {};

    clearBayesHighlights();
highlightBayesNodeFocus(node);

openCPTModalTwoPerParent({
  node,
  parentId: parents[parentIdx].id(),
  existing: userNaiveBayes[node.id()][parents[parentIdx].id()] || { p0: null, p1: null },
onSave: (result) => {
  userNaiveBayes[node.id()][parents[parentIdx].id()] = result;
  // Immediately update the node so propagation/visuals are current
  node.data('naiveBayes', userNaiveBayes[node.id()]);
  convergeAll({ cy });
    // Sweep to clear isVirgin for assertion nodes with a defined prob and at least one parent
  cy.nodes().forEach(node => {
    if (
      node.data('type') === NODE_TYPE_ASSERTION &&
      node.data('isVirgin') &&
      typeof node.data('prob') === 'number' &&
      node.incomers('edge').length > 0
    ) {
      node.removeData('isVirgin');
    }
  });
  computeVisuals(cy);
  advance();
},
  onPrev: (nodeIdx > 0 || parentIdx > 0) ? retreat : null
});


  } // <--- closes showNextModal

  showNextModal(); // <-- call inside startBayesTimeSequence
}

/*
  [WARNING: isVirgin Usage – 2024-07]
  - 'isVirgin' is set on assertion edges at creation and cleared on first edit (weight).
  - Propagation ignores parent assertion edges that are still 'isVirgin'.
  - Node label edit also clears node 'isVirgin'.
  - All current logic is consistent and robust.
  - If you later change or remove 'isVirgin', review:
      • Edge creation
      • Edge editing modals
      • Node label edit modal
      • Propagation filtering (convergeNodes)
  - If removing, comment out all logic—do not just delete—since latent bugs may result if filtering is skipped.

      • Node label edit modal
      • Propagation filtering (convergeNodes)
  - If removing, comment out all logic—do not just delete—since latent bugs may result if filtering is skipped.
*/
