// Future-Proof JSON Format - Minimal User Input Only
// This shows what a streamlined, future-proof format could look like

const MINIMAL_FORMAT_EXAMPLE = {
  "version": "1.0",  // Format version for migration
  "nodes": [
    {
      "id": "node1754053135604",
      "label": "R was sometimes evasive",
      "type": "fact",
      "description": "Respondent provided oblique answers...", // Instead of hoverLabel
      "position": { "x": 651, "y": -31 },
      // User customizations only:
      "customStyle": {
        "textColor": "#fff"  // Only if user explicitly changed
      }
    },
    {
      "id": "node1754053139208", 
      "label": "R has lacks motive to lie",
      "type": "assertion",
      "description": "The Respondent lacks motive to lie...",
      "position": { "x": 1372, "y": 55 }
    }
  ],
  "edges": [
    {
      "id": "edge1",
      "source": "node1754053135604",
      "target": "node1754053139208",
      "type": "supports",
      "weight": 0.85,  // Lite mode
      "rationale": "Because the evidence supports this connection",
      // Heavy mode data (if any):
      "cpt": {
        "condTrue": 85,
        "condFalse": 15,
        "baseline": 50
      }
    }
  ]
};

// BENEFITS OF MINIMAL FORMAT:
console.log("🎯 Benefits of minimal format:");
console.log("✅ Smaller file sizes (maybe 50-80% reduction)");
console.log("✅ Less chance of format conflicts during updates");
console.log("✅ Focus on actual user decisions, not computed values");
console.log("✅ Easier to validate and migrate");
console.log("✅ Platform-independent (no Cytoscape-specific fields)");

// CURRENT ISSUES WITH FULL FORMAT:
console.log("\n⚠️  Current format issues:");
console.log("❌ 80% of fields are computed/visual (can be regenerated)");
console.log("❌ Cytoscape-specific metadata creates dependencies"); 
console.log("❌ Visual fields change when rendering logic updates");
console.log("❌ Redundant fields (displayType=type, computedWeight=weight)");
console.log("❌ Runtime state saved (selected, removed, etc.)");

// MIGRATION STRATEGY:
function createMinimalSaveFormat(cy) {
  const nodes = cy.nodes().map(node => {
    const data = node.data();
    return {
      id: data.id,
      label: data.label || data.origLabel,
      type: data.type,
      description: data.hoverLabel,
      position: node.position(),
      // Only save user-customized visual properties
      customStyle: extractUserCustomizations(data)
    };
  });
  
  const edges = cy.edges().map(edge => {
    const data = edge.data();
    return {
      id: data.id,
      source: data.source,
      target: data.target,
      type: data.type,
      weight: data.weight || data.userAssignedWeight,
      rationale: data.rationale,
      // Include CPT if it exists (Heavy mode)
      ...(data.cpt && { cpt: data.cpt })
    };
  });
  
  return {
    version: "1.0",
    nodes,
    edges
  };
}

function extractUserCustomizations(nodeData) {
  const customStyle = {};
  
  // Only save if user explicitly changed from defaults
  if (nodeData.textColor && nodeData.textColor !== getDefaultTextColor(nodeData.type)) {
    customStyle.textColor = nodeData.textColor;
  }
  
  if (nodeData.sizeIndex && nodeData.sizeIndex !== 3) {
    customStyle.sizeIndex = nodeData.sizeIndex;
  }
  
  return Object.keys(customStyle).length ? customStyle : undefined;
}

function loadMinimalFormat(minimalData) {
  // Reconstruct full Cytoscape format from minimal data
  const elements = [];
  
  minimalData.nodes.forEach(node => {
    elements.push({
      data: {
        id: node.id,
        label: node.label,
        origLabel: node.label, // Set both for compatibility
        type: node.type,
        hoverLabel: node.description,
        // Apply user customizations
        ...node.customStyle,
        // Let visual computation happen automatically
      },
      position: node.position,
      group: 'nodes'
    });
  });
  
  minimalData.edges.forEach(edge => {
    elements.push({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        weight: edge.weight,
        rationale: edge.rationale,
        // Include CPT data if present
        ...(edge.cpt && { cpt: edge.cpt })
        // Let all visual/computed fields be auto-generated
      },
      group: 'edges'
    });
  });
  
  return elements;
}

