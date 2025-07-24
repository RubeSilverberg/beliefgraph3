// bayes-logic.js

export function propagateBayesHeavy(cy, maxIterations = 10, tolerance = 0.001) {
  const assertionNodes = cy.nodes().filter(n => n.data('type') === 'assertion');

  // Initialize heavyProb if not already set
  assertionNodes.forEach(node => {
    if (typeof node.data('heavyProb') !== 'number') {
      node.data('heavyProb', 0.5);
    }
  });

  for (let iter = 0; iter < maxIterations; iter++) {
    let maxChange = 0;

    assertionNodes.forEach(node => {
      const parents = node.incomers('edge');
      if (parents.length === 0) return; // No CPT to apply

      const edge = parents[0];
      const cpt = edge.data('cpt');
      if (!cpt) return; // No CPT defined

      const parentNode = edge.source();
      const parentProb = parentNode.data('heavyProb') ?? 0.5; // Heavy-specific

      const { parentTrue, parentFalse } = getConditionalProbs(edge);

      const newChildProb =
        (parentTrue / 100) * parentProb +
        (parentFalse / 100) * (1 - parentProb);

      const oldChildProb = node.data('heavyProb');
      node.data('heavyProb', newChildProb);

      maxChange = Math.max(maxChange, Math.abs(newChildProb - oldChildProb));
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
