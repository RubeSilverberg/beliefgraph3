// modals.js
import { adjustNodeSize } from './script_current.js'; // or wherever it's defined
import { NODE_TYPE_NOTE, NODE_TYPE_FACT, NODE_TYPE_ASSERTION, NODE_TYPE_AND, NODE_TYPE_OR } from './config.js';

// All modal popup creation and event handling logic
console.log("Loaded modals.js");
import { computeVisuals } from './visuals.js';
// Generic show/hide modal (if you want a unified interface, but not strictly required here)
export function showModal(modal) {
  document.body.appendChild(modal);
  centerModal(modal);
  modal.classList.remove('hidden');
  modal.focus && modal.focus();
}
export function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    setTimeout(() => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    }, 200);
  }
}

// --- Edit Node Label Modal ---
export function openEditNodeLabelModal(node) {
  const nodeType = node.data('type');
  
  // Use simplified note editor for note nodes
  if (nodeType === NODE_TYPE_NOTE) {
    openEditNoteModal(node);
    return;
  }
  
  // Regular editor for other nodes
  openEditRegularNodeModal(node);
}

// Simplified editor for note nodes - just text, no hover
function openEditNoteModal(node) {
  // Remove any existing modal
  hideModal('edit-note-modal');

  const modal = document.createElement('div');
  modal.id = 'edit-note-modal';
  modal.className = 'hidden';
  modal.style.position = 'fixed';
  modal.style.background = '#fff';
  modal.style.padding = '24px 24px 18px 24px';
  modal.style.border = '2px solid #1976d2';
  modal.style.borderRadius = '8px';
  modal.style.zIndex = 10001;
  modal.style.boxShadow = '0 6px 30px #1976d255';
  modal.style.minWidth = '350px';

  // Title
  const title = document.createElement('div');
  title.textContent = 'Edit Note';
  title.className = 'modal-title';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '14px';
  modal.appendChild(title);
  makeDraggable(modal, ".modal-title");

  // Note text input
  const textLabel = document.createElement('label');
  textLabel.textContent = 'Note text:';
  textLabel.style.display = 'block';
  textLabel.style.marginBottom = '3px';
  modal.appendChild(textLabel);

  const textInput = document.createElement('textarea');
  textInput.style.width = '100%';
  textInput.style.height = '80px';
  textInput.style.marginBottom = '18px';
  textInput.style.resize = 'vertical';
  textInput.value = node.data('displayLabel') || node.data('origLabel') || '';
  modal.appendChild(textInput);

  // Save and Cancel buttons
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.disabled = !textInput.value.trim();
  saveBtn.style.margin = '0 12px 0 0';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';

  modal.appendChild(saveBtn);
  modal.appendChild(cancelBtn);

  // Validation
  textInput.addEventListener('input', () => {
    saveBtn.disabled = !textInput.value.trim();
  });

  // Save logic
  saveBtn.onclick = function() {
    const textVal = textInput.value.trim();
    if (!textVal) return;

    node.data('displayLabel', textVal);
    node.removeData('hoverLabel'); // Notes don't have hover labels
    node.removeData('isVirgin');
    adjustNodeSize(node);
    computeVisuals(window.cy);

    hideModal(modal.id);
    setTimeout(() => {
      if (window.convergeAll) window.convergeAll({ cy: window.cy });
      if (window.computeVisuals) window.computeVisuals(window.cy);
    }, 0);
  };

  cancelBtn.onclick = function() {
    hideModal(modal.id);
  };

  // ESC key closes modal
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      hideModal(modal.id);
      document.removeEventListener('keydown', escHandler);
    }
  });

  // Show modal
  showModal(modal);
  textInput.focus();
  textInput.select();
}

