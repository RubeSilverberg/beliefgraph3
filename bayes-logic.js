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
    return calculateNaiveBayesMarginal(parentEdges);
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

function calculateNaiveBayesMarginal(parentEdges) {
  const validEdges = parentEdges.toArray().filter(edge => {
    const cpt = edge.data('cpt');
    return cpt && typeof cpt.condTrue === 'number' && typeof cpt.condFalse === 'number';
  });
  
  if (validEdges.length === 0) return 0.5;
  
  // Get baseline from first edge's CPT (all edges should have same baseline for this node)
  // If baseline not set, default to 50% for consistency with current assertion node initialization
  const firstCpt = validEdges[0].data('cpt');
  const baseline = (typeof firstCpt.baseline === 'number') ? firstCpt.baseline / 100 : 0.5;
  
  if (validEdges.length === 1) {
    // Single parent case: standard Bayesian calculation
    const edge = validEdges[0];
    const cpt = edge.data('cpt');
    const parentMarginal = edge.source().data('heavyProb') ?? 0.5; // Use computed marginal
    
    const pChildTrue_ParentTrue = Math.min(Math.max(cpt.condTrue / 100, 0.001), 0.999);
    const pChildTrue_ParentFalse = Math.min(Math.max(cpt.condFalse / 100, 0.001), 0.999);
    
    // Direct calculation - CPT values already encode the relationship direction
    return pChildTrue_ParentTrue * parentMarginal + 
           pChildTrue_ParentFalse * (1 - parentMarginal);
  }
  
  // Multiple parents: Naive Bayes assumption (conditional independence)
  // Start with baseline as prior probability in log-odds space
  const baselineOdds = baseline / (1 - baseline);
  let logOdds = Math.log(Math.max(baselineOdds, 0.001)); // Start with baseline prior
  
  validEdges.forEach(edge => {
    const cpt = edge.data('cpt');
    const parentMarginal = edge.source().data('heavyProb') ?? 0.5; // Use computed marginal
    
    const pChildTrue_ParentTrue = Math.min(Math.max(cpt.condTrue / 100, 0.001), 0.999);
    const pChildTrue_ParentFalse = Math.min(Math.max(cpt.condFalse / 100, 0.001), 0.999);
    
    // Calculate likelihood contribution - no inverse handling needed
    const pChildTrue_GivenThisParent = pChildTrue_ParentTrue * parentMarginal + 
                                      pChildTrue_ParentFalse * (1 - parentMarginal);
    const pChildFalse_GivenThisParent = 1 - pChildTrue_GivenThisParent;
    
    // Add this parent's log-likelihood ratio to total evidence
    const likelihoodRatio = pChildTrue_GivenThisParent / Math.max(pChildFalse_GivenThisParent, 0.001);
    logOdds += Math.log(Math.max(likelihoodRatio, 0.001)); // Epsilon protection
  });
  
  // Convert log-odds back to probability
  const odds = Math.exp(logOdds);
  return odds / (1 + odds);
}

// Make the function available globally
window.propagateBayesHeavy = propagateBayesHeavy;
