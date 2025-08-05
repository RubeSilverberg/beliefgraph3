// custom-edge-handles.js
// Custom edge handle implementation that replaces the problematic cytoscape-edgehandles extension

import {
  NODE_TYPE_FACT,
  NODE_TYPE_ASSERTION,
  NODE_TYPE_AND,
  NODE_TYPE_OR,
  NODE_TYPE_NOTE
} from './config.js';

import { wouldCreateCycle } from './logic.js';

let isEdgeHandlesEnabled = true;
let currentHandle = null;
let dragLine = null;
let isDragging = false;

/**
 * Setup custom edge handles that work reliably
 */
export function setupCustomEdgeHandles(cy) {
  console.log('setupCustomEdgeHandles called with cy:', cy);
  
  // Clean up any existing handlers
  cy.off('mouseover.edgehandles');
  cy.off('mouseout.edgehandles');
  cy.off('mousedown.edgehandles');
  cy.off('pan.edgehandles');
  cy.off('zoom.edgehandles');
  
  console.log('Cleaned up existing event handlers');
  
  // Add CSS for handles
  addEdgeHandleCSS();
  console.log('Added CSS for edge handles');
  
  // Show handle on node hover - use mouseover but try to coexist with existing handler
  cy.on('mouseover', 'node', function(evt) {
    console.log('� EDGE HANDLES mouseover detected on:', evt.target.id());
    handleNodeHover(cy, evt);
  });
  
  function handleNodeHover(cy, evt) {
    if (!isEdgeHandlesEnabled) {
      return;
    }
    if (!canCreateEdges()) {
      return;
    }
    
    const node = evt.target;
    if (node.data('type') === NODE_TYPE_NOTE) {
      return;
    }
    if (isDragging) {
      return;
    }
    
    showHandle(cy, node);
  }
  
  // Hide handle on node mouseout (with delay to prevent flickering)
  cy.on('mouseout', 'node', function(evt) {
    setTimeout(() => {
      if (!isDragging) {
        hideHandle();
      }
    }, 100);
  });
  
  // Handle pan/zoom events to hide handles
  cy.on('pan.edgehandles zoom.edgehandles', function() {
    if (!isDragging) {
      hideHandle();
    }
  });
  
  // Add global document mousedown listener to hide handle when clicking elsewhere
  document.addEventListener('mousedown', function(e) {
    // Only hide if we're not currently dragging an edge and a handle is visible
    if (!isDragging && currentHandle) {
      // Check if the click was on the handle itself
      const isClickOnHandle = e.target.classList.contains('custom-edge-handle');
      
      // Hide handle if click is NOT on the handle itself
      if (!isClickOnHandle) {
        hideHandle();
        
        // Also clean up any existing drag line (edge case)
        if (dragLine && dragLine.parentNode) {
          dragLine.parentNode.removeChild(dragLine);
          dragLine = null;
        }
      }
    }
  });
}

function showHandle(cy, node) {
  // Remove any existing handle
  hideHandle();
  
  // Create handle element
  const handle = document.createElement('div');
  handle.className = 'custom-edge-handle';
  handle.innerHTML = '⊕'; // Plus symbol
  
  // Position the handle
  const renderedPos = node.renderedPosition();
  const container = cy.container();
  
  handle.style.left = (renderedPos.x - 8) + 'px';
  handle.style.top = (renderedPos.y - 8) + 'px';
  
  container.appendChild(handle);
  currentHandle = { element: handle, node: node };
  
  // Add mouse events to handle
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startDrag(cy, node, e);
  });
  
  // Keep handle visible when hovering over it
  handle.addEventListener('mouseenter', () => {
    // Handle stays visible
  });
}

function hideHandle() {
  if (currentHandle) {
    if (currentHandle.element.parentNode) {
      currentHandle.element.parentNode.removeChild(currentHandle.element);
    }
    currentHandle = null;
  }
}

function startDrag(cy, sourceNode, startEvent) {
  isDragging = true;
  
  // Create drag line
  dragLine = document.createElement('div');
  dragLine.className = 'edge-drag-line';
  
  const container = cy.container();
  container.appendChild(dragLine);
  
  const containerRect = container.getBoundingClientRect();
  const sourcePos = sourceNode.renderedPosition();
  
  function updateDragLine(e) {
    if (!dragLine) return;
    
    const currentX = e.clientX - containerRect.left;
    const currentY = e.clientY - containerRect.top;
    
    const dx = currentX - sourcePos.x;
    const dy = currentY - sourcePos.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    dragLine.style.left = sourcePos.x + 'px';
    dragLine.style.top = sourcePos.y + 'px';
    dragLine.style.width = length + 'px';
    dragLine.style.transform = `rotate(${angle}deg)`;
  }
  
  function handleMouseMove(e) {
    if (!isDragging) return;
    updateDragLine(e);
  }
  
  function handleMouseUp(e) {
    if (!isDragging) return;
    
    isDragging = false;
    
    // Clean up drag line
    if (dragLine && dragLine.parentNode) {
      dragLine.parentNode.removeChild(dragLine);
    }
    dragLine = null;
    
    // Find target node
    const targetNode = findNodeAtPosition(cy, e.clientX - containerRect.left, e.clientY - containerRect.top);
    
    if (targetNode && canConnectNodes(cy, sourceNode, targetNode)) {
      createEdge(cy, sourceNode, targetNode);
    }
    
    // Clean up event listeners
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    // Hide handle
    hideHandle();
  }
  
  // Add global mouse events
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  
  // Initial line update
  updateDragLine(startEvent);
}

