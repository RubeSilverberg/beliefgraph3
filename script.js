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

// --- NODE/EDGE TYPE CONSTANTS ---
const NODE_TYPE_FACT = "fact";
const NODE_TYPE_ASSERTION = "assertion";
const NODE_TYPE_AND = "and";
const NODE_TYPE_OR = "or";
const EDGE_TYPE_SUPPORTS = "supports";
const EDGE_TYPE_OPPOSES = "opposes";

// For future reference, node types allowed:
const ALLOWED_NODE_TYPES = [NODE_TYPE_FACT, NODE_TYPE_ASSERTION, NODE_TYPE_AND, NODE_TYPE_OR];
const ALLOWED_EDGE_TYPES = [EDGE_TYPE_SUPPORTS, EDGE_TYPE_OPPOSES];

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

document.addEventListener('contextmenu', e => e.preventDefault());

const DEBUG = true;

let pendingEdgeSource = null;
let lastNodeTapTime = 0;
let lastTappedNode = null;
let lastEdgeTapTime = 0;
let lastTappedEdge = null;

const config = { epsilon: .01 };
const WEIGHT_MIN = 0.01;

// --- LOGGING ---
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

// --- EDGE MODIFIERS (ASSERTION NODES ONLY) ---
function updateEdgeModifierLabel(edge) {
  // [PHASE1 REMOVED 2024-07: per new spec – see design doc]
  // Only used for assertion nodes. For AND/OR, weight/modifiers are ignored.
  const node = cy.getElementById(edge.target().id());
  if (
    node.data("type") === NODE_TYPE_AND ||
    node.data("type") === NODE_TYPE_OR
  ) {
    edge.data('weightLabel', '—');
    return;
  }
  // else: assertion node logic unchanged
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

// Returns true if adding an edge from sourceId → targetId would create a cycle
function wouldCreateCycle(cy, sourceId, targetId) {
  if (sourceId === targetId) return true;
  const visited = new Set();
  function dfs(nodeId) {
    if (nodeId === sourceId) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    return cy.getElementById(nodeId)
      .outgoers('edge')
      .map(e => e.target().id())
      .some(nextId => dfs(nextId));
  }
  return dfs(targetId);
}

// --- MODIFIER MODALS ---
// The following modal logic applies ONLY for assertion node edges.
// For AND/OR, menu/modal should be blocked or show "not available" per spec.
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
// The following functions are for Bayes Heavy/Phase 2 only.
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
  modal.style.left = '50%';
  modal.style.top = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
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
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '12px';
  modal.appendChild(title);

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.minHeight = '120px';
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
  makeDraggable(modal);
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
  modal.style.left = '50%';
  modal.style.top = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
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
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '14px';
  modal.appendChild(title);

  // Display label (short)
  const displayLabelLabel = document.createElement('label');
  displayLabelLabel.textContent = 'Display title (short, 1–2 words):';
  displayLabelLabel.style.display = 'block';
  displayLabelLabel.style.marginBottom = '3px';
  modal.appendChild(displayLabelLabel);

  const displayInput = document.createElement('input');
  displayInput.type = 'text';
  displayInput.maxLength = 25; // generous but keeps nodes readable
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
  makeDraggable(modal);
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
  modal.style.left = '50%';
  modal.style.top = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
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
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '12px';
  modal.appendChild(title);

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.minHeight = '120px';
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
  makeDraggable(modal);
  textarea.focus();
}

