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

// Debug function to show detailed calculation steps
export function debugBayesCalculations(cy) {
  console.log("🔍 ===========================================");
  console.log("🔍 BELIEF GRAPH DEBUG CALCULATIONS");
  console.log("🔍 ===========================================");
  
  const nodes = cy.nodes().filter(n =>
    ['assertion', 'and', 'or', 'fact'].includes((n.data('type') || '').toLowerCase())
  );

  // Show calculation order
  const sortedNodes = topologicalSort(nodes, cy);
  console.log("📊 CALCULATION ORDER (topologically sorted):");
  sortedNodes.forEach((node, index) => {
    const type = (node.data('type') || '').toLowerCase();
    const label = node.data('label') || node.id();
    console.log(`  ${index + 1}. [${type.toUpperCase()}] ${label}`);
  });
  console.log("");

  // Calculate and show details for each node
  sortedNodes.forEach(node => {
    const type = (node.data('type') || '').toLowerCase();
    const label = node.data('label') || node.id();
    const parentEdges = node.incomers('edge');
    
    console.log(`🎯 NODE: [${type.toUpperCase()}] ${label}`);
    console.log(`   Current heavyProb: ${node.data('heavyProb')?.toFixed(4) || 'undefined'}`);
    
    if (parentEdges.length === 0) {
      console.log("   ✅ Root node (no parents)");
      if (type === 'fact') {
        const explicitProb = node.data('explicitHeavyProb');
        console.log(`   🎲 Explicit probability: ${explicitProb !== undefined ? explicitProb : 0.995}`);
      } else {
        console.log("   🎲 Default probability: 0.5");
      }
    } else {
      console.log(`   📥 Parents (${parentEdges.length}):`);
      parentEdges.forEach((edge, i) => {
        const parent = edge.source();
        const parentLabel = parent.data('label') || parent.id();
        const parentProb = parent.data('heavyProb') ?? 0.5;
        const cpt = edge.data('cpt') || {};
        console.log(`     ${i + 1}. ${parentLabel} (prob: ${parentProb.toFixed(4)})`);
        if (type === 'assertion') {
          console.log(`        CPT: condTrue=${cpt.condTrue}%, condFalse=${cpt.condFalse}%, baseline=${cpt.baseline || 50}%`);
        } else if (cpt.inverse) {
          console.log(`        🔄 Inverse relationship`);
        }
      });
      
      // Show calculation details
      if (type === 'assertion') {
        debugAssertionCalculation(node, parentEdges);
      } else if (type === 'and') {
        debugAndCalculation(parentEdges);
      } else if (type === 'or') {
        debugOrCalculation(parentEdges);
      }
    }
    console.log("");
  });
  
  console.log("🔍 ===========================================");
  console.log("🔍 DEBUG COMPLETE");
  console.log("🔍 ===========================================");
}

