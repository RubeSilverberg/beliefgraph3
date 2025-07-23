// bayes-logic.js

export function propagateBayesHeavy(cy) {
  // For each assertion node with parents:
  cy.nodes().forEach(node => {
    const parents = node.incomers('edge');
    if (parents.length === 0) return; // No CPT to apply

    // For now, assume only one parent edge (expand to multi-parent CPTs later)
    const edge = parents[0];
    const cpt = edge.data('cpt');
    if (!cpt) return; // No CPT defined

    // Get parent node probability
    const parentNode = edge.source();
    const parentProb = parentNode.data('prob');

    // Unpack correct CPT values (handle inverse)
    const { parentTrue, parentFalse, baseline } = getConditionalProbs(edge);

    // Calculate child probability:
    //   P(child) = P(child|parent) * P(parent) + P(child|not parent) * (1 - P(parent))
    const childProb = (parentTrue / 100) * parentProb + (parentFalse / 100) * (1 - parentProb);

    node.data('prob', childProb); // Write back
  });
}
// Helper
export function getConditionalProbs(edge) {
  const cpt = edge.data('cpt') || {};
  if (cpt.inverse) {
    return {
      parentTrue: cpt.condFalse,
      parentFalse: cpt.condTrue,
      baseline: cpt.baseline
    };
  } else {
    return {
      parentTrue: cpt.condTrue,
      parentFalse: cpt.condFalse,
      baseline: cpt.baseline
    };
  }
}
window.propagateBayesHeavy = propagateBayesHeavy;