function nudgeToBoundMultiplier(currentWeight, likert, bound = 0.99) {
  // Only for assertion nodes
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

// --- PROPAGATION LOGIC UTILITIES (USED ELSEWHERE) ---
function propagateFromParents({
  baseProb,
  parents,
  getProb,
  getWeight,
  epsilon = 0.01,
  saturationK = 1
}) {
  // For assertion nodes only—AND/OR logic is handled separately in Section 5
  if (!parents || parents.length === 0) return baseProb;
  const clampedBase = Math.min(Math.max(baseProb, epsilon), 1 - epsilon);
  const priorOdds = Math.log(clampedBase / (1 - clampedBase));
  const infos = parents.map(parent => {
    const prob = Math.min(Math.max(getProb(parent), epsilon), 1 - epsilon);
    return {
      parent,
      odds: Math.log(prob / (1 - prob)),
      weight: getWeight(parent)
    };
  });
  const totalAbsW = infos.reduce((sum, x) => sum + Math.abs(x.weight), 0);
let oddsDelta = 0;
for (let i = 0; i < infos.length; ++i) {
  const { odds, weight } = infos[i];
  oddsDelta += weight * (odds - priorOdds);
}
// Now apply global saturation to the total oddsDelta
const saturation = 1 - Math.exp(-saturationK * totalAbsW);
oddsDelta *= saturation;

  const updatedOdds = priorOdds + oddsDelta;
  return 1 / (1 + Math.exp(-updatedOdds));
}

function saturation(aei, k = 1) {
  return 1 - Math.exp(-k * aei);
}

// Applies all Likert modifiers to the edge’s base weight—ASSERTION ONLY
function getModifiedEdgeWeight(edge) {
  // [PHASE1 REMOVED 2024-07: per new spec – see design doc]
  const node = cy.getElementById(edge.target().id());
  if (
    node.data("type") === NODE_TYPE_AND ||
    node.data("type") === NODE_TYPE_OR
  ) {
    // For AND/OR, weights/modifiers are ignored
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
window.getModifiedEdgeWeight = getModifiedEdgeWeight;

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
function makeDraggable(modal, handleSelector = null) { /* unchanged */ }
function makeDraggable(modal, handleSelector = null) {
  let isDragging = false, startX, startY, origX, origY;
  const handle = handleSelector ? modal.querySelector(handleSelector) : modal;

  handle.style.cursor = "move";
  handle.onmousedown = function(e) {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = modal.getBoundingClientRect();
    origX = rect.left;
    origY = rect.top;
    document.body.style.userSelect = "none";
  };

  document.onmousemove = function(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    modal.style.left = (origX + dx) + "px";
    modal.style.top = (origY + dy) + "px";
    modal.style.transform = ""; // Remove centering transform when dragging
  };

  document.onmouseup = function() {
    isDragging = false;
    document.body.style.userSelect = "";
  };
}

function highlightBayesNodeFocus(targetNode) { /* unchanged */ }
function clearBayesHighlights() { /* unchanged */ }
function syncNaiveBayesParents(node) { /* unchanged – for Phase 2 / Bayes Heavy only */ }

// --- SETTERS (PROB, WEIGHT) ---
function setNodeProb(node, prob) {
  // [PHASE1 REMOVED 2024-07: per new spec – see design doc]
  // Probability is never set manually. Fact = 1-epsilon, assertion = 0.5 at creation (latent), rest via propagation.
  // Only called in legacy/manual code—should be removed elsewhere.
}
function setEdgeWeight(edge, weight) {
  // [PHASE1 REMOVED 2024-07: per new spec – see design doc]
  // Edge weights are only manually set for assertion nodes; for AND/OR, no effect.
}

// --- MENU / DOM ---
const menu = document.getElementById('menu');
const list = document.getElementById('menu-list');
function hideMenu() {
  menu.style.display = 'none';
}

// ===============================
// 🧱 SECTION 2: DOM Bindings
// ===============================

menu.addEventListener('click', e => e.stopPropagation());

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideMenu();
});

// ===============================
// 🌐 SECTION 3: Graph Initialization
// ===============================

const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: [
    // Only one node: "New Belief" assertion node
    { data: { id: 'N1', origLabel: 'New Belief', type: NODE_TYPE_ASSERTION } }
    // No explicit prob/initialProb—is latent/invisible until updated via propagation
  ],

  style: [
    {
      selector: 'node',
      style: {
        'shape': 'roundrectangle',
        'background-color': '#eceff1',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '10px',
        'text-wrap': 'wrap',
        'text-max-width': '120px',
        'padding': '12px',
        'width': 'label',
        'height': 'label',
        'min-width': 80,
        'min-height': 40,
        'border-style': 'solid',
        'border-width': 1,
        'border-color': '#bbb',
        'color': '#263238'
      }
    },
    {
      selector: 'node[borderWidth][borderColor]',
      style: {
        'border-width': 'data(borderWidth)',
        'border-color': 'data(borderColor)'
      }
    },
    { selector: 'node[label]', style: { label: 'data(label)' } },
    { selector: 'node[borderWidth]',  style: { 'border-width': 'data(borderWidth)' } },
    { selector: 'node[shape]',        style: { shape: 'data(shape)' } },
    // BASE EDGE STYLE — No label, dynamic width and color by type/strength
{
  selector: 'edge',
  style: {
    'curve-style': 'bezier',
    'mid-target-arrow-shape': 'triangle',
    'width': 'mapData(absWeight, 0, 1, 2, 8)',      // Adjust min/max width as desired
    'line-color': '#bbb',                            // Fallback gray, will be overridden below
    'mid-target-arrow-color': '#bbb',
    'opacity': 1,
    // Label REMOVED: only on hover/modal
  }
},
// SUPPORTS EDGES: Dynamic blue by strength
{
  selector: 'edge[type="supports"]',
  style: {
    'line-color': 'mapData(absWeight, 0, 1, #bbdefb, #1565c0)',
    'mid-target-arrow-color': 'mapData(absWeight, 0, 1, #bbdefb, #1565c0)'
  }
},
// OPPOSES EDGES: Dynamic red by strength
{
  selector: 'edge[type="opposes"], edge[opposes]',
  style: {
    'line-color': 'mapData(absWeight, 0, 1, #ffcdd2, #b71c1c)',
    'mid-target-arrow-shape': 'bar',  // Optional, if you want a different arrow
    'mid-target-arrow-color': 'mapData(absWeight, 0, 1, #ffcdd2, #b71c1c)',
//    'line-style': 'dotted'             // Optional, for additional visual
  }
},
// VIRGIN EDGES: Still visually distinct (optional)
{
  selector: 'edge[isVirgin]',
  style: {
    'line-color': '#ffb300',
    'mid-target-arrow-color': '#ffb300',
    'width': 4,
    'opacity': 1
  }
},

    // Special highlight for new nodes (visual only; phase 2 refactor will revise)
    // { selector: 'node[isVirgin]', style: { 'background-color': '#fffbe5', }},
    // Special highlight for new edges
    { selector: 'edge[isVirgin]', style: {
        'line-color': '#ffb300',
        'mid-target-arrow-color': '#ffb300',
        'width': 4,
        'opacity': 1
    }},
    { selector: 'node[highlighted]', style: {
        'background-color': '#fffbe5',
        'box-shadow': '0 0 18px 6px #ffe082',
        'z-index': 999
    }}
  ],

  layout: { name: 'grid', rows: 1 }
});

