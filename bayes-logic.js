// bayes-logic.js

export function propagateBayesHeavy(cy, maxIterations = 10, tolerance = 0.001) {
  const nodes = cy.nodes().filter(n =>
    ['assertion', 'and', 'or'].includes((n.data('type') || '').toLowerCase())
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
      if (parentEdges.length === 0) return;

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
          // Single parent: direct conditional probability
          const edge = validEdges[0];
          const cpt = edge.data('cpt');
          const parentProb = edge.source().data('heavyProb') ?? 0.5;
          const { parentTrue, parentFalse } = getConditionalProbs(edge);
          
          // P(Child | Parent) = P(Child | Parent=true) * P(Parent=true) + P(Child | Parent=false) * P(Parent=false)
          newProb = (parentTrue / 100) * parentProb + (parentFalse / 100) * (1 - parentProb);
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
            
            // Avoid division by zero
            if (pFalseGivenParent > 0.001) {
              const likelihoodRatio = pTrueGivenParent / pFalseGivenParent;
              logOdds += Math.log(likelihoodRatio);
            }
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
      console.log(`Converged after ${iter + 1} iterations`);
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
