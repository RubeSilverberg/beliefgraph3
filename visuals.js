// visuals.js
console.log("Loaded visuals.js");
import {
  NODE_TYPE_FACT,
  NODE_TYPE_ASSERTION,
  NODE_TYPE_AND,
  NODE_TYPE_OR,
  NODE_TYPE_NOTE,
  DEBUG,
  logMath,
  weightToLikert,
  likertDescriptor,
  saturation,
  WEIGHT_MIN
} from './config.js';

/**
 * Convert robustness value [0,1] to qualitative label.
 */
export function robustnessToLabel(robust) {
  if (robust < 0.15) return "Minimal";
  if (robust < 0.35) return "Low";
  if (robust < 0.60) return "Moderate";
  if (robust < 0.85) return "High";
  return "Very High";
}

/**
 * Automatically assign node types based on graph topology:
 * - Nodes with no incoming edges = facts
 * - Nodes with incoming edges = assertions
 * - Logic nodes (and, or) and notes remain unchanged
 */
export function autoUpdateNodeTypes(cy, fromConvergeAll = false) {
  let hasChanges = false;
  
  cy.nodes().forEach(node => {
    const currentType = node.data('type');
    
    // Skip logic nodes and notes - only auto-type fact/assertion nodes
    if (currentType === NODE_TYPE_AND || currentType === NODE_TYPE_OR || currentType === NODE_TYPE_NOTE) {
      return;
    }
    
    const incomingEdges = node.incomers('edge');
    const newType = incomingEdges.length === 0 ? NODE_TYPE_FACT : NODE_TYPE_ASSERTION;
    
    // Only update if type actually changed (avoid unnecessary re-renders)
    if (currentType !== newType) {
      hasChanges = true;
      node.data('type', newType);
      
      // If converting from fact to assertion, preserve incoming edge weights
      if (currentType === NODE_TYPE_FACT && newType === NODE_TYPE_ASSERTION) {
        incomingEdges.forEach(edge => {
          const currentWeight = edge.data('weight');
          if (currentWeight !== undefined && currentWeight !== 0 && !edge.data('userAssignedWeight')) {
            edge.data('userAssignedWeight', currentWeight);
          }
        });
      }
      
      // Update default labels for nodes that still have generic labels
      const currentLabel = node.data('label') || '';
      const baseLabel = currentLabel.split('\n')[0]; // Remove probability displays
      
      if (newType === NODE_TYPE_FACT && baseLabel === 'New Belief') {
        node.data('label', 'New Fact');
        node.data('origLabel', 'New Fact');
      } else if (newType === NODE_TYPE_ASSERTION && baseLabel === 'New Fact') {
        node.data('label', 'New Belief');
        node.data('origLabel', 'New Belief');
      }
      
      // Set appropriate default probabilities
      if (newType === NODE_TYPE_FACT) {
        // Facts should have high probability in both modes
        node.data('heavyProb', 1.0); // 100%
        // Note: lite mode prob will be set by propagation logic
      } else if (newType === NODE_TYPE_ASSERTION) {
        // Assertions should start virgin in lite mode, with 50% latent prior in heavy mode
        node.removeData('prob'); // Clear any existing lite mode probability to make it virgin
        node.data('isVirgin', true); // Mark as virgin for lite mode
        // Only set heavy mode default if not already calculated
        if (typeof node.data('heavyProb') !== 'number') {
          node.data('heavyProb', 0.5); // 50%
        }
      }
      
      console.log(`Auto-updated node ${node.id()} from ${currentType} to ${newType}`);
    }
  });
  
  // If any nodes changed type and we're not already inside convergeAll, trigger convergence
  if (hasChanges && !fromConvergeAll) {
    console.log('Node type changes detected, triggering convergence...');
    if (window.convergeAll) {
      window.convergeAll({ cy });
    }
  }
  
  return hasChanges; // Return whether changes occurred
}

/**
 * Main function to update node/edge visuals based on graph state.
 * Should be called after any probability or weight update.
 */
