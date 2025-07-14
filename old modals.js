// modals.js
// All modal popup creation and event handling logic

export function showModal(options) {
  // ...main modal show logic here (template string, insert, show)...
}
export function hideModal() {
  // ...hide and cleanup logic...
}

// Node label edit modal
export function openEditNodeLabelModal(node) {
  // Node label edit modal logic
  const prevModal = document.getElementById('node-label-modal');
  if (prevModal) prevModal.remove();
  const modal = document.createElement('div');
  modal.id = 'node-label-modal';
  modal.className = 'node-label-modal';
  const label = document.createElement('div');
  label.textContent = 'Edit node label:';
  label.className = 'node-label-modal-title';
  label.style.marginBottom = '10px';
  modal.appendChild(label);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = node.data('origLabel') || node.data('label') || '';
  input.style.width = '220px';
  modal.appendChild(input);
  const btn = document.createElement('button');
  btn.textContent = 'OK';
  btn.style.margin = '10px 5px 0 0';
  btn.onclick = function () {
    node.data('origLabel', input.value);
    node.data('label', input.value);
    node.removeData('isVirgin');
    setTimeout(() => {
      if (window.convergeAll) window.convergeAll({ cy: window.cy });
      if (window.computeVisuals) window.computeVisuals(window.cy);
    }, 0);
    document.body.removeChild(modal);
  };
  modal.appendChild(btn);
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.onclick = function () {
    document.body.removeChild(modal);
  };
  modal.appendChild(cancel);
  document.body.appendChild(modal);
  input.focus();
}

// Visual Signals modal
export function openVisualSignalsModal(node) {
  // Visual Signals modal logic
  // Placeholder: implement your modal UI here
  alert('Visual Signals modal for node ' + node.id());
}

// Notes modal
export function openNotesModal(node) {
  // Notes modal logic
  // Placeholder: implement your modal UI here
  alert('Notes modal for node ' + node.id());
}

// Rationale modal
export function openRationaleModal(element, type) {
  // Rationale modal logic
  // Placeholder: implement your modal UI here
  alert('Rationale modal for ' + type + ' ' + element.id());
}

// CPT modal (Bayes)
export function openCPTModalTwoPerParent({ node, parentId, existing, onSave, onPrev }) {
  // CPT modal logic (Bayes)
  // Placeholder: implement your modal UI here
  alert('CPT modal for node ' + node.id() + ' and parent ' + parentId);
  if (typeof onSave === 'function') onSave({ p0: null, p1: null });
}

// Modifier modal for edge editing
export function openModifierModal(edge) {
  // Modifier modal for edge editing
  // Placeholder: implement your modal UI here
  alert('Modifier modal for edge ' + edge.id());
}
