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
  // ...any other logic exports you use directly
} from './logic.js';

import {
  openEditNodeLabelModal,
  openVisualSignalsModal,
  openNotesModal,
  openRationaleModal,
  openCPTModalTwoPerParent,
  openModifierModal
} from './modal.js';

import { setupMenuAndEdgeModals } from './menu.js';

document.addEventListener('contextmenu', e => e.preventDefault());
// ====== Cytoscape Setup (initialize cy with style/layout as before) ======
// ... (your Cytoscape init code here; unchanged)

// ====== Custom Context Menu and Event Wiring ======
// (Paste your menu/context logic here, but do not redefine model logic functions)

// ====== Interaction: Tap, Double-Tap, Edge Creation ======
// (All event listeners—tap, double-tap, etc.—should just call the right imported functions)

// ====== Button Event Hookup ======
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnRestoreAutosave').addEventListener('click', restoreAutosave);
  document.getElementById('btnResetLayout').addEventListener('click', resetLayout);
  document.getElementById('btnClearGraph').addEventListener('click', clearGraph);
  document.getElementById('btnExportExcel').addEventListener('click', exportToExcelFromModel);
  document.getElementById('btnSaveGraph').addEventListener('click', saveGraph);
  document.getElementById('btnLoadGraph').addEventListener('click', loadGraph);
  document.getElementById('btnBayesTime').addEventListener('click', startBayesTimeSequence);
});

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
// ====== Cytoscape Setup ======
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

setTimeout(() => {
  cy.container().addEventListener('contextmenu', e => {
    e.preventDefault();
    return false;
  });
}, 0);


// Optionally, make cy globally accessible for debugging or cross-module use:
window.cy = cy;

// ====== (Event wiring and menu logic go below this) ======
setupMenuAndEdgeModals({
  cy,
  convergeAll,
  computeVisuals,
  openVisualSignalsModal,
  openNotesModal,
  openRationaleModal,
  NODE_TYPE_ASSERTION,
  NODE_TYPE_FACT,
  NODE_TYPE_AND,
  NODE_TYPE_OR
});
