console.log("Loaded style array:", typeof style !== 'undefined' ? style : '[style not defined]' );
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

// Attach computeVisuals to window for cross-module use
window.computeVisuals = computeVisuals;

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
          'min-height': 28,
          'content': 'data(label)'
        }
      },
      // Fact nodes: rectangle, thicker/darker border
{
  selector: 'node[type ="fact"]',
  style: {
    'shape': 'rectangle',
    'background-color': '#666', // or '#333'
    'color': '#fff',
    'border-color': '#666',     // or slightly lighter for subtle border
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
// Edge supports: dynamic grey scale, solid
{
  selector : 'edge[type="supports"]',
  style : {
    'line-color': 'mapData(absWeight, 0, 1, #e0e0e0, #444)',
    'mid-target-arrow-color': 'mapData(absWeight, 0, 1, #e0e0e0, #444)',
    'line-style': 'solid',
    'mid-target-arrow-shape': 'triangle'
  }
},
// Edge opposes: dynamic grey scale, dotted
{
  selector : 'edge[type ="opposes"], edge[opposes]',
  style : {
    'line-color': 'mapData(absWeight, 0, 1, #e0e0e0, #444)',
    'mid-target-arrow-color': 'mapData(absWeight, 0, 1, #e0e0e0, #444)',
    'line-style': 'dotted',
    'mid-target-arrow-shape': 'bar'
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
