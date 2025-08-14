// visuals.js - Updated styling for tooltips
console.log("Loaded visuals.js - Version 2.0");
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
 * Convert edge weight [0.15-1.0] to short descriptive label for virgin edges
 */
export function weightToShortLabel(weight, isOpposing = false) {
  const absWeight = Math.abs(weight);
  let label;
  
  if (absWeight >= 0.99) label = "Max";
  else if (absWeight >= 0.825) label = "Lrg"; // Between Large (0.85) and Strong (0.60)
  else if (absWeight >= 0.475) label = "Med"; // Between Medium (0.60) and Small (0.35)
  else if (absWeight >= 0.25) label = "Sm";   // Between Small (0.35) and Minimal (0.15)
  else label = "Min";
  
  return isOpposing ? `(${label})` : label;
}

/**
 * Generate edge label for virgin edges based on mode and assignment state
 */
export function getEdgeLabel(edge) {
  const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';
  
  if (bayesMode === 'heavy') {
    const cpt = edge.data('cpt') || {};
    const targetNode = edge.target();
    const parentNode = edge.source();
    const parentProb = parentNode.data('heavyProb');
    const targetType = targetNode.data('type');
    
    // Special case: edges TO AND/OR nodes only need parent probability
    if (targetType === NODE_TYPE_AND || targetType === NODE_TYPE_OR) {
      const isVirgin = typeof parentProb !== "number";
      if (isVirgin) {
        return "—"; // Em dash for unassigned logic edges
      } else {
        // Show parent probability as percentage for active logic edges
        const pct = Math.round(parentProb * 100);
        return `${Math.min(Math.max(pct, 1), 99)}%`;
      }
    }
    
    // Standard assertion edges: three-category system
    const hasCPT = cpt && 
                   typeof cpt.baseline === 'number' && 
                   typeof cpt.condTrue === 'number' && 
                   typeof cpt.condFalse === 'number';
    const hasParentProb = typeof parentProb === "number";
    
    if (!hasCPT) {
      // Category 1: Unassigned Virgin - no CPT data
      return "—"; // Em dash for unassigned Heavy mode edges
    } else if (!hasParentProb) {
      // Category 2: Assigned Virgin - has CPT but parent has no probability
      // Show CPT ratio as indicator that user has configured this edge
      const ratio = cpt.condFalse > 0 ? (cpt.condTrue / cpt.condFalse).toFixed(1) : "∞";
      return ratio; // Show ratio for assigned virgin edges
    } else {
      // Category 3: Non-Virgin - has CPT and parent has probability
      return ""; // No label for active edges
    }
  }
  
  // Lite mode logic
  const targetNode = edge.target();
  const parentNode = edge.source();
  let parentProb = parentNode.data('prob');
  // Inert facts: show their value but do not allow propagation; treat as undefined for edge activation logic
  const parentIsInert = parentNode.data('type') === NODE_TYPE_FACT && parentNode.data('inertFact');
  if (parentIsInert) {
    // Keep local parentProb variable for potential display elsewhere, but for virgin detection treat as absent
  }
  const edgeWeight = edge.data('weight');
  const hasUserWeight = edge.data('userAssignedWeight') !== undefined;
  const targetType = targetNode.data('type');
  
  // Special case for AND/OR nodes in Lite mode - they only need parent probability
  if (targetType === NODE_TYPE_AND || targetType === NODE_TYPE_OR) {
    const isVirgin = typeof parentProb !== "number";
    if (isVirgin) {
      return "—"; // Em dash for unassigned logic edges
    } else {
      // Show parent probability as percentage for active logic edges
      const pct = Math.round(parentProb * 100);
      return `${Math.min(Math.max(pct, 1), 99)}%`;
    }
  }
  
  // Check if this is a virgin edge (no parent prob OR no weight)
  const isVirgin = parentIsInert || typeof parentProb !== 'number' || !edgeWeight || edgeWeight === 0;
  
  // Debug logging to track virgin detection
  if (DEBUG) {
    console.log(`Edge ${edge.id()}: parentProb=${parentProb}, edgeWeight=${edgeWeight}, isVirgin=${isVirgin}`);
  }
  
  if (!isVirgin) {
    return ""; // Non-virgin edges show no label (use dynamic sizing/coloring)
  }
  
  // Virgin edge - check if assigned or unassigned
  if (!hasUserWeight || edgeWeight === 0) {
    return "—"; // Em dash for unassigned virgin edges
  }
  
  // Assigned virgin edge - show weight label
  const isOpposing = edge.data('opposes') || edge.data('type') === 'opposes';
  return weightToShortLabel(edgeWeight, isOpposing);
}