// MINIMAL INPUT TO FULL JSON CONVERTER
function createFullJsonFromMinimalInput(minimalInput) {
  const {
    nodes = [],
    edges = [],
    layoutType = 'grid' // 'grid', 'circle', 'tree', 'force', 'custom'
  } = minimalInput;
  
  // Generate node positions based on layout type
  const positions = generateNodePositions(nodes, edges, layoutType);
  
  // Process nodes with defaults
  const fullNodes = nodes.map((node, index) => {
    const nodeId = node.id || String.fromCharCode(97 + index); // a, b, c, etc.
    const label = node.label || node.shortLabel || `Node ${nodeId.toUpperCase()}`;
    
    return {
      data: {
        id: nodeId,
        label: label,
        origLabel: label,
        // Only set type for logic nodes and notes - facts/assertions auto-detected
        ...(node.type === 'and' || node.type === 'or' || node.type === 'note' ? { type: node.type } : {}),
        // Add description if provided
        ...(node.description || node.longLabel ? { hoverLabel: node.description || node.longLabel } : {}),
        // Add any visual customizations if provided
        ...(node.textColor ? { textColor: node.textColor } : {}),
        ...(node.sizeIndex ? { sizeIndex: node.sizeIndex } : {}),
        ...(node.floretColor ? { floretColor: node.floretColor } : {}),
        // Set fact probabilities if specified
        ...(node.prob !== undefined ? { prob: node.prob } : {}),
        ...(node.heavyProb !== undefined ? { heavyProb: node.heavyProb } : {})
      },
      position: node.position || positions[index],
      group: "nodes",
      removed: false,
      selected: false,
      selectable: true,
      locked: false,
      grabbable: true,
      pannable: false,
      classes: ""
    };
  });
  
  // Process edges with defaults
  const fullEdges = edges.map((edge, index) => {
    const edgeId = edge.id || `edge${index + 1}`;
    const edgeType = edge.type || 'supports';
    const weight = edge.weight !== undefined ? edge.weight : 0.6; // Default medium weight
    
    return {
      data: {
        id: edgeId,
        source: edge.source,
        target: edge.target,
        type: edgeType,
        weight: weight,
        userAssignedWeight: weight, // Mark as user-assigned
        computedWeight: weight,
        absWeight: Math.abs(weight),
        // Add rationale if provided
        ...(edge.rationale ? { rationale: edge.rationale } : {}),
        // Add CPT data if provided (Heavy mode)
        ...(edge.cpt ? { cpt: edge.cpt } : {}),
        // Visual properties
        displayType: edgeType,
        lineColor: edgeType === 'opposes' ? '#d32f2f' : '#666',
        label: "" // Will be computed by visual system
      },
      group: "edges",
      removed: false,
      selected: false,
      selectable: true,
      locked: false,
      grabbable: true,
      pannable: true,
      classes: ""
    };
  });
  
  return {
    graph: [...fullNodes, ...fullEdges]
  };
}

