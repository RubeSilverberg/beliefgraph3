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
          // Facts are assumed to be 100% true in Heavy mode
          const explicitProb = node.data('explicitHeavyProb');
          if (explicitProb !== undefined) {
            node.data('heavyProb', explicitProb);
          } else {
            node.data('heavyProb', 1.0); // Default Facts to 100% true
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
          // Multiple parents: assume independence (Naive Bayes)
          // Use likelihood ratios for proper Bayesian updating
          let logOdds = 0; // Start with neutral odds (log(1) = 0)
          
          validEdges.forEach(edge => {
            const cpt = edge.data('cpt');
            const parentProb = edge.source().data('heavyProb') ?? 0.5;
            
            // Use same logic as single parent case - no inverse handling needed
            const pTargetGivenSourceTrue = Math.min(Math.max(cpt.condTrue / 100, 0.001), 0.999);
            const pTargetGivenSourceFalse = Math.min(Math.max(cpt.condFalse / 100, 0.001), 0.999);
            
            // Calculate likelihood ratio for this parent
            const pTrueGivenParent = pTargetGivenSourceTrue * parentProb + pTargetGivenSourceFalse * (1 - parentProb);
            const pFalseGivenParent = 1 - pTrueGivenParent;
            
            // Calculate likelihood ratio with epsilon-protected values
            const likelihoodRatio = pTrueGivenParent / pFalseGivenParent;
            logOdds += Math.log(likelihoodRatio);
          });
          
          // Convert log odds back to probability
          const odds = Math.exp(logOdds);
          newProb = odds / (1 + odds);
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