/**
 * Automatically assign node types based on graph topology:
 * - Nodes with no incoming edges = facts
 * - Nodes with incoming edges = assertions
 * - Logic nodes (and, or) and notes remain unchanged
 */
export function autoUpdateNodeTypes(cy, fromConvergeAll = false) {
  // Heavy mode cannot make topology changes - only Lite mode can change node types
  const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';
  if (bayesMode === 'heavy') {
    return false; // No changes possible in Heavy mode
  }
  
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
  // Clear inert flag when leaving fact state
  if (node.data('inertFact')) node.removeData('inertFact');
      }
      
      // If converting from assertion to fact, restore any preserved edge weights
      if (currentType === NODE_TYPE_ASSERTION && newType === NODE_TYPE_FACT) {
        // For any remaining edges to this node, restore preserved weights
        incomingEdges.forEach(edge => {
          const preservedWeight = edge.data('userAssignedWeight');
          if (preservedWeight !== undefined) {
            edge.data('weight', preservedWeight);
            console.log(`Restored preserved weight ${preservedWeight} for edge ${edge.id()} during assertion→fact conversion`);
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
        // Initialize fact data through logic system
        if (window.initializeNodeData) {
          window.initializeNodeData(node, 'fact');
        }
      } else if (newType === NODE_TYPE_ASSERTION) {
        // Initialize assertion data through logic system
        if (window.initializeNodeData) {
          window.initializeNodeData(node, 'assertion');
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
      // Only set default text color if user hasn't customized it
      if (!node.data('userCustomTextColor')) {
        node.data('textColor', '#fff');
      }
      // Inert fact embellishments (visual only – no inline INERT text)
      if (node.data('inertFact')) {
        borderColor = '#ff9800';
        borderWidth = 4;
      }
      // Ensure any legacy translucency flag is cleared so inert facts are fully opaque
      if (node.data('backgroundOpacity') !== undefined) node.removeData('backgroundOpacity');
    }
    else if (nodeType === NODE_TYPE_ASSERTION) {
      // Only set default text color if user hasn't customized it
      if (!node.data('userCustomTextColor')) {
        node.data('textColor', '#000');
      }

      // HEAVY MODE: use only heavy fields with three-category edge system
      if (bayesMode === 'heavy') {
        // Check if node has any non-virgin incoming edges in heavy mode
        const incomingEdges = node.incomers('edge');
        const validHeavyEdges = incomingEdges.filter(e => {
          const cpt = e.data('cpt');
          const parentProb = e.source().data('heavyProb');
          
          // Three-category system: edge is valid if it has CPT AND parent has probability
          const hasCPT = cpt && 
                         typeof cpt.baseline === 'number' && 
                         typeof cpt.condTrue === 'number' && 
                         typeof cpt.condFalse === 'number';
          const hasParentProb = typeof parentProb === 'number';
          
          return hasCPT && hasParentProb;
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
        // Edge is valid if parent has a probability AND weight is set (not 0) AND parent (if fact) is not inert
        const parentNode = e.source();
        const parentProb = parentNode.data('prob');
        const edgeWeight = e.data('weight');
        const parentIsInert = parentNode.data('type') === NODE_TYPE_FACT && parentNode.data('inertFact');
        const isValid = !parentIsInert && typeof parentProb === 'number' && edgeWeight && edgeWeight !== 0;
        
        // Debug logging for edge validity
        if (DEBUG) {
          console.log(`Node ${node.id()} - Edge ${e.id()}: parentProb=${parentProb}, edgeWeight=${edgeWeight}, parentIsInert=${parentIsInert}, isValid=${isValid}`);
        }
        
        return isValid;
      });

      // EARLY VIRGIN CASE (no valid parents) - always show dash
      if (validEdges.length === 0) {
        label += `\n—`;
        // Note: Don't set isVirgin here - that's managed by logic system
        node.data({
          robustness: undefined,
          robustnessLabel: undefined,
          borderWidth: 1,
          borderColor: '#222',
          label 
        });
        return;
      } else {
        // Note: isVirgin should be managed by logic system, not visual system
        // Visual system should not modify isVirgin data
      }

      let p = node.data('prob');
      // Peer relation adjusted display probability (lite mode only)
      const displayP = node.data('displayProb');
      if(node.data('peerAdjusted') && typeof displayP === 'number'){
        p = displayP;
      }
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
      // Only set default text color if user hasn't customized it
      if (!node.data('userCustomTextColor')) {
        node.data('textColor', '#000');
      }

      let pct;
      if (bayesMode === 'heavy') {
        // Check if node has valid parent edges in heavy mode using three-category system
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
      
      // Always clear robustness data for AND/OR nodes
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
      // Clear data through logic system instead of direct removeData calls
      if (window.clearNodeDataForUnknownType) {
        window.clearNodeDataForUnknownType(node);
      }
    }
    // Unknown type
    else {
      label = `[Unknown Type] ${displayLabel}`;
      borderColor = '#bbb';
      // Clear data through logic system instead of direct removeData calls
      if (window.clearNodeDataForUnknownType) {
        window.clearNodeDataForUnknownType(node);
      }
    }
    node.data({
      label,
      borderWidth,
      borderColor,
      shape,
      floretColor: node.data('floretColor'),
      textColor: node.data('textColor')
    });
    // After updating the label, ensure the node box resizes to the computed label (dash/percent)
    if (typeof window !== 'undefined' && window.adjustNodeSize) {
      const t = node.data('type');
      if (t === NODE_TYPE_ASSERTION || t === NODE_TYPE_FACT) {
        try {
          window.adjustNodeSize(node, 0, { useComputedLabel: true });
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
              try { window.adjustNodeSize(node, 0, { useComputedLabel: true }); } catch (e) {}
            });
          }
        } catch (e) {}
      }
    }
    if (DEBUG) logMath(node.id(), `Visual: ${label.replace(/\n/g, ' | ')}`);
  });

  // === EDGE STYLING & VIRGIN LOGIC ===
  cy.edges().forEach(edge => {
    const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';
    let isVirgin = false;
    let absWeight = 0;
    let edgeType = 'supports';

    // Clean up any prior logic edge targetLabel overlays (feature disabled per user request)
    const tgtNodeTypeForCleanup = edge.target().data('type');
    if ((tgtNodeTypeForCleanup === NODE_TYPE_AND || tgtNodeTypeForCleanup === NODE_TYPE_OR) && edge.data('targetLabel')) {
      edge.removeData('targetLabel');
    }

    if (bayesMode === 'heavy') {
      // HEAVY MODE: Three-category edge system parallel to Lite mode
      const cpt = edge.data('cpt');
      const targetType = edge.target().data('type');
      const parentProb = edge.source().data('heavyProb');
      
      // Special handling for edges to AND/OR nodes
      if (targetType === NODE_TYPE_AND || targetType === NODE_TYPE_OR) {
        // For logic nodes, virginity is based only on parent having probability
        isVirgin = typeof parentProb !== "number";
        
        if (!isVirgin) {
          absWeight = 1; // Full weight since logic is deterministic
          // Check for inverse relationship (NOT) for visual styling - heavy mode only uses cpt.inverse
          const isInverse = !!(cpt && cpt.inverse);
          edgeType = isInverse ? 'opposes' : 'supports';
          edge.data('heavyType', edgeType);
        }
      } else {
        // Standard assertion node logic: Three-category system
        const hasCPT = cpt && 
                       typeof cpt.baseline === 'number' && 
                       typeof cpt.condTrue === 'number' && 
                       typeof cpt.condFalse === 'number';
        const hasParentProb = typeof parentProb === "number";
        
        if (!hasCPT) {
          // Category 1: Unassigned Virgin - no CPT data
          isVirgin = true;
          if (DEBUG) {
            console.log(`Heavy Edge ${edge.id()}: Category 1 - Unassigned Virgin (no CPT)`);
          }
        } else if (!hasParentProb) {
          // Category 2: Assigned Virgin - has CPT but parent has no probability
          isVirgin = true;
          // Store that this is an assigned virgin for hover display
          edge.data('assignedVirgin', true);
          if (DEBUG) {
            console.log(`Heavy Edge ${edge.id()}: Category 2 - Assigned Virgin (has CPT, no parent prob)`);
          }
        } else {
          // Category 3: Non-Virgin - has CPT and parent has probability
          isVirgin = false;
          edge.removeData('assignedVirgin');
          if (DEBUG) {
            console.log(`Heavy Edge ${edge.id()}: Category 3 - Non-Virgin (has CPT and parent prob)`);
          }
          
          // Calculate visual weight from CPT data
          if (cpt.condFalse > 0) {
            const logRatio = Math.log(cpt.condTrue / cpt.condFalse);
            absWeight = Math.min(1, Math.abs(logRatio / 3));
            edgeType = logRatio < 0 ? 'opposes' : 'supports';
          } else {
            // condFalse = 0 case
            absWeight = 0.5;
            edgeType = 'supports';
          }
          // Store heavy-specific type without polluting lite mode
          edge.data('heavyType', edgeType);
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
        
        // Debug logging to track virgin detection
        if (DEBUG) {
          console.log(`Edge ${edge.id()} (computeVisuals): parentProb=${parentProb}, edgeWeight=${edgeWeight}, isVirgin=${isVirgin}`);
        }
        
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
    
    // Set edge label (virgin weight label / dash / pct)
    const edgeLabel = getEdgeLabel(edge);
    const tgtType = edge.target().data('type');
    // Logic edge percentage overlays temporarily disabled; show nothing instead
    if (tgtType === NODE_TYPE_AND || tgtType === NODE_TYPE_OR) {
      edge.data('label', '');
      if (edge.data('targetLabel')) edge.removeData('targetLabel');
    } else {
      edge.data('label', edgeLabel);
    }
  });

  // One-time style for targetLabel (no box styling per request)
  // Suppress built-in target-label now that we draw dynamic overlays
  cy.style()
    .selector('edge[targetLabel]')
    .style({ 'target-label': '' })
    .update();

  // Draw dynamic overlays (requestAnimationFrame to ensure positions are current)
  // Dynamic logic edge label overlays disabled (green percentages) per user request.
  // Left in place for potential future reactivation.

  // Install dynamic listeners once to keep labels synced with movement
  if (!cy._logicEdgeDynamicListeners) {
    const schedule = () => {
      // No-op: overlays disabled
    };
    // Node movement / position changes
    cy.on('position drag free', 'node', schedule);
    // Viewport changes
    cy.on('pan zoom', schedule);
    // Edge structural or data changes
    cy.on('add remove data', 'edge', schedule);
    // Node probability/data changes that might alter labels
    cy.on('data', 'node', schedule);
    // Window resize
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', schedule);
    }
    cy._logicEdgeDynamicListeners = true;
  }
}

// --- Dynamic logic edge label overlays ---
function drawDynamicLogicEdgeLabels(cy){ /* disabled stub */ }
/**
 * Draw floating modifier boxes only for assertion node edges.
 */
export function drawModifierBoxes(cy) {
  document.querySelectorAll('.modifier-box').forEach(el => el.remove());
  cy.edges().forEach(edge => {
    const targetNode = edge.target();
    const targetType = targetNode.data('type');
    // Include AND/OR nodes in addition to assertion nodes
    if (targetType !== NODE_TYPE_ASSERTION && targetType !== NODE_TYPE_AND && targetType !== NODE_TYPE_OR) return;
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
  box.style.background = '#f8f9fa';
  box.style.border = '2px solid #2e7d32';
  box.style.borderRadius = '12px';
  box.style.padding = '16px 20px';
  box.style.fontSize = '16px';  // Much larger font
  box.style.lineHeight = '1.5';
  box.style.maxWidth = '400px';  // Allow much wider tooltips
  box.style.minWidth = '200px';
  box.style.zIndex = 20;
  box.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
  box.style.fontFamily = 'Segoe UI, Roboto, Arial, sans-serif';

  const displayLabel = node.data('displayLabel') || node.data('origLabel') || "";
  const hoverLabel = node.data('hoverLabel');
  const nodeType = node.data('type');
  const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';

  // Create combined label: "Short: Full description" with short label bold and description italic
  let combinedLabel = displayLabel;
  if (hoverLabel && hoverLabel !== displayLabel) {
    combinedLabel = `<b>${displayLabel}</b>: <i style="font-weight: 300;">${hoverLabel}</i>`;
  } else if (hoverLabel) {
    combinedLabel = `<i style="font-weight: 300;">${hoverLabel}</i>`;
  } else if (displayLabel) {
    combinedLabel = `<b>${displayLabel}</b>`;
  }

  function formatProb(p) {
    return (typeof p === "number") ? `<b style="font-size: 18px; color: #1565c0;">${Math.round(100 * p)}%</b>` : "<b style=\"color: #666;\">—</b>";
  }

  if (nodeType === NODE_TYPE_FACT) {
    const inert = node.data('inertFact');
    const typeLine = inert ? 'INERT Fact node' : 'Fact node';
    let extra = '';
    const base = node.data('prob');
    const adj = node.data('displayProb');
    if(node.data('peerAdjusted') && typeof base === 'number' && typeof adj === 'number'){
      const diff = adj - base;
      const sign = diff > 0 ? '+' : '−';
      extra = `<div style="margin-top:6px;font-size:13px;color:${diff>0?'#2e7d32':'#c62828'};">Peer adj: ${sign}${Math.round(Math.abs(diff)*100)}%</div>`;
    }
    box.innerHTML = `<div style="font-size: 17px; font-weight: 500; color: #000; margin-bottom: 8px;">${combinedLabel}</div>
                     <div style="color: ${inert ? '#e65100' : '#666'}; font-style: italic; font-weight:${inert ? '600':'400'};">${typeLine}</div>${extra}`;
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
        box.innerHTML = `<div style="font-size: 17px; font-weight: 500; color: #000; margin-bottom: 8px;">${combinedLabel}</div>
                         <div style="margin-bottom: 6px;">Current: <b style="color: #666;">—</b></div>
                         <div style="color: #e65100; font-style: italic;">No incoming conditional relationships configured.</div>`;
      } else {
        const hp = node.data('heavyProb');
        box.innerHTML = `<div style="font-size: 17px; font-weight: 500; color: #000; margin-bottom: 8px;">${combinedLabel}</div>
                         <div>Current: ${formatProb(hp)}</div>`;
      }
      container.parentElement.appendChild(box);
      return;
    }
    // --- AND/OR nodes, Heavy Mode ---
    if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
      const hp = node.data('heavyProb');
      let typeLabel = nodeType === NODE_TYPE_AND ? 'AND' : 'OR';
      
      // Build logical statement from parent nodes
      const incomingEdges = node.incomers('edge');
      const parentLabels = incomingEdges.map(edge => {
        const parentNode = edge.source();
        const parentLabel = parentNode.data('displayLabel') || parentNode.data('origLabel') || parentNode.id();
        // Clean the label (remove probability displays)
        const cleanLabel = parentLabel.split('\n')[0].trim();
        
        // Check for inverse relationship (heavy mode uses cpt.inverse)
        const cpt = edge.data('cpt') || {};
        const isInverse = !!cpt.inverse;
        
        return isInverse ? `NOT ${cleanLabel}` : cleanLabel;
      });
      
      let logicStatement;
      if (parentLabels.length === 0) {
        logicStatement = 'No parent statements';
      } else if (parentLabels.length === 1) {
        logicStatement = parentLabels[0];
      } else {
        const connector = nodeType === NODE_TYPE_AND ? ' AND ' : ' OR ';
        logicStatement = parentLabels.join(connector);
      }
      
      box.innerHTML = `<div style="font-size: 17px; font-weight: 500; color: #000; margin-bottom: 8px;">${typeLabel}</div>
                       <div style="margin-bottom: 6px;">Current: ${formatProb(hp)}</div>
                       <div style="color: #666; font-style: italic; margin-bottom: 8px;">
                         <b>Statement:</b> ${logicStatement}
                       </div>`;
      container.parentElement.appendChild(box);
      return;
    }
  } else {
    // --- Lite Mode ---
    if (nodeType === NODE_TYPE_ASSERTION) {
      const base = node.data('prob');
      const adj = node.data('displayProb');
      const peerAdj = node.data('peerAdjusted') && typeof base === 'number' && typeof adj === 'number';
      if (typeof base !== "number") {
        box.innerHTML = `<div style="font-size: 17px; font-weight: 500; color: #000; margin-bottom: 8px;">${combinedLabel}</div>
                         <div style="margin-bottom: 6px;">Current: <b style="color: #666;">—</b></div>
                         <div style="color: #e65100; font-style: italic;">No incoming information.</div>`;
      } else {
        const shown = peerAdj ? adj : base;
        box.innerHTML = `<div style="font-size: 17px; font-weight: 500; color: #000; margin-bottom: 8px;">${combinedLabel}</div>
                         <div style="margin-bottom: 6px;">Current: <b style="font-size: 18px; color: #1565c0;">${Math.round(100 * shown)}%</b></div>`;
        if(peerAdj){
          const diff = adj - base; const sign = diff>0?'+':'−';
          box.innerHTML += `<div style="margin-top:6px;font-size:13px;color:${diff>0?'#2e7d32':'#c62828'};">Peer adj: ${sign}${Math.round(Math.abs(diff)*100)}%</div>`;
        }
      }
      // Apply robustness styling with dynamic color matching border
      const rlabel = node.data('robustnessLabel');
      if (rlabel) {
        const robust = node.data('robustness');
        const grayscale = robust !== undefined
          ? `rgb(${Math.round(180 - 60 * robust)}, ${Math.round(180 - 60 * robust)}, ${Math.round(180 - 60 * robust)})`
          : '#888';
        box.innerHTML += `<div style="margin-top: 6px;"><b style="color:#111;">Robustness</b>: <b style="color:${grayscale};">${rlabel}</b></div>`;
      }
      container.parentElement.appendChild(box);
      return;
    }
    if (nodeType === NODE_TYPE_AND || nodeType === NODE_TYPE_OR) {
      let typeLabel = nodeType === NODE_TYPE_AND ? 'AND' : 'OR';
      const lp = node.data('prob');
      
      // Build logical statement from parent nodes
      const incomingEdges = node.incomers('edge');
      const parentLabels = incomingEdges.map(edge => {
        const parentNode = edge.source();
        const parentLabel = parentNode.data('displayLabel') || parentNode.data('origLabel') || parentNode.id();
        // Clean the label (remove probability displays)
        const cleanLabel = parentLabel.split('\n')[0].trim();
        
        // Check for inverse relationship
        const cpt = edge.data('cpt') || {};
        const opposes = edge.data('opposes');
        const isInverse = !!cpt.inverse || !!opposes;
        
        return isInverse ? `NOT ${cleanLabel}` : cleanLabel;
      });
      
      let logicStatement;
      if (parentLabels.length === 0) {
        logicStatement = 'No parent statements';
      } else if (parentLabels.length === 1) {
        logicStatement = parentLabels[0];
      } else {
        const connector = nodeType === NODE_TYPE_AND ? ' AND ' : ' OR ';
        logicStatement = parentLabels.join(connector);
      }
      
      box.innerHTML = `<div style="font-size: 17px; font-weight: 500; color: #000; margin-bottom: 8px;">${typeLabel}</div>
                       <div style="margin-bottom: 6px;">Current: ${formatProb(lp)}</div>
                       <div style="color: #666; font-style: italic; margin-bottom: 8px;">
                         <b>Statement:</b> ${logicStatement}
                       </div>`;
      
      container.parentElement.appendChild(box);
      return;
    }
  }
  box.innerHTML = `<div style="font-size: 17px; font-weight: 500; color: #000; margin-bottom: 8px;">${combinedLabel}</div>
                   <div style="color: #e65100; font-style: italic;">Unknown node type</div>`;
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
  box.style.padding = '10px 16px';
  box.style.fontSize = '14px';  // Increased from 12px
  box.style.lineHeight = '1.4';
  box.style.fontFamily = 'Segoe UI, Roboto, Arial, sans-serif';
  box.style.minWidth = '120px';
  box.style.maxWidth = '280px';
  box.style.zIndex = 20;
  box.style.boxShadow = '0 2px 8px #1565c066';

  // Check if edge is virgin based on current mode
  const bayesMode = window.getBayesMode ? window.getBayesMode() : 'lite';
  const edgeTargetType = edge.target().data('type');
  let isVirgin = false;
  
  if (bayesMode === 'heavy') {
    const cpt = edge.data('cpt');
    const parentProb = edge.source().data('heavyProb');
    
    if (edgeTargetType === NODE_TYPE_AND || edgeTargetType === NODE_TYPE_OR) {
      isVirgin = typeof parentProb !== "number";
    } else {
      const hasCPT = cpt && 
                     typeof cpt.baseline === 'number' && 
                     typeof cpt.condTrue === 'number' && 
                     typeof cpt.condFalse === 'number';
      const hasParentProb = typeof parentProb === "number";
      
      isVirgin = !hasCPT || !hasParentProb;
    }
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
      // Handle both Heavy and Lite mode virgin edge displays
      if (bayesMode === 'heavy') {
        const cpt = edge.data('cpt');
        const hasCPT = cpt && 
                       typeof cpt.baseline === 'number' && 
                       typeof cpt.condTrue === 'number' && 
                       typeof cpt.condFalse === 'number';
        
        if (hasCPT) {
          // Assigned virgin - show the preserved CPT data
          const ratio = cpt.condFalse > 0 ? (cpt.condTrue / cpt.condFalse).toFixed(1) : "∞";
          const baseline = Math.round(cpt.baseline);
          box.innerHTML = `<div style="color: #666;"><b>CPT:</b> ${cpt.condTrue}% | ${cpt.condFalse}% (${ratio}:1)</div>`;
          box.innerHTML += `<div style="color: #666;"><b>Baseline:</b> ${baseline}%</div>`;
          box.innerHTML += `<div style="color: #666; font-size: 12px; margin-top: 4px;"><i>Parent has no probability</i></div>`;
        } else {
          // Unassigned virgin - show em dash
          box.innerHTML = `<div style="color: #999;"><b>CPT:</b> —</div>`;
          box.innerHTML += `<div style="color: #666; font-size: 12px;"><i>Not configured</i></div>`;
        }
      } else {
        // Lite mode logic (unchanged)
        const userAssignedWeight = edge.data('userAssignedWeight');
        if (userAssignedWeight !== undefined) {
          // Assigned virgin - show the preserved weight in orange
          const likert = weightToLikert(userAssignedWeight);
          const qualitativeLabel = likertDescriptor(likert);
          const isOpposing = edge.data('opposes') || edge.data('type') === 'opposes';
          const relationshipType = isOpposing ? 'opposes' : 'supports';
          
          box.innerHTML = `<div style="color: #666;"><b>Weight:</b> ${qualitativeLabel} (${relationshipType})</div>`;
        } else {
          // Unassigned virgin - show em dash
          box.innerHTML = `<div style="color: #999;"><b>Weight:</b> —</div>`;
          box.innerHTML += `<div style="color: #666; font-size: 12px;"><i>Not assigned</i></div>`;
        }
      }
    }
    container.parentElement.appendChild(box);
    return;
  }
  
  // Display different content based on target type and mode
  if (targetType === NODE_TYPE_AND || targetType === NODE_TYPE_OR) {
    const parentProb = bayesMode === 'heavy' ? 
      edge.source().data('heavyProb') : 
      edge.source().data('prob');
    const decimal = typeof parentProb === "number" ? parentProb.toFixed(1) : null;
    box.innerHTML = `<div><b>Logic:</b> ${baseLabel}</div>`;
    if (decimal !== null) {
      box.innerHTML += `<div><span style="font-size: 1.2em; font-weight: bold;">${decimal}</span></div>`;
    }
  } else {
    // Assertion edge display - different for Heavy vs Lite mode
    if (bayesMode === 'heavy') {
      const cpt = edge.data('cpt');
      
      // Convert percentages to decimals
      const condTrueDecimal = (cpt.condTrue / 100).toFixed(1);
      const condFalseDecimal = (cpt.condFalse / 100).toFixed(1);
      
      box.innerHTML = `<div><b>True/False:</b> ${condTrueDecimal} | ${condFalseDecimal}</div>`;
      
      // Show ratio as likelihood ratio
      const ratio = cpt.condFalse > 0 ? (cpt.condTrue / cpt.condFalse).toFixed(1) : "∞";
      box.innerHTML += `<div style="font-size: 14px; font-weight: bold; margin-top: 6px; color: #333;">Likelihood ratio = ${ratio}</div>`;
    } else {
      // Lite mode assertion edge display
      const cpt = edge.data('cpt') || {};
      const isInverse = !!(cpt.inverse || edge.data('opposes') || edge.data('type') === 'opposes');
      const displayLabel = isInverse ? `(${baseLabel})` : baseLabel;
      
      box.innerHTML = `<div style="color: #333; font-weight: 500;">Influence: <span style="font-weight: 600;">${displayLabel}</span></div>`;

      if (mods.length) {
        box.innerHTML += `<hr style="margin: 8px 0 6px 0; border: none; border-top: 1px solid #ddd;">`;
        mods.forEach(mod => {
          let color = '#666';
          if (mod.likert > 0) color = '#2e7d32';
          if (mod.likert < 0) color = '#c62828';
          const val = mod.likert > 0 ? '+' + mod.likert : '' + mod.likert;
          box.innerHTML += `<div style="color: ${color}; margin: 3px 0; font-weight: 500;">
            ${val}: ${mod.label}
          </div>`;
        });
      }
    }
  }

  // Display contributing factors if they exist
  const contributingFactors = edge.data('contributingFactors');
  if (contributingFactors && contributingFactors.length > 0) {
    box.innerHTML += `<div style="margin-top: 8px; border-top: 1px solid #ddd; padding-top: 6px;">`;
    box.innerHTML += `<div style="font-weight: 500; color: #333; margin-bottom: 4px;">Contributing factors:</div>`;
    contributingFactors.forEach(factor => {
      // Clean up the factor text and add bullet if it doesn't have one
      let displayFactor = factor.trim();
      if (!displayFactor.startsWith('•') && !displayFactor.startsWith('-') && !displayFactor.startsWith('*')) {
        displayFactor = '• ' + displayFactor;
      }
      box.innerHTML += `<div style="margin: 2px 0; font-size: 13px; color: #555; line-height: 1.3;">${displayFactor}</div>`;
    });
    box.innerHTML += `</div>`;
  }

  // Check if edge has rationale text and add indicator
  const rationale = edge.data('rationale');
  if (rationale && rationale.trim().length > 0) {
    box.innerHTML += `<div style="margin-top: 8px; font-size: 12px; color: #666; font-style: italic;">*see rationale</div>`;
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
    // Show edge hover in both modes now that Heavy mode has three-category system
    
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
