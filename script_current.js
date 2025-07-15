console.log("Loaded style array:", typeof style !== 'undefined' ? style : '[style not defined]');
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
  exportToExcelFromModel,
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
  openModifierModal
} from './modals.js';

import { setupMenuAndEdgeModals } from './menu.js';

// Attach computeVisuals to window for cross-module use
window.computeVisuals = computeVisuals;

// ====== Central Node Sizing Logic ======
export function adjustNodeSize(node, change = 0, options = {}) {
  // If user is using +/- buttons, update sizeIndex
  let sizeIndex = node.data('sizeIndex') ?? 3;
  sizeIndex = Math.max(1, Math.min(15, sizeIndex + change)); // 10 steps
  node.data('sizeIndex', sizeIndex);

  // Base font size (let user change steps if desired)
  const baseFont = 14;
  const fontStep = 1.5;
  const fontSize = Math.round(baseFont + (sizeIndex - 3) * fontStep);
  node.data('fontSize', fontSize);

  // Estimate text width: longest line only
  const text = (node.data('displayLabel') || node.data('label') || node.data('origLabel') || '').toString();
  const lines = text.split('\n');
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  // Heuristic: each char ~0.55em; add padding for each line break
  const minWidth = 60;
  const perChar = 0.55 * fontSize; // px per character
  let width = Math.max(minWidth, Math.ceil(longest * perChar + 28)); // +padding
  // Clamp width if you want, e.g., 60–350px:
  width = Math.max(60, Math.min(width, 350));

  // Height: base + #lines
  const baseHeight = fontSize * 1.7; // padding for one line
  const height = Math.ceil(baseHeight + (lines.length - 1) * fontSize * 1.1);

  node.data('width', width);
  node.data('height', height);
  // You can set textMaxWidth here if you want (see below)
  node.data('textMaxWidth', width - 10); // little buffer
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
          'shape': 'roundrectangle', // overridden by type
          'background-color': '#eceff1',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-weight': 600,
          'font-family': 'Segoe UI, Roboto, Arial, sans-serif',
          'font-size': 'data(fontSize)',
          'line-height': 1.4,
          'letter-spacing': '0.01em',
          'text-outline-width': 0,
          'text-shadow': '0 1px 2px #faf6ff80', // optional, subtle
          'text-wrap': 'wrap',
          'text-max-width': 'data(textMaxWidth)',   // tune if needed
          'padding': '12px',
          'border-style': 'solid',
          'border-width': 'data(borderWidth)',
          'border-color': 'data(borderColor)',
          'min-width': 40,
          'min-height': 24,
          'content': 'data(label)'
        }
      },
      // Fact nodes: rectangle, thicker/darker border
      {
        selector: 'node[type="fact"]',
        style: {
          'shape': 'rectangle'
          // fallback only, actual value set in computeVisuals
        }
      },
      // AND logic: diamond, thicker border
      {
        selector: 'node[type="and"]',
        style: {
          'shape': 'diamond'
          // fallback only, actual value set in computeVisuals
        }
      },
      // OR logic: ellipse, thicker border
      {
        selector: 'node[type="or"]',
        style: {
          'shape': 'ellipse'
          // fallback only, actual value set in computeVisuals
        }
      },
      // Edge base
      {
        selector: 'edge',
        style: {
          'curve-style': 'bezier',
          'mid-target-arrow-shape': 'triangle',
          'width': 'mapData(absWeight, 0, 1, 2, 8)',
          'line-color': '#bbb',
          'mid-target-arrow-color': '#bbb',
          'opacity': 1
        }
      },
      // Edge supports: blue
      {
        selector: 'edge[type="supports"]',
        style: {
          'line-color': 'mapData(absWeight, 0, 1, #bbdefb, #1565c0)',
          'mid-target-arrow-color': 'mapData(absWeight, 0, 1, #bbdefb, #1565c0)'
        }
      },
      // Edge opposes: red
      {
        selector: 'edge[type="opposes"], edge[opposes]',
        style: {
          'line-color': 'mapData(absWeight, 0, 1, #ffcdd2, #b71c1c)',
          'mid-target-arrow-shape': 'bar',
          'mid-target-arrow-color': 'mapData(absWeight, 0, 1, #ffcdd2, #b71c1c)'
        }
      },
      // Virgin edges
      {
        selector: 'edge[isVirgin]',
        style: {
          'line-color': '#ffb300',
          'mid-target-arrow-color': '#ffb300',
          'width': 4,
          'opacity': 1
        }
      },
      // Floret color override
      {
        selector: 'node[floretColor]',
        style: {
          'background-color': 'data(floretColor)',
          'background-opacity': 0.18
        }
      }
    ],
    layout: { name: 'preset' }
  });

  // Double-click node to edit label
  cy.on('dblclick', 'node', function(event) {
    const node = event.target;
    openEditNodeLabelModal(node);
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
    NODE_TYPE_OR
  });

  // ====== Button Event Hookup ======
  document.getElementById('btnRestoreAutosave').addEventListener('click', restoreAutosave);
  document.getElementById('btnResetLayout').addEventListener('click', resetLayout);
  document.getElementById('btnClearGraph').addEventListener('click', clearGraph);
  document.getElementById('btnExportExcel').addEventListener('click', exportToExcelFromModel);
  document.getElementById('btnSaveGraph').addEventListener('click', saveGraph);
  document.getElementById('btnLoadGraph').addEventListener('click', loadGraph);
  document.getElementById('btnBayesTime').addEventListener('click', startBayesTimeSequence);

  // ====== Autosave Timer ======
  setInterval(autosave, 5 * 60 * 1000);

  // ====== Quiet Mode: Suppress Known Warnings/Errors ======
  (function(){
    const origError = console.error;
    const origWarn  = console.warn;
    console.error = function(...args) {
      const msg = args[0] + '';
      if (msg.includes('layoutBase') || msg.includes('memoize')) return;
      origError.apply(console, args);
    };
    console.warn = function(...args) {
      const msg = args[0] + '';
      if (msg.includes('The style value of `label` is deprecated')) return;
      origWarn.apply(console, args);
    };
  })();
});
