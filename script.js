/*
All belief and modifier propagation uses a single centralized function (`propagateFromParents`),
run modifiers→edges to convergence first, then nodes→nodes to convergence, with all logic modular
and no cycles between layers.
*/
// ===============================
// 🔧 SECTION 1: Config & Utilities
// ===============================
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
let lastClickTime = 0;
let lastTappedNode = null;
let lastTappedEdge = null;

const config = { epsilon: .01 };
const WEIGHT_MIN = 0.01;

// Debug utility: logs with node context if DEBUG is true
function logMath(nodeId, msg) {
  if (DEBUG) console.log(`[${nodeId}] ${msg}`);
}

function likertToWeight(val) {
  // Only accepts -5 to -1 and +1 to +5
  // [-1, -0.85, -0.60, -0.35, -0.15, 0.15, 0.35, 0.60, 0.85, 1]
  const weights = [-1, -0.85, -0.60, -0.35, -0.15, 0.15, 0.35, 0.60, 0.85, 1];
  // -5 maps to 0, -1 maps to 4, +1 maps to 5, +5 maps to 9
  if (val < 0) return weights[val + 5];      // -5 → 0, -1 → 4
  if (val > 0) return weights[val + 4];      // +1 → 5, +5 → 9
  return 0.15; // fallback, but you should prevent val=0 in UI
}
window.likertToWeight = likertToWeight;

function getTopologicallySortedNodesWithParents() {
  // 1. Get all nodes with at least one parent (incoming edge)
  const nodesWithParents = cy.nodes().filter(n => n.incomers('edge').length > 0);

  // 2. Topological sort (Kahn's algorithm)
  const sorted = [];
  const tempMarks = new Set();
  const permMarks = new Set();

  function visit(n) {
    if (permMarks.has(n.id())) return;
    if (tempMarks.has(n.id())) throw new Error('Cycle detected');
    tempMarks.add(n.id());
    n.incomers('edge').forEach(e => {
      const parent = e.source();
      visit(parent);
    });
    permMarks.add(n.id());
    sorted.push(n);
  }

  nodesWithParents.forEach(n => visit(n));
  return sorted; // Array of Cytoscape node objects, topologically sorted
}

function weightToLikert(w) {
  // Map absolute weight to 1–5, regardless of sign
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
  return closestIdx + 1; // Always 1–5, showing strength only
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

function updateEdgeModifierLabel(edge) {
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
  // Quick: adding self-loop? Always a cycle
  if (sourceId === targetId) return true;
  // DFS to see if a path exists from target back to source
  const visited = new Set();
  function dfs(nodeId) {
    if (nodeId === sourceId) return true; // found a cycle
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    // For each outgoing edge from nodeId
    return cy.getElementById(nodeId)
      .outgoers('edge')
      .map(e => e.target().id())
      .some(nextId => dfs(nextId));
  }
  return dfs(targetId);
}

function openEditModifiersModal(edge) {
    if (window.bayesHeavyMode) return;
  // Remove existing modal if present
  const prevModal = document.getElementById('modifier-modal');
  if (prevModal) prevModal.remove();

  const mods = edge.data('modifiers') ?? [];
  const modal = document.createElement('div');
  modal.id = 'modifier-modal';
  modal.className = 'modifier-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('tabindex', '-1');

  const title = document.createElement('div');
  title.textContent = 'Edit Modifiers';
  title.className = 'modifier-modal-title';
  modal.appendChild(title);
  makeDraggable(modal, ".modifier-modal-title");

  // Build modifier rows via fragment
  const frag = document.createDocumentFragment();
  mods.forEach((mod, i) => {
    const row = document.createElement('div');
    row.className = 'modifier-modal-row';

    // Label
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = mod.label ?? '';
    labelInput.onchange = () => {
      mods[i].label = labelInput.value;
      edge.data('modifiers', mods);
      updateEdgeModifierLabel(edge);
    };
    row.appendChild(labelInput);

    // Likert
    const likertInput = document.createElement('input');
    likertInput.type = 'number';
    likertInput.min = -5;
    likertInput.max = 5;
    likertInput.step = 1;
    likertInput.value = mod.likert;
    likertInput.onchange = () => {
      mods[i].likert = Number(likertInput.value);
      mods[i].weight = likertToWeight(Number(likertInput.value));
      edge.data('modifiers', mods);
      updateEdgeModifierLabel(edge);
      convergeAll({ cy });
      computeVisuals();
    };
    row.appendChild(likertInput);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑️';
    delBtn.title = 'Delete modifier';
    delBtn.className = 'danger';
    delBtn.onclick = () => {
      mods.splice(i, 1);
      edge.data('modifiers', mods);
      updateEdgeModifierLabel(edge);
      convergeAll({ cy });
      computeVisuals();
      modal.remove();
      openEditModifiersModal(edge); // reopen with updated list
    };
    row.appendChild(delBtn);

    frag.appendChild(row);
  });
  modal.appendChild(frag);

  // Add new modifier
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add Modifier';
  addBtn.onclick = () => {
    mods.push({ label: '', likert: 0, weight: 0 });
    edge.data('modifiers', mods);
    updateEdgeModifierLabel(edge);
    modal.remove();
    openEditModifiersModal(edge);
  };
  modal.appendChild(addBtn);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.marginLeft = '8px';
  closeBtn.onclick = () => {
    modal.remove();
    document.removeEventListener('keydown', escListener);
  };
  modal.appendChild(closeBtn);

  // Escape key closes
  function escListener(e) {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', escListener);
    }
  }
  document.addEventListener('keydown', escListener);

  document.body.appendChild(modal);
  modal.focus();
}