// Regular editor for non-note nodes
function openEditRegularNodeModal(node) {
  // Remove any existing modal
  hideModal('edit-label-modal');

  const modal = document.createElement('div');
  modal.id = 'edit-label-modal';
  modal.className = 'hidden';
  modal.style.position = 'fixed';
  modal.style.background = '#fff';
  modal.style.padding = '24px 24px 18px 24px';
  modal.style.border = '2px solid #1976d2';
  modal.style.borderRadius = '8px';
  modal.style.zIndex = 10001;
  modal.style.boxShadow = '0 6px 30px #1976d255';
  modal.style.minWidth = '350px';

  // Title
  const title = document.createElement('div');
  title.textContent = 'Edit Node Label';
  title.className = 'modal-title';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '14px';
  modal.appendChild(title);
  makeDraggable(modal, ".modal-title");

  // Display label (short)
  const displayLabelLabel = document.createElement('label');
  displayLabelLabel.textContent = 'Display title (short, 1–2 words):';
  displayLabelLabel.style.display = 'block';
  displayLabelLabel.style.marginBottom = '3px';
  modal.appendChild(displayLabelLabel);

  const displayInput = document.createElement('input');
  displayInput.type = 'text';
  displayInput.maxLength = 30;
  displayInput.style.width = '100%';
  displayInput.style.marginBottom = '10px';
  displayInput.value = node.data('displayLabel') || node.data('origLabel') || '';
  modal.appendChild(displayInput);

  // Hover label (long)
  const hoverLabelLabel = document.createElement('label');
  hoverLabelLabel.textContent = 'Hover title (full sentence, optional):';
  hoverLabelLabel.style.display = 'block';
  hoverLabelLabel.style.marginBottom = '3px';
  modal.appendChild(hoverLabelLabel);

  const hoverInput = document.createElement('input');
  hoverInput.type = 'text';
  hoverInput.style.width = '100%';
  hoverInput.style.marginBottom = '18px';
  hoverInput.value = node.data('hoverLabel') || '';
  modal.appendChild(hoverInput);

  // Save and Cancel buttons
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.disabled = !displayInput.value.trim();
  saveBtn.style.margin = '0 12px 0 0';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';

  modal.appendChild(saveBtn);
  modal.appendChild(cancelBtn);

  // Validation
  displayInput.addEventListener('input', () => {
    saveBtn.disabled = !displayInput.value.trim();
  });

  // Save logic
  saveBtn.onclick = function() {
    const displayVal = displayInput.value.trim();
    const hoverVal = hoverInput.value.trim();
    if (!displayVal) return;

    // For notes, don't limit the length; for other nodes, limit to 25 chars
    const finalDisplayVal = node.data('type') === NODE_TYPE_NOTE ? displayVal : displayVal.slice(0, 25);

    node.data('displayLabel', finalDisplayVal);
    node.data('hoverLabel', hoverVal);
    node.removeData('isVirgin');
    adjustNodeSize(node);
    computeVisuals(window.cy);

    hideModal(modal.id);
    setTimeout(() => {
      if (window.convergeAll) window.convergeAll({ cy: window.cy });
      if (window.computeVisuals) window.computeVisuals(window.cy);
    }, 0);
  };

  cancelBtn.onclick = function() {
    hideModal(modal.id);
  };

  // ESC key closes modal
  const escListener = (e) => {
    if (e.key === "Escape") {
      hideModal(modal.id);
      window.removeEventListener('keydown', escListener);
    }
  };
  window.addEventListener('keydown', escListener);

  showModal(modal);
  displayInput.focus();
}

// Visual configuration constants
const VISUAL_CONFIG = {
  colors: {
    presets: [
      { name: 'Standard Shade', value: 'virgin' },
      { name: 'Black', value: 'black' },
      { name: 'Red', value: 'red' },
      { name: 'Blue', value: 'blue' },
      { name: 'Green', value: 'green' },
      { name: 'Purple', value: 'purple' },
      { name: 'Orange', value: '#f9a825' },
      { name: 'Teal', value: '#00897b' },
      { name: 'Magenta', value: '#d81b60' }
    ],
    nodeTypeDefaults: {
      fact: { text: '#fff', floret: '#666' },
      assertion: { text: '#000', floret: '#eceff1' },
      and: { text: '#000', floret: '#eceff1' },
      or: { text: '#000', floret: '#eceff1' },
      note: { text: '#333', floret: '#fffacd' }
    }
  },
  sizes: {
    min: 1,
    max: 20,
    default: 3
  }
};