export function computeVisuals(cy) {
  const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';

  // Note: Node type updates and note edge cleanup are now handled in convergeAll() 
  // before this function is called to avoid circular calls

  cy.nodes().forEach(node => {
    const nodeType = node.data('type');
    const displayLabel = node.data('displayLabel') || node.data('origLabel') || "";
    let label = displayLabel;
    
    // Provide default labels for nodes without meaningful labels
    if (!label || label.trim() === "") {
      if (nodeType === NODE_TYPE_FACT) {
        label = "New Fact";
      } else if (nodeType === NODE_TYPE_ASSERTION) {
        label = "New Belief";
      }
    }
    
    let borderWidth = 1;
    let borderColor = '#bbb';
    let shape = 'roundrectangle';

    if (nodeType === NODE_TYPE_FACT) {
      label = displayLabel;
      shape = 'rectangle';
      borderWidth = 2;
      borderColor = '#444';
      node.data('textColor', '#fff');
    }
    else if (nodeType === NODE_TYPE_ASSERTION) {
      node.data('textColor', '#000');

      // HEAVY MODE: use only heavy fields
      if (bayesMode === 'heavy') {
        // Check if node has any non-virgin incoming edges in heavy mode
        const incomingEdges = node.incomers('edge');
        const validHeavyEdges = incomingEdges.filter(e => {
          const cpt = e.data('cpt');
          return cpt && typeof cpt.baseline === 'number';
        });

        const heavyProb = node.data('heavyProb');
        let pPct;
        
        if (validHeavyEdges.length === 0) {
          // No valid heavy edges - show as virgin
          pPct = null;
          label += `\n—`;
        } else {
          pPct = typeof heavyProb === "number" ? Math.round(heavyProb * 100) : null;
          label += pPct !== null ? `\n${pPct}%` : `\n—`;
        }
        
        borderWidth = 2;
        borderColor = '#333';
        node.data({
          label,
          borderWidth,
          borderColor,
          shape,
          floretColor: node.data('floretColor'),
          textColor: node.data('textColor')
        });
        return;
      }

      // LITE MODE
      const incomingEdges = node.incomers('edge');
      const validEdges = incomingEdges.filter(e => {
        // Edge is valid if parent has a probability AND weight is set (not 0)
        const parentProb = e.source().data('prob');
        const edgeWeight = e.data('weight');
        return typeof parentProb === "number" && edgeWeight && edgeWeight !== 0;
      });

      // EARLY VIRGIN CASE (no valid parents) - always show dash
      if (validEdges.length === 0) {
        label += `\n—`;
        node.data({
          isVirgin: true,
          robustness: undefined,
          robustnessLabel: undefined,
          borderWidth: 1,
          borderColor: '#222',
          label 
        });
        return;
      } else {
        node.removeData('isVirgin');
      }

      let p = node.data('prob');
      let pPct = typeof p === "number" ? Math.round(p * 100) : null;

      label += pPct !== null
        ? `\n${Math.min(Math.max(pPct, 1), 99)}%`
        : `\n—`;

      borderWidth = 2;
      borderColor = '#333';

      // LITE: robustness for assertion nodes if valid parents
      if (bayesMode !== 'heavy' && typeof p === "number" && validEdges.length > 0) {
        const aei = validEdges.reduce((sum, e) => {
          const sourceType = e.source().data('type');
          if (sourceType !== NODE_TYPE_ASSERTION && sourceType !== NODE_TYPE_FACT) return sum;
          const w = e.data('weight');
          return sum + (typeof w === "number" ? Math.abs(w) : 0);
        }, 0);

        const robust = saturation(aei);
        const robustLabel = robustnessToLabel(robust);
        node.data({ robustness: robust, robustnessLabel: robustLabel });

        borderWidth = Math.max(2, Math.round(robust * 10));
        const grayLevel = Math.round(238 - 127 * robust);
        borderColor = `rgb(${grayLevel},${grayLevel},${grayLevel})`;
      } else {
        node.removeData('robustness');
        node.removeData('robustnessLabel');
      }

      node.data({ borderWidth, borderColor });

    }
    // AND/OR nodes
    else if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
      let pct;
      if (bayesMode === 'heavy') {
        // Check if node has valid parent edges in heavy mode (same logic as lite mode)
        const incomingEdges = node.incomers('edge');
        const hasValidParents = incomingEdges.length > 0 && 
          incomingEdges.every(edge => typeof edge.source().data('heavyProb') === "number");
        
        pct = hasValidParents && typeof node.data('heavyProb') === "number" ? 
          Math.round(node.data('heavyProb') * 100) : null;
      } else {
        pct = typeof node.data('prob') === "number" ? Math.round(node.data('prob') * 100) : null;
      }
      let typeLabel = nodeType === NODE_TYPE_AND ? "AND" : "OR";
      if (pct !== null) {
        if (pct > 0 && pct < 1) pct = 1;
        if (pct > 99) pct = 99;
        label = `${typeLabel}\n${pct}%`;
      } else {
        label = `${typeLabel}\n—`;
      }
      shape = nodeType === NODE_TYPE_AND ? "diamond" : "ellipse";
      borderWidth = 3;
      borderColor = "#bbb";
      node.removeData('robustness');
      node.removeData('robustnessLabel');
      if (!node.data('hoverLabel') && displayLabel !== typeLabel) {
        node.data('hoverLabel', displayLabel);
      }
    }
    // Note nodes: simple text display, no probability or logic
    else if (nodeType === NODE_TYPE_NOTE) {
      // For notes, use the display label (what the user edited) or fall back to defaults
      label = node.data('displayLabel') || node.data('origLabel') || node.data('label') || 'Note';
      borderColor = '#ddd';
      borderWidth = 1;
      node.removeData('robustness');
      node.removeData('robustnessLabel');
      node.removeData('hoverLabel'); // No hover label distinction
      node.removeData('prob');
      node.removeData('heavyProb');
    }
    // Unknown type
    else {
      label = `[Unknown Type] ${displayLabel}`;
      borderColor = '#bbb';
      node.removeData('robustness');
      node.removeData('robustnessLabel');
    }
    node.data({
      label,
      borderWidth,
      borderColor,
      shape,
      floretColor: node.data('floretColor'),
      textColor: node.data('textColor')
    });
    if (DEBUG) logMath(node.id(), `Visual: ${label.replace(/\n/g, ' | ')}`);
  });

  // === EDGE STYLING & VIRGIN LOGIC ===
  cy.edges().forEach(edge => {
    const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';
    let isVirgin = false;
    let absWeight = 0;
    let edgeType = 'supports';

    if (bayesMode === 'heavy') {
      // HEAVY MODE: Use completely separate data namespace
      const cpt = edge.data('cpt');
      const targetType = edge.target().data('type');
      
      // Special handling for edges to AND/OR nodes
      if (targetType === NODE_TYPE_AND || targetType === NODE_TYPE_OR) {
        // For logic nodes, virginity is based on parent having probability, not CPT completeness
        // Logic nodes don't need full CPT - just the inverse flag
        const parentProb = edge.source().data('heavyProb');
        isVirgin = typeof parentProb !== "number";
        
        if (!isVirgin) {
          absWeight = 1; // Full weight since logic is deterministic
          // Check for inverse relationship (NOT) for visual styling - heavy mode only uses cpt.inverse
          const isInverse = !!(cpt && cpt.inverse);
          edgeType = isInverse ? 'opposes' : 'supports';
          edge.data('heavyType', edgeType);
        }
      } else {
        // Standard assertion node logic - requires full CPT
        // Edge is virgin if no CPT or incomplete CPT data
        isVirgin = !cpt || 
                   typeof cpt.baseline !== 'number' || 
                   typeof cpt.condTrue !== 'number' || 
                   typeof cpt.condFalse !== 'number';
        
        if (!isVirgin && cpt.condFalse > 0) {
          const logRatio = Math.log(cpt.condTrue / cpt.condFalse);
          absWeight = Math.min(1, Math.abs(logRatio / 3));
          edgeType = logRatio < 0 ? 'opposes' : 'supports';
          // Store heavy-specific type without polluting lite mode
          edge.data('heavyType', edgeType);
        } else if (!isVirgin) {
          // Non-virgin but incomplete CPT data (condFalse = 0)
          absWeight = 0.5;
          edge.data('heavyType', 'supports');
        }
      }
    } else {
      // LITE MODE: Use completely separate data namespace
      const parentProb = edge.source().data('prob');
      const edgeWeight = edge.data('weight');
      const targetType = edge.target().data('type');
      
      // Special case: edges TO and/or nodes are never virgin (they use deterministic logic)
      if (targetType === NODE_TYPE_AND || targetType === NODE_TYPE_OR) {
        // Edge is virgin only if parent has no probability
        isVirgin = typeof parentProb !== "number";
        if (!isVirgin) {
          absWeight = 1; // Full weight since logic is deterministic
          // Check for inverse relationship (NOT) for visual styling
          const opposes = edge.data('opposes');
          const cpt = edge.data('cpt') || {};
          const isInverse = !!cpt.inverse || !!opposes;
          edgeType = isInverse ? 'opposes' : 'supports';
        }
      } else {
        // Standard assertion nodes: virgin if parent has no prob OR weight is 0/unset
        isVirgin = typeof parentProb !== "number" || !edgeWeight || edgeWeight === 0;
        
        if (!isVirgin) {
          absWeight = Math.abs(edgeWeight);
          edgeType = edge.data('type') || 'supports';
        }
      }
    }

    // Set visual properties based on current mode only
    if (isVirgin) {
      // Virgin edges: Purple in heavy, Orange in lite
      edge.data('lineColor', bayesMode === 'heavy' ? '#A26DD2' : '#ff9900');
      edge.data('absWeight', 0);
    } else {
      // Non-virgin edges: Gray scale based on weight
      edge.data('absWeight', absWeight);
      const grayLevel = Math.round(224 - (absWeight * 180));
      edge.data('lineColor', `rgb(${grayLevel},${grayLevel},${grayLevel})`);
    }
    
    // Store current display type without cross-mode pollution
    edge.data('displayType', edgeType);
  });

  cy.style().update();
}
/**
 * Draw floating modifier boxes only for assertion node edges.
 */
