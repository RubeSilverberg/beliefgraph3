// Network Logger for pgmpy Testing
// This function extracts and logs the complete Bayesian network structure
// for mathematical verification in pgmpy

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

def build_naive_joint_cpt(parents, per_parent_cpts, baseline):
    """
    Given:
      - parents: list of parent node names
      - per_parent_cpts: list of dicts, one per parent, each with keys:
           'T' (prob child True | parent True)
           'F' (prob child True | parent False)
      - baseline: marginal P(child True) with no parents
    Returns:
      - List of joint probabilities (P(child=True|parent combo)) for all 2^N parent combos,
        ordered lexicographically (pgmpy order).
    """
    combos = list(itertools.product([0, 1], repeat=len(parents)))  # 0=True, 1=False
    probs = []
    for combo in combos:
        prod = 1.0
        for idx, val in enumerate(combo):
            p = per_parent_cpts[idx]['T'] if val == 0 else per_parent_cpts[idx]['F']
            prod *= p
        p_true = prod / (baseline ** (len(parents) - 1))
        p_true = max(0.0, min(1.0, p_true))
        probs.append(p_true)
    return probs

def create_cpd(node, cpt_info):
    """
    cpt_info requires:
      - 'parents': list of parent names (can be empty for roots)
      - if 'style' == 'naive':
          - 'per_parent': list of dicts for each parent as above
          - 'baseline': baseline probability (float)
      - if 'style' == 'joint':
          - 'table': explicit list of joint probabilities (2^N entries)
    """
    if not cpt_info or 'parents' not in cpt_info or not cpt_info['parents']:
        return None  # Root node, handled separately

    parents = cpt_info['parents']
    style = cpt_info.get('style', 'joint')

    if style == 'joint':
        true_probs = cpt_info['table']
    elif style == 'naive':
        per_parent = cpt_info['per_parent']
        baseline = cpt_info['baseline']
        true_probs = build_naive_joint_cpt(parents, per_parent, baseline)
    else:
        raise ValueError(f"Unknown CPT style {style} for node {node}")

    cpd = TabularCPD(
        variable=node,
        variable_card=2,
        values=[true_probs, [1 - p for p in true_probs]],
        evidence=parents,
        evidence_card=[2] * len(parents)
    )
    return cpd

def build_bayesian_network(nodes, edges, priors, cpts):
    model = DiscreteBayesianNetwork(edges)

    # Add priors for root nodes (priors must be 2D lists: [[P(True)], [P(False)]])
    for node in nodes:
        if node in priors:
            model.add_cpds(TabularCPD(node, 2, priors[node]))

    # Add CPDs for non-root nodes
    for node in nodes:
        if node in cpts:
            cpd = create_cpd(node, cpts[node])
            if cpd:
                model.add_cpds(cpd)

    assert model.check_model(), "Model failed validation!"
    return model

def run_inference(model, nodes, priors):
    infer = VariableElimination(model)
    query_nodes = [n for n in nodes if n not in priors]

    print("=== Joint distribution of non-root nodes ===")
    joint = infer.query(variables=query_nodes)
    print(joint)

    print("\\n=== Marginal probabilities ===")
    for var in query_nodes:
        res = infer.query(variables=[var])
        print(f"{var}: P(True) = {res.values[0]:.4f}, P(False) = {res.values[1]:.4f}")

# === USER INPUT SECTION ===
# Generated from Belief Graph on ${new Date().toLocaleString()}

`;

  // Generate nodes list
  const nodeNames = nodes.map(n => n.data.id);
  pythonScript += `nodes = ${JSON.stringify(nodeNames)}\n\n`;
  
  // Generate edges list
  const edgeList = edges.map(e => [e.data.source, e.data.target]);
  pythonScript += `edges = ${JSON.stringify(edgeList)}\n\n`;
  
  // Generate priors for root nodes
  pythonScript += "# Priors must be 2D lists: [[P(True)], [P(False)]]\n";
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
  pythonScript += "# CPTs for non-root nodes\n";
  pythonScript += "cpts = {\n";
  nodes.forEach(node => {
    const nodeId = node.data.id;
    const incomingEdges = edges.filter(e => e.data.target === nodeId);
    
    if (incomingEdges.length > 0) {
      // This node has parents
      const parentIds = incomingEdges.map(e => e.data.source);
      pythonScript += `    '${nodeId}': {\n`;
      pythonScript += `        'parents': ${JSON.stringify(parentIds)},\n`;
      
      if (incomingEdges.length === 1) {
        // Single parent - use joint style
        const edge = incomingEdges[0];
        const cpt = edge.data.cpt;
        if (cpt) {
          const pTrueGivenFalse = Number((cpt.condFalse / 100).toFixed(4));
          const pTrueGivenTrue = Number((cpt.condTrue / 100).toFixed(4));
          
          pythonScript += `        'style': 'joint',\n`;
          pythonScript += `        'table': [${pTrueGivenFalse}, ${pTrueGivenTrue}]  # P(T|F), P(T|T)\n`;
        } else {
          // No CPT data, use default
          pythonScript += `        'style': 'joint',\n`;
          pythonScript += `        'table': [0.5, 0.5]  # P(T|F), P(T|T)\n`;
        }
      } else {
        // Multiple parents - use naive style
        pythonScript += `        'style': 'naive',\n`;
        
        pythonScript += `        'per_parent': [\n`;
        incomingEdges.forEach((edge, i) => {
          const cpt = edge.data.cpt;
          if (cpt) {
            const pT = Number((cpt.condTrue / 100).toFixed(3));
            const pF = Number((cpt.condFalse / 100).toFixed(3));
            pythonScript += `            {'T': ${pT}, 'F': ${pF}},\n`;
          } else {
            pythonScript += `            {'T': 0.5, 'F': 0.5},\n`;
          }
        });
        pythonScript += `        ],\n`;
        
        // Get baseline from first CPT (they should be consistent)
        const firstCpt = incomingEdges[0].data.cpt;
        const baseline = firstCpt ? Number((firstCpt.baseline / 100 || 0.5).toFixed(3)) : 0.5;
        pythonScript += `        'baseline': ${baseline}\n`;
      }
      
      pythonScript += `    },\n`;
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
  
  console.log("✅ Downloaded complete pgmpy script: belief_graph_pgmpy.py");
  console.log("📁 Ready to run in any Python environment with pgmpy installed!");
}

// Make it available globally
window.logNetworkForPgmpy = logNetworkForPgmpy;

// Auto-log if cy is available
if (typeof cy !== 'undefined') {
  console.log("Network logger loaded. Use logNetworkForPgmpy(cy) to generate network log.");
}