// Get default colors for a node type
function getNodeTypeDefaults(nodeType) {
  return VISUAL_CONFIG.colors.nodeTypeDefaults[nodeType] || 
         VISUAL_CONFIG.colors.nodeTypeDefaults.assertion;
}

function createColorPreview(color) {
  const preview = document.createElement('div');
  preview.className = 'color-preview';
  preview.style.backgroundColor = color;
  preview.title = `Current color: ${color}`;
  return preview;
}

function createColorControl(labelText, currentValue, onchange, nodeType = 'assertion') {
  const container = document.createElement('div');
  container.className = 'color-control';
  
  const label = document.createElement('label');
  label.textContent = labelText;
  
  const pickerContainer = document.createElement('div');
  pickerContainer.className = 'color-picker-container';
  
  // Show current color or default for node type
  const isTextColor = labelText.toLowerCase().includes('text');
  const displayColor = currentValue === 'virgin' ? 
    getNodeTypeDefaults(nodeType)[isTextColor ? 'text' : 'floret'] : 
    currentValue;
  
  const preview = createColorPreview(displayColor);
  
  const select = document.createElement('select');
  VISUAL_CONFIG.colors.presets.forEach(preset => {
    const option = document.createElement('option');
    option.value = preset.value;
    option.textContent = preset.name;
    if (preset.value === currentValue) option.selected = true;
    select.appendChild(option);
  });
  
  select.onchange = (e) => {
    const newColor = e.target.value;
    const isTextColor = labelText.toLowerCase().includes('text');
    const displayColor = newColor === 'virgin' ? 
      getNodeTypeDefaults(nodeType)[isTextColor ? 'text' : 'floret'] : 
      newColor;
    preview.style.backgroundColor = displayColor;
    onchange(newColor);
  };
  
  pickerContainer.appendChild(preview);
  pickerContainer.appendChild(select);
  container.appendChild(label);
  container.appendChild(pickerContainer);
  
  return container;
}