function generateNodePositions(nodes, edges, layoutType = 'grid') {
  const nodeCount = nodes.length;
  const positions = [];
  
  switch (layoutType) {
    case 'custom': {
      // Use provided positions, fall back to grid for nodes without positions
      let gridIndex = 0;
      const cols = Math.ceil(Math.sqrt(nodeCount));
      const gridSpacing = 150;
      const startX = 100, startY = 100;
      
      nodes.forEach((node, i) => {
        if (node.position) {
          positions.push(node.position);
        } else {
          // Fall back to grid position for nodes without explicit position
          positions.push({
            x: startX + (gridIndex % cols) * gridSpacing,
            y: startY + Math.floor(gridIndex / cols) * gridSpacing
          });
          gridIndex++;
        }
      });
      break;
    }
    
    case 'circle': {
      // Arrange nodes in a circle
      const radius = Math.max(200, nodeCount * 30);
      const centerX = 400, centerY = 300;
      for (let i = 0; i < nodeCount; i++) {
        const angle = (2 * Math.PI * i) / nodeCount;
        positions.push({
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle)
        });
      }
      break;
    }
      
    case 'tree': {
      // Simple tree layout (facts at top, assertions below)
      let factCount = 0, assertionCount = 0;
      const factY = 100, assertionY = 300;
      const treeSpacing = 150;
      
      nodes.forEach((node, i) => {
        if (node.type === 'fact' || (!node.type && !hasIncomingEdges(node.id, edges))) {
          positions.push({
            x: 200 + factCount * treeSpacing,
            y: factY
          });
          factCount++;
        } else {
          positions.push({
            x: 200 + assertionCount * treeSpacing,
            y: assertionY
          });
          assertionCount++;
        }
      });
      break;
    }
      
    case 'force': {
      // Simple force-directed approximation
      const forceSpacing = 120;
      for (let i = 0; i < nodeCount; i++) {
        positions.push({
          x: 200 + (i % 4) * forceSpacing + Math.random() * 50,
          y: 200 + Math.floor(i / 4) * forceSpacing + Math.random() * 50
        });
      }
      break;
    }
      
    case 'grid':
    default: {
      // Grid layout
      const cols = Math.ceil(Math.sqrt(nodeCount));
      const gridSpacing = 150;
      const startX = 100, startY = 100;
      
      for (let i = 0; i < nodeCount; i++) {
        positions.push({
          x: startX + (i % cols) * gridSpacing,
          y: startY + Math.floor(i / cols) * gridSpacing
        });
      }
      break;
    }
  }
  
  return positions;
}

function hasIncomingEdges(nodeId, edges) {
  return edges.some(edge => edge.target === nodeId);
}

