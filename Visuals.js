console.log("Loaded style array:", typeof style !== 'undefined' ? style : '[style not defined]');
// visuals.js
console.log("Loaded visuals.js");
import {
  NODE_TYPE_FACT,
  NODE_TYPE_ASSERTION,
  NODE_TYPE_AND,
  NODE_TYPE_OR,
  DEBUG,
  logMath,
  weightToLikert,
  likertDescriptor,
  saturation,
  getModifiedEdgeWeight,
  WEIGHT_MIN
} from './config.js';

/**
 * Convert robustness value [0,1] to qualitative label.
 */
export function robustnessToLabel(robust) {
  if (robust < 0.15) return "Minimal";
  if (robust < 0.35) return "Low";
  if (robust < 0.60) return "Moderate";
  if (robust < 0.85) return "High";
  return "Very High";
}

/**
 * Main function to update node/edge visuals based on graph state.
 * Should be called after any probability or weight update.
 */
export function computeVisuals(cy) {
  cy.nodes().forEach(node => {
    const nodeType = node.data('type');
    const displayLabel = node.data('displayLabel') || node.data('origLabel') || "";
    let label = displayLabel;
    let borderWidth = 1;
    let borderColor = '#bbb';
    let shape = 'roundrectangle';

    if (nodeType === NODE_TYPE_FACT) {
      label = `Fact: \n${displayLabel}`;
      shape = 'rectangle';
      borderWidth = 2;
      borderColor = '#444';
      node.removeData('robustness');
      node.removeData('robustnessLabel');
      node.data('textColor', '#fff');
    } else if (nodeType === NODE_TYPE_ASSERTION) {
      const incomingEdges = node.incomers('edge');
      node.data('textColor', '#000');
      // Only count edges that are non-virgin and whose parent is also non-virgin
      const validEdges = incomingEdges.filter(e =>
        !e.data('isVirgin') &&
        !e.source().data('isVirgin')
      );

      if (typeof node.data('prob') === "number" && validEdges.length > 0) {
        const p = node.data('prob');
        let pPct = Math.round(p * 100);
        if (pPct > 0 && pPct < 1) pPct = 1;
        if (pPct > 99) pPct = 99;
        label += `\n${pPct}%`;

        const aei = validEdges.reduce((sum, e) => {
          const sourceType = e.source().data('type');
          if (sourceType !== NODE_TYPE_ASSERTION && sourceType !== NODE_TYPE_FACT) return sum;
          const w = getModifiedEdgeWeight(cy, e);
          return sum + (typeof w === "number" ? Math.abs(w) : 0);
        }, 0);

        const robust = saturation(aei);
        const robustLabel = robustnessToLabel(robust);
        node.data('robustness', robust);
        node.data('robustnessLabel', robustLabel);
        borderWidth = Math.max(2, Math.round(robust * 10));
// Grayscale: 238 (very light gray) at minimal, 111 (nearly black) at very high robustness
const grayLevel = Math.round(238 - 127 * robust);
borderColor = `rgb(${grayLevel},${grayLevel},${grayLevel})`;

      } else {
        label += `\n—`;
        node.removeData('robustness');
        node.removeData('robustnessLabel');
        borderWidth = 1;
        borderColor = '#222';
      }
    } else if (nodeType === NODE_TYPE_AND) {
      let pct = typeof node.data('prob') === "number" ? Math.round(node.data('prob') * 100) : null;
      if (pct !== null) {
        if (pct > 0 && pct < 1) pct = 1;
        if (pct > 99) pct = 99;
        label = `AND\n${pct}%`;
      } else {
        label = "AND\n—";
      }
      shape = "diamond";
      borderWidth = 3;
      borderColor = "#bbb";
      node.removeData('robustness');
      node.removeData('robustnessLabel');
      if (!node.data('hoverLabel') && displayLabel !== "AND") {
        node.data('hoverLabel', displayLabel);
      }
    } else if (nodeType === NODE_TYPE_OR) {
      let pct = typeof node.data('prob') === "number" ? Math.round(node.data('prob') * 100) : null;
      if (pct !== null) {
        if (pct > 0 && pct < 1) pct = 1;
        if (pct > 99) pct = 99;
        label = `OR\n${pct}%`;
      } else {
        label = "OR\n—";
      }
      shape = "ellipse";
      borderWidth = 3;
      borderColor = "#bbb";
      node.removeData('robustness');
      node.removeData('robustnessLabel');
      if (!node.data('hoverLabel') && displayLabel !== "OR") {
        node.data('hoverLabel', displayLabel);
      }
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
      shape,
      floretColor: node.data('floretColor'), // preserves current value
  textColor: node.data('textColor')      // same for text, optional but recommended
    });
    if (DEBUG) logMath(node.id(), `Visual: ${label.replace(/\n/g, ' | ')}`);
  });

  cy.edges().forEach(edge => {
    const targetNode = edge.target();
    let absW = 0, label = '';
    if (targetNode.data('type') === NODE_TYPE_ASSERTION) {
      const effectiveWeight = getModifiedEdgeWeight(cy, edge);
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

/**
 * Draw floating modifier boxes only for assertion node edges.
 */
export function drawModifierBoxes(cy) {
  document.querySelectorAll('.modifier-box').forEach(el => el.remove());
  cy.edges().forEach(edge => {
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
      const val = mod.likert > 0 ? '+' + mod.likert : '' + mod.likert;
      item.innerHTML = `<span style="color:${color};font-weight:600;min-width:24px;display:inline-block;">${val}</span> <span style="margin-left:5px;">${mod.label}</span>`;
      box.appendChild(item);
    });
    container.parentElement.appendChild(box);
  });
}

/**
 * Node hover: probability/logic display per node type.
 */
export function showNodeHoverBox(cy, node) {
  removeNodeHoverBox();
  const pos = node.renderedPosition();
  const container = cy.container();
  const x = pos.x + 20;
  const y = pos.y - 30;

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
    box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><span>Fact node</span>`;
    container.parentElement.appendChild(box);
    return;
  } else if (nodeType === NODE_TYPE_ASSERTION) {
    if (typeof node.data('prob') !== "number") {
      box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><span>Current: <b>—</b></span><br><i>No incoming information.</i>`;
    } else {
      const curProb = Math.round(100 * node.data('prob'));
      box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br>
        <span>Current: <b>${curProb}%</b></span>`;
    }
    const rlabel = node.data('robustnessLabel');
    if (rlabel) {
      // Compute grayscale for the robustness label
const robust = node.data('robustness');
const grayscale = robust !== undefined
  ? `rgb(${Math.round(180 - 60 * robust)}, ${Math.round(180 - 60 * robust)}, ${Math.round(180 - 60 * robust)})`
  : '#888';
box.innerHTML += `<br><span><b style="color:#111">Robustness</b>: <b style="color:${grayscale}">${rlabel}</b></span>`;
    }
 } else if (nodeType === NODE_TYPE_AND) {
  let probStr = typeof node.data('prob') === "number"
    ? `<br>Current: <b>${Math.round(100 * node.data('prob'))}%</b>`
    : "<br>Current: <b>—</b>";
  box.innerHTML = `<b>AND</b>${probStr}<br><i>AND logic node<br>(product of parent probs)</i>`;
} else if (nodeType === NODE_TYPE_OR) {
  let probStr = typeof node.data('prob') === "number"
    ? `<br>Current: <b>${Math.round(100 * node.data('prob'))}%</b>`
    : "<br>Current: <b>—</b>";
  box.innerHTML = `<b>OR</b>${probStr}<br><i>OR logic node<br>(sum-minus-product of parent probs)</i>`;
} else {
  box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><i>Unknown node type</i>`;
}

  container.parentElement.appendChild(box);
}