export function openVisualSignalsModal(node, cy) {
  hideModal('visual-signals-modal');

  const modal = document.createElement('div');
  modal.id = 'visual-signals-modal';
  modal.className = 'hidden';

  // Get current values - handle node type defaults properly
  const nodeType = node.data('type') || 'assertion';
  const currentTextColor = node.data('textColor') || 'virgin';
  const currentBackgroundColor = node.data('floretColor') || 'virgin';
  const currentSize = node.data('sizeIndex') || VISUAL_CONFIG.sizes.default;

  modal.innerHTML = `
    <div class="modal-title">
      Visual Signals for Node
      <button class="close-btn" id="closeVisualSignalsModal">&times;</button>
    </div>
    
    <div class="control-section">
      <h4>Node Size</h4>
      <div class="size-controls">
        <button class="size-button" id="decreaseNodeSize">−</button>
        <span id="sizeIndicator" style="margin: 0 10px; font-weight: 500;">Size: ${currentSize}</span>
        <button class="size-button" id="increaseNodeSize">+</button>
      </div>
      <div style="font-size: 11px; color: #666; margin-top: 4px;">
        Range: ${VISUAL_CONFIG.sizes.min}–${VISUAL_CONFIG.sizes.max} (default: ${VISUAL_CONFIG.sizes.default})
      </div>
    </div>
    
    <div class="control-section">
      <h4>Colors</h4>
      <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
        Node type: <strong>${nodeType}</strong> 
        (default text: <span style="color: ${getNodeTypeDefaults(nodeType).text};">●</span>, 
         default background: <span style="color: ${getNodeTypeDefaults(nodeType).floret};">●</span>)
      </div>
      <div id="textColorControl"></div>
      <div id="backgroundColorControl"></div>
      <button id="resetColors" class="reset-btn">Reset to Node Type Defaults</button>
    </div>
  `;

  showModal(modal);
  centerModal(modal);
  makeDraggable(modal, '.modal-title');

  // Add color controls with proper node type context
  const textColorControl = createColorControl('Text:', currentTextColor, (color) => {
    applyVisualChange(node, 'textColor', color, cy);
  }, nodeType);
  
  const backgroundColorControl = createColorControl('Background:', currentBackgroundColor, (color) => {
    applyVisualChange(node, 'floretColor', color, cy);
  }, nodeType);
  
  document.getElementById('textColorControl').appendChild(textColorControl);
  document.getElementById('backgroundColorControl').appendChild(backgroundColorControl);

  // Close button handler
  document.getElementById('closeVisualSignalsModal').onclick = () => hideModal(modal.id);

  // Size control handlers with live updates and button state management
  const sizeIndicator = document.getElementById('sizeIndicator');
  const increaseBtn = document.getElementById('increaseNodeSize');
  const decreaseBtn = document.getElementById('decreaseNodeSize');
  let currentSizeValue = currentSize;
  
  function updateSizeButtons() {
    decreaseBtn.disabled = currentSizeValue <= VISUAL_CONFIG.sizes.min;
    increaseBtn.disabled = currentSizeValue >= VISUAL_CONFIG.sizes.max;
    decreaseBtn.style.opacity = decreaseBtn.disabled ? '0.5' : '1';
    increaseBtn.style.opacity = increaseBtn.disabled ? '0.5' : '1';
  }
  
  updateSizeButtons(); // Set initial state
  
  increaseBtn.onclick = () => {
    if (currentSizeValue < VISUAL_CONFIG.sizes.max) {
      currentSizeValue++;
      adjustNodeSize(node, 1);
      sizeIndicator.textContent = `Size: ${currentSizeValue}`;
      updateSizeButtons();
      computeVisuals(cy);
    }
  };
  
  decreaseBtn.onclick = () => {
    if (currentSizeValue > VISUAL_CONFIG.sizes.min) {
      currentSizeValue--;
      adjustNodeSize(node, -1);
      sizeIndicator.textContent = `Size: ${currentSizeValue}`;
      updateSizeButtons();
      computeVisuals(cy);
    }
  };

  // Reset colors button
  document.getElementById('resetColors').onclick = () => {
    // Reset to node type defaults (not global defaults)
    applyVisualChange(node, 'textColor', 'virgin', cy);
    applyVisualChange(node, 'floretColor', 'virgin', cy);
    
    // Update the dropdowns
    const textSelect = document.querySelector('#textColorControl select');
    const backgroundSelect = document.querySelector('#backgroundColorControl select');
    const textPreview = document.querySelector('#textColorControl .color-preview');
    const backgroundPreview = document.querySelector('#backgroundColorControl .color-preview');
    
    if (textSelect) textSelect.value = 'virgin';
    if (backgroundSelect) backgroundSelect.value = 'virgin';
    if (textPreview) textPreview.style.backgroundColor = getNodeTypeDefaults(nodeType).text;
    if (backgroundPreview) backgroundPreview.style.backgroundColor = getNodeTypeDefaults(nodeType).floret;
  };

  // Click outside modal closes it
  function outsideClickHandler(e) {
    if (!modal.contains(e.target)) {
      hideModal(modal.id);
      document.removeEventListener('mousedown', outsideClickHandler);
    }
  }
  document.addEventListener('mousedown', outsideClickHandler);
}

// Centralized visual change handler
function applyVisualChange(node, property, value, cy) {
  const nodeType = node.data('type') || 'assertion';
  
  switch (property) {
    case 'textColor':
      const textColor = value === 'virgin' ? 
        getNodeTypeDefaults(nodeType).text : 
        value;
      node.data('textColor', textColor);
      // Set a flag to prevent computeVisuals from overriding user choice
      node.data('userCustomTextColor', value !== 'virgin');
      break;
      
    case 'floretColor':
      // Legacy support - this just sets background color on current node
      const floretColor = value === 'virgin' ? 
        getNodeTypeDefaults(nodeType).floret : 
        value;
      node.data('floretColor', floretColor);
      node.data('userCustomFloretColor', value !== 'virgin');
      break;
      
    default:
      console.warn(`Unknown visual property: ${property}`);
      return;
  }
  
  computeVisuals(cy);
}