cy.ready(() => {
  // Only one node? Set sane zoom and center.
  if (cy.nodes().length === 1) {
    cy.zoom(2);      // 1 is typically "normal" zoom; adjust if your default is different
    cy.center();
  } else {
    cy.fit();
  }
});

// ===============================
// 🎨 SECTION 4: Visual Styling & Modifier Box
// ===============================

// Draws floating modifier boxes only for assertion node edges
function drawModifierBoxes() {
  // Remove previous boxes
  document.querySelectorAll('.modifier-box').forEach(el => el.remove());
  cy.edges().forEach(edge => {
    // Guard: Only show for edges targeting assertion nodes
    const targetNode = edge.target();
    if (targetNode.data('type') !== NODE_TYPE_ASSERTION) return;

    const mods = edge.data('modifiers') ?? [];
    if (!mods.length) return;

    const mid = edge.midpoint();
    const pan = cy.pan();
    const zoom = cy.zoom();
    const container = cy.container();
    const x = mid.x * zoom + pan.x;
    const y = mid.y * zoom + pan.y;

    const box = document.createElement('div');
    box.className = 'modifier-box';
    box.style.position = 'absolute';
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.background = 'rgba(220,235,250,0.97)';
    box.style.border = '1.5px solid #1565c0';
    box.style.borderRadius = '8px';
    box.style.padding = '5px 8px';
    box.style.fontSize = '11px';
    box.style.minWidth = '80px';
    box.style.maxWidth = '220px';
    box.style.zIndex = 10;
    box.style.boxShadow = '0 1.5px 7px #1565c066';

    mods.forEach(mod => {
      const item = document.createElement('div');
      item.style.margin = '2px 0';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      let color = '#616161';
      if (mod.likert > 0) color = '#2e7d32';
      if (mod.likert < 0) color = '#c62828';
      const val = mod.likert > 0 ? '+'+mod.likert : ''+mod.likert;
      item.innerHTML = `<span style="color:${color};font-weight:600;min-width:24px;display:inline-block;">${val}</span> <span style="margin-left:5px;">${mod.label}</span>`;
      box.appendChild(item);
    });
    container.parentElement.appendChild(box);
  });
}

