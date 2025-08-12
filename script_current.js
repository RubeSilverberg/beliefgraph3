// script_current.js

import {
  openEditNodeLabelModal,
  openNotesModal,
  openRationaleModal,
  openContributingFactorsModal,
  openVisualSignalsModal,
  openMultiVisualSignalsModal,
  openCPTModalTwoPerParent
} from './modals.js';
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
  TOOLTIP_TEXTS,
  attachTooltip,
  // ...any other needed config exports
} from './config.js';

import { showExamplesMenu } from './examples.js';

import {
  resetLayout,
  clearGraph,
  autosave,
  restoreAutosave,
  saveGraph,
  loadGraph,
  addNote,
  addStatement,
  finalizeBayesTimeCPT,
  getParentStateCombos,
  startBayesTimeSequence,
  convergeAll,
  wouldCreateCycle,
  getTopologicallySortedNodesWithParents,
  syncNaiveBayesParents,
  clearBayesHighlights,
  highlightBayesNodeFocus,
  initializeNodeData,
  clearNodeDataForUnknownType,
  clearVisualOnlyData,
  // If you later add more, include here
} from './logic.js';

import { setupMenuAndEdgeModals } from './menu.js';
import { setupCustomEdgeHandles, initializeCustomEdgeHandlesModeMonitoring } from './custom-edge-handles.js';
import { TextAnnotations } from './text-annotations.js';
// --- Quick Guide Button Logic ---
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('quick-guide-btn');
  if (btn) {
    btn.onclick = () => {
      fetch('quick_guide.txt')
        .then(resp => resp.text())
        .then(text => {
          const modal = document.createElement('div');
          modal.style.position = 'fixed';
          modal.style.top = '10%';
          modal.style.left = '50%';
          modal.style.transform = 'translateX(-50%)';
          modal.style.background = '#fff';
          modal.style.border = '1px solid #888';
          modal.style.padding = '24px';
          modal.style.maxWidth = '600px';
          modal.style.maxHeight = '70vh';
          modal.style.overflowY = 'auto';
          modal.style.zIndex = 10000;
          // Convert lines starting with a bullet to HTML list items
          const lines = text.split(/\r?\n/);
          let html = '';
          let inList = false;
          lines.forEach(line => {
            if (/^\s*[•*-]/.test(line)) {
              if (!inList) { html += '<ul style="margin-top:0">'; inList = true; }
              html += `<li>${line.replace(/^\s*[•*-]\s*/, '')}</li>`;
            } else {
              if (inList) { html += '</ul>'; inList = false; }
              html += `<div>${line.replace(/</g, '&lt;')}</div>`;
            }
          });
          if (inList) html += '</ul>';
          modal.innerHTML = html;

          const closeBtn = document.createElement('button');
          closeBtn.textContent = 'Close';
          closeBtn.style.marginTop = '16px';
          closeBtn.onclick = () => document.body.removeChild(modal);
          modal.appendChild(closeBtn);
          document.body.appendChild(modal);
        });
    };
  }
});

// --- Text Annotation Functions (Global Scope) ---
function addTextAnnotation() {
  if (!window.cy || !window.textAnnotations) {
    alert('Graph not loaded.');
    return;
  }
  
  // Add annotation to center of current viewport
  const viewport = window.cy.extent();
  const centerX = (viewport.x1 + viewport.x2) / 2;
  const centerY = (viewport.y1 + viewport.y2) / 2;
  
  const annotation = window.textAnnotations.createAnnotation(centerX, centerY, 'New note');
  
  // Auto-edit the new annotation
  setTimeout(() => {
    window.textAnnotations.editAnnotation(annotation);
  }, 10);
  
  console.log('Text annotation added');
}

