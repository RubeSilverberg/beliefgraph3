console.log("Loaded menu.js");
import { wouldCreateCycle, propagateBayesLite } from './logic.js';
import { openVisualSignalsModal } from './modals.js';
export function setupMenuAndEdgeModals({
  cy,
  propagateBayesLite,
  computeVisuals,
  openNotesModal,
  openRationaleModal,
  NODE_TYPE_ASSERTION,
  NODE_TYPE_FACT,
  NODE_TYPE_AND,
  NODE_TYPE_OR,
  NODE_TYPE_NOTE
}) {
    cy.container().addEventListener('contextmenu', function(e) {
  e.stopPropagation();
  e.preventDefault();
  return false;
}, true);

  // --- Menu DOM Setup ---
  let menu = document.getElementById('menu');
  let list = document.getElementById('menu-list');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'menu';
    menu.style.position = 'fixed';
    menu.style.background = '#fff';
    menu.style.border = '1px solid #aaa';
    menu.style.padding = '4px 0';
    menu.style.zIndex = 9999;
    menu.style.minWidth = '220px';
    menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    menu.style.display = 'none';
    document.body.appendChild(menu);
  }
// Double-click (double-tap) event listener for node label editing
window.cy.on('doubleTap', 'node', function(event) {
  openEditNodeLabelModal(event.target);
});


  if (!list) {
    list = document.createElement('ul');
    list.id = 'menu-list';
    list.style.listStyle = 'none';
    list.style.padding = '0';
    list.style.margin = '0';
    menu.appendChild(list);
  }

  // Suppress browser's native right-click menu on Cytoscape canvas
  cy.container().addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
  });

  // --- Robust hideMenu and outside-click handler ---
  let closeListener = null;

  function hideMenu() {
    menu.style.display = 'none';
    list.innerHTML = '';
    if (closeListener) {
      document.removeEventListener('click', closeListener, true);
      document.removeEventListener('contextmenu', closeListener, true);
      closeListener = null;
    }
  }

  let pendingEdgeSource = null;
  let lastTappedEdge = null;
  let lastEdgeTapTime = 0;

  cy.on('cxttap', evt => {
    // Allow context menu in heavy mode for note nodes, but restrict other functionality
    const isHeavyMode = window.getBayesMode && window.getBayesMode() === 'heavy';
    const isNoteNode = evt.target.isNode && evt.target.isNode() && evt.target.data('type') === NODE_TYPE_NOTE;
    
    // In heavy mode, only allow menu for note nodes
    if (isHeavyMode && !isNoteNode) return;
    
    console.log('cxttap fired');
    evt.originalEvent.preventDefault();
    evt.originalEvent.stopPropagation();
    hideMenu();

    const pos = evt.renderedPosition;
    const rect = cy.container().getBoundingClientRect();
    const x = rect.left + pos.x;
    const y = rect.top + pos.y;

    // --- Menu options construction ---
    if (evt.target === cy) {
      [
        {
          label: 'Add Node Here', action: () => {
            if (window.getBayesMode && window.getBayesMode() === 'heavy') return;
            cy.add({
              group: 'nodes',
              data: {
                id: 'node' + Date.now(),
                origLabel: 'New Belief',
                label: 'New Belief',
                type: NODE_TYPE_ASSERTION, // Will be auto-updated by autoUpdateNodeTypes
                isVirgin: true,
                 width: 60,       // <<-- add this
                 height: 36       // <<-- add this (60 * 0.6)
              },
              position: evt.position
            });
            // Ensure clean state for new assertion nodes
            setTimeout(() => {
              const newNode = cy.nodes().last();
              newNode.removeData('prob');
              newNode.removeData('robustness');
              newNode.removeData('robustnessLabel');
              (window.propagateBayesLite || propagateBayesLite)({ cy });
              computeVisuals(cy);
            }, 0);
          }
        },
        {
          label: 'Add logic', action: () => {
            if (window.getBayesMode && window.getBayesMode() === 'heavy') return;
            cy.add({
              group: 'nodes',
              data: {
                id: 'node' + Date.now(),
                origLabel: 'Logic node',
                type: NODE_TYPE_AND
              },
              position: evt.position
            });
            (window.propagateBayesLite || propagateBayesLite)({ cy });
            computeVisuals(cy);
          }
        }
      ].forEach(({ label, action }) => {
        const li = document.createElement('li');
        li.textContent = label;
        li.style.cursor = 'pointer';
        li.onclick = () => { action(); hideMenu(); };
        list.appendChild(li);
      });

    } else if (evt.target.isNode && evt.target.isNode()) {
      const node = evt.target;
      const nodeType = node.data('type');

      // Special case for note nodes: simplified menu
      if (nodeType === NODE_TYPE_NOTE) {
        const visualItem = document.createElement('li');
        visualItem.textContent = 'Visual Signals...';
        visualItem.style.cursor = 'pointer';
        visualItem.onclick = () => {
          openVisualSignalsModal(node);
          hideMenu();
        };
        list.appendChild(visualItem);

        const deleteItem = document.createElement('li');
        deleteItem.textContent = 'Delete Note';
        deleteItem.style.cursor = 'pointer';
        deleteItem.onclick = () => {
          node.remove();
          setTimeout(() => { computeVisuals(cy); }, 0);
          hideMenu();
        };
        list.appendChild(deleteItem);
        
        // Position and show the menu
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = 'block';

        // Set up outside-click handler to hide menu
        setTimeout(() => {
          closeListener = (e) => {
            if (!menu.contains(e.target)) hideMenu();
          };
          document.addEventListener('click', closeListener, true);
          document.addEventListener('contextmenu', closeListener, true);
        }, 0);
        
        // Exit early - no other options for note nodes  
        return;
      }

      // === Regular node menu items (non-notes) ===

      // === Regular node menu items (non-notes) ===

      // Only allow connections for non-note nodes
      const startEdge = document.createElement('li');
      startEdge.textContent = 'Connect to...';
      startEdge.style.cursor = 'pointer';
      startEdge.onclick = () => { pendingEdgeSource = node; hideMenu(); };
      list.appendChild(startEdge);

      // Logic node type conversion (AND/OR)
      if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
        const toggleLogic = document.createElement('li');
        toggleLogic.textContent = nodeType === NODE_TYPE_AND ? 'Convert to OR Node' : 'Convert to AND Node';
        toggleLogic.style.cursor = 'pointer';
        toggleLogic.onclick = () => {
          const newType = nodeType === NODE_TYPE_AND ? NODE_TYPE_OR : NODE_TYPE_AND;
          node.data({ type: newType });
          (window.propagateBayesLite || propagateBayesLite)({ cy });
          computeVisuals(cy);
          hideMenu();
        };
        list.appendChild(toggleLogic);
      }

      const visualSignalsItem = document.createElement('li');
      visualSignalsItem.textContent = 'Visual Signals...';
      visualSignalsItem.style.cursor = 'pointer';
      visualSignalsItem.onclick = () => {
        openVisualSignalsModal(node, cy);
        hideMenu();
      };
      list.appendChild(visualSignalsItem);

      const notesItem = document.createElement('li');
      notesItem.textContent = 'View/Edit Notes...';
      notesItem.style.cursor = 'pointer';
      notesItem.onclick = () => {
        openNotesModal(node);
        hideMenu();
      };
      list.appendChild(notesItem);

      const del = document.createElement('li');
      del.textContent = 'Delete Node';
      del.style.cursor = 'pointer';
      del.onclick = () => {
        if (window.getBayesMode && window.getBayesMode() === 'heavy') return;
        selectedNodes.forEach(node => node.remove());
        (window.propagateBayesLite || propagateBayesLite)({ cy });
        computeVisuals(cy);
        hideMenu();
      };
      list.appendChild(del);

    } else if (evt.target.isEdge && evt.target.isEdge()) {
      const edge = evt.target;
      const targetNode = edge.target();
      const targetType = targetNode.data('type');

      const rationaleItem = document.createElement('li');
      rationaleItem.textContent = 'View/Edit Rationale...';
      rationaleItem.style.cursor = 'pointer';
      rationaleItem.onclick = () => {
        openRationaleModal(edge, "edge");
        hideMenu();
      };
      list.appendChild(rationaleItem);

      const del = document.createElement('li');
      del.textContent = 'Delete This Edge';
      del.style.cursor = 'pointer';
      del.onclick = () => {
        if (window.getBayesMode && window.getBayesMode() === 'heavy') return;
        edge.remove();
        propagateBayesLite({ cy });
        cy.nodes().forEach(node => {
          const inc = node.incomers('edge').filter(e => {
            // Check if edge is virgin based on current mode
            const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';
            const nodeType = node.data('type');
            
            if (bayesMode === 'heavy') {
              const cpt = e.data('cpt');
              return cpt && typeof cpt.baseline === 'number';
            } else {
              const parentProb = e.source().data('prob');
              const edgeWeight = e.data('weight');
              
              // Special case: edges TO and/or nodes are never virgin if parent has probability
              if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
                return typeof parentProb === "number";
              } else {
                return typeof parentProb === "number" && edgeWeight && edgeWeight !== 0;
              }
            }
          });
          if (node.data('type') === NODE_TYPE_ASSERTION && inc.length === 0) {
            node.removeData('prob');
            node.removeData('robustness');
            node.removeData('robustnessLabel');
          }
        });
        computeVisuals(cy);
        hideMenu();
      };
      list.appendChild(del);
    }

    // --- Show menu and set up outside-click handler ---
    if (list.childNodes.length) {
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.style.display = 'block';

      setTimeout(() => {
        closeListener = function(event) {
          if (!menu.contains(event.target)) {
            hideMenu();
          }
        };
        document.addEventListener('click', closeListener, true);
        document.addEventListener('contextmenu', closeListener, true);
      }, 0);
    }
  });

  // Handle edge creation after "Connect to..." is activated
  cy.on('tap', evt => {
    if (window.getBayesMode && window.getBayesMode() === 'heavy') return;
    if (!pendingEdgeSource) return;
    const target = evt.target;
    // Must click a node, and not the same node, and not a note node
    if (!target.isNode() || target.id() === pendingEdgeSource.id() || target.data('type') === NODE_TYPE_NOTE) {
      pendingEdgeSource = null;
      return;
    }

    // --- CYCLE PREVENTION GOES HERE ---
    const sourceId = pendingEdgeSource.id();
    const targetId = target.id();
    if (wouldCreateCycle(cy, sourceId, targetId)) {
      alert('Adding this edge would create a cycle (closed loop), which is not allowed.');
      pendingEdgeSource = null;
      return;
    }

    // Determine type and create the edge
    const targetType = target.data('type');
    let edgeData = {
      source: pendingEdgeSource.id(),
      target: target.id(),
      rationale: ""
    };
    if (targetType === NODE_TYPE_ASSERTION) {
      edgeData.weight = 0; // Virgin edge - no influence until user sets weight
      edgeData.type = "supports";
    } else if (targetType === NODE_TYPE_AND || targetType === NODE_TYPE_OR) {
      // Logic nodes don't use weights - they use deterministic logic
      // No weight needed, edge is automatically non-virgin if parent has probability
      edgeData.type = "supports";
    }

    cy.add({ group: 'edges', data: edgeData });
    pendingEdgeSource = null;
    (window.propagateBayesLite || propagateBayesLite)({ cy });
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
    computeVisuals(cy);
  });

  // --- Double-Tap Edge for Editing Influence/Modifier ---
