// script_current.js

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
  NODE_TYPE_NOTE,
  EDGE_TYPE_SUPPORTS,
  EDGE_TYPE_OPPOSES,
  ALLOWED_NODE_TYPES,
  ALLOWED_EDGE_TYPES,
  DEBUG,
  config,
  WEIGHT_MIN,
  getModifiedEdgeWeight,
  // ...any other needed config exports
} from './config.js';

import {
  resetLayout,
  clearGraph,
  autosave,
  restoreAutosave,
  saveGraph,
  loadGraph,
  addNote,
  finalizeBayesTimeCPT,
  getParentStateCombos,
  startBayesTimeSequence,
  convergeAll,
  wouldCreateCycle,
  getTopologicallySortedNodesWithParents,
  syncNaiveBayesParents,
  clearBayesHighlights,
  highlightBayesNodeFocus,
  // If you later add more, include here
} from './logic.js';

import {
  openEditNodeLabelModal,
  openNotesModal,
  openRationaleModal,
  openCPTModalTwoPerParent,
} from './modals.js';

import { setupMenuAndEdgeModals } from './menu.js';

let mode = 'lite'; // Tracks current Bayes mode globally
window.getBayesMode = () => mode;

// === Bayes Mode Switch Logic - Complete Isolation ===
function setBayesMode(newMode) {
  if (newMode !== 'lite' && newMode !== 'heavy') return;
  
  console.log(`Switching from ${mode} to ${newMode} mode`);
  
  // Clean up current mode's temporary display data
  if (window.cy) {
    window.cy.edges().forEach(edge => {
      edge.removeData('lineColor');
      edge.removeData('absWeight'); 
      edge.removeData('displayType');
      edge.removeData('isVirgin'); // Remove old virgin attribute
    });
    
    // Also clean up any stale visual data on nodes
    window.cy.nodes().forEach(node => {
      node.removeData('label'); // Force label recomputation
    });
  }
  
  mode = newMode;
  
  // Mode-specific initialization
  if (newMode === 'lite') {
    // Ensure lite mode propagation is current
    if (typeof convergeAll === 'function') {
      convergeAll({ cy: window.cy });
    }
  } else if (newMode === 'heavy') {
    // Ensure heavy mode propagation is current  
    if (window.propagateBayesHeavy && window.cy) {
      window.propagateBayesHeavy(window.cy);
    }
  }
  
  // Update UI and visuals for new mode
  handleModeProcesses(newMode);
  updateModeIndicator(newMode);
  
  // Recompute visuals with clean slate (small delay to ensure cleanup completes)
  setTimeout(() => {
    if (window.computeVisuals && window.cy) {
      window.computeVisuals(window.cy);
    }
  }, 50);
  
  console.log(`Mode switch to ${newMode} complete`);
}
window.setBayesMode = setBayesMode;

// Attach computeVisuals to window for cross-module use
window.computeVisuals = computeVisuals;

function handleModeProcesses(mode) {
  // Put any mode-specific logic here.
  // Example: enable/disable controls, lock out propagation, show modals, etc.
  if (mode === 'heavy') {
    // Example: disable propagate button
    // document.getElementById('propagateBtn').disabled = true;
  } else {
    // Example: re-enable propagate button
    // document.getElementById('propagateBtn').disabled = false;
  }
}