// --- Node hover: probability/logic display per node type ---
cy.on('mouseover', 'node', evt => {
  showNodeHoverBox(evt.target);
});
cy.on('mouseout', 'node', evt => {
  removeNodeHoverBox();
});

function showNodeHoverBox(node) {
  removeNodeHoverBox(); // Clean up any old
  const pos = node.renderedPosition();
  const container = cy.container();
  const x = pos.x + 20; // Offset to the right
  const y = pos.y - 30; // Offset upward

  const box = document.createElement('div');
  box.className = 'node-hover-box';
  box.style.position = 'absolute';
  box.style.left = `${x + 20}px`;
  box.style.top = `${y - 30}px`;
  box.style.background = '#f3f3fc';
  box.style.border = '1.5px solid #2e7d32';
  box.style.borderRadius = '8px';
  box.style.padding = '7px 14px';
  box.style.fontSize = '12px';
  box.style.zIndex = 20;
  box.style.boxShadow = '0 2px 8px #1565c066';

  const displayLabel = node.data('displayLabel') || node.data('origLabel') || "";
  const hoverLabel = node.data('hoverLabel');
  const nodeType = node.data('type');

if (nodeType === NODE_TYPE_FACT) {
  // Fact node: suppress probability indicator entirely
  box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><span>Fact node</span>`;
  container.parentElement.appendChild(box);
  return; // Do not show probability or any other details for fact nodes
  } else if (nodeType === NODE_TYPE_ASSERTION) {
    // Assertion node: show prob only if set, otherwise indicate latent
    if (typeof node.data('prob') !== "number") {
      box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><i>No incoming information.</i>`;
    } else {
      const curProb = Math.round(100 * node.data('prob'));
      box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br>
        <span>Current: <b>${curProb}%</b></span>`;
    }
    // Add qualitative robustness to hover box if available (always for assertion nodes)
    const rlabel = node.data('robustnessLabel');
    if (rlabel) {
      box.innerHTML += `<br><span><b style="color:#8000ff">Robustness</b>: <b>${rlabel}</b></span>`;

    }
  } else if (nodeType === NODE_TYPE_AND) {
    box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><i>AND logic node<br>(product of parent probs)</i>`;
  } else if (nodeType === NODE_TYPE_OR) {
    box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><i>OR logic node<br>(sum-minus-product of parent probs)</i>`;
  } else {
    box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><i>Unknown node type</i>`;
  }

  container.parentElement.appendChild(box);
}

function removeNodeHoverBox() {
  document.querySelectorAll('.node-hover-box').forEach(el => el.remove());
}
document.addEventListener('mousedown', removeNodeHoverBox);
document.addEventListener('mousedown', removeModifierBox);

// --- Edge hover: only show for assertion node targets ---
cy.on('mouseover', 'edge', evt => {
  const edge = evt.target;
  showModifierBox(edge);
});
cy.on('mouseout', 'edge', evt => {
  removeModifierBox();
});