// EXAMPLE USAGE AND TESTS
const MINIMAL_INPUT_EXAMPLES = {
  // Absolute minimal - just connections
  minimal: {
    nodes: [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' }
    ],
    edges: [
      { source: 'a', target: 'b', weight: 0.8 },
      { source: 'b', target: 'c', weight: -0.6 }
    ]
  },
  
  // With labels and some customization
  enhanced: {
    nodes: [
      { 
        id: 'evidence', 
        label: 'Strong Evidence',
        description: 'This is compelling evidence for the case',
        prob: 0.9 
      },
      { 
        id: 'conclusion', 
        label: 'Final Conclusion',
        textColor: '#ffffff',
        sizeIndex: 5
      },
      {
        id: 'logic1',
        type: 'and',
        label: 'Both Required'
      }
    ],
    edges: [
      { 
        source: 'evidence', 
        target: 'conclusion', 
        type: 'supports',
        weight: 0.85,
        rationale: 'Strong evidence supports the conclusion'
      },
      {
        source: 'evidence',
        target: 'logic1',
        weight: 0.7
      }
    ],
    layoutType: 'tree'
  },
  
  // Comprehensive example with all features
  comprehensive: {
    nodes: [
      {
        id: 'styled_fact',
        label: 'Important Evidence',
        description: 'This evidence has custom styling and positioning',
        textColor: '#ffffff',
        sizeIndex: 5,
        floretColor: '#FF5722',
        position: { x: 150, y: 100 },
        prob: 0.85
      },
      {
        id: 'logic_and',
        type: 'and',
        label: 'Combined Evidence',
        description: 'Logical AND of multiple evidence pieces',
        position: { x: 350, y: 200 }
      },
      {
        id: 'logic_or',
        type: 'or',
        label: 'Alternative Paths',
        description: 'Logical OR for different reasoning paths',
        position: { x: 550, y: 200 }
      },
      {
        id: 'conclusion',
        label: 'Final Conclusion',
        description: 'The ultimate conclusion of our reasoning',
        textColor: '#4CAF50',
        sizeIndex: 6,
        position: { x: 450, y: 350 }
      },
      {
        id: 'research_note',
        type: 'note',
        label: 'Research Notes',
        description: 'Important methodology and assumptions:\n- Used Bayesian reasoning\n- Assumed independence of evidence\n- Applied 95% confidence threshold',
        textColor: '#E3F2FD',
        sizeIndex: 3,
        position: { x: 100, y: 300 }
      },
      {
        id: 'warning_note',
        type: 'note',
        label: 'Limitations',
        description: 'This analysis has several limitations that should be considered',
        textColor: '#FFF3E0',
        sizeIndex: 2,
        position: { x: 650, y: 350 }
      }
    ],
    edges: [
      {
        source: 'styled_fact',
        target: 'logic_and',
        weight: 0.8,
        type: 'supports',
        rationale: 'Strong evidence feeds into combined analysis'
      },
      {
        source: 'logic_and',
        target: 'logic_or',
        weight: 0.9,
        type: 'supports',
        rationale: 'Combined evidence provides strong support'
      },
      {
        source: 'logic_or',
        target: 'conclusion',
        weight: 0.85,
        type: 'supports',
        rationale: 'Alternative reasoning paths lead to conclusion'
      },
      {
        source: 'styled_fact',
        target: 'conclusion',
        weight: -0.3,
        type: 'opposes',
        rationale: 'Some aspects of the evidence create doubt'
      }
    ],
    layoutType: 'custom'
  },
  
  // Heavy mode with CPT
  heavyMode: {
    nodes: [
      { id: 'fact1', label: 'Witness Testimony' },
      { id: 'belief1', label: 'Defendant Guilty' }
    ],
    edges: [
      {
        source: 'fact1',
        target: 'belief1',
        cpt: {
          condTrue: 90,
          condFalse: 20,
          baseline: 50
        }
      }
    ]
  }
};

// Test function
function testMinimalInputConverter() {
  console.log("\n🧪 Testing Minimal Input Converter:");
  
  Object.entries(MINIMAL_INPUT_EXAMPLES).forEach(([name, input]) => {
    console.log(`\n--- Testing ${name} ---`);
    const result = createFullJsonFromMinimalInput(input);
    console.log(`✅ Generated ${result.graph.length} elements`);
    console.log(`   Nodes: ${result.graph.filter(el => el.group === 'nodes').length}`);
    console.log(`   Edges: ${result.graph.filter(el => el.group === 'edges').length}`);
  });
}

// Make functions available for browser testing
window.createMinimalSaveFormat = createMinimalSaveFormat;
window.loadMinimalFormat = loadMinimalFormat;
window.createFullJsonFromMinimalInput = createFullJsonFromMinimalInput;
window.testMinimalInputConverter = testMinimalInputConverter;
window.MINIMAL_INPUT_EXAMPLES = MINIMAL_INPUT_EXAMPLES;

console.log("\n💡 To implement minimal format:");
console.log("1. Modify saveGraph() to use createMinimalSaveFormat()");
console.log("2. Modify loadGraph() to detect format and use loadMinimalFormat()");
console.log("3. Add format version detection for backward compatibility");
console.log("4. Test with existing files to ensure no data loss");

console.log("\n🚀 New: Minimal Input Converter");
console.log("- Use createFullJsonFromMinimalInput(minimalInput) to expand minimal data");
console.log("- Run testMinimalInputConverter() in browser console to see examples");
console.log("- Supports automatic layout generation and smart defaults");
console.log("- Test with: window.createFullJsonFromMinimalInput({ nodes: [{id:'a'}, {id:'b'}], edges: [{source:'a', target:'b'}] })");
