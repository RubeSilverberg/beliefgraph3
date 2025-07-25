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
      node.data('textColor', '#fff');
    }
    else if (nodeType === NODE_TYPE_ASSERTION) {
      const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';
      node.data('textColor', '#000');
      // === HEAVY MODE SHORT-CIRCUIT ===
      if (bayesMode === 'heavy') {
        const heavyProb = node.data('heavyProb');
        let pPct = typeof heavyProb === "number" ? Math.round(heavyProb * 100) : null;
        label += pPct !== null ? `\n${pPct}%` : `\n—`;
        borderWidth = 2;
        borderColor = '#333';
        node.data({
          label,
          borderWidth,
          borderColor,
          shape,
          floretColor: node.data('floretColor'),
          textColor: node.data('textColor')
        });
        return;
      }
      const incomingEdges = node.incomers('edge');
      const validEdges = incomingEdges.filter(e =>
        !e.data('isVirgin') && !e.source().data('isVirgin')
      );

      // === EARLY VIRGIN CASE (Lite only) ===
      if (bayesMode === 'lite' && validEdges.length === 0) {
        label += `\n—`;
        node.data({
          isVirgin: true,
          robustness: undefined,
          robustnessLabel: undefined,
          borderWidth: 1,
          borderColor: '#222',
          label 
        });
        return;
      } else {
        node.removeData('isVirgin');
      }

      let p = node.data('prob');
      let pPct = typeof p === "number" ? Math.round(p * 100) : null;

      // --- Shared baseline label logic ---
      label += pPct !== null
        ? `\n${Math.min(Math.max(pPct, 1), 99)}%`
        : `\n—`;

      // --- Shared defaults ---
      borderWidth = 2;
      borderColor = '#333';

      // --- Mode-specific overrides ---
      if (bayesMode !== 'heavy' && typeof p === "number" && validEdges.length > 0) {
        const aei = validEdges.reduce((sum, e) => {
          const sourceType = e.source().data('type');
          if (sourceType !== NODE_TYPE_ASSERTION && sourceType !== NODE_TYPE_FACT) return sum;
          const w = getModifiedEdgeWeight(cy, e);
          return sum + (typeof w === "number" ? Math.abs(w) : 0);
        }, 0);

        const robust = saturation(aei);
        const robustLabel = robustnessToLabel(robust);
        node.data({ robustness: robust, robustnessLabel: robustLabel });

        borderWidth = Math.max(2, Math.round(robust * 10));
        const grayLevel = Math.round(238 - 127 * robust);
        borderColor = `rgb(${grayLevel},${grayLevel},${grayLevel})`;
      } else {
        node.removeData('robustness');
        node.removeData('robustnessLabel');
      }

      node.data({ borderWidth, borderColor });

    } 
    // --- AND/OR nodes (mode-dependent) ---
    else if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
      const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';
      let pct;
      if (bayesMode === 'heavy') {
        pct = typeof node.data('heavyProb') === "number" ? Math.round(node.data('heavyProb') * 100) : null;
      } else {
        pct = typeof node.data('prob') === "number" ? Math.round(node.data('prob') * 100) : null;
      }
      let typeLabel = nodeType === NODE_TYPE_AND ? "AND" : "OR";
      if (pct !== null) {
        if (pct > 0 && pct < 1) pct = 1;
        if (pct > 99) pct = 99;
        label = `${typeLabel}\n${pct}%`;
      } else {
        label = `${typeLabel}\n—`;
      }
      shape = nodeType === NODE_TYPE_AND ? "diamond" : "ellipse";
      borderWidth = 3;
      borderColor = "#bbb";
      node.removeData('robustness');
      node.removeData('robustnessLabel');
      if (!node.data('hoverLabel') && displayLabel !== typeLabel) {
        node.data('hoverLabel', displayLabel);
      }
    } 
    // --- Unknown type ---
    else {
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
      floretColor: node.data('floretColor'),
      textColor: node.data('textColor')
    });
    if (DEBUG) logMath(node.id(), `Visual: ${label.replace(/\n/g, ' | ')}`);
  });

  cy.edges().forEach(edge => {
    const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';

    // ====== DO NOT purge any edge fields ======

    // ====== Now recalc/set the fields for the current mode ======
    let isVirgin = false;
    let absWeight = 0;
    let edgeType = edge.data('type');

    if (bayesMode === 'heavy') {
      const cpt = edge.data('cpt');
      isVirgin = !cpt || typeof cpt.baseline !== 'number';
      edge.data('isVirgin', isVirgin ? true : undefined);

      if (!isVirgin) {
        if (
          typeof cpt.condTrue === 'number' &&
          typeof cpt.condFalse === 'number' &&
          cpt.condFalse > 0
        ) {
          const logRatio = Math.log(cpt.condTrue / cpt.condFalse);
          absWeight = Math.min(1, Math.abs(logRatio / 3)); // 3 is your scaler
          edgeType = logRatio < 0 ? 'opposes' : 'supports';
          edge.data('type', edgeType); // override for heavy
        }
      }
    } else { // Lite mode
      // Lite mode virginity: parent has no prob
      const parentProb = edge.source().data('prob');
      isVirgin = typeof parentProb !== "number";
      edge.data('isVirgin', isVirgin ? true : undefined);

      if (!isVirgin) {
        absWeight = edge.data('absWeight') ?? 0;
        // edgeType is already set in Lite
      }
    }

    // ====== Set color and absWeight for virgin/non-virgin ======
    if (isVirgin) {
      edge.data('lineColor', bayesMode === 'heavy' ? '#A26DD2' : '#ffb300');
      edge.data('absWeight', 0);
    } else {
      edge.data('absWeight', absWeight);
      // Color and dash handled by Cytoscape style array via type and absWeight
    }
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
 * Node hover: probability/logic display per node type, MODE-SPLIT.
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
  const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';

  // Helper for robust display
  function formatProb(p) {
    return (typeof p === "number") ? `<b>${Math.round(100 * p)}%</b>` : "<b>—</b>";
  }

  if (nodeType === NODE_TYPE_FACT) {
    box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><span>Fact node</span>`;
    container.parentElement.appendChild(box);
    return;
  }

  // MODE FORK: Heavy vs Lite
  if (bayesMode === 'heavy') {
    // --- Assertion node, Heavy Mode ---
    if (nodeType === NODE_TYPE_ASSERTION) {
      const hp = node.data('heavyProb');
      box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br>
        <span>Current: ${formatProb(hp)}</span>`;
      // No robustness shown for heavy unless you implement it
      container.parentElement.appendChild(box);
      return;
    }
    // --- AND/OR nodes, Heavy Mode ---
    if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
      const hp = node.data('heavyProb');
      let typeLabel = nodeType === NODE_TYPE_AND ? 'AND' : 'OR';
      box.innerHTML = `<b>${typeLabel}</b><br>Current: ${formatProb(hp)}`;
      // Optionally, brief logic explanation
      if (nodeType === NODE_TYPE_AND)
        box.innerHTML += "<br><i>AND logic node (product of heavy parent probs)</i>";
      else
        box.innerHTML += "<br><i>OR logic node (sum-minus-product of heavy parent probs)</i>";
      container.parentElement.appendChild(box);
      return;
    }
  } else {
    // --- Lite Mode ---
    if (nodeType === NODE_TYPE_ASSERTION) {
      const lp = node.data('prob');
      if (typeof lp !== "number") {
        box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><span>Current: <b>—</b></span><br><i>No incoming information.</i>`;
      } else {
        box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br>
          <span>Current: <b>${Math.round(100 * lp)}%</b></span>`;
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
      container.parentElement.appendChild(box);
      return;
    }
    if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
      let typeLabel = nodeType === NODE_TYPE_AND ? 'AND' : 'OR';
      const lp = node.data('prob');
      box.innerHTML = `<b>${typeLabel}</b><br>Current: ${formatProb(lp)}`;
      if (nodeType === NODE_TYPE_AND)
        box.innerHTML += "<br><i>AND logic node<br>(product of parent probs)</i>";
      else
        box.innerHTML += "<br><i>OR logic node<br>(sum-minus-product of parent probs)</i>";
      container.parentElement.appendChild(box);
      return;
    }
  }
  // Default fallback
  box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><i>Unknown node type</i>`;
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
    // Only show in Lite mode (or when NOT heavy)
    if (window.getBayesMode && window.getBayesMode() === 'heavy') return;
    showModifierBox(cy, evt.target);
  });
  cy.on('mouseout', 'edge', evt => {
    removeModifierBox();
  });

  // Optional: clean up boxes when clicking elsewhere
  document.addEventListener('mousedown', removeNodeHoverBox);
  document.addEventListener('mousedown', removeModifierBox);
}