function openCPTModalTwoPerParent({ node, parentId, existing, onSave, onPrev }) {
  // Remove any existing modals

  document.querySelectorAll('.cpt-modal').forEach(m => m.remove());

  const modal = document.createElement('div');
  modal.className = 'cpt-modal modifier-modal bayes-time-modal';
  modal.style.zIndex = 20000;
  modal.style.position = 'fixed';
  modal.style.left = '40px';
  modal.style.bottom = '40px';

  const parentNode = cy.getElementById(parentId);
  const parentLabel = parentNode.data('origLabel') || parentId;

  let askingFor = 'p1'; // Start with parent=true
function updatePrompt() {
  const baseProb = node.data('initialProb');
  const basePct = (baseProb !== undefined && baseProb !== null)
    ? ` (Base probability: ${Math.round(baseProb * 100)}%)` : "";
  if (askingFor === 'p1') {
    promptText = `If "${parentLabel}" is (or had been) true, how likely would that make "${node.data('origLabel')}"?${basePct}`;
  } else {
    promptText = `If "${parentLabel}" is (or had been) false, how likely would that make "${node.data('origLabel')}"?${basePct}`;
  }
  title.textContent = promptText;
}
  const title = document.createElement('div');
  title.className = 'modifier-modal-title';
  modal.appendChild(title);

  const input = document.createElement('input');
  input.type = 'number';
  input.min = 0;
  input.max = 1;
  input.step = 0.01;
  input.style.width = '120px';
  modal.appendChild(input);

  // Prepopulate if exists
  input.value = (existing && existing.p1 !== null) ? existing.p1 : '';

  updatePrompt();

  const btnRow = document.createElement('div');
  btnRow.style.marginTop = '14px';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.onclick = () => {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0 || val > 1) {
      alert('Enter a probability between 0 and 1');
      input.focus();
      return;
    }
    if (askingFor === 'p1') {
      existing.p1 = val;
      askingFor = 'p0';
      input.value = (existing.p0 !== null) ? existing.p0 : '';
      updatePrompt();
      input.focus();
      return;
    }
    existing.p0 = val;
    modal.remove();
    onSave(existing);
    convergeAll({ cy });
computeVisuals();
  };
  btnRow.appendChild(saveBtn);

  if (onPrev) {
    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Previous';
    prevBtn.style.marginLeft = '10px';
    prevBtn.onclick = () => {
      modal.remove();
      onPrev();
    };
    btnRow.appendChild(prevBtn);
  }

  modal.appendChild(btnRow);
  document.body.appendChild(modal);
  input.focus();
}

function openRationaleModal(element, type = "node") {
  // Remove existing rationale modal if present
  document.querySelectorAll('.rationale-modal').forEach(el => el.remove());
  
  const modal = document.createElement('div');
  modal.className = 'rationale-modal modifier-modal'; // Inherit base styling

  // Title
  const title = document.createElement('div');
  title.className = 'modifier-modal-title';
  title.textContent = `View/Edit Rationale (${type === "node" ? "Node" : "Edge"})`;
  modal.appendChild(title);
makeDraggable(modal, ".modifier-modal-title");

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.style.width = "420px";
  textarea.style.height = "110px";
  textarea.style.margin = "10px 0 16px 0";
  textarea.style.fontSize = "14px";
  textarea.value = element.data('rationale') || "";
  modal.appendChild(textarea);

  // Buttons
  const btnContainer = document.createElement('div');
  btnContainer.style.display = 'flex';
  btnContainer.style.justifyContent = 'flex-end';
  btnContainer.style.gap = '10px';

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.onclick = () => {
    element.data('rationale', textarea.value);
    modal.remove();
    document.removeEventListener('keydown', escListener);
    document.removeEventListener('mousedown', clickAway);
  };
  btnContainer.appendChild(saveBtn);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => {
    modal.remove();
    document.removeEventListener('keydown', escListener);
    document.removeEventListener('mousedown', clickAway);
  };
  btnContainer.appendChild(cancelBtn);

  modal.appendChild(btnContainer);
  document.body.appendChild(modal);
  textarea.focus();

  // Escape key closes
  function escListener(e) {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', escListener);
      document.removeEventListener('mousedown', clickAway);
    }
  }
  // Click outside closes
  function clickAway(e) {
    if (!modal.contains(e.target)) {
      modal.remove();
      document.removeEventListener('keydown', escListener);
      document.removeEventListener('mousedown', clickAway);
    }
  }
  document.addEventListener('keydown', escListener);
  document.addEventListener('mousedown', clickAway);
}