// Multi-node visual signals modal
export function openMultiVisualSignalsModal(nodes, cy) {
  hideModal('multi-visual-signals-modal');

  const modal = document.createElement('div');
  modal.id = 'multi-visual-signals-modal';
  modal.className = 'hidden';
  modal.style.position = 'fixed';
  modal.style.background = '#fff';
  modal.style.padding = '28px 28px 24px 28px';
  modal.style.border = '2px solid #1976d2';
  modal.style.borderRadius = '8px';
  modal.style.zIndex = 10001;
  modal.style.boxShadow = '0 6px 30px #1976d255';
  modal.style.minWidth = '420px';
  modal.style.maxWidth = '520px';

  // Get node type distribution
  const nodeTypes = {};
  nodes.forEach(node => {
    const type = node.data('type') || 'assertion';
    nodeTypes[type] = (nodeTypes[type] || 0) + 1;
  });
  
  const typeText = Object.entries(nodeTypes)
    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
    .join(', ');

  modal.innerHTML = `
    <div class="modal-title">
      Visual Signals for Multiple Nodes
      <button class="close-btn" id="closeMultiVisualSignalsModal">&times;</button>
    </div>
    
    <div style="margin-bottom: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
      <strong>Selection:</strong> ${nodes.length} nodes (${typeText})
    </div>
    
    <div class="control-section">
      <h4>Node Size</h4>
      <div class="size-controls">
        <button class="size-button" id="multiDecreaseNodeSize">−</button>
        <span style="margin: 0 10px; font-weight: 500;">Adjust All</span>
        <button class="size-button" id="multiIncreaseNodeSize">+</button>
      </div>
      <div style="font-size: 11px; color: #666; margin-top: 6px;">
        Range: ${VISUAL_CONFIG.sizes.min}–${VISUAL_CONFIG.sizes.max} (default: ${VISUAL_CONFIG.sizes.default})
      </div>
    </div>
    
    <div class="control-section">
      <h4>Colors</h4>
      <div style="font-size: 12px; color: #666; margin-bottom: 10px;">
        Apply colors to all selected nodes (respects individual node type defaults for "Standard Shade")
      </div>
      <div id="multiTextColorControl"></div>
      <div id="multiBackgroundColorControl" style="margin-top: 10px;"></div>
      <button id="multiResetColors" class="reset-btn" style="margin-top: 8px;">Reset All to Node Type Defaults</button>
    </div>
  `;

  showModal(modal);
  centerModal(modal);
  makeDraggable(modal, '.modal-title');

  // Add color controls for multi-select (no specific node type since it's mixed)
  const multiTextColorControl = createMultiColorControl('Text:', (color) => {
    nodes.forEach(node => {
      applyVisualChange(node, 'textColor', color, cy);
    });
  });
  
  const multiBackgroundColorControl = createMultiColorControl('Background:', (color) => {
    nodes.forEach(node => {
      applyVisualChange(node, 'floretColor', color, cy);
    });
  });
  
  document.getElementById('multiTextColorControl').appendChild(multiTextColorControl);
  document.getElementById('multiBackgroundColorControl').appendChild(multiBackgroundColorControl);

  // Close button handler
  document.getElementById('closeMultiVisualSignalsModal').onclick = () => hideModal(modal.id);

  // Size control handlers
  document.getElementById('multiIncreaseNodeSize').onclick = () => {
    nodes.forEach(node => {
      const currentSize = node.data('sizeIndex') || VISUAL_CONFIG.sizes.default;
      if (currentSize < VISUAL_CONFIG.sizes.max) {
        adjustNodeSize(node, 1);
      }
    });
    computeVisuals(cy);
  };
  
  document.getElementById('multiDecreaseNodeSize').onclick = () => {
    nodes.forEach(node => {
      const currentSize = node.data('sizeIndex') || VISUAL_CONFIG.sizes.default;
      if (currentSize > VISUAL_CONFIG.sizes.min) {
        adjustNodeSize(node, -1);
      }
    });
    computeVisuals(cy);
  };

  // Reset colors button
  document.getElementById('multiResetColors').onclick = () => {
    nodes.forEach(node => {
      applyVisualChange(node, 'textColor', 'virgin', cy);
      applyVisualChange(node, 'floretColor', 'virgin', cy);
    });
  };

  // Click outside modal closes it
  function outsideClickHandler(e) {
    if (!modal.contains(e.target)) {
      hideModal(modal.id);
      document.removeEventListener('mousedown', outsideClickHandler);
    }
  }
  document.addEventListener('mousedown', outsideClickHandler);
}

