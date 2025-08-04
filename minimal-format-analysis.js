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

// Make functions available for testing
window.createMinimalSaveFormat = createMinimalSaveFormat;
window.loadMinimalFormat = loadMinimalFormat;

console.log("\n💡 To implement minimal format:");
console.log("1. Modify saveGraph() to use createMinimalSaveFormat()");
console.log("2. Modify loadGraph() to detect format and use loadMinimalFormat()");
console.log("3. Add format version detection for backward compatibility");
console.log("4. Test with existing files to ensure no data loss");