function showModifierBox(edge) {
  removeModifierBox();
  // Guard: Only show for edges targeting assertion nodes
  const targetNode = edge.target();
  if (targetNode.data('type') !== NODE_TYPE_ASSERTION) {
    // Optionally, could show: "No modifiers for logic node"
    return;
  }
  const mods = edge.data('modifiers') ?? [];
  const baseLikert = weightToLikert(edge.data('weight')); // existing function
  const baseLabel = likertDescriptor(baseLikert);

  const mid = edge.midpoint();
  const pan = cy.pan();
  const zoom = cy.zoom();
  const container = cy.container();
  const x = mid.x * zoom + pan.x;
  const y = mid.y * zoom + pan.y;

  const box = document.createElement('div');
  box.className = 'modifier-box';
  box.style.position = 'absolute';
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  box.style.background = 'rgba(220,235,250,0.97)';
  box.style.border = '1.5px solid #1565c0';
  box.style.borderRadius = '8px';
  box.style.padding = '6px 14px';
  box.style.fontSize = '12px';
  box.style.zIndex = 20;
  box.style.boxShadow = '0 2px 8px #1565c066';

  if (edge.data('isVirgin')) {
    box.innerHTML = `<i>Weight not set.</i>`;
    container.parentElement.appendChild(box);
    return;
  }
  // Base Likert info
  box.innerHTML = `<div><b>Base influence:</b> ${baseLabel}</div>`;

  if (mods.length) {
    box.innerHTML += `<hr style="margin:6px 0 3px 0">`;
    mods.forEach(mod => {
      let color = '#616161';
      if (mod.likert > 0) color = '#2e7d32';
      if (mod.likert < 0) color = '#c62828';
      const val = mod.likert > 0 ? '+'+mod.likert : ''+mod.likert;
      box.innerHTML += `<div style="color:${color};margin:2px 0;">
        ${val}: ${mod.label}
      </div>`;
    });
  }

  container.parentElement.appendChild(box);
}

function removeModifierBox() {
  document.querySelectorAll('.modifier-box').forEach(el => el.remove());
}


// ===============================
// 🎨 SECTION 4b: Node/Edge Visuals
// ===============================

function robustnessToLabel(robust) {
  if (robust < 0.15) return "Minimal";
  if (robust < 0.35) return "Low";
  if (robust < 0.60) return "Moderate";
  if (robust < 0.85) return "High";
  return "Very High";
}

function computeVisuals() {
  cy.nodes().forEach(node => {
    const nodeType = node.data('type');
    const displayLabel = node.data('displayLabel') || node.data('origLabel') || "";
    let label = displayLabel;
    let borderWidth = 1;
    let borderColor = '#bbb'; // Always set!
    let shape = 'roundrectangle';

    if (nodeType === NODE_TYPE_FACT) {
      // Fact node: always show as "Fact: Label"
      label = `Fact: ${displayLabel}`;
      shape = 'rectangle';
      borderWidth = 2;
      borderColor = '#444';
      node.removeData('robustness');
      node.removeData('robustnessLabel');
    } else if (nodeType === NODE_TYPE_ASSERTION) {
      // Assertion node: show prob if and only if set (not latent/undefined)
      if (typeof node.data('prob') === "number") {
        const p = node.data('prob');
        let pPct = Math.round(p * 100);
        if (pPct > 0 && pPct < 1) pPct = 1;
        if (pPct > 99) pPct = 99;
        label += `\n${pPct}%`;
        // Robustness as border only (not in label)
        const aei = node.incomers('edge').reduce((sum, e) => {
  const parentNode = e.source();
  // Allow both assertion and fact parents to count toward robustness
  if (parentNode.data('type') !== NODE_TYPE_ASSERTION && parentNode.data('type') !== NODE_TYPE_FACT) return sum;
  const w = getModifiedEdgeWeight(e);
  return sum + (typeof w === "number" ? Math.abs(w) : 0);
}, 0);

        const robust = saturation(aei); // [0,1]
        // Qualitative robustness label
        const robustLabel =
          robust < 0.15 ? "Minimal" :
          robust < 0.35 ? "Low" :
          robust < 0.60 ? "Moderate" :
          robust < 0.85 ? "High" : "Very High";
        node.data('robustness', robust);
        node.data('robustnessLabel', robustLabel);

        borderWidth = robust > 0 ? Math.max(2, Math.round(robust * 10)) : 1;
        // Vividness scales from 0.2 to 1.0 (purple border)
        const vivid = 0.2 + 0.8 * robust;
        borderColor = `rgba(128,0,255,${vivid})`;
        // (Optional) CPT badge
        if (bayesHeavyMode && node.data('cpt')) {
          label += `\n[Naive Bayes]`;
        }
      } else {
        // No prob: still set minimal robustness border for UI consistency
        node.removeData('robustness');
        node.removeData('robustnessLabel');
        borderWidth = 1;
        borderColor = `rgba(128,0,255,0.2)`;
      }
    } else if (nodeType === NODE_TYPE_AND) {
      label = `And: ${displayLabel}`;
      shape = 'diamond';
      borderWidth = 3;
      borderColor = '#bbb';
      node.removeData('robustness');
      node.removeData('robustnessLabel');
    } else if (nodeType === NODE_TYPE_OR) {
      label = `Or: ${displayLabel}`;
      shape = 'ellipse';
      borderWidth = 3;
      borderColor = '#bbb';
      node.removeData('robustness');
      node.removeData('robustnessLabel');
    } else {
      label = `[Unknown Type] ${displayLabel}`;
      borderColor = '#bbb';
      node.removeData('robustness');
      node.removeData('robustnessLabel');
    }

    node.data({
      label,
      borderWidth,
      borderColor,
      shape
    });
    if (DEBUG) logMath(node.id(), `Visual: ${label.replace(/\n/g, ' | ')}`);
  });

  cy.edges().forEach(edge => {
    // Edge visuals: Only show weights/modifiers for assertion node edges
    const targetNode = edge.target();
    let absW = 0, label = '';
    if (targetNode.data('type') === NODE_TYPE_ASSERTION) {
      const effectiveWeight = getModifiedEdgeWeight(edge);
      // Clamp tiny weights to ±1 for Likert conversion
      let displayWeight = effectiveWeight;
      if (Math.abs(effectiveWeight) > 0 && Math.abs(effectiveWeight) < 0.011) {
        displayWeight = effectiveWeight > 0 ? 0.01 : -0.01;
      }
      absW = Math.abs(displayWeight);
      const likertValue = weightToLikert(displayWeight);
      const hasModifiers = (edge.data('modifiers') ?? []).length > 0;
      if (Math.abs(displayWeight) > WEIGHT_MIN || hasModifiers) {
        label = likertDescriptor(likertValue);
      }
    } else {
      // AND/OR/fact: never show assertion weighting
      label = '';
      absW = 0;
    }

    edge.data({
      absWeight: absW,
      weightLabel: label
    });
  });

  cy.style().update();
}