// Create color control for multi-node selection (no specific node type)
function createMultiColorControl(labelText, onchange) {
  const container = document.createElement('div');
  container.className = 'color-control';
  
  const label = document.createElement('label');
  label.textContent = labelText;
  
  const pickerContainer = document.createElement('div');
  pickerContainer.className = 'color-picker-container';
  
  const preview = createColorPreview('#ccc'); // Neutral preview for multi-select
  
  const select = document.createElement('select');
  VISUAL_CONFIG.colors.presets.forEach(preset => {
    const option = document.createElement('option');
    option.value = preset.value;
    option.textContent = preset.name;
    select.appendChild(option);
  });
  
  select.onchange = (e) => {
    const newColor = e.target.value;
    // For multi-select, show a neutral color in preview
    const displayColor = newColor === 'virgin' ? '#ccc' : newColor;
    preview.style.backgroundColor = displayColor;
    onchange(newColor);
  };
  
  pickerContainer.appendChild(preview);
  pickerContainer.appendChild(select);
  container.appendChild(label);
  container.appendChild(pickerContainer);
  
  return container;
}


// --- Notes Modal ---
export function openNotesModal(node) {
  hideModal('notes-modal');

  const modal = document.createElement('div');
  modal.id = 'notes-modal';
  modal.className = 'hidden';
  modal.style.position = 'fixed';
  modal.style.background = '#fff';
  modal.style.padding = '24px 20px 18px 20px';
  modal.style.border = '2px solid #1976d2';
  modal.style.borderRadius = '8px';
  modal.style.zIndex = 10001;
  modal.style.boxShadow = '0 6px 30px #1976d255';
  modal.style.minWidth = '360px';

  // Title
  const title = document.createElement('div');
  title.textContent = 'View/Edit Notes';
  title.className = 'modal-title';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '12px';
  modal.appendChild(title);
  makeDraggable(modal, ".modal-title");

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.minHeight = '60px';
  textarea.style.fontSize = '14px';
  textarea.style.border = '1px solid #bbb';
  textarea.style.borderRadius = '4px';
  textarea.value = node.data('notes') || '';
  modal.appendChild(textarea);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.margin = '14px 10px 0 0';
  saveBtn.onclick = function() {
    node.data('notes', textarea.value.trim());
    hideModal(modal.id);
  };
  modal.appendChild(saveBtn);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = function() {
    hideModal(modal.id);
  };
  modal.appendChild(cancelBtn);

  // ESC key closes modal
  const escListener = (e) => {
    if (e.key === "Escape") {
      hideModal(modal.id);
      window.removeEventListener('keydown', escListener);
    }
  };
  window.addEventListener('keydown', escListener);

  showModal(modal);
  textarea.focus();
}

