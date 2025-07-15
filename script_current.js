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

// Suppress browser context menu globally
document.addEventListener('contextmenu', e => e.preventDefault());


document.addEventListener('DOMContentLoaded', () => {


  // ====== Cytoscape Setup: Custom Node & Edge Styles ======
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
  'font-size': 16, // Set your default; can be adjusted as needed
  'line-height': 1.4,
  'letter-spacing': '0.01em',
  'text-outline-width': 0,
  'text-shadow': '0 1px 2px #faf6ff80', // optional, subtle
  'text-wrap': 'wrap',
  'text-max-width': '120px',   // tune if needed
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
          'shape': 'rectangle',
          // fallback only, actual value set in computeVisuals
          // 'border-width': 2,
          // 'border-color': '#444'
        }
      },
      // AND logic: diamond, thicker border
      {
        selector: 'node[type="and"]',
        style: {
          'shape': 'diamond',
          // fallback only, actual value set in computeVisuals
          // 'border-width': 3,
          // 'border-color': '#bbb'
        }
      },
      // OR logic: ellipse, thicker border
      {
        selector: 'node[type="or"]',
        style: {
          'shape': 'ellipse',
          // fallback only, actual value set in computeVisuals
          // 'border-width': 3,
          // 'border-color': '#bbb'
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
          'opacity': 1,
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
      // Highlighted nodes
      {
        selector: 'node[highlighted]',
        style: {
          'background-color': '#fffbe5',
          'box-shadow': '0 0 18px 6px #ffe082',
          'z-index': 999
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
