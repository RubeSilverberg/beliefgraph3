// Network Logger for pgmpy Testing
// This function extracts and logs the complete Bayesian network structure
// for mathematical verification in pgmpy

function logNetworkForPgmpy(cy) {
  console.log("=== BAYESIAN NETWORK STRUCTURE FOR PGMPY TESTING ===");
  console.log("");
  
  // Get all nodes and edges
  const nodes = cy.nodes().jsons();
  const edges = cy.edges().jsons();
  
  // Separate fact nodes and assertion nodes
  const factNodes = nodes.filter(n => n.data.type === 'fact');
  const assertionNodes = nodes.filter(n => n.data.type === 'assertion');
  const andNodes = nodes.filter(n => n.data.type === 'and');
  const orNodes = nodes.filter(n => n.data.type === 'or');
  
  console.log("1. NODES:");
  console.log("=========");
  
  // Log fact nodes (prior probabilities)
  console.log("FACT NODES (Prior Probabilities):");
  factNodes.forEach(node => {
    const id = node.data.id;
    const label = node.data.origLabel || node.data.label;
    const prob = node.data.prob || node.data.heavyProb || 0.5;
    console.log(`  ${id}: "${label}" - P(${label}) = ${prob}`);
  });
  console.log("");
  
  // Log assertion nodes
  console.log("ASSERTION NODES (Evidence/Query Nodes):");
  assertionNodes.forEach(node => {
    const id = node.data.id;
    const label = node.data.origLabel || node.data.label;
    const isVirgin = node.data.isVirgin || false;
    console.log(`  ${id}: "${label}" - Virgin: ${isVirgin}`);
  });
  console.log("");
  
  // Log logic nodes if any
  if (andNodes.length > 0) {
    console.log("AND NODES:");
    andNodes.forEach(node => {
      const id = node.data.id;
      const label = node.data.origLabel || node.data.label;
      console.log(`  ${id}: "${label}"`);
    });
    console.log("");
  }
  
  if (orNodes.length > 0) {
    console.log("OR NODES:");
    orNodes.forEach(node => {
      const id = node.data.id;
      const label = node.data.origLabel || node.data.label;
      console.log(`  ${id}: "${label}"`);
    });
    console.log("");
  }
  
  console.log("2. EDGES & CONDITIONAL PROBABILITY TABLES:");
  console.log("==========================================");
  
  // Log edges with CPT data
  edges.forEach(edge => {
    const sourceId = edge.data.source;
    const targetId = edge.data.target;
    const sourceNode = cy.getElementById(sourceId);
    const targetNode = cy.getElementById(targetId);
    const sourceLabel = sourceNode.data('origLabel') || sourceNode.data('label') || sourceId;
    const targetLabel = targetNode.data('origLabel') || targetNode.data('label') || targetId;
    
    console.log(`EDGE: ${sourceId} → ${targetId}`);
    console.log(`  From: "${sourceLabel}" to "${targetLabel}"`);
    
    const cpt = edge.data.cpt;
    if (cpt) {
      console.log(`  CPT Values:`);
      console.log(`    Baseline: P(${targetLabel}) = ${cpt.baseline}%`);
      console.log(`    P(${targetLabel} | ${sourceLabel} = true) = ${cpt.condTrue}%`);
      console.log(`    P(${targetLabel} | ${sourceLabel} = false) = ${cpt.condFalse}%`);
    } else {
      console.log(`  No CPT data (virgin edge)`);
    }
    console.log("");
  });
  
  console.log("3. PGMPY NETWORK SUMMARY:");
  console.log("=========================");
  console.log("Variables:");
  [...factNodes, ...assertionNodes, ...andNodes, ...orNodes].forEach(node => {
    const id = node.data.id;
    const label = node.data.origLabel || node.data.label;
    console.log(`  ${id} (${label}): Binary [True, False]`);
  });
  console.log("");
  
  console.log("Dependencies:");
  edges.forEach(edge => {
    const sourceId = edge.data.source;
    const targetId = edge.data.target;
    console.log(`  ${targetId} depends on ${sourceId}`);
  });
  console.log("");
  
  console.log("Prior Probabilities:");
  factNodes.forEach(node => {
    const id = node.data.id;
    const prob = node.data.prob || node.data.heavyProb || 0.5;
    console.log(`  P(${id} = True) = ${prob}`);
    console.log(`  P(${id} = False) = ${1 - prob}`);
  });
  console.log("");
  
  console.log("Conditional Probabilities:");
  edges.forEach(edge => {
    const cpt = edge.data.cpt;
    if (cpt) {
      const sourceId = edge.data.source;
      const targetId = edge.data.target;
      console.log(`  For ${targetId}:`);
      console.log(`    P(${targetId} = True | ${sourceId} = True) = ${cpt.condTrue / 100}`);
      console.log(`    P(${targetId} = False | ${sourceId} = True) = ${(100 - cpt.condTrue) / 100}`);
      console.log(`    P(${targetId} = True | ${sourceId} = False) = ${cpt.condFalse / 100}`);
      console.log(`    P(${targetId} = False | ${sourceId} = False) = ${(100 - cpt.condFalse) / 100}`);
      console.log("");
    }
  });
  
  console.log("=== END NETWORK LOG ===");
}

// Make it available globally
window.logNetworkForPgmpy = logNetworkForPgmpy;

// Auto-log if cy is available
if (typeof cy !== 'undefined') {
  console.log("Network logger loaded. Use logNetworkForPgmpy(cy) to generate network log.");
}
