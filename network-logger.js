// Network Logger for pgmpy Testing
// This function extracts and logs the complete Bayesian network structure
// for mathematical verification in pgmpy

function logNetworkForPgmpy(cy) {
  console.log("=== PGMPY PYTHON CODE ===");
  console.log("# Copy and paste this into the USER INPUT SECTION of your pgmpy template");
  console.log("");
  
  // Get all nodes and edges
  const allNodes = cy.nodes().jsons();
  const allEdges = cy.edges().jsons();
  
  // Filter out AND/OR nodes for now - treat everything as assertion nodes
  const nodes = allNodes.filter(n => ['fact', 'assertion'].includes(n.data.type));
  const edges = allEdges.filter(e => {
    const source = cy.getElementById(e.data.source);
    const target = cy.getElementById(e.data.target);
    return ['fact', 'assertion'].includes(source.data('type')) && 
           ['fact', 'assertion'].includes(target.data('type'));
  });
  
  // Generate nodes list
  const nodeNames = nodes.map(n => n.data.id);
  console.log("# Node definitions");
  console.log(`nodes = ${JSON.stringify(nodeNames)}`);
  console.log("");
  
  // Generate edges list
  const edgeList = edges.map(e => [e.data.source, e.data.target]);
  console.log("# Edge definitions (parent, child) tuples");
  console.log(`edges = ${JSON.stringify(edgeList)}`);
  console.log("");
  
  // Generate priors for root nodes (nodes with no incoming edges)
  console.log("# Prior probabilities for root nodes");
  console.log("priors = {");
  nodes.forEach(node => {
    const nodeId = node.data.id;
    const incomingEdges = edges.filter(e => e.data.target === nodeId);
    
    if (incomingEdges.length === 0) {
      // This is a root node
      let prob = 0.5; // default
      if (node.data.type === 'fact') {
        prob = node.data.prob || node.data.heavyProb || 0.5;
      }
      const probTrue = Number(prob.toFixed(4));
      const probFalse = Number((1 - prob).toFixed(4));
      console.log(`    '${nodeId}': [[${probTrue}], [${probFalse}]],`);
    }
  });
  console.log("}");
  console.log("");
  
  // Generate CPTs for non-root nodes
  console.log("# Conditional Probability Tables");
  console.log("cpts = {");
  nodes.forEach(node => {
    const nodeId = node.data.id;
    const incomingEdges = edges.filter(e => e.data.target === nodeId);
    
    if (incomingEdges.length > 0) {
      // This node has parents
      const parentIds = incomingEdges.map(e => e.data.source);
      console.log(`    '${nodeId}': {`);
      console.log(`        'parents': ${JSON.stringify(parentIds)},`);
      
      if (incomingEdges.length === 1) {
        // Single parent - use joint style
        const edge = incomingEdges[0];
        const cpt = edge.data.cpt;
        if (cpt) {
          const pTrueGivenFalse = Number((cpt.condFalse / 100).toFixed(4));
          const pTrueGivenTrue = Number((cpt.condTrue / 100).toFixed(4));
          
          console.log(`        'style': 'joint',`);
          console.log(`        'table': [${pTrueGivenFalse}, ${pTrueGivenTrue}]  # P(T|F), P(T|T)`);
        } else {
          // No CPT data, use default
          console.log(`        'style': 'joint',`);
          console.log(`        'table': [0.5, 0.5]  # P(T|F), P(T|T)`);
        }
      } else {
        // Multiple parents - use naive style
        console.log(`        'style': 'naive',`);
        
        console.log(`        'per_parent': [`);
        incomingEdges.forEach((edge, i) => {
          const cpt = edge.data.cpt;
          if (cpt) {
            const pT = Number((cpt.condTrue / 100).toFixed(3));
            const pF = Number((cpt.condFalse / 100).toFixed(3));
            console.log(`            {'T': ${pT}, 'F': ${pF}},`);
          } else {
            console.log(`            {'T': 0.5, 'F': 0.5},`);
          }
        });
        console.log(`        ],`);
        
        // Get baseline from first CPT (they should be consistent)
        const firstCpt = incomingEdges[0].data.cpt;
        const baseline = firstCpt ? Number((firstCpt.baseline / 100 || 0.5).toFixed(3)) : 0.5;
        console.log(`        'baseline': ${baseline}`);
      }
      
      console.log(`    },`);
    }
  });
  console.log("}");
  console.log("");
  console.log("=== END PGMPY CODE ===");
}

// Make it available globally
window.logNetworkForPgmpy = logNetworkForPgmpy;

// Auto-log if cy is available
if (typeof cy !== 'undefined') {
  console.log("Network logger loaded. Use logNetworkForPgmpy(cy) to generate network log.");
}