export function drawModifierBoxes(cy) {
  document.querySelectorAll('.modifier-box').forEach(el => el.remove());
  cy.edges().forEach(edge => {
    const targetNode = edge.target();
    if (targetNode.data('type') !== NODE_TYPE_ASSERTION) return;
    const mods = edge.data('modifiers') ?? [];
    if (!mods.length) return;
    const mid = edge.midpoint();
    const pan = cy.pan();
    const zoom = cy.zoom();
    const container = cy.container();
    const x = mid.x * zoom + pan.x;
    const y = mid.y * zoom + pan.y;
    const box = document.createElement('div');
    box.className = 'modifier-box';
    box.style.position = 'absolute';
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.background = 'rgba(220,235,250,0.97)';
    box.style.border = '1.5px solid #1565c0';
    box.style.borderRadius = '8px';
    box.style.padding = '5px 8px';
    box.style.fontSize = '11px';
    box.style.minWidth = '80px';
    box.style.maxWidth = '220px';
    box.style.zIndex = 10;
    box.style.boxShadow = '0 1.5px 7px #1565c066';
    mods.forEach(mod => {
      const item = document.createElement('div');
      item.style.margin = '2px 0';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      let color = '#616161';
      if (mod.likert > 0) color = '#2e7d32';
      if (mod.likert < 0) color = '#c62828';
      const val = mod.likert > 0 ? '+' + mod.likert : '' + mod.likert;
      item.innerHTML = `<span style="color:${color};font-weight:600;min-width:24px;display:inline-block;">${val}</span> <span style="margin-left:5px;">${mod.label}</span>`;
      box.appendChild(item);
    });
    container.parentElement.appendChild(box);
  });
}