// Enhanced save function that includes text annotations
function saveGraphWithAnnotations() {
  const cy = window.cy;
  if (typeof cy === 'undefined') {
    alert('Graph not loaded.');
    return;
  }
  try {
    const elements = cy.elements().jsons();
    const annotations = window.textAnnotations ? window.textAnnotations.exportAnnotations() : [];
    
    const data = {
      graph: elements,
      textAnnotations: annotations,
      version: '1.0'
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graph.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('Graph with annotations downloaded as graph.json');
  } catch (err) {
    console.error('Save to file failed:', err);
  }
}

// Enhanced load function that includes text annotations
function loadGraphWithAnnotations() {
  const cy = window.cy;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const fileContent = JSON.parse(evt.target.result);
        
        // Handle new format with annotations
        if (fileContent.graph && fileContent.textAnnotations !== undefined) {
          // Load graph elements
          cy.elements().remove();
          cy.add(fileContent.graph);
          
          // Load text annotations
          if (window.textAnnotations) {
            window.textAnnotations.importAnnotations(fileContent.textAnnotations);
          }
        } else {
          // Handle legacy format (just graph elements)
          cy.elements().remove();
          cy.add(fileContent);
        }
        
        convergeAll({ cy });
        cy.layout({ name: 'preset' }).run();
        window.computeVisuals?.(cy);
        cy.fit();
        cy.resize();
        window.resetLayout?.();
        console.log(`Graph loaded from file: ${file.name}`);
      } catch (err) {
        console.error('Failed to load graph:', err);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// Enhanced clear function that includes text annotations
function clearGraphWithAnnotations() {
  const cy = window.cy;
  if (!confirm('Are you sure you want to clear the graph?')) return;
  
  // Clear Cytoscape graph
  cy.elements().remove();
  
  // Clear text annotations
  if (window.textAnnotations) {
    window.textAnnotations.clearAllAnnotations();
  }
  
  if (window.computeVisuals) window.computeVisuals(cy);
  console.log('Graph and annotations cleared');
}

let mode = 'lite'; // Tracks current Bayes mode globally
window.getBayesMode = () => mode;

function flipArrowDirections(mode) {
  if (!window.cy) return;
  
  console.log(`Flipping arrow directions for ${mode} mode`);
  
  if (mode === 'heavy') {
    // Heavy mode: flip arrows to point from target to source (reverse of edge direction)
    window.cy.style()
      .selector('edge')
      .style({
        'mid-target-arrow-shape': 'none',
        'mid-source-arrow-shape': 'triangle',
        'mid-source-arrow-color': 'data(lineColor)'
      })
      .selector('edge[displayType="opposes"]')
      .style({
        'mid-source-arrow-shape': 'triangle',
        'mid-source-arrow-color': '#d32f2f'
      })
      .update();
  } else {
    // Lite mode: arrows point from source to target (follows edge direction)
    window.cy.style()
      .selector('edge')
      .style({
        'mid-source-arrow-shape': 'none',
        'mid-target-arrow-shape': 'triangle',
        'mid-target-arrow-color': 'data(lineColor)'
      })
      .selector('edge[displayType="opposes"]')
      .style({
        'mid-target-arrow-shape': 'triangle',
        'mid-target-arrow-color': '#d32f2f'
      })
      .update();
  }
}

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
  
  // Flip arrow directions based on mode
  if (window.cy) {
    flipArrowDirections(newMode);
  }
  
  // Use unified convergence for both modes (handles mode-specific propagation internally)
  if (window.convergeAll && window.cy) {
    window.convergeAll({ cy: window.cy });
  }
  
  // Update UI and visuals for new mode
  handleModeProcesses(newMode);
  updateModeIndicator(newMode);
  
  // Recompute visuals with clean slate (synchronous to avoid race conditions)
  if (window.computeVisuals && window.cy) {
    window.computeVisuals(window.cy);
  }
  
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
      'border-color': '#666',
      'border-width': 2,
      'border-style': 'solid'
    }
  },
  // Inert fact nodes: very obvious styling
  {
    selector: 'node[type="fact"][inertFact]',
    style: {
      'border-style': 'dashed',
      'border-color': '#ff9800',
      'border-width': 4,
      'background-color': '#555',
  'background-opacity': 'data(backgroundOpacity)',
      'text-outline-width': 2,
      'text-outline-color': '#000'
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
      'mid-target-arrow-shape': 'triangle',  // Default for lite mode
      'mid-source-arrow-shape': 'none',
      'width': 'mapData(absWeight, 0, 1, 2, 8)',
      'line-color': 'data(lineColor)',
      'mid-target-arrow-color': 'data(lineColor)',
      'mid-source-arrow-color': 'data(lineColor)',
      'opacity': 1,
      // Edge labels for virgin edges - positioned to float away from arrow
      'label': 'data(label)',
      'font-size': '11px',
      'font-weight': 'bold',
      'color': '#000000',  // Black text for visibility
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.9,
      'text-background-padding': '3px',
      'text-background-shape': 'roundrectangle',
      'text-margin-y': '-15px',     // Move text up from edge line
      'source-text-margin-x': '10px',  // Small offset from center
      'text-rotation': 'none'       // Keep text horizontal for readability
    }
  },
  // Edge supports: use displayType to avoid cross-mode conflicts
  {
    selector: 'edge[displayType="supports"]',
    style: {
      'line-style': 'solid',
      'mid-target-arrow-shape': 'triangle'  // Will be overridden by mode switch
    }
  },
  // Edge opposes: use displayType to avoid cross-mode conflicts  
  {
    selector: 'edge[displayType="opposes"]',
    style: {
      'line-style': 'dotted',
      'mid-target-arrow-shape': 'triangle',  // Will be overridden by mode switch
      'mid-target-arrow-color': '#d32f2f'  // Red triangle for NOT relationships
    }
  },
  // Virgin edges: dashed line style to indicate non-propagation
  {
    selector: 'edge[absWeight = 0]',  // Virgin edges have absWeight = 0
    style: {
      'line-style': 'dashed'  // Perforated paper effect
    }
  },
  // Floret color override
  {
    selector: 'node[floretColor]',
    style: {
      'background-color': 'data(floretColor)',
  // Previously translucent; now fully opaque per request
  'background-opacity': 1
    }
  },
  // ---- VIRGIN EDGE STYLE: REMOVED - now using computed lineColor ----
],


    layout: { name: 'preset' }
  });

  // (Auto-import of testGraphData removed per user request to prevent unintended data loss)

  // Double-click node to edit label
  cy.on('dblclick', 'node', function(event) {
    const node = event.target;
    openEditNodeLabelModal(node);
  });

  // ===== MULTI-SELECT FUNCTIONALITY =====
  let selectedNodes = new Set();
  let multiSelectMode = false;
  
  // Enable box selection
  cy.boxSelectionEnabled(true);
  
  // Create multi-select controls
  const multiSelectControls = document.createElement('div');
  multiSelectControls.className = 'multi-select-controls';
  multiSelectControls.innerHTML = `
    <div class="selection-count">0 nodes selected</div>
    <div style="font-size: 11px; color: #666; margin-bottom: 8px;">
      💡 Ctrl+Click nodes, drag to box select<br>
      ⌨️ Delete key, Escape, Ctrl+A
    </div>
    <button id="multiSelectVisuals">Visual Signals</button>
    <button id="multiSelectDelete">Delete Selected</button>
    <button id="multiSelectClear">Clear Selection</button>
  `;
  document.body.appendChild(multiSelectControls);
  
  function updateSelectionUI() {
    const count = selectedNodes.size;
    const countDiv = multiSelectControls.querySelector('.selection-count');
    countDiv.textContent = `${count} node${count !== 1 ? 's' : ''} selected`;
    
    if (count > 0) {
      multiSelectControls.classList.add('active');
    } else {
      multiSelectControls.classList.remove('active');
      multiSelectMode = false;
    }
    
    // Update selection indicators on nodes
    cy.nodes().forEach(node => {
      const isSelected = selectedNodes.has(node.id());
      if (isSelected && !node.hasClass('selected')) {
        node.addClass('selected');
        node.select();
      } else if (!isSelected && node.hasClass('selected')) {
        node.removeClass('selected'); 
        node.unselect();
      }
    });
  }
  
  // Multi-select click handler
  cy.on('tap', 'node', function(event) {
    // Check for Ctrl/Cmd key
    if (event.originalEvent.ctrlKey || event.originalEvent.metaKey) {
      const nodeId = event.target.id();
      
      if (selectedNodes.has(nodeId)) {
        selectedNodes.delete(nodeId);
      } else {
        selectedNodes.add(nodeId);
        multiSelectMode = true;
      }
      
      updateSelectionUI();
      event.stopPropagation();
    }
  });
  
  // Box selection support
  cy.on('boxend', function(event) {
    const boxSelectedNodes = cy.nodes(':selected');
    
    boxSelectedNodes.forEach(node => {
      selectedNodes.add(node.id());
    });
    
    if (selectedNodes.size > 0) {
      multiSelectMode = true;
      updateSelectionUI();
    }
  });
  
  // Clear selection on background click
  cy.on('tap', function(event) {
    if (event.target === cy && selectedNodes.size > 0) {
      selectedNodes.clear();
      updateSelectionUI();
    }
  });
  
  // Multi-select control handlers
  document.getElementById('multiSelectVisuals').onclick = () => {
    if (selectedNodes.size > 0) {
      const nodes = Array.from(selectedNodes).map(id => cy.getElementById(id));
      openMultiVisualSignalsModal(nodes, cy);
    }
  };
  
  document.getElementById('multiSelectDelete').onclick = () => {
    if (selectedNodes.size > 0 && confirm(`Delete ${selectedNodes.size} selected nodes?`)) {
      // Only allow in lite mode
      if (window.getBayesMode && window.getBayesMode() === 'heavy') return;
      
      selectedNodes.forEach(id => {
        const node = cy.getElementById(id);
        if (node.length) node.remove();
      });
      
      selectedNodes.clear();
      updateSelectionUI();
      
      if (window.convergeAll) window.convergeAll({ cy });
      if (window.computeVisuals) window.computeVisuals(cy);
    }
  };
  
  document.getElementById('multiSelectClear').onclick = () => {
    selectedNodes.clear();
    updateSelectionUI();
  };
  
  // Keyboard shortcuts for multi-select
  document.addEventListener('keydown', (e) => {
    // Delete key to delete selected nodes
    if (e.key === 'Delete' && selectedNodes.size > 0) {
      if (window.getBayesMode && window.getBayesMode() === 'heavy') return;
      
      if (confirm(`Delete ${selectedNodes.size} selected nodes?`)) {
        selectedNodes.forEach(id => {
          const node = cy.getElementById(id);
          if (node.length) node.remove();
        });
        
        selectedNodes.clear();
        updateSelectionUI();
        
        if (window.convergeAll) window.convergeAll({ cy });
        if (window.computeVisuals) window.computeVisuals(cy);
      }
    }
    
    // Escape key to clear selection
    if (e.key === 'Escape' && selectedNodes.size > 0) {
      selectedNodes.clear();
      updateSelectionUI();
    }
    
    // Ctrl+A to select all nodes
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e.target.tagName.match(/INPUT|TEXTAREA/)) {
      e.preventDefault();
      selectedNodes.clear();
      cy.nodes().forEach(node => {
        selectedNodes.add(node.id());
      });
      multiSelectMode = true;
      updateSelectionUI();
    }
    
    // 'n' key to add new statement (same as Add Statement button)
    if (e.key === 'n' && !e.target.tagName.match(/INPUT|TEXTAREA/) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      addStatement();
    }
  });

  // Make cy global if needed elsewhere
  window.cy = cy;
  
  // Initialize text annotations system
  window.textAnnotations = new TextAnnotations(document.body);

  // Set initial arrow directions based on current mode (default is lite)
  flipArrowDirections(mode);

  // ===== Edge Visibility Interaction (faint instead of hide) =====
  function faintAllEdges() {
    cy.edges().addClass('faint-edge').removeClass('focus-edge');
  }
  function unfaintEdges(edges) {
    edges.removeClass('faint-edge').addClass('focus-edge');
  }
  function restoreAllEdges(){
    cy.edges().removeClass('faint-edge focus-edge');
  }
  if (!cy._addedFaintEdgeStyle) {
    cy.style()
      .selector('edge.faint-edge')
        .style({ 'opacity': 0.12 })
      .selector('edge.focus-edge')
        .style({ 'opacity': 0.9 })
      .update();
    cy._addedFaintEdgeStyle = true;
  }
  cy.on('mousedown', (evt) => {
    if (evt.target === cy) {
      requestAnimationFrame(()=>faintAllEdges());
    }
  });
  cy.on('mousedown', 'node', (evt) => {
    const node = evt.target;
    requestAnimationFrame(()=>{
      faintAllEdges();
      unfaintEdges(node.connectedEdges());
    });
  });
  cy.on('mouseup', () => {
    restoreAllEdges();
  });
  // Optional: double-click background to immediately restore full edge emphasis
  cy.on('dblclick', (evt) => { if (evt.target === cy) restoreAllEdges(); });

  // (Legacy) cytoscape-edgehandles extension call removed – replaced by custom-edge-handles.js implementation.
  // If reintroducing the original extension later, insert its setup call here guarded by a feature flag.

  // Ensure right-click suppression on the Cytoscape canvas (for browsers that don't respect document-level handler)
  setTimeout(() => {
    cy.container().addEventListener('contextmenu', e => {
      e.preventDefault();
      return false;
    });
  }, 0);

  // Register all hover/visual event handlers
  registerVisualEventHandlers(cy);

  // Setup custom edge handles for intuitive edge creation
  setupCustomEdgeHandles(cy);

  // === Soften floretColor nodes while keeping opacity 1 ===
  function parseColorToHex6(input){
    if(!input) return null;
    let c = input.trim();
    // Expand #abc
    if(/^#?[0-9a-fA-F]{3}$/.test(c)) return '#'+c.replace('#','').split('').map(ch=>ch+ch).join('').toLowerCase();
    // #rrggbb / #rrggbbaa
    if(/^#?[0-9a-fA-F]{6,8}$/.test(c)) return '#'+c.replace('#','').slice(0,6).toLowerCase();
    // rgb/rgba()
    const m = c.match(/^rgba?\(([^)]+)\)$/i);
    if(m){
      const parts = m[1].split(',').map(p=>parseFloat(p.trim()));
      if(parts.length>=3){ const toHex=v=>('0'+Math.min(255,Math.max(0,Math.round(v))).toString(16)).slice(-2); return '#'+toHex(parts[0])+toHex(parts[1])+toHex(parts[2]); }
    }
    // Named colors via canvas normalization
    if(typeof document!=='undefined'){
      const ctx = parseColorToHex6._ctx || (parseColorToHex6._ctx = document.createElement('canvas').getContext('2d'));
      ctx.fillStyle = c; // will normalize or fallback
      const computed = ctx.fillStyle; // rgb(...) or #rrggbb
      if(/^#[0-9a-fA-F]{6}$/.test(computed)) return computed.toLowerCase();
      const mm = computed.match(/^rgba?\(([^)]+)\)$/i);
      if(mm){
        const parts = mm[1].split(',').map(p=>parseFloat(p.trim()));
        if(parts.length>=3){ const toHex=v=>('0'+Math.min(255,Math.max(0,Math.round(v))).toString(16)).slice(-2); return '#'+toHex(parts[0])+toHex(parts[1])+toHex(parts[2]); }
      }
    }
    return null;
  }
  function softenColor(input) {
    const hex6 = parseColorToHex6(input);
    if(!hex6) return input; // fallback
    const h = hex6.slice(1);
    let r = parseInt(h.slice(0,2),16);
    let g = parseInt(h.slice(2,4),16);
    let b = parseInt(h.slice(4,6),16);
    // Convert to HSL, reduce saturation, increase lightness slightly
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    let hDeg, s, l=(max+min)/2;
    if(max===min){ hDeg=0; s=0; }
    else {
      const d=max-min;
      s=l>0.5? d/(2-max-min): d/(max+min);
      switch(max){
        case r: hDeg=(g-b)/d + (g<b?6:0); break;
        case g: hDeg=(b-r)/d + 2; break;
        case b: hDeg=(r-g)/d + 4; break;
      }
      hDeg/=6;
    }
  // Adjust: much softer (limit saturation & lift lightness heavily)
  // More aggressive softening: near pastel
  s = Math.min(0.18, s * 0.18); // push saturation very low
  l = Math.max(0.78, Math.min(0.92, l * 0.4 + 0.55)); // lift lightness significantly
    function h2rgb(p,q,t){ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }
    let r2,g2,b2;
    if(s===0){ r2=g2=b2=l; }
    else {
      const q = l < 0.5 ? l*(1+s) : l + s - l*s;
      const p = 2*l - q;
      r2=h2rgb(p,q,hDeg+1/3); g2=h2rgb(p,q,hDeg); b2=h2rgb(p,q,hDeg-1/3);
    }
    const toHex = v => ('0'+Math.round(v*255).toString(16)).slice(-2);
  return '#'+toHex(r2)+toHex(g2)+toHex(b2);
  }
  function applySoftColorToNode(n){
    const orig = n.data('floretColor');
    if(!orig) return;
    const prevBase = n.data('softBaseColor');
    if(prevBase === orig && n.data('softFloretColor')) return; // already processed
    const soft = softenColor(orig);
    n.data({ softFloretColor: soft, floretBorderColor: orig, softBaseColor: orig });
    if(!n.data('userCustomTextColor')){
      // inline relative luminance calc (avoids extra global fn)
      const m = soft.match(/^#?([0-9a-fA-F]{6})$/);
      if(m){
        const c = m[1];
        const rf=parseInt(c.slice(0,2),16)/255, gf=parseInt(c.slice(2,4),16)/255, bf=parseInt(c.slice(4,6),16)/255;
        const f=x=> x<=0.03928? x/12.92: Math.pow((x+0.055)/1.055,2.4);
        const lum=0.2126*f(rf)+0.7152*f(gf)+0.0722*f(bf);
        n.data('textColor', lum > 0.55 ? '#111' : '#fff');
      }
    }
  }
  function refreshSoftColors(){
    if (cy._softening) return;
    cy._softening = true;
    cy.nodes('[floretColor]').forEach(applySoftColorToNode);
    cy.style()
      .selector('node[softFloretColor]')
        .style({ 'background-color':'data(softFloretColor)','background-opacity':1,'border-color':'data(floretBorderColor)','border-width':2 })
      .update();
    cy._softening = false;
  }
  refreshSoftColors();
  window.refreshSoftColors = refreshSoftColors; // external reapplication
  cy.on('data', 'node', evt => { if(!cy._softening) applySoftColorToNode(evt.target); });
  initializeCustomEdgeHandlesModeMonitoring();

  // Register custom context menu, edge modals, etc.
  setupMenuAndEdgeModals({
    cy,
    convergeAll,
    computeVisuals,
    openNotesModal,
    openRationaleModal,
    openContributingFactorsModal,
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
  document.getElementById('btnClearGraph').addEventListener('click', clearGraphWithAnnotations);
  document.getElementById('btnSaveGraph').addEventListener('click', saveGraphWithAnnotations);
  document.getElementById('btnLoadGraph').addEventListener('click', loadGraphWithAnnotations);
  document.getElementById('btnLoadExample').addEventListener('click', showExamplesMenu);
  // document.getElementById('btnAddStatement').addEventListener('click', addStatement);
  // document.getElementById('btnAddNote').addEventListener('click', addTextAnnotation); // Moved to right-click menu
  
  // Debug button - only add listener if button exists
  const debugBtn = document.getElementById('btnDebugCalculations');
  if (debugBtn) {
    debugBtn.addEventListener('click', () => {
      if (window.debugBayesCalculations && window.cy) {
        window.debugBayesCalculations(window.cy);
      } else {
        console.log("Debug function not available or no graph loaded");
      }
    });
  }

  // ====== Tooltip Setup ======
  // Simple placeholder tooltip for Toggle Bayes button
  attachTooltip(document.getElementById('btnBayesTime'), TOOLTIP_TEXTS.toggleBayes);

  // Only attach tooltip if debug button exists
  if (debugBtn) {
    attachTooltip(debugBtn, TOOLTIP_TEXTS.debugCalculations);
  }
  
  // Only attach tooltips if buttons exist
  const exportBtn = document.querySelector('button[onclick*="logNetworkForPgmpy"]');
  if (exportBtn) {
    attachTooltip(exportBtn, TOOLTIP_TEXTS.exportPgmpy);
  }
  
  const mathDocsBtn = document.querySelector('button[onclick*="colab.research.google.com"]');
  if (mathDocsBtn) {
    attachTooltip(mathDocsBtn, TOOLTIP_TEXTS.mathDocs);
  }

  // ====== Smart Auto-Backup Timer ======
  setInterval(autosave, 10 * 1000); // Every 10 seconds

});