/**
 * Returns a multiplier to nudge `currentWeight` toward the specified bound (default 0.99)
 * using a Likert modifier in the range [-5, 5].
 * - For L > 0: nudges toward ±bound (preserving sign)
 * - For L < 0: nudges toward zero
 * - For L = 0 or currentWeight = 0: returns 1 (no-op)
 * Examples:
 *   nudgeToBoundMultiplier(0.2, 5)   // Multiplier to bring 0.2 → 0.99
 *   nudgeToBoundMultiplier(-0.3, 5)  // Multiplier to bring -0.3 → -0.99
 *   nudgeToBoundMultiplier(0.7, -5)  // Multiplier to bring 0.7 → 0
 */
function nudgeToBoundMultiplier(currentWeight, likert, bound = 0.99) {
  // Clamp Likert to [-5, 5]
  const L = Math.max(-5, Math.min(5, likert));
  const absWeight = Math.abs(currentWeight);
  if (absWeight === 0 || L === 0) return 1; // No-op if zero or neutral

  const frac = Math.abs(L) / 5;

  let desired;
  if (L > 0) {
    // Nudge toward ±bound, preserving sign
    desired = (1 - frac) * absWeight + frac * bound;
  } else {
    // Nudge toward zero
    desired = (1 - frac) * absWeight;
  }

  // Avoid division by zero, floating-point weirdness
  let multiplier = desired / absWeight;
  if (!isFinite(multiplier)) multiplier = 1;

  // Optionally round to avoid floating-point creep
  return Math.round(multiplier * 1000) / 1000;
}

function propagateFromParents({
  baseProb,
  parents,
  getProb,
  getWeight,
  epsilon = 0.01,
  saturationK = 1
}) {
  if (!parents || parents.length === 0) return baseProb;

  const clampedBase = Math.min(Math.max(baseProb, epsilon), 1 - epsilon);
  const priorOdds = Math.log(clampedBase / (1 - clampedBase));

  // Precompute parent odds/weights
  const infos = parents.map(parent => {
    const prob = Math.min(Math.max(getProb(parent), epsilon), 1 - epsilon);
    return {
      parent,
      odds: Math.log(prob / (1 - prob)),
      weight: getWeight(parent)
    };
  });

  // Precompute total AEI
  const totalAbsW = infos.reduce((sum, x) => sum + Math.abs(x.weight), 0);

  // Compute effective weights for each edge (excluding itself)
  let oddsDelta = 0;
  for (let i = 0; i < infos.length; ++i) {
    const { odds, weight } = infos[i];
    const AEI_minus_i = totalAbsW - Math.abs(weight);
    const dilution = Math.exp(-saturationK * AEI_minus_i); // f(x) = exp(-kx)
    const effWeight = weight * dilution;
    oddsDelta += effWeight * (odds - priorOdds);
  }

  const updatedOdds = priorOdds + oddsDelta;
  return 1 / (1 + Math.exp(-updatedOdds));
}

// Saturation function with sharpness parameter (k)
function saturation(aei, k = 1) {
  return 1 - Math.exp(-k * aei);
}

/**
 * Applies all Likert modifiers to the edge’s base weight, sequentially nudging toward the bound.
 * Final value is clamped to a minimum magnitude of WEIGHT_MIN.
 *
 * @param {EdgeSingular} edge – Cytoscape edge
 * @returns {number} The modified edge weight after all modifiers
 */
function getModifiedEdgeWeight(edge) {
  let currentWeight = edge.data('weight');
  const mods = edge.data('modifiers') ?? [];

  mods.forEach(mod => {
    const mult = nudgeToBoundMultiplier(currentWeight, mod.likert, 0.99);
    currentWeight = currentWeight * mult;
  });

// Clamp at the end
if (Math.abs(currentWeight) < WEIGHT_MIN) currentWeight = WEIGHT_MIN * (currentWeight < 0 ? -1 : 1);

// NEW SIGN LOGIC for 'opposes'
if (edge.data('opposes')) currentWeight = -Math.abs(currentWeight);
else currentWeight = Math.abs(currentWeight);

return currentWeight;
}

window.getModifiedEdgeWeight = getModifiedEdgeWeight;

