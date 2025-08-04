// Network Logger for pgmpy Testing
// Simplified for compatibility with refactored Bayes Heavy code

function logNetworkForPgmpy(cy) {
  console.log("=== GENERATING PGMPY PYTHON SCRIPT ===");
  
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
  
  // Generate the complete Python script
  let pythonScript = `from pgmpy.models import DiscreteBayesianNetwork
from pgmpy.factors.discrete import TabularCPD
from pgmpy.inference import VariableElimination
import itertools
import numpy as np

def create_cpd(node, parents, probabilities):
    """
    Create a CPD for a node with given parents and probability table.
    probabilities: list of P(node=True | parent_combination) for all 2^N combinations
    """
    if not parents:
        return None  # Root node, handled separately
    
    cpd = TabularCPD(
        variable=node,
        variable_card=2,
        values=[probabilities, [1 - p for p in probabilities]],
        evidence=parents,
        evidence_card=[2] * len(parents)
    )
    return cpd

def build_bayesian_network(nodes, edges, priors, cpts):
    model = DiscreteBayesianNetwork(edges)

    # Add priors for root nodes
    for node in nodes:
        if node in priors:
            model.add_cpds(TabularCPD(node, 2, priors[node]))

    # Add CPDs for non-root nodes
    for node in nodes:
        if node in cpts:
            parents, probabilities = cpts[node]
            cpd = create_cpd(node, parents, probabilities)
            if cpd:
                model.add_cpds(cpd)

    assert model.check_model(), "Model failed validation!"
    return model

def run_inference(model, nodes, priors):
    infer = VariableElimination(model)

    print("=== Marginal probabilities ===")
    for var in nodes:
        res = infer.query(variables=[var])
        print(f"{var}: P(True) = {res.values[0]:.4f}")

# === USER INPUT SECTION ===
# Generated from Belief Graph on ${new Date().toLocaleString()}

`;

  // Generate nodes list
  const nodeNames = nodes.map(n => n.data.id);
  pythonScript += `nodes = ${JSON.stringify(nodeNames)}\n\n`;
  
  // Generate edges list
  const edgeList = edges.map(e => [e.data.source, e.data.target]);
  pythonScript += `edges = ${JSON.stringify(edgeList)}\n\n`;
  
  // Generate priors for root nodes (2D lists: [[P(True)], [P(False)]])
  pythonScript += "priors = {\n";
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
      pythonScript += `    '${nodeId}': [[${probTrue}], [${probFalse}]],\n`;
    }
  });
  pythonScript += "}\n\n";
  
  // Generate CPTs for non-root nodes
  // Format: node_id: [parent_list, probability_list]
  pythonScript += "# CPTs: {node: [parents, probabilities]}\n";
  pythonScript += "cpts = {\n";
  nodes.forEach(node => {
    const nodeId = node.data.id;
    const incomingEdges = edges.filter(e => e.data.target === nodeId);
    
    if (incomingEdges.length > 0) {
      const parentIds = incomingEdges.map(e => e.data.source);
      
      // Calculate probability table for all parent combinations
      // For N parents, we need 2^N probabilities in pgmpy order
      const numCombinations = Math.pow(2, parentIds.length);
      const probabilities = [];
      
      for (let combo = 0; combo < numCombinations; combo++) {
        if (incomingEdges.length === 1) {
          // Single parent case: straightforward
          const edge = incomingEdges[0];
          const cpt = edge.data.cpt;
          if (cpt) {
            // pgmpy order: parent=False first, then parent=True
            const prob = combo === 0 ? (cpt.condFalse / 100) : (cpt.condTrue / 100);
            probabilities.push(Number(prob.toFixed(4)));
          } else {
            probabilities.push(0.5); // default
          }
        } else {
          // Multi-parent case: use standard Naive Bayes
          // This should match exactly what calculateNaiveBayesMarginal does
          let likelihood = 1.0;
          let baseline = 0.5; // default
          
          for (let i = 0; i < parentIds.length; i++) {
            const parentIsTrue = !!(combo & (1 << i));
            const edge = incomingEdges[i];
            const cpt = edge.data.cpt;
            
            if (cpt) {
              baseline = (cpt.baseline || 50) / 100; // use first edge's baseline
              const prob = parentIsTrue ? (cpt.condTrue / 100) : (cpt.condFalse / 100);
              likelihood *= prob;
            } else {
              likelihood *= 0.5; // default
            }
          }
          
          // Naive Bayes normalization: divide by baseline^(N-1)
          const normalization = Math.pow(baseline, parentIds.length - 1);
          const finalProb = Math.max(0, Math.min(1, likelihood / normalization));
          probabilities.push(Number(finalProb.toFixed(4)));
        }
      }
      
      pythonScript += `    '${nodeId}': [${JSON.stringify(parentIds)}, ${JSON.stringify(probabilities)}],\n`;
    }
  });
  pythonScript += "}\n\n";
  
  pythonScript += `# === END USER INPUT ===

if __name__ == "__main__":
    model = build_bayesian_network(nodes, edges, priors, cpts)
    run_inference(model, nodes, priors)
`;

  // Create and download the file
  const blob = new Blob([pythonScript], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'belief_graph_pgmpy.py';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log("✅ Downloaded simplified pgmpy script: belief_graph_pgmpy.py");
  console.log("📁 Now matches the refactored Bayes Heavy implementation!");
}

// Make it available globally
window.logNetworkForPgmpy = logNetworkForPgmpy;

// Auto-log if cy is available
if (typeof cy !== 'undefined') {
  console.log("Network logger loaded. Use logNetworkForPgmpy(cy) to generate network log.");
}