/**
 * Node hover: probability/logic display per node type, MODE-SPLIT.
 */
export function showNodeHoverBox(cy, node) {
  removeNodeHoverBox();
  const pos = node.renderedPosition();
  const container = cy.container();
  const x = pos.x + 20;
  const y = pos.y - 30;

  const box = document.createElement('div');
  box.className = 'node-hover-box';
  box.style.position = 'absolute';
  box.style.left = `${x + 20}px`;
  box.style.top = `${y - 30}px`;
  box.style.background = '#f3f3fc';
  box.style.border = '1.5px solid #2e7d32';
  box.style.borderRadius = '8px';
  box.style.padding = '7px 14px';
  box.style.fontSize = '12px';
  box.style.zIndex = 20;
  box.style.boxShadow = '0 2px 8px #1565c066';

  const displayLabel = node.data('displayLabel') || node.data('origLabel') || "";
  const hoverLabel = node.data('hoverLabel');
  const nodeType = node.data('type');
  const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';

  function formatProb(p) {
    return (typeof p === "number") ? `<b>${Math.round(100 * p)}%</b>` : "<b>—</b>";
  }

  if (nodeType === NODE_TYPE_FACT) {
    box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><span>Fact node</span>`;
    container.parentElement.appendChild(box);
    return;
  }

  // MODE FORK: Heavy vs Lite
  if (bayesMode === 'heavy') {
    // --- Assertion node, Heavy Mode ---
    if (nodeType === NODE_TYPE_ASSERTION) {
      // Check if this is a virgin node (no configured incoming edges)
      const incomingEdges = node.incomers('edge');
      const hasValidEdges = incomingEdges.some(edge => {
        const cpt = edge.data('cpt');
        return cpt && 
               cpt.baseline !== undefined && 
               cpt.condTrue !== undefined && 
               cpt.condFalse !== undefined;
      });
      
      if (!hasValidEdges) {
        box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><span>Current: <b>—</b></span><br><i>No incoming conditional relationships configured.</i>`;
      } else {
        const hp = node.data('heavyProb');
        box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br>
          <span>Current: ${formatProb(hp)}</span>`;
      }
      container.parentElement.appendChild(box);
      return;
    }
    // --- AND/OR nodes, Heavy Mode ---
    if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
      const hp = node.data('heavyProb');
      let typeLabel = nodeType === NODE_TYPE_AND ? 'AND' : 'OR';
      box.innerHTML = `<b>${typeLabel}</b><br>Current: ${formatProb(hp)}`;
      if (nodeType === NODE_TYPE_AND)
        box.innerHTML += "<br><i>AND logic node (product of heavy parent probs)</i>";
      else
        box.innerHTML += "<br><i>OR logic node (sum-minus-product of heavy parent probs)</i>";
      container.parentElement.appendChild(box);
      return;
    }
  } else {
    // --- Lite Mode ---
    if (nodeType === NODE_TYPE_ASSERTION) {
      const lp = node.data('prob');
      if (typeof lp !== "number") {
        box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><span>Current: <b>—</b></span><br><i>No incoming information.</i>`;
      } else {
        box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br>
          <span>Current: <b>${Math.round(100 * lp)}%</b></span>`;
      }
      const rlabel = node.data('robustnessLabel');
      if (rlabel) {
        const robust = node.data('robustness');
        const grayscale = robust !== undefined
          ? `rgb(${Math.round(180 - 60 * robust)}, ${Math.round(180 - 60 * robust)}, ${Math.round(180 - 60 * robust)})`
          : '#888';
        box.innerHTML += `<br><span><b style="color:#111">Robustness</b>: <b style="color:${grayscale}">${rlabel}</b></span>`;
      }
      container.parentElement.appendChild(box);
      return;
    }
    if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
      let typeLabel = nodeType === NODE_TYPE_AND ? 'AND' : 'OR';
      const lp = node.data('prob');
      box.innerHTML = `<b>${typeLabel}</b><br>Current: ${formatProb(lp)}`;
      if (nodeType === NODE_TYPE_AND)
        box.innerHTML += "<br><i>AND logic node<br>(product of parent probs)</i>";
      else
        box.innerHTML += "<br><i>OR logic node<br>(sum-minus-product of parent probs)</i>";
      container.parentElement.appendChild(box);
      return;
    }
  }
  box.innerHTML = `<b>${hoverLabel || displayLabel}</b><br><i>Unknown node type</i>`;
  container.parentElement.appendChild(box);
}

export function removeNodeHoverBox() {
  document.querySelectorAll('.node-hover-box').forEach(el => el.remove());
}

/**
 * Edge hover: show for assertion, and, and or node targets.
 */
export function showModifierBox(cy, edge) {
  removeModifierBox();
  const targetNode = edge.target();
  const targetType = targetNode.data('type');
  
  // Only show for specific target types
  if (targetType !== NODE_TYPE_ASSERTION && targetType !== NODE_TYPE_AND && targetType !== NODE_TYPE_OR) {
    return;
  }
  
  const mods = edge.data('modifiers') ?? [];
  let baseLikert, baseLabel;
  
  // Handle different edge types differently
  if (targetType === NODE_TYPE_AND || targetType === NODE_TYPE_OR) {
    // Logic nodes don't use weights
    baseLabel = `${targetType.toUpperCase()} logic`;
  } else {
    // Assertion nodes use weights
    baseLikert = weightToLikert(edge.data('weight'));
    baseLabel = likertDescriptor(baseLikert);
  }

  const mid = edge.midpoint();
  const pan = cy.pan();
  const zoom = cy.zoom();
  const container = cy.container();
  const x = mid.x * zoom + pan.x;
  const y = mid.y * zoom + pan.y;

  const box = document.createElement('div');
  box.className = 'modifier-box';
  box.style.position = 'absolute';
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  box.style.background = 'rgba(220,235,250,0.97)';
  box.style.border = '1.5px solid #1565c0';
  box.style.borderRadius = '8px';
  box.style.padding = '6px 14px';
  box.style.fontSize = '12px';
  box.style.zIndex = 20;
  box.style.boxShadow = '0 2px 8px #1565c066';

  // Check if edge is virgin based on current mode
  const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';
  const edgeTargetType = edge.target().data('type');
  let isVirgin = false;
  
  if (bayesMode === 'heavy') {
    const cpt = edge.data('cpt');
    isVirgin = !cpt || typeof cpt.baseline !== 'number';
  } else {
    const parentProb = edge.source().data('prob');
    const edgeWeight = edge.data('weight');
    
    // Special case: edges TO and/or nodes are never virgin (they use deterministic logic)
    if (edgeTargetType === NODE_TYPE_AND || edgeTargetType === NODE_TYPE_OR) {
      isVirgin = typeof parentProb !== "number";
    } else {
      isVirgin = typeof parentProb !== "number" || !edgeWeight || edgeWeight === 0;
    }
  }

  if (isVirgin) {
    if (edgeTargetType === NODE_TYPE_AND || edgeTargetType === NODE_TYPE_OR) {
      box.innerHTML = `<i>Parent node has no probability.</i>`;
    } else {
      // Check if this is an assigned virgin (user set weight but edge is dormant)
      const userAssignedWeight = edge.data('userAssignedWeight');
      if (userAssignedWeight !== undefined) {
        // Assigned virgin - show the preserved weight in orange
        const likert = weightToLikert(userAssignedWeight);
        const isOpposing = edge.data('opposes') || edge.data('type') === 'opposes';
        const relationshipType = isOpposing ? 'opposes' : 'supports';
        
        box.innerHTML = `<div style="color: #ff9900;"><b>Preserved weight:</b> ${likert} (${relationshipType})</div>`;
        box.innerHTML += `<div style="color: #666; font-size: 11px;"><i>Edge dormant - not propagating</i></div>`;
      } else {
        // Unassigned virgin - show em dash
        box.innerHTML = `<div style="color: #999;"><b>Weight:</b> —</div>`;
        box.innerHTML += `<div style="color: #666; font-size: 11px;"><i>Not assigned</i></div>`;
      }
    }
    container.parentElement.appendChild(box);
    return;
  }
  
  // Display different content based on target type
  if (targetType === NODE_TYPE_AND || targetType === NODE_TYPE_OR) {
    const parentProb = edge.source().data('prob');
    const pct = typeof parentProb === "number" ? Math.round(parentProb * 100) : null;
    box.innerHTML = `<div><b>Logic:</b> ${baseLabel}</div>`;
    if (pct !== null) {
      box.innerHTML += `<div>Parent probability: <b>${pct}%</b></div>`;
    }
  } else {
    // Standard assertion edge display
    box.innerHTML = `<div><b>Base influence:</b> ${baseLabel}</div>`;

    if (mods.length) {
      box.innerHTML += `<hr style="margin:6px 0 3px 0">`;
      mods.forEach(mod => {
        let color = '#616161';
        if (mod.likert > 0) color = '#2e7d32';
        if (mod.likert < 0) color = '#c62828';
        const val = mod.likert > 0 ? '+' + mod.likert : '' + mod.likert;
        box.innerHTML += `<div style="color:${color};margin:2px 0;">
          ${val}: ${mod.label}
        </div>`;
      });
    }
  }

  container.parentElement.appendChild(box);
}

export function removeModifierBox() {
  document.querySelectorAll('.modifier-box').forEach(el => el.remove());
}

/**
 * Register Cytoscape event handlers for all node/edge hover visuals.
 * Should be called once after cy init.
 */
export function registerVisualEventHandlers(cy) {
  let nodeHoverTimeout = null;
  let edgeHoverTimeout = null;

  cy.on('mouseover', 'node', evt => {
    const node = evt.target;
    // Skip hover for note nodes
    if (node.data('type') === NODE_TYPE_NOTE) return;
    
    // Clear any existing timeout
    if (nodeHoverTimeout) {
      clearTimeout(nodeHoverTimeout);
    }
    
    // Set delay before showing hover box
    nodeHoverTimeout = setTimeout(() => {
      showNodeHoverBox(cy, node);
    }, 300); // 0.3 second delay
  });
  
  cy.on('mouseout', 'node', evt => {
    // Clear pending timeout
    if (nodeHoverTimeout) {
      clearTimeout(nodeHoverTimeout);
      nodeHoverTimeout = null;
    }
    removeNodeHoverBox();
  });

  cy.on('mouseover', 'edge', evt => {
    // Only show in Lite mode (or when NOT heavy)
    if (window.getBayesMode && window.getBayesMode() === 'heavy') return;
    
    // Clear any existing timeout
    if (edgeHoverTimeout) {
      clearTimeout(edgeHoverTimeout);
    }
    
    // Set delay before showing edge hover box
    edgeHoverTimeout = setTimeout(() => {
      showModifierBox(cy, evt.target);
    }, 300); // 0.3 second delay
  });
  
  cy.on('mouseout', 'edge', evt => {
    // Clear pending timeout
    if (edgeHoverTimeout) {
      clearTimeout(edgeHoverTimeout);
      edgeHoverTimeout = null;
    }
    removeModifierBox();
  });

  // Clear hover boxes when dragging starts to prevent sticking
  cy.on('grab', 'node', evt => {
    // Clear pending timeout
    if (nodeHoverTimeout) {
      clearTimeout(nodeHoverTimeout);
      nodeHoverTimeout = null;
    }
    removeNodeHoverBox();
  });

  cy.on('drag', 'node', evt => {
    // Ensure hover boxes stay cleared during drag
    removeNodeHoverBox();
  });

  // Optional: clean up boxes when clicking elsewhere
  document.addEventListener('mousedown', removeNodeHoverBox);
  document.addEventListener('mousedown', removeModifierBox);
}

// Make autoUpdateNodeTypes available globally for menu.js
if (typeof window !== 'undefined') {
  window.autoUpdateNodeTypes = autoUpdateNodeTypes;
}