function findNodeAtPosition(cy, x, y) {
  // Find node at the given position
  const nodes = cy.nodes();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const bb = node.renderedBoundingBox();
    if (x >= bb.x1 && x <= bb.x2 && y >= bb.y1 && y <= bb.y2) {
      return node;
    }
  }
  return null;
}

function canConnectNodes(cy, sourceNode, targetNode) {
  // Same validation as the original edgehandles
  if (!sourceNode || !targetNode) return false;
  
  // Can't connect to/from note nodes
  if (sourceNode.data('type') === NODE_TYPE_NOTE || targetNode.data('type') === NODE_TYPE_NOTE) {
    return false;
  }
  
  // Can't connect to self
  if (sourceNode.id() === targetNode.id()) {
    return false;
  }
  
  // Prevent cycles
  if (wouldCreateCycle(cy, sourceNode.id(), targetNode.id())) {
    return false;
  }
  
  return true;
}

function createEdge(cy, sourceNode, targetNode) {
  const targetType = targetNode.data('type');
  let edgeData = {
    source: sourceNode.id(),
    target: targetNode.id(),
    rationale: ""
  };
  
  if (targetType === NODE_TYPE_ASSERTION) {
    edgeData.weight = 0; // Virgin edge - no influence until user sets weight
    edgeData.type = "supports";
  } else if (targetType === NODE_TYPE_AND || targetType === NODE_TYPE_OR) {
    // Logic nodes don't use weights - they use deterministic logic
    edgeData.type = "supports";
  }
  
  cy.add({ group: 'edges', data: edgeData });
  
  // Trigger existing convergence and visual updates
  if (window.convergeAll) {
    window.convergeAll({ cy });
  }
  if (window.computeVisuals) {
    window.computeVisuals(cy);
  }
  
  // Handle virgin nodes (from original logic)
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
}

function canCreateEdges() {
  // Edge creation is disabled in heavy mode
  return !(window.getBayesMode && window.getBayesMode() === 'heavy');
}

export function toggleCustomEdgeHandles(enabled) {
  isEdgeHandlesEnabled = enabled;
  if (!enabled) {
    hideHandle();
  }
}

export function initializeCustomEdgeHandlesModeMonitoring() {
  // Set up a periodic check for mode changes
  let lastMode = null;
  
  const checkModeChange = () => {
    const currentMode = window.getBayesMode ? window.getBayesMode() : 'lite';
    
    if (currentMode !== lastMode) {
      lastMode = currentMode;
      const canCreate = canCreateEdges();
      toggleCustomEdgeHandles(canCreate);
    }
  };
  
  // Check immediately and then periodically
  checkModeChange();
  setInterval(checkModeChange, 500);
}

function addEdgeHandleCSS() {
  const existingStyle = document.getElementById('custom-edgehandles-styles');
  if (existingStyle) return; // Already added
  
  const style = document.createElement('style');
  style.id = 'custom-edgehandles-styles';
  style.textContent = `
    /* Custom edge handle styling */
    .custom-edge-handle {
      position: absolute;
      width: 16px;
      height: 16px;
      background: #1976d2;
      color: white;
      border: 2px solid white;
      border-radius: 50%;
      cursor: crosshair;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      line-height: 1;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      user-select: none;
      transition: transform 0.1s ease;
    }
    
    .custom-edge-handle:hover {
      transform: scale(1.2);
      background: #1565c0;
    }
    
    /* Drag line styling */
    .edge-drag-line {
      position: absolute;
      height: 2px;
      background: #1976d2;
      z-index: 999;
      transform-origin: left center;
      pointer-events: none;
      opacity: 0.8;
    }
    
    .edge-drag-line::after {
      content: '';
      position: absolute;
      right: -6px;
      top: -3px;
      width: 0;
      height: 0;
      border-left: 6px solid #1976d2;
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
    }
  `;
  
  document.head.appendChild(style);
}