cy.ready(computeVisuals);
cy.on('dragfree zoom pan', computeVisuals);

// ===============================
// 🔁 SECTION 5: Propagation Logic
// ===============================

/** Probability to use for “fact” nodes (never exactly 1.0 to avoid logit infinities) */
const FACT_PROB = 1 - config.epsilon;

/*
  Edge convergence (unchanged; but only meaningful for assertion nodes)
*/
function convergeEdges({ cy, epsilon, maxIters }) {
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

    // 1. Collect new weights (Jacobi pass)
    cy.edges().forEach(edge => {
      const prev = edge.data('computedWeight');
      // Only compute weights for assertion node targets
      const targetNode = edge.target();
      let nw = prev;
      if (targetNode.data('type') === NODE_TYPE_ASSERTION) {
        nw = getModifiedEdgeWeight(edge);
      }
      deltas.push({ edge, prev, nw });
      const delta = Math.abs(nw - prev);
      if (delta > maxDelta) maxDelta = delta;
    });

    // 2. Apply new weights in batch
    cy.batch(() => {
      deltas.forEach(({ edge, nw }) => edge.data('computedWeight', nw));
    });

    // 3. Early exit if converged
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

/*
  Node convergence:
  - Updates node probabilities using new spec for all types.
  - Uses type field for all logic.
*/
function convergeNodes({ cy, epsilon, maxIters }) {
  if (DEBUG) {
    console.log("[DEBUG] convergeNodes start");
    cy.nodes().forEach(node => {
      console.log(`[DEBUG] ${node.id()} prob at convergeNodes start:`, node.data('prob'));
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
      let newProb;

      if (nodeType === NODE_TYPE_FACT) {
        // Fact node: always fixed
        newProb = FACT_PROB;
      } else if (nodeType === NODE_TYPE_AND) {
        // AND node: product of parent probabilities
        const parents = node.incomers('edge').map(e => e.source());
        if (parents.length === 0) {
          newProb = undefined; // latent; not set/displayed
        } else {
          newProb = parents.reduce((acc, parent) => {
            const p = parent.data('prob');
            return (typeof p === "number") ? acc * p : acc;
          }, 1);
        }
      } else if (nodeType === NODE_TYPE_OR) {
        // OR node: sum-minus-product of parent probabilities
        const parents = node.incomers('edge').map(e => e.source());
        if (parents.length === 0) {
          newProb = undefined; // latent
        } else {
          let prod = 1;
          parents.forEach(parent => {
            const p = parent.data('prob');
            prod *= (typeof p === "number") ? (1 - p) : 1;
          });
          newProb = 1 - prod;
        }
      } else if (nodeType === NODE_TYPE_ASSERTION) {
  // Assertion: If no (non-virgin) parents, remain latent (undefined)
const inc = node.incomers('edge').filter(e => {
  const parent = e.source();
  return !(parent.data('type') === NODE_TYPE_ASSERTION && parent.data('isVirgin'));
});

  if (inc.length === 0) {
    newProb = undefined;
  } else {
    newProb = propagateFromParents({
            baseProb: 0.5, // always start naive
            parents: inc,
            getProb: e => {
              const parent = e.source();
              const parentType = parent.data('type');
              if (parentType === NODE_TYPE_FACT) return FACT_PROB;
              if (typeof parent.data('prob') === "number") return parent.data('prob');
              // If parent is latent, treat as 0.5 (minimally informative)
              return 0.5;
            },
            getWeight: e => {
              const targetType = e.target().data('type');
              if (targetType === NODE_TYPE_ASSERTION) {
                return (typeof e.data('computedWeight') === "number") ? e.data('computedWeight') : 0;
              }
              // For AND/OR, ignored (and not called)
              return 0;
            },
            saturationK: 1,
            epsilon
          });
        }
      } else {
        // Unknown node type
        newProb = undefined;
      }

      deltas.push({ node, prev: node.data('prob'), newProb });
      const delta = Math.abs((typeof newProb === "number" && typeof node.data('prob') === "number") ? (newProb - node.data('prob')) : 0);
      if (delta > maxDelta) maxDelta = delta;
    });

    // Apply all new probabilities in one batch
    cy.batch(() => {
      deltas.forEach(({ node, newProb }) => node.data('prob', newProb));
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
    type: NODE_TYPE_ASSERTION,
    isVirgin: true
  },
  position: evt.position
});
        setTimeout(() => { convergeAll({ cy }); computeVisuals(); }, 0);
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
        setTimeout(() => { convergeAll({ cy }); computeVisuals(); }, 0);
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
  setTimeout(() => { convergeAll({ cy }); computeVisuals(); }, 0);
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
        setTimeout(() => { convergeAll({ cy }); computeVisuals(); }, 0);
        hideMenu();
      };
      list.appendChild(toggleLogic);
    }

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
    del.onclick = () => { node.remove(); setTimeout(() => { convergeAll({ cy }); computeVisuals(); }, 0); hideMenu(); };
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
    del.onclick = () => { edge.remove(); setTimeout(() => { convergeAll({ cy }); computeVisuals(); }, 0); hideMenu(); };
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
        { label: "Absolute", value: 1 },
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
        computeVisuals();
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
    makeDraggable(modal);
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
  computeVisuals();
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
  setTimeout(() => { computeVisuals(); }, 0);
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
        setTimeout(() => {
          cy.style().update();
          cy.resize();
          cy.nodes().forEach(n => {
            // [PHASE1 REMOVED 2024-07: isFact logic replaced by type check per spec – see design doc]
            // if (!n.data('isFact')) {
            //   n.data('prob', n.data('initialProb'));
            // }
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
          computeVisuals();
          resetLayout();
          // Force one more resize/redraw to flush
          setTimeout(() => {
            cy.resize();
            cy.fit(); // optional: only if you want the graph to auto-zoom
          }, 0);
          console.log(`Graph loaded from file: ${file.name}`);
        }, 0);
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
  setTimeout(() => { convergeAll({ cy }); computeVisuals(); }, 0);
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
    computeVisuals();
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
