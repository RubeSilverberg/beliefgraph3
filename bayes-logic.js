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

  // Single pass calculation - all operations are deterministic
  nodes.forEach(node => {
      const type = (node.data('type') || '').toLowerCase();
      const parentEdges = node.incomers('edge');
      
      // Handle root nodes (nodes with no parents)
      if (parentEdges.length === 0) {
        if (type === 'fact') {
          // Facts use same high probability as lite mode for consistency
          const explicitProb = node.data('explicitHeavyProb');
          if (explicitProb !== undefined) {
            node.data('heavyProb', explicitProb);
          } else {
            node.data('heavyProb', 0.995); // Match lite mode FACT_PROB
          }
        }
        // Note: AND/OR/ASSERTION nodes with no parents keep their initialized 0.5 probability
        return;
      }

      let newProb = 0.5; // default if logic fails

      if (type === 'and') {
        // AND node: product of parent probabilities
        newProb = parentEdges.toArray().reduce((acc, edge) => {
          let parentProb = edge.source().data('heavyProb') ?? 0.5;
          
          // Check for inverse relationship (NOT) - heavy mode uses cpt.inverse
          const cpt = edge.data('cpt') || {};
          if (cpt.inverse) {
            parentProb = 1 - parentProb;
          }
          
          return acc * parentProb;
        }, 1);
      } else if (type === 'or') {
        // OR node: 1 - product of (1 - parentProb)
        const prod = parentEdges.toArray().reduce((acc, edge) => {
          let parentProb = edge.source().data('heavyProb') ?? 0.5;
          
          // Check for inverse relationship (NOT) - heavy mode uses cpt.inverse
          const cpt = edge.data('cpt') || {};
          if (cpt.inverse) {
            parentProb = 1 - parentProb;
          }
          
          return acc * (1 - parentProb);
        }, 1);
        newProb = 1 - prod;
      } else if (type === 'assertion') {
        // Proper Bayesian inference with CPT
        const validEdges = parentEdges.toArray().filter(edge => {
          const cpt = edge.data('cpt');
          return cpt && 
                 typeof cpt.condTrue === 'number' && 
                 typeof cpt.condFalse === 'number';
        });
        
        if (validEdges.length === 0) {
          // No valid CPT edges - keep current probability
          return;
        }
        
        if (validEdges.length === 1) {
          // Single parent: Always update target using source (A → B)
          const edge = validEdges[0];
          const cpt = edge.data('cpt');
          const sourceNode = edge.source(); // A
          const targetNode = edge.target(); // B (this node)
          const sourceProb = sourceNode.data('heavyProb') ?? 0.5;
          
          // Get the CPT values with epsilon clamping
          const pTargetGivenSourceTrue = Math.min(Math.max(cpt.condTrue / 100, 0.001), 0.999);   // P(B=true | A=true)
          const pTargetGivenSourceFalse = Math.min(Math.max(cpt.condFalse / 100, 0.001), 0.999); // P(B=true | A=false)
          
          // No need to handle inverse logic here - the UI already set the correct values
          // when inverse was checked, so condTrue/condFalse are already correct
          
          // Calculate target probability: P(B=true) = P(B=true|A=true)*P(A=true) + P(B=true|A=false)*P(A=false)
          newProb = pTargetGivenSourceTrue * sourceProb + pTargetGivenSourceFalse * (1 - sourceProb);
        } else {
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
            newProb = Math.max(0, Math.min(1, pChildTrue));
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
            newProb = odds / (1 + odds);
          }
        }
      }

      const oldProb = node.data('heavyProb');
      
      // Clamp probability to valid range [0, 1]
      newProb = Math.max(0, Math.min(1, newProb));
      
      node.data('heavyProb', newProb);
    });
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
