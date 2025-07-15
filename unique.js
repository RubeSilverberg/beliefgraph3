// Unique lines and blocks from confused.js not present in logic.js, menu.js, modals.js, visuals.js, config.js, or script_current.js

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

// --- CONFIG ---
let bayesHeavyMode = false;  // false = Bayes Lite; true = Bayes Heavy
window.bayesHeavyMode = bayesHeavyMode;

function updateModeBadge() {
  let badge = document.getElementById('mode-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'mode-badge';
    badge.style.position = 'fixed';
    badge.style.top = '10px';
    badge.style.right = '10px';
    badge.style.backgroundColor = '#ff7043';
    badge.style.color = '#fff';
    badge.style.padding = '6px 12px';
    badge.style.borderRadius = '4px';
    badge.style.fontWeight = 'bold';
    badge.style.zIndex = 9999;
    document.body.appendChild(badge);
  }
  badge.textContent = bayesHeavyMode ? 'Bayes Heavy Mode' : 'Bayes Lite Mode';
}
updateModeBadge();

const DEBUG = true;

function logMath(nodeId, msg) {
  if (DEBUG) console.log(`[${nodeId}] ${msg}`);
}

// --- EDGE WEIGHT/LIKERT UTILITIES (FOR ASSERTION NODES ONLY) ---
function likertToWeight(val) {
  // Only valid for assertion nodes
  // [-1, -0.85, -0.60, -0.35, -0.15, 0.15, 0.35, 0.60, 0.85, 1]
  const weights = [-1, -0.85, -0.60, -0.35, -0.15, 0.15, 0.35, 0.60, 0.85, 1];
  if (val < 0) return weights[val + 5];      // -5 → 0, -1 → 4
  if (val > 0) return weights[val + 4];      // +1 → 5, +5 → 9
  return 0.15; // fallback, should not hit val=0 in UI
}
window.likertToWeight = likertToWeight;

function weightToLikert(w) {
  // Only for assertion edge weights
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
  return closestIdx + 1; // 1–5, strength only
}
window.weightToLikert = weightToLikert;

function likertDescriptor(val) {
  switch (val) {
    case  1: return "Minimal";
    case  2: return "Small";
    case  3: return "Medium";
    case  4: return "Strong";
    case  5: return "Maximal";
    default: return `Custom (${val})`;
  }
}

// --- MODIFIER MODALS ---
function openEditModifiersModal(edge) {
  // [PHASE1 REMOVED 2024-07: per new spec – see design doc]
  const node = cy.getElementById(edge.target().id());
  if (
    node.data("type") === NODE_TYPE_AND ||
    node.data("type") === NODE_TYPE_OR
  ) {
    // For AND/OR, modifiers are N/A
    alert("Modifiers/weights are not available for AND/OR logic nodes.");
    return;
  }
  // ...existing assertion edge modifier modal code...
  // (unchanged)
}

// --- BAYES HEAVY / CPT UTILS ---
function openCPTModalTwoPerParent({ node, parentId, existing, onSave, onPrev }) {
  // [PHASE1 REMOVED 2024-07: per new spec – see design doc]
  // Flagged for future: Only relevant in Bayes Heavy mode, not active for Lite
}

