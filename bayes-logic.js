// bayes-logic.js

export function propagateBayesHeavy(cy, maxIterations = 10, tolerance = 0.001) {
  const nodes = cy.nodes().filter(n =>
    ['assertion', 'and', 'or', 'fact'].includes((n.data('type') || '').toLowerCase())
  );

  // Initialize heavyProb if not already set
  nodes.forEach(node => {
    if (typeof node.data('heavyProb') !== 'number') {
      node.data('heavyProb', 0.5);
    }
  });

  for (let iter = 0; iter < maxIterations; iter++) {
    let maxChange = 0;

    nodes.forEach(node => {
      const type = (node.data('type') || '').toLowerCase();
      const parentEdges = node.incomers('edge');
      
      // Handle Facts (nodes with no parents) - set explicit probability
      if (parentEdges.length === 0) {
        if (type === 'fact') {
          // Facts are assumed to be 100% true in Heavy mode
          // Unless they have explicit probability data
          const explicitProb = node.data('explicitHeavyProb');
          if (explicitProb !== undefined) {
            node.data('heavyProb', explicitProb);
          } else {
            node.data('heavyProb', 1.0); // Default Facts to 100% true
          }
        }
        return;
      }

      let newProb = 0.5; // default if logic fails

      if (type === 'and') {
        // AND node: product of parent probabilities
        newProb = parentEdges.toArray().reduce((acc, edge) => {
          const parentProb = edge.source().data('heavyProb') ?? 0.5;
          return acc * parentProb;
        }, 1);
      } else if (type === 'or') {
        // OR node: 1 - product of (1 - parentProb)
        const prod = parentEdges.toArray().reduce((acc, edge) => {
          const parentProb = edge.source().data('heavyProb') ?? 0.5;
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
          
          // Get the raw CPT values - these represent P(target=true | source=state)
          const pTargetGivenSourceTrue = cpt.condTrue / 100;   // P(B=true | A=true)
          const pTargetGivenSourceFalse = cpt.condFalse / 100; // P(B=true | A=false)
          
          // Handle inverse logic if needed
          let pTrue, pFalse;
          if (cpt.inverse) {
            pTrue = pTargetGivenSourceFalse;  // If inverse, swap the logic
            pFalse = pTargetGivenSourceTrue;
          } else {
            pTrue = pTargetGivenSourceTrue;   // Normal case
            pFalse = pTargetGivenSourceFalse;
          }
          
          // Calculate target probability: P(B=true) = P(B=true|A=true)*P(A=true) + P(B=true|A=false)*P(A=false)
          newProb = pTrue * sourceProb + pFalse * (1 - sourceProb);
        } else {
          // Multiple parents: assume independence (Naive Bayes)
          // Use likelihood ratios for proper Bayesian updating
          let logOdds = 0; // Start with neutral odds (log(1) = 0)
          
          validEdges.forEach(edge => {
            const cpt = edge.data('cpt');
            const parentProb = edge.source().data('heavyProb') ?? 0.5;
            const { parentTrue, parentFalse } = getConditionalProbs(edge);
            
            // Calculate likelihood ratio for this parent
            const pTrueGivenParent = (parentTrue / 100) * parentProb + (parentFalse / 100) * (1 - parentProb);
            const pFalseGivenParent = 1 - pTrueGivenParent;
            
            // Handle the likelihood ratio properly
            if (pFalseGivenParent > 0 && pTrueGivenParent > 0) {
              const likelihoodRatio = pTrueGivenParent / pFalseGivenParent;
              logOdds += Math.log(likelihoodRatio);
            } else if (pTrueGivenParent > 0) {
              // pFalseGivenParent = 0, evidence strongly supports true
              logOdds += 10; // Large positive value instead of infinity
            } else if (pFalseGivenParent > 0) {
              // pTrueGivenParent = 0, evidence strongly supports false  
              logOdds -= 10; // Large negative value instead of negative infinity
            }
            // If both are 0, skip this evidence (shouldn't happen with valid CPT)
          });
          
          // Convert log odds back to probability
          const odds = Math.exp(logOdds);
          newProb = odds / (1 + odds);
        }
      }

      const oldProb = node.data('heavyProb');
      node.data('heavyProb', newProb);
      maxChange = Math.max(maxChange, Math.abs(newProb - oldProb));
    });

    if (maxChange < tolerance) {
      break;
    }
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