function addModifier(edgeId) {
    if (window.bayesHeavyMode) return;
  const prevModal = document.getElementById('modifier-modal');
if (prevModal) prevModal.remove();
  const edge = cy.getElementById(edgeId);
  if (edge.empty()) return; // Proper existence check

  // Prevent multiple modals by checking if one exists
  if (document.getElementById('modifier-modal')) return;

  // Create modal container
const modal = document.createElement('div');
modal.id = 'modifier-modal';
modal.className = 'modifier-modal';

// Title bar for drag handle
const title = document.createElement('div');
title.textContent = 'Add Modifier';
title.className = 'modifier-modal-title';
modal.appendChild(title);
makeDraggable(modal, ".modifier-modal-title");

  // Close modal helper
  function closeModal() {
    document.body.removeChild(modal);
    document.removeEventListener('keydown', keydownHandler);
    document.removeEventListener('click', outsideClickHandler, true);
  }

  // Label input
  const labelLabel = document.createElement('div');
  labelLabel.textContent = 'Modifier label:';
  labelLabel.style.marginBottom = '6px';
  modal.appendChild(labelLabel);

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.style.width = '200px';
  labelInput.style.marginBottom = '12px';
  labelInput.style.fontSize = '14px';
  modal.appendChild(labelInput);

  // Likert dropdown
  const likertLabel = document.createElement('div');
  likertLabel.textContent = 'Effect on influence (Scale of -5 to +5):';
  likertLabel.style.marginBottom = '6px';
  modal.appendChild(likertLabel);

  const likertSelect = document.createElement('select');
  likertSelect.style.fontSize = '14px';
  likertSelect.style.marginBottom = '12px';

  const likertOptions = [
    { value: -5, text: '−5 (Nearly eliminates)' },
    { value: -4, text: '−4 (Strongly decreases)' },
    { value: -3, text: '−3 (Significantly decreases)' },
    { value: -2, text: '−2 (Somewhat decreases)' },
    { value: -1, text: '−1 (Minimally descreases)' },
    { value: 1, text: '1 (Minimally increases)' },
    { value: 2, text: '2 (Somewhat increases)' },
    { value: 3, text: '3 (Moderately increases)' },
    { value: 4, text: '4 (Stronly increases influence)' },
    { value: 5, text: '5 (Nearly maximizes)' },
  ];

  likertOptions.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.text;
    likertSelect.appendChild(o);
  });

  // Default preselection to 0 (no influence)
  likertSelect.value = '0';

  modal.appendChild(likertSelect);

  // Buttons container
  const btnContainer = document.createElement('div');
  btnContainer.style.display = 'flex';
  btnContainer.style.justifyContent = 'center';
  btnContainer.style.gap = '10px';

  // OK button
  const okBtn = document.createElement('button');
  okBtn.textContent = 'OK';
  okBtn.style.padding = '6px 12px';
  okBtn.onclick = () => {
    const label = labelInput.value.trim();
    if (!label) {
      alert('Please enter a modifier label.');
      labelInput.focus();
      return;
    }

    const likertVal = parseInt(likertSelect.value, 10);
    if (isNaN(likertVal) || likertVal < -5 || likertVal > 5) {
      alert('Please select a valid effect strength.');
      likertSelect.focus();
      return;
    }

    const mods = edge.data('modifiers') ?? [];
    mods.push({
      label,
      likert: likertVal,
      weight: likertToWeight(likertVal)
    });
    edge.data('modifiers', mods);

    setTimeout(() => {
      convergeAll({ cy });
      computeVisuals();
    }, 0);

    closeModal();
  };
  btnContainer.appendChild(okBtn);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.padding = '6px 12px';
  cancelBtn.onclick = closeModal;
  btnContainer.appendChild(cancelBtn);

  modal.appendChild(btnContainer);

  document.body.appendChild(modal);

  labelInput.focus();

  // Close modal on Escape key
  function keydownHandler(e) {
    if (e.key === 'Escape') {
      closeModal();
    }
  }
  document.addEventListener('keydown', keydownHandler);

  // Close modal on outside click
  function outsideClickHandler(e) {
    if (!modal.contains(e.target)) {
      closeModal();
    }
  }
  document.addEventListener('click', outsideClickHandler, true);
}

function makeDraggable(modal, handleSelector = null) {
  // Use handle if provided, else whole modal
  const handle = handleSelector ? modal.querySelector(handleSelector) : modal;
  if (!handle) return;

  let offsetX, offsetY, isDragging = false;

  handle.style.cursor = 'move';

  handle.onmousedown = function (e) {
    isDragging = true;
    // Calculate offset of cursor inside the modal
    const rect = modal.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.body.style.userSelect = "none";

    document.onmousemove = function (e2) {
      if (!isDragging) return;
      // Clamp within window (optional)
      let left = e2.clientX - offsetX;
      let top = e2.clientY - offsetY;
      // Prevent dragging outside viewport
      left = Math.max(0, Math.min(left, window.innerWidth - rect.width));
      top = Math.max(0, Math.min(top, window.innerHeight - rect.height));
      modal.style.left = left + "px";
      modal.style.top = top + "px";
      modal.style.position = 'fixed';
    };

    document.onmouseup = function () {
      isDragging = false;
      document.onmousemove = null;
      document.onmouseup = null;
      document.body.style.userSelect = "";
    };
  };
}

function highlightBayesNodeFocus(targetNode) {
  // Remove highlight from all nodes
  cy.nodes().removeData('highlighted');
  // Set highlight ONLY for target node
  targetNode.data('highlighted', true);

  // Center the view on the target node
  cy.center(targetNode);
  // Optionally animate fit for a smoother effect (optional)
  // cy.animate({ center: { eles: targetNode } }, { duration: 300 });
}

function clearBayesHighlights() {
  cy.nodes().forEach(n => n.data('highlighted', false));
}
// Drop this in near your other utility functions.
function syncNaiveBayesParents(node) {
  // Get the current parent IDs for this node (using Cytoscape API)
  const currentParentIds = node.incomers('edge').map(e => e.source().id());
  let nb = node.data('naiveBayes') || {};

  // Remove any entries for no-longer-parents
  Object.keys(nb).forEach(pid => {
    if (!currentParentIds.includes(pid)) delete nb[pid];
  });

  // Add CPT slots for any new parents (if missing)
  currentParentIds.forEach(pid => {
    if (!nb[pid]) nb[pid] = { p0: null, p1: null };
  });

  node.data('naiveBayes', nb);
}

