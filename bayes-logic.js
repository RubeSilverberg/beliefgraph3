// bayes-logic.js

export function propagateBayesHeavy(cy) {
  const nodes = cy.nodes().filter(n =>
    ['assertion', 'and', 'or', 'fact'].includes((n.data('type') || '').toLowerCase())
  );

  // Initialize heavyProb if not already set
  nodes.forEach(node => {
    if (typeof node.data('heavyProb') !== 'number') {
      node.data('heavyProb', 0.5);
    }
  });

  // Topological sort to ensure proper calculation order
  const sortedNodes = topologicalSort(nodes, cy);

  // Single-pass calculation in dependency order
  sortedNodes.forEach(node => {
    const newProb = calculateNodeMarginal(node, cy);
    node.data('heavyProb', Math.max(0, Math.min(1, newProb)));
  });
}

function topologicalSort(nodes, cy) {
  const visited = new Set();
  const result = [];

  function dfsVisit(node) {
    if (visited.has(node.id())) return;
    
    // Visit all children first (post-order traversal)
    node.outgoers('edge').targets().forEach(child => {
      if (nodes.includes(child)) {
        dfsVisit(child);
      }
    });
    
    visited.add(node.id());
    result.unshift(node); // Add to front for proper ordering
  }

  nodes.forEach(node => {
    if (!visited.has(node.id())) {
      dfsVisit(node);
    }
  });

  return result;
}

function calculateNodeMarginal(node, cy) {
  const type = (node.data('type') || '').toLowerCase();
  const parentEdges = node.incomers('edge');
  
  // Root nodes (no parents)
  if (parentEdges.length === 0) {
    if (type === 'fact') {
      const explicitProb = node.data('explicitHeavyProb');
      return explicitProb !== undefined ? explicitProb : 0.995;
    }
    return 0.5; // Default for isolated AND/OR/ASSERTION nodes
  }

  // Calculate based on node type
  if (type === 'and') {
    return calculateAndMarginal(parentEdges);
  } else if (type === 'or') {
    return calculateOrMarginal(parentEdges);
  } else if (type === 'assertion') {
    return calculateNaiveBayesMarginal(node, parentEdges);
  }
  
  return 0.5; // Fallback
}

function calculateAndMarginal(parentEdges) {
  // AND node: product of parent probabilities
  return parentEdges.toArray().reduce((acc, edge) => {
    let parentProb = edge.source().data('heavyProb') ?? 0.5;
    
    // Check for inverse relationship (NOT) - heavy mode uses cpt.inverse
    const cpt = edge.data('cpt') || {};
    if (cpt.inverse) {
      parentProb = 1 - parentProb;
    }
    
    return acc * parentProb;
  }, 1);
}

function calculateOrMarginal(parentEdges) {
  // OR node: 1 - product of (1 - parent probabilities)
  return 1 - parentEdges.toArray().reduce((acc, edge) => {
    let parentProb = edge.source().data('heavyProb') ?? 0.5;
    
    // Check for inverse relationship (NOT) - heavy mode uses cpt.inverse
    const cpt = edge.data('cpt') || {};
    if (cpt.inverse) {
      parentProb = 1 - parentProb;
    }
    
    return acc * (1 - parentProb);
  }, 1);
}