// --- Double-Click Edge for Editing Influence/Modifier ---
cy.on('dblclick', 'edge', evt => {
  if (window.getBayesMode && window.getBayesMode() === 'heavy') {
    // Open Bayes modal for this edge
    window.openBayesModalForEdge
      ? window.openBayesModalForEdge(evt.target)
      : alert('Bayes modal not wired yet.');
    return;
  }
  const edge = evt.target;
  const targetNode = edge.target();
  const targetType = targetNode.data('type');

  // Always remove any existing modifier modal
  const prevModal = document.getElementById('modifier-modal');
  if (prevModal) prevModal.remove();

  const modal = document.createElement('div');
  modal.id = 'modifier-modal';
  modal.className = 'modifier-modal';
  modal.style.position = 'fixed';
  modal.style.background = '#fff';
  modal.style.border = '1px solid #aaa';
  modal.style.padding = '16px';
  modal.style.zIndex = 10001;
  modal.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
  modal.style.left = 'calc(50vw - 160px)';
  modal.style.top = 'calc(50vh - 90px)';
  modal.style.minWidth = '300px';

  const label = document.createElement('div');
  label.textContent = 'Set weight:';
  label.className = "modifier-modal-title";
  label.style.marginBottom = '10px';
  modal.appendChild(label);
  makeDraggable(modal, '.modifier-modal-title');

  // Opposing checkbox (always present)
  const opposesContainer = document.createElement('div');
  opposesContainer.style.marginBottom = '8px';
  const opposesCheckbox = document.createElement('input');
  opposesCheckbox.type = 'checkbox';
  opposesCheckbox.id = 'opposes-checkbox';
  opposesCheckbox.checked = !!edge.data('opposes');
  const opposesLabel = document.createElement('label');
  opposesLabel.textContent = "Opposing ('not') influence";
  opposesLabel.htmlFor = 'opposes-checkbox';
  opposesContainer.appendChild(opposesCheckbox);
  opposesContainer.appendChild(opposesLabel);
  modal.appendChild(opposesContainer);

  let select;
  if (targetType === NODE_TYPE_ASSERTION) {
    select = document.createElement('select');
    select.style.marginBottom = '10px';
    const options = [
      { label: "Maximal", value: 1 },
      { label: "Strong", value: 0.85 },
      { label: "Moderate", value: 0.60 },
      { label: "Small", value: 0.35 },
      { label: "Minimal", value: 0.15 }
    ];
    const currentAbs = Math.abs(edge.data('weight') ?? 0.15);
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (Math.abs(currentAbs - opt.value) < 0.01) o.selected = true;
      select.appendChild(o);
    });
    modal.appendChild(select);
  }

  const btn = document.createElement('button');
  btn.textContent = 'OK';
  btn.style.margin = '10px 5px 0 0';
  btn.onclick = function () {
    const opposes = opposesCheckbox.checked;

    if (targetType === NODE_TYPE_ASSERTION && select) {
      const prevWeight = edge.data('weight');
      const val = parseFloat(select.value);
      edge.data('weight', val);
      edge.data('absWeight', Math.abs(val));


      if (prevWeight !== val) {
        // Weight changed, trigger recomputation
      }
    } else {
      // Non-assertion edge logic
    }

    if (opposes) {
      edge.data('opposes', true);
      edge.data('type', 'opposes');
    } else {
      edge.removeData('opposes');
      edge.data('type', 'supports');
    }

    document.body.removeChild(modal);
    setTimeout(() => {
      (window.propagateBayesLite || propagateBayesLite)({ cy });
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
      computeVisuals(cy);
    }, 0);
  };

  modal.appendChild(btn);

  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.onclick = function () {
    document.body.removeChild(modal);
  };
  modal.appendChild(cancel);

  document.body.appendChild(modal);

  if (select) select.focus();
});
}
// --- Make modal draggable by handle (title bar or full modal)
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