function setNodeProb(node, prob) {
  node.data('prob', prob);
  node.removeData('isVirgin');
}
function setEdgeWeight(edge, weight) {
  edge.data('weight', weight);
  edge.removeData('isVirgin');
}

// ----------------------
// Menu DOM references and hideMenu utility
// ----------------------
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
  { data: { id: 'N1', origLabel: 'StrongPrior', prob: 0.85, initialProb: 0.85 } },
  { data: { id: 'N2', origLabel: 'Skeptic', prob: 0.15, initialProb: 0.15 } },
 
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
  { selector: 'edge', style: {
      width: 3,
      'curve-style': 'bezier',
      'mid-target-arrow-shape': 'triangle',
      'font-size': '14px',
      'text-rotation': 'autorotate',
      'text-margin-y': '-24px',
      'text-margin-x': '4px',
      'text-background-opacity': 1,
      'text-background-color': '#fff',
      'text-background-padding': '6px',
      'text-wrap': 'wrap',
      'text-max-width': 80,
      'text-border-width': 0
  }},
{
  selector: 'edge[opposes]',
  style: {
    'line-color': '#7c4dff',            // Use your preferred color
    'mid-target-arrow-shape': 'bar',    // Or 'tee', 'circle'
    'mid-target-arrow-color': '#7c4dff',
    'line-style': 'dotted'              // Or 'dashed'
  }
},

  { selector: 'edge[absWeight]', style: {
      'line-color': 'mapData(absWeight, 0, 2, #bbdefb, #1565c0)',
      'mid-target-arrow-color': 'mapData(absWeight, 0, 2, #bbdefb, #1565c0)'
  }},
  { selector: 'edge[weightLabel]', style: { 
      label: 'data(weightLabel)',
      'text-wrap': 'wrap',
      'text-max-width': 100,
      'text-background-opacity': 1,
      'text-background-color': '#fff',
      'text-background-padding': '6px'
  }},
  // --- Special highlight for new nodes ---
{ selector: 'node[isVirgin]', style: {
  'background-color': '#fffbe5',
  }},
  // --- Special highlight for new edges ---
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


// ===============================
// 🎨 SECTION 4: Visual Styling & Modifier Box
// ===============================