// --- Rationale Modal (for edge or node) ---
export function openRationaleModal(element, type) {
  hideModal('rationale-modal');

  const modal = document.createElement('div');
  modal.id = 'rationale-modal';
  modal.className = 'hidden';
  modal.style.position = 'fixed';
  modal.style.background = '#fff';
  modal.style.padding = '24px 20px 18px 20px';
  modal.style.border = '2px solid #2e7d32';
  modal.style.borderRadius = '8px';
  modal.style.zIndex = 10001;
  modal.style.boxShadow = '0 6px 30px #2e7d3255';
  modal.style.minWidth = '360px';

  // Title
  const title = document.createElement('div');
  title.textContent = 'View/Edit Rationale';
  title.className = 'modal-title';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '12px';
  modal.appendChild(title);
  makeDraggable(modal, ".modal-title");

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.minHeight = '60px';
  textarea.style.fontSize = '14px';
  textarea.style.border = '1px solid #bbb';
  textarea.style.borderRadius = '4px';
  textarea.value = element.data('rationale') || '';
  modal.appendChild(textarea);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.margin = '14px 10px 0 0';
  saveBtn.onclick = function() {
    element.data('rationale', textarea.value.trim());
    hideModal(modal.id);
  };
  modal.appendChild(saveBtn);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = function() {
    hideModal(modal.id);
  };
  modal.appendChild(cancelBtn);

  // ESC key closes modal
  const escListener = (e) => {
    if (e.key === "Escape") {
      hideModal(modal.id);
      window.removeEventListener('keydown', escListener);
    }
  };
  window.addEventListener('keydown', escListener);

  showModal(modal);
  textarea.focus();
}