export function removeNodeHoverBox() {
  document.querySelectorAll('.node-hover-box').forEach(el => el.remove());
}

/**
 * Edge hover: only show for assertion node targets.
 */
export function showModifierBox(cy, edge) {
  removeModifierBox();
  const targetNode = edge.target();
  if (targetNode.data('type') !== NODE_TYPE_ASSERTION) {
    return;
  }
  const mods = edge.data('modifiers') ?? [];
  const baseLikert = weightToLikert(edge.data('weight'));
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
  box.innerHTML = `<div><b>Base influence:</b> ${baseLabel}</div>`;

  if (mods.length) {
    box.innerHTML += `<hr style="margin:6px 0 3px 0">`;
    mods.forEach(mod => {
      let color = '#616161';
      if (mod.likert > 0) color = '#2e7d32';
      if (mod.likert < 0) color = '#c62828';
      const val = mod.likert > 0 ? '+' + mod.likert : '' + mod.likert;
      box.innerHTML += `<div style="color:${color};margin:2px 0;">
        ${val}: ${mod.label}
      </div>`;
    });
  }

  container.parentElement.appendChild(box);
}

export function removeModifierBox() {
  document.querySelectorAll('.modifier-box').forEach(el => el.remove());
}

/**
 * Register Cytoscape event handlers for all node/edge hover visuals.
 * Should be called once after cy init.
 */
export function registerVisualEventHandlers(cy) {
  cy.on('mouseover', 'node', evt => {
    showNodeHoverBox(cy, evt.target);
  });
  cy.on('mouseout', 'node', evt => {
    removeNodeHoverBox();
  });

  cy.on('mouseover', 'edge', evt => {
    showModifierBox(cy, evt.target);
  });
  cy.on('mouseout', 'edge', evt => {
    removeModifierBox();
  });

  // Optional: clean up boxes when clicking elsewhere
  document.addEventListener('mousedown', removeNodeHoverBox);
  document.addEventListener('mousedown', removeModifierBox);
}