// Draws a floating modifier box per edge
function drawModifierBoxes() {
  // Remove any previous boxes
  document.querySelectorAll('.modifier-box').forEach(el => el.remove());
  cy.edges().forEach(edge => {
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

// --- Node hover: show baseline and current probability ---
cy.on('mouseover', 'node', evt => {
  showNodeHoverBox(evt.target);
});
cy.on('mouseout', 'node', evt => {
  removeNodeHoverBox();
});

function showNodeHoverBox(node) {
  removeNodeHoverBox(); // clean up any old
const pos = node.renderedPosition();
const container = cy.container();
const x = pos.x + 20; // Offset to the right
const y = pos.y - 30; // Offset upward


  // Build hover box
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

const label = node.data('origLabel');
if (node.data('isVirgin')) {
  box.innerHTML = `<b>${label}</b><br><i>Probability not set.</i>`;
} else {
  const curProb = Math.round(100 * (node.data('prob') ?? 0));
  const baseProb = Math.round(100 * (node.data('initialProb') ?? 0));
  box.innerHTML = `<b>${label}</b><br>
    <span>Current: <b>${curProb}%</b></span><br>
    <span>Baseline: <b>${baseProb}%</b></span>`;
}

  container.parentElement.appendChild(box);
}

function removeNodeHoverBox() {
  document.querySelectorAll('.node-hover-box').forEach(el => el.remove());
}
document.addEventListener('mousedown', removeNodeHoverBox);
document.addEventListener('mousedown', removeModifierBox);
// --- Paste these after cytoscape initialization ---
cy.on('mouseover', 'edge', evt => {
  const edge = evt.target;
  showModifierBox(edge);
});
cy.on('mouseout', 'edge', evt => {
  removeModifierBox();
});

function showModifierBox(edge) {
  removeModifierBox();
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
  cy.nodes('[isVirgin]').forEach(node => {
  if (node.data('prob') !== 0.5) node.removeData('isVirgin');
});
  cy.nodes().forEach(node => {
     console.log(`[UI] ${node.id()} new prob:`, node.data('prob'));
    const p    = node.data('prob');
let pPct = Math.round(p * 100);
if (pPct > 0 && pPct < 1) pPct = 1;
if (pPct > 99) pPct = 99;
    const aei  = node.incomers('edge').reduce((sum, e) => sum + Math.abs(getModifiedEdgeWeight(e)), 0);
    const robust = saturation(aei);

    const bw = robust > 0 ? Math.max(2, Math.round(robust * 10)) : 1;

    let label = `${node.data('origLabel')}`;


if (node.data('isVirgin')) {
  // Show only the base label—nothing else
} else if (node.data('isFact') === true) {
  label = `Fact: ${node.data('origLabel')}`;
} else {
  label += `\nProb. ${pPct}%`;
  if (node.incomers('edge').length > 0) {
    const robustLabel = robustnessToLabel(robust);
    label += `\nRobust: ${robustLabel}`;
if (bayesHeavyMode && node.data('cpt')) {
  label += `\n[Naive Bayes]`;
}
  }
}

    node.data({
      label,
      borderWidth: bw,
      shape: node.data('isFact') === true ? 'rectangle' : 'roundrectangle'
    });
    if (DEBUG) logMath(node.id(), `Visual: ${label.replace(/\n/g, ' | ')}`);
     console.log(`[computeVisuals] Node ${node.id()} borderWidth:`, node.data('borderWidth'));
  });

cy.edges().forEach(edge => {
  const effectiveWeight = getModifiedEdgeWeight(edge);

  // Clamp tiny weights to ±1 for Likert conversion
  let displayWeight = effectiveWeight;
  if (Math.abs(effectiveWeight) > 0 && Math.abs(effectiveWeight) < 0.011) {
    displayWeight = effectiveWeight > 0 ? 0.01 : -0.01; // avoids zero, preserves sign
  }
 const absW = Math.abs(effectiveWeight);
const likertValue = weightToLikert(displayWeight);
const hasModifiers = (edge.data('modifiers') ?? []).length > 0;

let label = '';
if (edge.data('isVirgin')) {
  label = ''; // or a special message if desired, or nothing
} else if (Math.abs(displayWeight) > WEIGHT_MIN || hasModifiers) {
  label = likertDescriptor(likertValue);
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
  Edge convergence:
  - Initializes computedWeight to weight on all edges.
  - Uses Jacobi (two-pass): computes all new weights, then applies them.
  - Wraps in cy.batch() to avoid unnecessary repaints.
  - Returns convergence info ({converged, iterations, finalDelta}).
  - Logs a warning if maxIters is hit before convergence, with context.
  - After convergence, computedWeight is canonical for all downstream math/visuals.
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
      const nw = getModifiedEdgeWeight(edge);
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
  - Iteratively updates node probabilities using converged edge weights.
  - Uses Jacobi (two-pass): computes all new probabilities, then applies them.
  - Only batches UI updates when needed.
  - Returns convergence info ({converged, iterations, finalDelta}).
  - Logs a warning if maxIters is hit before convergence.
  - Uses passed-in epsilon throughout.
  - After convergence, node.data('prob') is canonical for all downstream logic/visuals.
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
      if (node.data('isFact')) return;

      if (bayesHeavyMode && node.data('naiveBayes')) {
  const parents = node.incomers('edge').map(e => e.source());
  const parentStates = parents.map(p => (p.data('prob') >= 0.5 ? 1 : 0));
  const baseProb = node.data('initialProb');

  // Check for incomplete CPTs (any p0 or p1 missing/null)
  const nb = node.data('naiveBayes');
  let incomplete = parents.some(parent => {
    const entry = nb[parent.id()];
    return !entry || entry.p0 === null || entry.p1 === null;
  });
  if (incomplete) return; // Skip update if incomplete

  // Apply naive Bayes math: combine all parents' influences
  let numerator = baseProb;
  let denominator = 1 - baseProb;

  parents.forEach((parent, i) => {
    const entry = nb[parent.id()];
    const condProb = parentStates[i] === 1 ? entry.p1 : entry.p0;
    numerator *= condProb / baseProb;
    denominator *= (1 - condProb) / (1 - baseProb);
  });

  const newProb = numerator / (numerator + denominator);

  deltas.push({ node, prev: node.data('prob'), newProb });
  const delta = Math.abs(newProb - node.data('prob'));
  if (delta > maxDelta) maxDelta = delta;
  return;
}

      if (node.data('cpt')) {
        const inc = node.incomers('edge');
        const parentNodes = inc.map(e => e.source());
        const parentState = parentNodes.map(p => (p.data('prob') >= 0.5 ? 1 : 0));
        const key = parentState.join(',');
        const cpt = node.data('cpt');
        let newProb;
        if (cpt.hasOwnProperty(key)) {
          newProb = cpt[key];
        } else {
          newProb = node.data('initialProb');
          if (DEBUG) console.warn(`[CPT] No CPT entry for ${node.id()} key: ${key} — using initialProb`);
        }
        deltas.push({ node, prev: node.data('prob'), newProb });
        const delta = Math.abs(newProb - node.data('prob'));
        if (delta > maxDelta) maxDelta = delta;
        return;
      }

      const prev = node.data('prob');
      const inc = node.incomers('edge');
      let newProb;
      if (!inc.length) {
        newProb = node.data('initialProb');
      } else {
newProb = propagateFromParents({
  baseProb: node.data('initialProb'),
  parents: inc,
  getProb: e => {
    const parent = e.source();
    return parent.data('isVirgin') ? 0.5 : (parent.data('isFact') ? FACT_PROB : parent.data('prob'));
  },
  getWeight: e => (e.data('isVirgin') ? 0 : e.data('computedWeight')),
  saturationK: 1,
  epsilon
});
      }
      deltas.push({ node, prev, newProb });
      const delta = Math.abs(newProb - prev);
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
  - Uses config.epsilon and a default maxIters if not provided.
  - Logs stage-level failures in addition to per-stage warnings.
  - Returns convergence stats for both stages.
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

  // --- BAYES HEAVY MODE: Only show rationale viewing ---
  if (window.bayesHeavyMode) {
    if (evt.target.isNode && evt.target.isNode()) {
      const node = evt.target;
      const rationaleItem = document.createElement('li');
      rationaleItem.textContent = 'View/Edit Rationale...';
      rationaleItem.onclick = () => {
        openRationaleModal(node, "node");
        hideMenu();
      };
      list.appendChild(rationaleItem);
    }
    if (evt.target.isEdge && evt.target.isEdge()) {
      const edge = evt.target;
      const rationaleItem = document.createElement('li');
      rationaleItem.textContent = 'View/Edit Rationale...';
      rationaleItem.onclick = () => {
        openRationaleModal(edge, "edge");
        hideMenu();
      };
      list.appendChild(rationaleItem);
    }
    if (list.childNodes.length) {
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.style.display = 'block';
      requestAnimationFrame(() => {
        document.addEventListener('click', () => hideMenu(), { once: true });
      });
    }
    return; // Don’t show anything else in heavy mode
  }

  // ---------- REGULAR MENU BELOW THIS LINE ----------
  if (evt.target === cy) {
    [
      { label: 'Add New Node Here', action: () => {
          cy.add({
            group: 'nodes',
            data: {
              id: 'node' + Date.now(),
              origLabel: 'New Belief',
              initialProb: 0.5,
              isVirgin: true,
              prob: 0.5,
              rationale: ""
            },
            position: evt.position
          });
          setTimeout(() => { convergeAll({ cy }); computeVisuals(); }, 0);
        }
      },
      { label: 'Center Graph', action: () => cy.fit() }
    ].forEach(({ label, action }) => {
      const li = document.createElement('li');
      li.textContent = label;
      li.onclick = () => { action(); hideMenu(); };
      list.appendChild(li);
    });
  } else if (evt.target.isNode && evt.target.isNode()) {
    const node = evt.target;

    const startEdge = document.createElement('li');
    startEdge.textContent = 'Connect to...';
    startEdge.onclick = () => { pendingEdgeSource = node; hideMenu(); };
    list.appendChild(startEdge);

    const toggleFact = document.createElement('li');
    toggleFact.textContent = node.data('isFact') === true ? 'Unmark as Fact' : 'Mark as Fact';
    toggleFact.onclick = () => {
      const nowFact = node.data('isFact') === true;
      const newFact = !nowFact;
      node.data('isFact', newFact);
      if (newFact) node.data('prob', 1 - config.epsilon);
      setTimeout(() => { convergeAll({ cy }); computeVisuals(); }, 0);
      hideMenu();
    };
    list.appendChild(toggleFact);

    const editLabel = document.createElement('li');
    editLabel.textContent = 'Edit Label';
    editLabel.onclick = () => {
      if (window.bayesHeavyMode) return;
      const current = node.data('origLabel') || '';
      const newLabel = prompt('Edit label:', current);
      if (newLabel && newLabel.trim()) {
        node.data('origLabel', newLabel.trim());
        setTimeout(() => { computeVisuals(); }, 0);
      }
      hideMenu();
    };
    list.appendChild(editLabel);

    const rationaleItem = document.createElement('li');
    rationaleItem.textContent = 'View/Edit Rationale...';
    rationaleItem.onclick = () => {
      openRationaleModal(node, "node");
      hideMenu();
    };
    list.appendChild(rationaleItem);

    const del = document.createElement('li');
    del.textContent = 'Delete This Node';
    del.onclick = () => { node.remove(); setTimeout(() => { convergeAll({ cy }); computeVisuals(); }, 0); hideMenu(); };
    list.appendChild(del);

  } else if (evt.target.isEdge && evt.target.isEdge()) {
    const edge = evt.target;

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

    const addMod = document.createElement('li');
    addMod.textContent = 'Add Modifier (Label & Likert)';
    addMod.onclick = () => { addModifier(edge.id()); hideMenu(); };
    list.appendChild(addMod);

    const editMods = document.createElement('li');
    editMods.textContent = 'Edit Modifiers';
    editMods.onclick = () => {
      if (window.bayesHeavyMode) return;
      openEditModifiersModal(edge); 
      hideMenu();
    };
    list.appendChild(editMods);
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

cy.on('tap', 'edge', evt => {
  if (window.bayesHeavyMode) return;
  const now = Date.now();
  const edge = evt.target;
  const id = edge.id();
  if (id === lastTappedEdge && now - lastClickTime < 300) {
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

    // Opposing checkbox
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

    // Only positive options for influence strength
    const select = document.createElement('select');
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

    const btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.style.margin = '10px 5px 0 0';
    btn.onclick = function () {
      const val = parseFloat(select.value);
      const opposes = opposesCheckbox.checked;
edge.data('weight', val);
if (opposes) {
  edge.data('opposes', true);
} else {
  edge.removeData('opposes');  // This line is crucial
}
edge.removeData('isVirgin');
      document.body.removeChild(modal);
      setTimeout(() => {
        convergeAll({ cy });
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
    select.focus();

    lastTappedEdge = null;
    lastClickTime = 0;
  } else {
    lastTappedEdge = id;
    lastClickTime = now;
  }
});

cy.on('tap', evt => {
  if (window.bayesHeavyMode) return;
  if (!pendingEdgeSource) return;
  const target = evt.target;
  if (!target.isNode() || target.id() === pendingEdgeSource.id()) {
    pendingEdgeSource = null;
    return;
  }

  // 🟢 CYCLE PREVENTION LOGIC
  const sourceId = pendingEdgeSource.id();
  const targetId = target.id();
  if (wouldCreateCycle(cy, sourceId, targetId)) {
    alert('Adding this edge would create a cycle (closed loop), which is not allowed.');
    pendingEdgeSource = null;
    return;
  }

  cy.add({
  group: 'edges',
  data: {
    source: sourceId,
    target: targetId,
    weight: WEIGHT_MIN,
    isVirgin: true,
    rationale: ""
    
  }
});
  pendingEdgeSource = null;
  setTimeout(() => {
    convergeAll({ cy });
    computeVisuals();
  }, 0);
});

// Likert mapping function
function nodeLikertToProb(val) {
  // 1–7 only; index 0 is unused.
  const probs = [null, 0.01, 0.15, 0.33, 0.50, 0.67, 0.85, 0.99];
  if (typeof val !== 'number' || val < 1 || val > 7) return 0.5;
  return probs[val];
}
window.nodeLikertToProb = nodeLikertToProb;

// Drop-in double-tap handler for node priors
cy.on('tap', 'node', evt => {
    if (window.bayesHeavyMode) return;
  const now = Date.now();
  const node = evt.target;
  const id = node.id();
  if (id === lastTappedNode && now - lastClickTime < 300) {
    // Modal setup
const prevModal = document.getElementById('modifier-modal');
if (prevModal) prevModal.remove();
const modal = document.createElement('div');
modal.className = 'modifier-modal';

    const label = document.createElement('div');
    label.textContent = 'Set baseline belief:';
    label.style.marginBottom = '10px';
label.className = "modifier-modal-title";
    modal.appendChild(label);
makeDraggable(modal, ".modifier-modal-title");

    // Dropdown Likert options
    const select = document.createElement('select');
    select.style.fontSize = '16px';
    select.style.marginBottom = '10px';
    const likertOptions = [
      { value: 1, text: 'Certain No (1%)' },
      { value: 2, text: 'Very Unlikely (15%)' },
      { value: 3, text: 'Unlikely (33%)' },
      { value: 4, text: 'Neutral (50%)' },
      { value: 5, text: 'Likely (67%)' },
      { value: 6, text: 'Very Likely (85%)' },
      { value: 7, text: 'Certain Yes (99%)' },
    ];
    // Preselect current value if possible
    const current = node.data('initialProb') ?? node.data('prob') ?? 0.5;
    let preselectIdx = 4; // Default to 50%
    for (let i = 1; i <= 7; ++i) {
      if (Math.abs(current - nodeLikertToProb(i)) < 0.01) {
        preselectIdx = i;
        break;
      }
    }
    likertOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.value === preselectIdx) option.selected = true;
      select.appendChild(option);
    });
    modal.appendChild(select);

    // OK button
    const btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.style.margin = '10px 5px 0 0';
    btn.onclick = function () {
      const likertVal = parseInt(select.value);
      const prob = nodeLikertToProb(likertVal);
      node.data('initialProb', prob);
      node.data('prob', prob);
      node.removeData('isVirgin');
      console.log('[DEBUG] node data after isVirgin clear:', node.data());
      console.log(`[DEBUG] Set node ${node.id()} prob and initialProb to`, prob);
      cy.style().update();
      document.body.removeChild(modal);
      setTimeout(() => {
        convergeAll({ cy });
        computeVisuals();
      }, 0);
      setTimeout(() => {
        computeVisuals();
      }, 1); // schedule a tick later, guarantees correct sequence
    };
    modal.appendChild(btn);

    // Cancel button
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.onclick = function () {
      document.body.removeChild(modal);
    };
    modal.appendChild(cancel);

    document.body.appendChild(modal);
    select.focus();

    lastTappedNode = null;
    lastClickTime = 0;
  } else {
    lastTappedNode = id;
    lastClickTime = now;
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
    cy.zoom(1);
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
    if (!n.data('isFact')) {
      n.data('prob', n.data('initialProb'));
    }
  });
  convergeAll({ cy });
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
    if (!n.data('isFact')) {
      n.data('prob', n.data('initialProb'));
    }
  });
    convergeAll({ cy });
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
  computeVisuals();
  advance();
},
  onPrev: (nodeIdx > 0 || parentIdx > 0) ? retreat : null
});


  } // <--- closes showNextModal

  showNextModal(); // <-- call inside startBayesTimeSequence
}