function debugAssertionCalculation(node, parentEdges) {
  const validEdges = parentEdges.toArray().filter(edge => {
    const cpt = edge.data('cpt');
    return cpt && typeof cpt.condTrue === 'number' && typeof cpt.condFalse === 'number';
  });
  
  console.log(`   🧮 ASSERTION CALCULATION:`);
  
  if (validEdges.length === 0) {
    console.log("     ❌ No valid CPTs found, using default 0.5");
    return;
  }
  
  if (validEdges.length === 1) {
    const edge = validEdges[0];
    const cpt = edge.data('cpt');
    const parentMarginal = edge.source().data('heavyProb') ?? 0.5;
    
    const pTrue = Math.min(Math.max(cpt.condTrue / 100, 0.001), 0.999);
    const pFalse = Math.min(Math.max(cpt.condFalse / 100, 0.001), 0.999);
    
    console.log(`     📋 Single parent calculation:`);
    console.log(`        P(child=true|parent=true) = ${pTrue.toFixed(4)}`);
    console.log(`        P(child=true|parent=false) = ${pFalse.toFixed(4)}`);
    console.log(`        Parent marginal = ${parentMarginal.toFixed(4)}`);
    
    const result = pTrue * parentMarginal + pFalse * (1 - parentMarginal);
    console.log(`        Result = ${pTrue.toFixed(4)} × ${parentMarginal.toFixed(4)} + ${pFalse.toFixed(4)} × ${(1-parentMarginal).toFixed(4)} = ${result.toFixed(4)}`);
    return;
  }
  
  // Multi-parent enumeration
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

  console.log(`     📋 Multi-parent enumeration (${numParents} parents):`);
  console.log(`        Baselines: ${cpts.map(c => (c.baseline * 100).toFixed(1) + '%').join(', ')}`);
  
  // Check baselines
  const baselineVals = cpts.map(cpt => cpt.baseline);
  const minBaseline = Math.min(...baselineVals);
  const maxBaseline = Math.max(...baselineVals);
  if ((maxBaseline - minBaseline) / minBaseline > 0.05) {
    console.log(`        ⚠️  BASELINE INCONSISTENCY: ${(minBaseline * 100).toFixed(1)}% - ${(maxBaseline * 100).toFixed(1)}%`);
  }

  let pChildTrue = 0;
  console.log(`        Enumerating ${1 << numParents} combinations:`);
  
  for (let combo = 0; combo < (1 << numParents); combo++) {
    let pCombo = 1;
    let likelihoodProduct = 1;
    let baselineProduct = 1;
    let comboStr = "";
    
    for (let i = 0; i < numParents; i++) {
      const parentIsTrue = !!(combo & (1 << i));
      const parentProb = parentNodes[i].data('heavyProb') ?? 0.5;
      const cpt = cpts[i];
      
      pCombo *= parentIsTrue ? parentProb : (1 - parentProb);
      likelihoodProduct *= parentIsTrue ? cpt.pTrue : cpt.pFalse;
      baselineProduct *= cpt.baseline;
      comboStr += parentIsTrue ? "T" : "F";
    }
    
    const baselineNormalization = baselineProduct / cpts[0].baseline;
    const pChildGivenCombo = likelihoodProduct / baselineNormalization;
    const contribution = pCombo * Math.max(0, Math.min(1, pChildGivenCombo));
    pChildTrue += contribution;
    
    if (combo < 8) { // Show first 8 combinations to avoid spam
      console.log(`          ${comboStr}: P=${pCombo.toFixed(4)}, L=${likelihoodProduct.toFixed(4)}, B=${baselineNormalization.toFixed(4)}, P(child|combo)=${pChildGivenCombo.toFixed(4)}, contrib=${contribution.toFixed(4)}`);
    } else if (combo === 8) {
      console.log(`          ... (showing first 8 of ${1 << numParents} combinations)`);
    }
  }
  
  console.log(`        Final result: ${pChildTrue.toFixed(4)}`);
}

function debugAndCalculation(parentEdges) {
  console.log(`   🧮 AND CALCULATION:`);
  let result = 1;
  parentEdges.forEach((edge, i) => {
    let parentProb = edge.source().data('heavyProb') ?? 0.5;
    const cpt = edge.data('cpt') || {};
    if (cpt.inverse) {
      parentProb = 1 - parentProb;
      console.log(`     Parent ${i+1}: ${parentProb.toFixed(4)} (inverted)`);
    } else {
      console.log(`     Parent ${i+1}: ${parentProb.toFixed(4)}`);
    }
    result *= parentProb;
  });
  console.log(`     Product: ${result.toFixed(4)}`);
}

function debugOrCalculation(parentEdges) {
  console.log(`   🧮 OR CALCULATION:`);
  let result = 1;
  parentEdges.forEach((edge, i) => {
    let parentProb = edge.source().data('heavyProb') ?? 0.5;
    const cpt = edge.data('cpt') || {};
    if (cpt.inverse) {
      parentProb = 1 - parentProb;
      console.log(`     Parent ${i+1}: ${parentProb.toFixed(4)} (inverted), (1-p)=${(1-parentProb).toFixed(4)}`);
    } else {
      console.log(`     Parent ${i+1}: ${parentProb.toFixed(4)}, (1-p)=${(1-parentProb).toFixed(4)}`);
    }
    result *= (1 - parentProb);
  });
  result = 1 - result;
  console.log(`     1 - product of (1-p): ${result.toFixed(4)}`);
}

window.debugBayesCalculations = debugBayesCalculations;