// --- NODE NOTES MODAL ---
function openNotesModal(node) {
  // Remove any existing modal
  const prevModal = document.getElementById('notes-modal');
  if (prevModal) prevModal.remove();

  // Modal container
  const modal = document.createElement('div');
  modal.id = 'notes-modal';
  modal.style.position = 'fixed';
  modal.style.background = '#fff';
  modal.style.padding = '24px 20px 18px 20px';
  modal.style.border = '2px solid #1976d2';
  modal.style.borderRadius = '8px';
  modal.style.zIndex = 10001;
  modal.style.boxShadow = '0 6px 30px #1976d255';
  modal.style.minWidth = '360px';

  // Title
  const title = document.createElement('div');
  title.textContent = 'View/Edit Notes';
  title.className = 'modal-title';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '12px';
  modal.appendChild(title);
  makeDraggable(modal, ".modal-title");
  // Textarea
  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.minHeight = '80px';
  textarea.style.fontSize = '14px';
  textarea.style.border = '1px solid #bbb';
  textarea.style.borderRadius = '4px';
  textarea.value = node.data('notes') || '';
  modal.appendChild(textarea);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.margin = '14px 10px 0 0';
  saveBtn.onclick = function() {
    node.data('notes', textarea.value.trim());
    document.body.removeChild(modal);
  };
  modal.appendChild(saveBtn);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = function() {
    document.body.removeChild(modal);
  };
  modal.appendChild(cancelBtn);

  // ESC key closes modal
  const escListener = (e) => {
    if (e.key === "Escape") {
      document.body.removeChild(modal);
      window.removeEventListener('keydown', escListener);
    }
  };
  window.addEventListener('keydown', escListener);

  document.body.appendChild(modal);
centerModal(modal);   // <-- add this right after appending modal

  textarea.focus();
}
function openEditNodeLabelModal(node) {
  // Remove any existing modal
  const prevModal = document.getElementById('edit-label-modal');
  if (prevModal) prevModal.remove();

  // Modal container
  const modal = document.createElement('div');
  modal.id = 'edit-label-modal';
  modal.style.position = 'fixed';
  modal.style.background = '#fff';
  modal.style.padding = '24px 24px 18px 24px';
  modal.style.border = '2px solid #1976d2';
  modal.style.borderRadius = '8px';
  modal.style.zIndex = 10001;
  modal.style.boxShadow = '0 6px 30px #1976d255';
  modal.style.minWidth = '350px';

  // Title
  const title = document.createElement('div');
  title.textContent = 'Edit Node Label';
  title.className = 'modal-title';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '14px';
  modal.appendChild(title);
  makeDraggable(modal, ".modal-title");

  // Display label (short)
  const displayLabelLabel = document.createElement('label');
  displayLabelLabel.textContent = 'Display title (short, 1–2 words):';
  displayLabelLabel.style.display = 'block';
  displayLabelLabel.style.marginBottom = '3px';
  modal.appendChild(displayLabelLabel);

  const displayInput = document.createElement('input');
  displayInput.type = 'text';
  displayInput.maxLength = 30; // generous but keeps nodes readable
  displayInput.style.width = '100%';
  displayInput.style.marginBottom = '10px';
  displayInput.value = node.data('displayLabel') || node.data('origLabel') || '';
  modal.appendChild(displayInput);

  // Hover label (long)
  const hoverLabelLabel = document.createElement('label');
  hoverLabelLabel.textContent = 'Hover title (full sentence, optional):';
  hoverLabelLabel.style.display = 'block';
  hoverLabelLabel.style.marginBottom = '3px';
  modal.appendChild(hoverLabelLabel);

  const hoverInput = document.createElement('input');
  hoverInput.type = 'text';
  hoverInput.style.width = '100%';
  hoverInput.style.marginBottom = '18px';
  hoverInput.value = node.data('hoverLabel') || '';
  modal.appendChild(hoverInput);

  // Save and Cancel buttons
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.disabled = !displayInput.value.trim();
  saveBtn.style.margin = '0 12px 0 0';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';

  modal.appendChild(saveBtn);
  modal.appendChild(cancelBtn);

  // Validation: Enable/disable Save button based on display label
  displayInput.addEventListener('input', () => {
    saveBtn.disabled = !displayInput.value.trim();
  });

  // Save logic
 saveBtn.onclick = function() {
  const displayVal = displayInput.value.trim().slice(0, 25);
  const hoverVal = hoverInput.value.trim();
  if (!displayVal) return;


  node.data('displayLabel', displayVal);
  node.data('hoverLabel', hoverVal);
  node.removeData('isVirgin');  // <-- Clear isVirgin on label edit
  adjustNodeSize(node);
  computeVisuals(window.cy);

  document.body.removeChild(modal);
  setTimeout(() => { computeVisuals(); }, 0);
};

  cancelBtn.onclick = function() {
    document.body.removeChild(modal);
  };

  // ESC key closes modal
  const escListener = (e) => {
    if (e.key === "Escape") {
      document.body.removeChild(modal);
      window.removeEventListener('keydown', escListener);
    }
  };
  window.addEventListener('keydown', escListener);

  document.body.appendChild(modal);
centerModal(modal);   // <-- add this right after appending modal

  displayInput.focus();
}

