console.log("Loaded menu.js");
import { wouldCreateCycle } from './logic.js';
import { openVisualSignalsModal, openContributingFactorsModal, openDoCalculusModal } from './modals.js';
export function setupMenuAndEdgeModals({
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
  let activePeerSubMenu = null; // track open Peer Relations submenu to prevent permanence bugs

  function hideMenu() {
    menu.style.display = 'none';
    list.innerHTML = '';
    // ensure any open peer submenu is removed
    if (activePeerSubMenu) { try { activePeerSubMenu.remove(); } catch(_){} activePeerSubMenu = null; }
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
  // Always show menu; selectively disable structural actions in heavy mode
  const isHeavyMode = window.getBayesMode && window.getBayesMode() === 'heavy';
    
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
          label: 'Add Statement Here (N)', action: () => {
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
              convergeAll({ cy });
              computeVisuals(cy);
            }, 0);
          }
        },
        {
          label: 'Add Logic', action: () => {
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
            convergeAll({ cy });
            computeVisuals(cy);
          }
        },
        {
          label: 'Add Note Here', action: () => {
            if (window.textAnnotations) {
              // Convert Cytoscape model coords -> rendered pixels -> page coords
              const z = cy.zoom();
              const pan = cy.pan();
              const rect = cy.container().getBoundingClientRect();
              const renderedX = evt.position.x * z + pan.x;
              const renderedY = evt.position.y * z + pan.y;
              const pageX = rect.left + renderedX;
              const pageY = rect.top + renderedY;

              const annotation = window.textAnnotations.createAnnotation(pageX, pageY, 'New note');
              // Auto-edit the new annotation
              setTimeout(() => {
                window.textAnnotations.editAnnotation(annotation);
              }, 10);
            } else {
              console.warn('Text annotations system not available');
            }
          }
        }
      ].forEach(({ label, action }) => {
        const li = document.createElement('li');
        li.textContent = label;
        li.style.cursor = 'pointer';
        if (isHeavyMode && (label === 'Add Statement Here (N)' || label === 'Add Logic')) {
          li.style.opacity = '0.5';
          li.title = 'Disabled in Bayes Heavy mode';
        }
        li.onclick = () => { action(); hideMenu(); };
        list.appendChild(li);
      });

      // Heavy mode utility: Do-Calculus quick query
      if (isHeavyMode) {
        const doCalcItem = document.createElement('li');
        doCalcItem.textContent = 'Do-Calculus (Intervene/Query)';
        doCalcItem.style.cursor = 'pointer';
        doCalcItem.onclick = () => { openDoCalculusModal(cy); hideMenu(); };
        list.appendChild(doCalcItem);
      }


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
          computeVisuals(cy);
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

      // NOTE: "Connect to..." functionality replaced by edgehandles extension
      // Only allow connections for non-note nodes
      // const startEdge = document.createElement('li');
      // startEdge.textContent = 'Connect to...';
      // startEdge.style.cursor = 'pointer';
      // startEdge.onclick = () => { pendingEdgeSource = node; hideMenu(); };
      // list.appendChild(startEdge);

      // Logic node type conversion (AND/OR)
      if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
        const toggleLogic = document.createElement('li');
        toggleLogic.textContent = nodeType === NODE_TYPE_AND ? 'Convert to OR Node' : 'Convert to AND Node';
        toggleLogic.style.cursor = 'pointer';
        if (isHeavyMode) { toggleLogic.style.opacity = '0.5'; toggleLogic.title = 'Disabled in Bayes Heavy mode'; }
        toggleLogic.onclick = () => {
      if (window.getBayesMode && window.getBayesMode() === 'heavy') return; // disable structural edit in heavy
          const newType = nodeType === NODE_TYPE_AND ? NODE_TYPE_OR : NODE_TYPE_AND;
          node.data({ type: newType });
          convergeAll({ cy });
          computeVisuals(cy);
          hideMenu();
        };
        list.appendChild(toggleLogic);
      }

      // Fact-only: inert toggle (prevents outgoing propagation while retaining displayed probability)
      if (nodeType === NODE_TYPE_FACT) {
        const mode = window.getBayesMode ? window.getBayesMode() : 'lite';
        const flag = mode === 'heavy' ? 'inertFactHeavy' : 'inertFact';
        const inert = !!node.data(flag);
        const toggleInert = document.createElement('li');
        toggleInert.textContent = inert ? 'Make Fact Active (propagate)' : 'Make Fact Inert';
        toggleInert.style.cursor = 'pointer';
        toggleInert.onclick = () => {
          if (inert) {
            node.removeData(flag);
          } else {
            node.data(flag, true);
          }
          // Recompute so children drop/add this parent contribution
          convergeAll({ cy });
            // Ensure assertion nodes with now-zero valid parents become virgin again
          computeVisuals(cy);
          hideMenu();
        };
        list.appendChild(toggleInert);
      }

      // --- Peer Relations (submenu with tooltip) ---
  if(window.startPeerRelationMode && nodeType !== NODE_TYPE_FACT && (!window.getBayesMode || window.getBayesMode() !== 'heavy')){
        function hideSubMenu(){ if(activePeerSubMenu){ try { activePeerSubMenu.remove(); } catch(_){} activePeerSubMenu = null; } }

        const peerItem = document.createElement('li');
        peerItem.textContent = 'Peer Relations...';
        peerItem.style.cursor = 'pointer';
        peerItem.title = 'The graph does not allow mutual relationships or completed cycles. Use this as alterntive.';
        peerItem.onclick = (e) => {
          e.stopPropagation();
          if(activePeerSubMenu){ hideSubMenu(); return; }
          // Build submenu
          const subMenuEl = document.createElement('div');
          subMenuEl.style.position = 'fixed';
          subMenuEl.style.background = '#fff';
          subMenuEl.style.border = '1px solid #aaa';
          subMenuEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          subMenuEl.style.zIndex = 10000;
          const ul = document.createElement('ul');
          ul.style.listStyle = 'none'; ul.style.margin = '0'; ul.style.padding = '4px 0';
          subMenuEl.appendChild(ul);

          function addSubItem(text, handler){
            const li = document.createElement('li');
            li.textContent = text; li.style.cursor='pointer'; li.style.whiteSpace='nowrap';
            li.onclick = () => { handler(); hideSubMenu(); hideMenu(); };
            ul.appendChild(li);
          }

          addSubItem('Set Alignment…', () => window.startPeerRelationMode({ cy, sourceNode: node, relation: 'aligned' }));
          addSubItem('Set Antagonism…', () => window.startPeerRelationMode({ cy, sourceNode: node, relation: 'antagonistic' }));
          if(window.listPeerRelations){
            addSubItem('Edit / Remove Peer Relations…', () => {
              const rels = window.listPeerRelations(node) || [];
              const dialog = document.createElement('div');
              dialog.style.position='fixed'; dialog.style.top='10%'; dialog.style.left='50%'; dialog.style.transform='translateX(-50%)';
              dialog.style.background='#fff'; dialog.style.padding='16px 20px'; dialog.style.border='1px solid #888'; dialog.style.borderRadius='8px'; dialog.style.zIndex=10000; dialog.style.maxWidth='360px'; dialog.style.font='14px/1.4 Arial,sans-serif';
              dialog.innerHTML = `<h3 style="margin:0 0 10px;font:600 16px Arial,sans-serif;">Relations for ${(node.data('displayLabel')||node.data('origLabel')||node.id())}</h3>`;
              if(!rels.length){ dialog.innerHTML += '<div style="color:#666;">None</div>'; }
              const LEVELS = [
                { label: 'Off', value: 0.00 },
                { label: 'Weak', value: 0.10 },
                { label: 'Moderate', value: 0.25 },
                { label: 'Strong', value: 0.35 },
                { label: 'Very strong', value: 0.50 }
              ];

              function nearestIndex(val){
                if(typeof val !== 'number' || isNaN(val)) return 1; // default to Weak
                let best = 0, bestD = Infinity;
                for(let i=0;i<LEVELS.length;i++){ const d = Math.abs(LEVELS[i].value - val); if(d < bestD){ best=i; bestD=d; } }
                return best;
              }

              rels.forEach(r=> {
                const row = document.createElement('div');
                row.style.display='grid'; row.style.gridTemplateColumns='auto 1fr auto'; row.style.gap='8px'; row.style.alignItems='center'; row.style.margin='6px 0';
                const peerNode = cy.getElementById(r.peerId);
                const name = (peerNode && (peerNode.data('displayLabel')||peerNode.data('origLabel')||peerNode.id())) || r.peerId;
                const color = r.relation==='aligned' ? '#2e7d32' : '#c62828';
                const tag = r.relation==='aligned' ? 'Align' : 'Antag';
                const left = document.createElement('div'); left.innerHTML = `<span style="color:${color};font-weight:600;">${tag}</span>`;
                const mid = document.createElement('div');
                const nameEl = document.createElement('div'); nameEl.textContent = name; nameEl.style.marginBottom='4px';
                const sliderWrap = document.createElement('div');
                sliderWrap.style.display='flex';
                sliderWrap.style.flexDirection='column';
                sliderWrap.style.alignItems='stretch';
                sliderWrap.style.gap='4px';
                const lbl = document.createElement('span'); lbl.style.fontSize='12px'; lbl.style.color='#555';
                const slider = document.createElement('input');
                slider.type='range';
                slider.min='0';
                slider.max=String(LEVELS.length-1);
                slider.step='1';
                slider.style.width='100%';
                const initIdx = nearestIndex(r.strength ?? 0);
                slider.value = String(initIdx);
                lbl.textContent = `Strength: ${LEVELS[initIdx].label}`;
                slider.addEventListener('input', () => {
                  const idx = Number(slider.value) | 0;
                  const chosen = LEVELS[idx] || LEVELS[0];
                  lbl.textContent = `Strength: ${chosen.label}`;
                  if(window.setPeerRelationStrength){ window.setPeerRelationStrength(node, peerNode, chosen.value); }
                  if(window.applyPeerInfluence) window.applyPeerInfluence(cy);
                  if(window.computeVisuals) window.computeVisuals(cy);
                });
                sliderWrap.appendChild(lbl); sliderWrap.appendChild(slider);
                mid.appendChild(nameEl); mid.appendChild(sliderWrap);
                const btn = document.createElement('button'); btn.textContent='Remove'; btn.style.fontSize='12px'; btn.onclick=()=> { if(window.removePeerRelation){ window.removePeerRelation(node, peerNode); if(window.applyPeerInfluence) window.applyPeerInfluence(cy); if(window.computeVisuals) window.computeVisuals(cy); dialog.remove(); } };
                row.appendChild(left); row.appendChild(mid); row.appendChild(btn); dialog.appendChild(row);
              });
              const controls = document.createElement('div'); controls.style.marginTop='12px'; controls.style.display='flex'; controls.style.flexWrap='wrap'; controls.style.gap='8px';
              const clearAllBtn = document.createElement('button'); clearAllBtn.textContent='Clear All'; clearAllBtn.onclick=()=> { if(window.clearAllPeerRelationsForNode){ window.clearAllPeerRelationsForNode(node); if(window.applyPeerInfluence) window.applyPeerInfluence(cy); if(window.computeVisuals) window.computeVisuals(cy); dialog.remove(); } };
              const toggleOverlayBtn = document.createElement('button'); toggleOverlayBtn.textContent= window._peerOverlayHidden? 'Show Overlay':'Hide Overlay'; toggleOverlayBtn.onclick=()=> { if(window.togglePeerOverlay){ window.togglePeerOverlay(); toggleOverlayBtn.textContent = window._peerOverlayHidden? 'Show Overlay':'Hide Overlay'; } };
              const close = document.createElement('button'); close.textContent='Close'; close.onclick=()=> dialog.remove();
              controls.appendChild(clearAllBtn); controls.appendChild(toggleOverlayBtn); controls.appendChild(close); dialog.appendChild(controls);
              document.body.appendChild(dialog);
            });
          }

          document.body.appendChild(subMenuEl);
          activePeerSubMenu = subMenuEl;
          // Position submenu to the right of the clicked item
          const itemRect = peerItem.getBoundingClientRect();
          subMenuEl.style.left = (itemRect.right + 6) + 'px';
          subMenuEl.style.top = (itemRect.top) + 'px';

          // Close submenu when clicking outside of it (but not closing the main menu twice)
          setTimeout(() => {
            const handler = (ev) => { if(activePeerSubMenu && !activePeerSubMenu.contains(ev.target) && ev.target !== peerItem) { hideSubMenu(); } };
            document.addEventListener('click', handler, { once:true, capture:true });
            document.addEventListener('contextmenu', handler, { once:true, capture:true });
          }, 0);
        };
        list.appendChild(peerItem);
      }

      const visualSignalsItem = document.createElement('li');
      visualSignalsItem.textContent = 'Visual Signals...';
      visualSignalsItem.style.cursor = 'pointer';
      visualSignalsItem.onclick = () => {
        openVisualSignalsModal(node, cy);
        hideMenu();
      };
      list.appendChild(visualSignalsItem);

  // Heavy mode utility on node: assertion-only Do-Calculus
  if (isHeavyMode && nodeType === NODE_TYPE_ASSERTION) {
        const doCalcItem = document.createElement('li');
        doCalcItem.textContent = 'Do-Calculus for this node…';
        doCalcItem.style.cursor = 'pointer';
        doCalcItem.onclick = () => {
          // Open modal then set X to current node (best effort; modal reads cy to build list)
          openDoCalculusModal(cy);
          // After a tick, try to set select to this node
          setTimeout(() => {
    const selX = document.getElementById('do-select-x');
    const selY = document.getElementById('do-select-y');
    if (selX) selX.value = node.id();
    if (selY) selY.value = node.id();
          }, 0);
          hideMenu();
        };
        list.appendChild(doCalcItem);
      }

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
      if (window.getBayesMode && window.getBayesMode() === 'heavy') {
        del.style.opacity = '0.5';
        del.title = 'Disabled in Bayes Heavy mode';
      }
      del.onclick = () => {
        if (window.getBayesMode && window.getBayesMode() === 'heavy') return;
        node.remove();
        convergeAll({ cy });
        computeVisuals(cy);
        hideMenu();
      };
      list.appendChild(del);

    } else if (evt.target.isEdge && evt.target.isEdge()) {
      const edge = evt.target;
      const targetNode = edge.target();
      const targetType = targetNode.data('type');

      // Edge inert toggle (non-structural, per-mode). Only for legit edges.
      (function(){
        const mode = window.getBayesMode ? window.getBayesMode() : 'lite';
        const flag = mode === 'heavy' ? 'inertEdgeHeavy' : 'inertEdge';
        const parent = edge.source();
        const parentType = parent.data('type');
        const parentIsFact = parentType === NODE_TYPE_FACT;
        const parentInert = mode === 'heavy' ? (parentIsFact && !!parent.data('inertFactHeavy'))
                                             : (parentIsFact && !!parent.data('inertFact'));
        const isInert = !!edge.data(flag);
        const cpt = edge.data('cpt');
        const edgeWeight = edge.data('weight');
        const parentProb = mode === 'heavy' ? parent.data('heavyProb') : parent.data('prob');

        // Determine if this edge would be valid/legit ignoring its own inert flag
        let baseLegit = false;
        if (!parentInert) {
          if (targetType === NODE_TYPE_AND || targetType === NODE_TYPE_OR) {
            baseLegit = (typeof parentProb === 'number');
          } else {
            if (mode === 'heavy') {
              const hasCPT = cpt && typeof cpt.baseline === 'number' && typeof cpt.condTrue === 'number' && typeof cpt.condFalse === 'number';
              baseLegit = hasCPT && (typeof parentProb === 'number');
            } else {
              baseLegit = (typeof parentProb === 'number') && !!edgeWeight && edgeWeight !== 0;
            }
          }
        }

        if (baseLegit) {
          const toggleItem = document.createElement('li');
          toggleItem.textContent = isInert ? 'Make Edge Active (propagate)' : 'Make Edge Inert';
          toggleItem.style.cursor = 'pointer';
          toggleItem.onclick = () => {
            if (isInert) {
              edge.removeData(flag);
            } else {
              edge.data(flag, true);
            }
            convergeAll({ cy });
            computeVisuals(cy);
            hideMenu();
          };
          list.appendChild(toggleItem);
        }
      })();

      const rationaleItem = document.createElement('li');
      rationaleItem.textContent = 'View/Edit Rationale...';
      rationaleItem.style.cursor = 'pointer';
      rationaleItem.onclick = () => {
        openRationaleModal(edge, "edge");
        hideMenu();
      };
      list.appendChild(rationaleItem);

      const contributingFactorsItem = document.createElement('li');
      contributingFactorsItem.textContent = 'Edit Contributing Factors...';
      contributingFactorsItem.style.cursor = 'pointer';
      contributingFactorsItem.onclick = () => {
        openContributingFactorsModal(edge);
        hideMenu();
      };
      list.appendChild(contributingFactorsItem);

      const del = document.createElement('li');
      del.textContent = 'Delete This Edge';
      del.style.cursor = 'pointer';
      if (window.getBayesMode && window.getBayesMode() === 'heavy') {
        del.style.opacity = '0.5';
        del.title = 'Disabled in Bayes Heavy mode';
      }
      del.onclick = () => {
        if (window.getBayesMode && window.getBayesMode() === 'heavy') return;
        edge.remove();
        convergeAll({ cy });
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

  // NOTE: Edge creation handler replaced by edgehandles extension
  // Handle edge creation after "Connect to..." is activated
  /*
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
    convergeAll({ cy });
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
  */

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
      edge.data('userAssignedWeight', val); // Track that user has set a weight


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
      convergeAll({ cy });
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