function updateModeIndicator(mode) {
  let badge = document.getElementById('modeBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'modeBadge';
    badge.style.position = 'fixed';
    badge.style.top = '16px';
    badge.style.right = '16px';
    badge.style.padding = '6px 18px';
    badge.style.borderRadius = '10px';
    badge.style.fontWeight = 'bold';
    badge.style.zIndex = 9999;
    badge.style.boxShadow = '0 2px 10px rgba(0,0,0,0.25)';
    badge.style.pointerEvents = 'none'; // don't block clicks
    document.body.appendChild(badge);
  }
  if (mode === 'heavy') {
    badge.style.background = 'red';
    badge.style.color = 'white';
    badge.textContent = 'BAYES HEAVY MODE';
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// ====== Central Node Sizing Logic ======
export function adjustNodeSize(node, change = 0, options = {}) {
  // If user is using +/- buttons, update sizeIndex
  let sizeIndex = node.data('sizeIndex') ?? 3;
  sizeIndex = Math.max(1, Math.min(20, sizeIndex + change));
  node.data('sizeIndex', sizeIndex );

  // Base font size grows with user size
  const baseFont = 14;
  const fontStep = 1.1;
  const fontSize = Math.round(baseFont + (sizeIndex - 3) * fontStep );
  node.data('fontSize', fontSize );

  // Text sizing
  const text = (node.data('displayLabel') || node.data('label') || node.data('origLabel') || '').toString();
  const lines = text.split('\n');
  const longest = lines.reduce((max, line) => Math.max(max, line.length ), 0 );

  // Allow user size to raise the width cap
  const minWidth = 60;
  const baseMaxWidth = 180; // default width for organic wrapping
  const maxUserWidth = 350; // hard cap for huge user nodes
  const userMaxWidth = baseMaxWidth + (sizeIndex - 3) * 22; // each step gives more width
  const actualMaxWidth = Math.min(userMaxWidth, maxUserWidth);

  const perChar = 0.37 * fontSize; // heuristic, moderate fit
  let width = Math.max(minWidth, Math.ceil(longest * perChar));
  width = Math.min(width, actualMaxWidth);

  node.data('width', width);
  node.data('textMaxWidth', width - 8); // keep text from bumping edge

  // Estimate actual line count including wrapped lines, not just explicit \n
  const charsPerLine = Math.max(1, Math.floor((width - 8) / (0.55 * fontSize))); // tweak 0.55 as needed for your font
  const estimatedWrappedLines = Math.ceil(text.length / charsPerLine);
  const numLines = Math.max(lines.length, estimatedWrappedLines);

  // Height calculation: aggressive vertical growth for more lines (real or wrapped)
  const baseHeight = fontSize * 1.7;
  const height = Math.ceil(baseHeight + (numLines - 1) * fontSize * 2);
  node.data('height', height);
}

// Suppress browser context menu globally
document.addEventListener('contextmenu', e => e.preventDefault());

// ====== Cytoscape Setup: Custom Node & Edge Styles ======
document.addEventListener('DOMContentLoaded', () => {
  const cy = cytoscape({
    container: document.getElementById('cy'),
    elements: [],
    style: [
  // Base node: ALL sizing, font, wrapping logic
  {
    selector: 'node',
    style: {
      'width': 'data(width)',
      'height': 'data(height)',
      'color': 'data(textColor)',
      'shape': 'roundrectangle',
      'background-color': '#eceff1',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-weight': 600,
      'font-family': 'Segoe UI, Roboto, Arial, sans-serif',
      'font-size': 'data(fontSize)',
      'line-height': 1.4,
      'text-wrap': 'wrap',
      'text-max-width': 'data(textMaxWidth)',
      'padding': '12px',
      'border-style': 'solid',
      'border-width': 'data(borderWidth)',
      'border-color': 'data(borderColor)',
      'min-width': 40,
      'min-height': 28,
      'content': 'data(label)'
    }
  },
  // Fact nodes: rectangle, thicker/darker border
  {
    selector: 'node[type ="fact"]',
    style: {
      'shape': 'rectangle',
      'background-color': '#666',
      'color': '#fff',
      'border-color': '#666',
      'border-width': 2,
      'border-style': 'solid'
    }
  },
  // AND logic: diamond, thicker border, bigger
  {
    selector: 'node[type="and"]',
    style: {
      'shape': 'diamond',
      'width': 80,
      'height': 80
    }
  },
  // OR logic: ellipse, thicker border, bigger
  {
    selector: 'node[type="or"]',
    style: {
      'shape': 'ellipse',
      'width': 80,
      'height': 80
    }
  },
  // Note nodes: simple text style, light yellow background
  {
    selector: 'node[type="note"]',
    style: {
      'shape': 'roundrectangle',
      'background-color': '#fffacd',
      'border-color': '#ddd',
      'border-width': 1,
      'border-style': 'dashed',
      'color': '#333',
      'font-style': 'italic'
    }
  },
  // Edge base - use computed values from mode-specific logic
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'mid-target-arrow-shape': 'triangle',
      'width': 'mapData(absWeight, 0, 1, 2, 8)',
      'line-color': 'data(lineColor)',
      'mid-target-arrow-color': 'data(lineColor)',
      'opacity': 1
    }
  },
  // Edge supports: use displayType to avoid cross-mode conflicts
  {
    selector: 'edge[displayType="supports"]',
    style: {
      'line-style': 'solid',
      'mid-target-arrow-shape': 'triangle'
    }
  },
  // Edge opposes: use displayType to avoid cross-mode conflicts  
  {
    selector: 'edge[displayType="opposes"]',
    style: {
      'line-style': 'dotted',
      'mid-target-arrow-shape': 'triangle'
    }
  },
  // Floret color override
  {
    selector: 'node[floretColor]',
    style: {
      'background-color': 'data(floretColor)',
      'background-opacity': 0.18
    }
  },
  // ---- VIRGIN EDGE STYLE: REMOVED - now using computed lineColor ----
],


    layout: { name: 'preset' }
  });

  // Double-click node to edit label
  cy.on('dblclick', 'node', function(event) {
    const node = event.target;
    openEditNodeLabelModal(node);
  });

  // Ensure only one tooltip at a time
  let edgeTooltipDiv = null;
  cy.on('mouseover', 'edge', function(evt) {
    if (!window.getBayesMode || window.getBayesMode() !== 'heavy') return; // Only show in heavy mode
    const edge = evt.target;
    const cpt = edge.data('cpt') || {};

    // Check if this is a virgin edge (no CPT data configured)
    const isVirgin = !cpt || 
                     cpt.baseline === undefined || 
                     cpt.condTrue === undefined || 
                     cpt.condFalse === undefined;

    // Remove any existing tooltip
    if (edgeTooltipDiv) edgeTooltipDiv.remove();

    // Create tooltip div
    edgeTooltipDiv = document.createElement('div');
    edgeTooltipDiv.className = 'edge-tooltip';
    
    if (isVirgin) {
      // Show virgin edge message
      edgeTooltipDiv.innerHTML = `
        <div><b>Conditional relationship not yet configured</b></div>
        <div>Double-click edge to set up conditional probabilities</div>
      `;
    } else {
      // Extract values for configured edges
      const baseline = cpt.baseline;
      const pTrue = cpt.condTrue;
      const pFalse = cpt.condFalse;
      let lr = '—';
      if (typeof pTrue === 'number' && typeof pFalse === 'number' && pFalse > 0) {
        // Apply epsilon clamping for ratio calculation to match our math
        const clampedTrue = Math.min(Math.max(pTrue, 0.1), 99.9);
        const clampedFalse = Math.min(Math.max(pFalse, 0.1), 99.9);
        lr = (clampedTrue / clampedFalse).toFixed(2) + '×';
      }

      edgeTooltipDiv.innerHTML = `
        <div><b>Likelihood Ratio:</b> <span class="lr-value">${lr}</span></div>
        <div>Baseline: <b>${baseline}%</b></div>
        <div>P(child | parent = true): <b>${pTrue}%</b></div>
        <div>P(child | parent = false): <b>${pFalse}%</b></div>
      `;
    }
    
    document.body.appendChild(edgeTooltipDiv);

    // ---- Set initial position immediately ----
    let clientX = 0, clientY = 0;
    if (evt.originalEvent) {
      clientX = evt.originalEvent.clientX;
      clientY = evt.originalEvent.clientY;
    } else if (window.event) { // fallback (rarely needed)
      clientX = window.event.clientX;
      clientY = window.event.clientY;
    }
    edgeTooltipDiv.style.left = (clientX + 18) + 'px';
    edgeTooltipDiv.style.top = (clientY + 8) + 'px';

    // Keep tooltip following mouse
    document.body.onmousemove = function(e) {
      if (edgeTooltipDiv) {
        edgeTooltipDiv.style.left = (e.clientX + 18) + 'px';
        edgeTooltipDiv.style.top = (e.clientY + 8) + 'px';
      }
    };
  });

  // Remove tooltip on mouseout
  cy.on('mouseout', 'edge', function(evt) {
    if (edgeTooltipDiv) {
      edgeTooltipDiv.remove();
      edgeTooltipDiv = null;
      document.body.onmousemove = null;
    }
  });

  // Make cy global if needed elsewhere
  window.cy = cy;

  // Ensure right-click suppression on the Cytoscape canvas (for browsers that don't respect document-level handler)
  setTimeout(() => {
    cy.container().addEventListener('contextmenu', e => {
      e.preventDefault();
      return false;
    });
  }, 0);

  // Register all hover/visual event handlers
  registerVisualEventHandlers(cy);

  // Register custom context menu, edge modals, etc.
  setupMenuAndEdgeModals({
    cy,
    convergeAll,
    computeVisuals,
    openNotesModal,
    openRationaleModal,
    NODE_TYPE_ASSERTION,
    NODE_TYPE_FACT,
    NODE_TYPE_AND,
    NODE_TYPE_OR,
    NODE_TYPE_NOTE
  });

  // ====== Button Event Hookup ======
  document.getElementById('btnBayesTime').onclick = function() {
    setBayesMode(mode === 'lite' ? 'heavy' : 'lite');
  };
  document.getElementById('btnRestoreAutosave').addEventListener('click', restoreAutosave);
  document.getElementById('btnResetLayout').addEventListener('click', resetLayout);
  document.getElementById('btnClearGraph').addEventListener('click', clearGraph);
  document.getElementById('btnSaveGraph').addEventListener('click', saveGraph);
  document.getElementById('btnLoadGraph').addEventListener('click', loadGraph);
  document.getElementById('btnAddNote').addEventListener('click', addNote);

  // ====== Autosave Timer ======
  setInterval(autosave, 5 * 60 * 1000);


});