// --- EDGE RATIONALE MODAL ---
function openRationaleModal(edge) {
  // Remove any existing modal
  const prevModal = document.getElementById('rationale-modal');
  if (prevModal) prevModal.remove();

  // Modal container
  const modal = document.createElement('div');
  modal.id = 'rationale-modal';
  modal.style.position = 'fixed';
  modal.style.background = '#fff';
  modal.style.padding = '24px 20px 18px 20px';
  modal.style.border = '2px solid #2e7d32';
  modal.style.borderRadius = '8px';
  modal.style.zIndex = 10001;
  modal.style.boxShadow = '0 6px 30px #2e7d3255';
  modal.style.minWidth = '360px';

  // Title
  const title = document.createElement('div');
  title.textContent = 'View/Edit Rationale';
  title.className = 'modal-title';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '12px';
  modal.appendChild(title);
  makeDraggable(modal, ".modal-title");

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.minHeight = '80px';
  textarea.style.fontSize = '14px';
  textarea.style.border = '1px solid #bbb';
  textarea.style.borderRadius = '4px';
  textarea.value = edge.data('rationale') || '';
  modal.appendChild(textarea);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.margin = '14px 10px 0 0';
  saveBtn.onclick = function() {
    edge.data('rationale', textarea.value.trim());
    document.body.removeChild(modal);
  };
  modal.appendChild(saveBtn);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = function() {
    document.body.removeChild(modal);
  };
  modal.appendChild(cancelBtn);

  // ESC key closes modal
  const escListener = (e) => {
    if (e.key === "Escape") {
      document.body.removeChild(modal);
      window.removeEventListener('keydown', escListener);
    }
  };
  window.addEventListener('keydown', escListener);
  document.body.appendChild(modal);
centerModal(modal);   // <-- add this right after appending modal

  textarea.focus();
}

// --- MODIFIER CREATION (ASSERTION EDGES ONLY) ---
function addModifier(edgeId) {
  // [PHASE1 REMOVED 2024-07: per new spec – see design doc]
  const edge = cy.getElementById(edgeId);
  const node = cy.getElementById(edge.target().id());
  if (
    node.data("type") === NODE_TYPE_AND ||
    node.data("type") === NODE_TYPE_OR
  ) {
    alert("Modifiers/weights are not available for AND/OR logic nodes.");
    return;
  }
  // ...existing modal logic for assertion edges...
}

// --- GENERIC UTILS / BAYES & AUTOSAVE ---
function centerModal(modal) {
  // Ensure modal is in DOM and visible for size measurement
  modal.style.left = "0px";
  modal.style.top = "0px";
  modal.style.display = "block"; // ensure not display:none

  const { innerWidth, innerHeight } = window;
  const rect = modal.getBoundingClientRect();
  modal.style.left = Math.round((innerWidth - rect.width) / 2) + "px";
  modal.style.top  = Math.round((innerHeight - rect.height) / 2) + "px";
}

// Make modal draggable by handle (title bar or full modal)
function makeDraggable(modal, handleSelector = null) {
  let isDragging = false, startX, startY, origX, origY;
  const handle = handleSelector ? modal.querySelector(handleSelector) : modal;

  handle.style.cursor = "move";
  handle.onmousedown = function(e) {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    // Lock current pixel position before moving
    const rect = modal.getBoundingClientRect();
    modal.style.left = rect.left + "px";
    modal.style.top  = rect.top + "px";
    origX = rect.left;
    origY = rect.top;
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  document.onmousemove = function(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    modal.style.left = (origX + dx) + "px";
    modal.style.top  = (origY + dy) + "px";
  };

  document.onmouseup = function() {
    isDragging = false;
    document.body.style.userSelect = "";
  };
}

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
  computeVisuals();
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
      computeVisuals();
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
  computeVisuals();
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
*/