// --- CPT Modal (Bayes) ---
export function openCPTModalTwoPerParent({ node, parentId, existing, onSave, onPrev }) {
  hideModal('cpt-modal');

  const modal = document.createElement('div');
  modal.id = 'cpt-modal';
  modal.className = 'hidden';
  modal.style.position = 'fixed';
  modal.style.background = '#fff';
  modal.style.padding = '24px 24px 18px 24px';
  modal.style.border = '2px solid #1976d2';
  modal.style.borderRadius = '8px';
  modal.style.zIndex = 10001;
  modal.style.boxShadow = '0 6px 30px #1976d255';
  modal.style.minWidth = '350px';

  // Title
  const title = document.createElement('div');
  title.textContent = `Set Conditional Probabilities (Node: ${node.id()}, Parent: ${parentId})`;
  title.className = 'modal-title';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '14px';
  modal.appendChild(title);
  makeDraggable(modal, ".modal-title");

  // Probability for parent 0
  const p0label = document.createElement('label');
  p0label.textContent = `P(${node.id()}=Yes | ${parentId}=No):`;
  p0label.style.display = 'block';
  modal.appendChild(p0label);
  const p0input = document.createElement('input');
  p0input.type = 'number';
  p0input.min = 0;
  p0input.max = 1;
  p0input.step = 0.01;
  p0input.value = existing?.p0 ?? '';
  modal.appendChild(p0input);

  // Probability for parent 1
  const p1label = document.createElement('label');
  p1label.textContent = `P(${node.id()}=Yes | ${parentId}=Yes):`;
  p1label.style.display = 'block';
  p1label.style.marginTop = '8px';
  modal.appendChild(p1label);
  const p1input = document.createElement('input');
  p1input.type = 'number';
  p1input.min = 0;
  p1input.max = 1;
  p1input.step = 0.01;
  p1input.value = existing?.p1 ?? '';
  modal.appendChild(p1input);

  // Save and Prev/Cancel buttons
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.margin = '10px 10px 0 0';

  saveBtn.onclick = function() {
    const p0 = parseFloat(p0input.value);
    const p1 = parseFloat(p1input.value);
    if (isNaN(p0) || isNaN(p1)) return;
    hideModal(modal.id);
    if (typeof onSave === 'function') onSave({ p0, p1 });
  };
  modal.appendChild(saveBtn);

  if (onPrev) {
    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Prev';
    prevBtn.style.margin = '10px 10px 0 0';
    prevBtn.onclick = function() {
      hideModal(modal.id);
      if (typeof onPrev === 'function') onPrev();
    };
    modal.appendChild(prevBtn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = function() {
    hideModal(modal.id);
  };
  modal.appendChild(cancelBtn);

  // ESC key closes modal
  const escListener = (e) => {
    if (e.key === "Escape") {
      hideModal(modal.id);
      window.removeEventListener('keydown', escListener);
    }
  };
  window.addEventListener('keydown', escListener);

  showModal(modal);
  p0input.focus();
}

// === Modal Utility Functions ===

// Center modal in viewport (call after appending to body)
function centerModal(modal) {
  modal.style.left = "0px";
  modal.style.top = "0px";
  modal.style.display = "block";
  const { innerWidth, innerHeight } = window;
  const rect = modal.getBoundingClientRect();
  modal.style.left = Math.round((innerWidth - rect.width) / 2) + "px";
  modal.style.top = Math.round((innerHeight - rect.height) / 2) + "px";
}

// Make modal draggable by handle (title bar or full modal)
function makeDraggable(modal, handleSelector = null) {
  let isDragging = false, startX, startY, origX, origY;
  const handle = handleSelector ? modal.querySelector(handleSelector) : modal;
  if (!handle) return;

  handle.style.cursor = "move";
  handle.onmousedown = function(e) {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = modal.getBoundingClientRect();
    modal.style.left = rect.left + "px";
    modal.style.top  = rect.top + "px";
    origX = rect.left;
    origY = rect.top;
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  document.onmousemove = function(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    modal.style.left = (origX + dx) + "px";
    modal.style.top  = (origY + dy) + "px";
  };

  document.onmouseup = function() {
    isDragging = false;
    document.body.style.userSelect = "";
  };
}

// --- Contributing Factors Modal (for edges) ---
export function openContributingFactorsModal(edge) {
  hideModal('contributing-factors-modal');

  const modal = document.createElement('div');
  modal.id = 'contributing-factors-modal';
  modal.className = 'hidden';
  modal.style.position = 'fixed';
  modal.style.background = '#fff';
  modal.style.padding = '24px 20px 18px 20px';
  modal.style.border = '2px solid #2e7d32';
  modal.style.borderRadius = '8px';
  modal.style.zIndex = 10001;
  modal.style.boxShadow = '0 6px 30px #2e7d3255';
  modal.style.minWidth = '400px';
  modal.style.maxWidth = '500px';

  // Title
  const title = document.createElement('div');
  title.textContent = 'Edit Contributing Factors';
  title.className = 'modal-title';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '12px';
  modal.appendChild(title);
  makeDraggable(modal, ".modal-title");

  // Instructions
  const instructions = document.createElement('div');
  instructions.textContent = 'Enter contributing factors (one per line):';
  instructions.style.fontSize = '14px';
  instructions.style.color = '#666';
  instructions.style.marginBottom = '10px';
  modal.appendChild(instructions);

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.minHeight = '120px';
  textarea.style.fontSize = '14px';
  textarea.style.border = '1px solid #bbb';
  textarea.style.borderRadius = '4px';
  textarea.style.padding = '8px';
  textarea.style.lineHeight = '1.4';
  textarea.placeholder = 'Example:\n• Additional consideration A\n• Caveat B';
  
  // Get existing contributing factors (stored as array of strings)
  const existingFactors = edge.data('contributingFactors') || [];
  textarea.value = existingFactors.join('\n');
  modal.appendChild(textarea);

  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.marginTop = '14px';
  
  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.marginRight = '10px';
  saveBtn.onclick = function() {
    const text = textarea.value.trim();
    if (text) {
      // Split by lines and filter out empty lines
      const factors = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      edge.data('contributingFactors', factors);
    } else {
      edge.removeData('contributingFactors');
    }
    hideModal(modal.id);
  };
  buttonContainer.appendChild(saveBtn);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = function() {
    hideModal(modal.id);
  };
  buttonContainer.appendChild(cancelBtn);
  
  modal.appendChild(buttonContainer);

  // ESC key closes modal
  const escListener = (e) => {
    if (e.key === "Escape") {
      hideModal(modal.id);
      window.removeEventListener('keydown', escListener);
    }
  };
  window.addEventListener('keydown', escListener);

  showModal(modal);
  textarea.focus();
}