function calculateNaiveBayesMarginal(node, parentEdges) {
  const validEdges = parentEdges.toArray().filter(edge => {
    const cpt = edge.data('cpt');
    return cpt && typeof cpt.condTrue === 'number' && typeof cpt.condFalse === 'number';
  });
  
  if (validEdges.length === 0) return 0.5;
  
  if (validEdges.length === 1) {
    // Single parent case: standard Bayesian calculation
    const edge = validEdges[0];
    const cpt = edge.data('cpt');
    const parentMarginal = edge.source().data('heavyProb') ?? 0.5;
    
    const pChildTrue_ParentTrue = Math.min(Math.max(cpt.condTrue / 100, 0.001), 0.999);
    const pChildTrue_ParentFalse = Math.min(Math.max(cpt.condFalse / 100, 0.001), 0.999);
    
    return pChildTrue_ParentTrue * parentMarginal + 
           pChildTrue_ParentFalse * (1 - parentMarginal);
  }
  
  // Multi-parent: exact Naive Bayes via joint enumeration with baseline normalization
  const maxParents = 8; // Set threshold for exact vs. fallback
  if (validEdges.length <= maxParents) {
    const numParents = validEdges.length;
    const parentNodes = validEdges.map(edge => edge.source());
    const cpts = validEdges.map(edge => {
      const cpt = edge.data('cpt');
      return {
        pTrue: Math.min(Math.max(cpt.condTrue / 100, 0.001), 0.999),
        pFalse: Math.min(Math.max(cpt.condFalse / 100, 0.001), 0.999),
        baseline: Math.min(Math.max((cpt.baseline || 50) / 100, 0.001), 0.999)
      };
    });

    // Check for inconsistent baselines
    const baselineVals = cpts.map(cpt => cpt.baseline);
    const minBaseline = Math.min(...baselineVals);
    const maxBaseline = Math.max(...baselineVals);

    if ((maxBaseline - minBaseline) / minBaseline > 0.05) {
      const message = `⚠️ Inconsistent Baselines Detected!\n\n` +
        `Assertion node "${node.data('label') || node.id()}" has mismatched baseline probabilities:\n` +
        baselineVals.map((b, i) => `• Parent ${i+1}: ${(b * 100).toFixed(1)}%`).join('\n') + '\n\n' +
        `Range: ${(minBaseline * 100).toFixed(1)}% - ${(maxBaseline * 100).toFixed(1)}%\n\n` +
        `For accurate Naive Bayes calculations, all CPTs for the same target should have identical baselines.`;
      
      alert(message);
    }

    let pChildTrue = 0;
    for (let combo = 0; combo < (1 << numParents); combo++) {
      let pCombo = 1;
      let likelihoodProduct = 1;
      let baselineProduct = 1;
      for (let i = 0; i < numParents; i++) {
        const parentIsTrue = !!(combo & (1 << i));
        const parentProb = parentNodes[i].data('heavyProb') ?? 0.5;
        const cpt = cpts[i];
        pCombo *= parentIsTrue ? parentProb : (1 - parentProb);
        likelihoodProduct *= parentIsTrue ? cpt.pTrue : cpt.pFalse;
        baselineProduct *= cpt.baseline;
      }
      // Normalize by baseline^(numParents-1)
      const baselineNormalization = baselineProduct / cpts[0].baseline;
      const pChildGivenCombo = likelihoodProduct / baselineNormalization;
      pChildTrue += pCombo * Math.max(0, Math.min(1, pChildGivenCombo));
    }
    return Math.max(0, Math.min(1, pChildTrue));
  } else {
    // Fallback: log-odds approximation for performance
    let logOdds = 0;
    validEdges.forEach(edge => {
      const cpt = edge.data('cpt');
      const parentProb = edge.source().data('heavyProb') ?? 0.5;
      const pTargetGivenSourceTrue = Math.min(Math.max(cpt.condTrue / 100, 0.001), 0.999);
      const pTargetGivenSourceFalse = Math.min(Math.max(cpt.condFalse / 100, 0.001), 0.999);
      const pTrueGivenParent = pTargetGivenSourceTrue * parentProb +
                              pTargetGivenSourceFalse * (1 - parentProb);
      const pFalseGivenParent = 1 - pTrueGivenParent;
      const likelihoodRatio = pTrueGivenParent / pFalseGivenParent;
      logOdds += Math.log(likelihoodRatio);
    });
    const odds = Math.exp(logOdds);
    return odds / (1 + odds);
  }
}

// Helper unchanged, just reprinted for clarity:
export function getConditionalProbs(edge) {
  const cpt = edge.data('cpt') || {};
  if (cpt.inverse) {
    return {
      parentTrue: cpt.condFalse,
      parentFalse: cpt.condTrue,
      baseline: cpt.baseline,
    };
  } else {
    return {
      parentTrue: cpt.condTrue,
      parentFalse: cpt.condFalse,
      baseline: cpt.baseline,
    };
  }
}

window.propagateBayesHeavy = propagateBayesHeavy;
