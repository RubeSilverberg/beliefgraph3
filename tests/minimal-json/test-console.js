// Quick test script to run in browser console
console.log("🧪 Testing Minimal JSON Converter");

// Test data from our test-minimal.json file
const testMinimalData = {
  "nodes": [
    {
      "id": "witness_testimony",
      "label": "Witness saw suspect at scene",
      "description": "Multiple witnesses independently identified the suspect"
    },
    {
      "id": "dna_evidence", 
      "label": "DNA match found",
      "description": "DNA sample matches suspect with 99.9% certainty"
    },
    {
      "id": "guilty_verdict",
      "label": "Suspect is guilty",
      "description": "Based on the evidence, the suspect committed the crime"
    }
  ],
  "edges": [
    {
      "source": "witness_testimony",
      "target": "guilty_verdict",
      "weight": 0.6,
      "rationale": "Witness testimony provides moderate support"
    },
    {
      "source": "dna_evidence", 
      "target": "guilty_verdict",
      "weight": 0.85,
      "rationale": "DNA evidence provides strong support"
    }
  ],
  "layoutType": "tree"
};

console.log("📋 Minimal input data:", testMinimalData);

// Test the converter
if (typeof window.createFullJsonFromMinimalInput === 'function') {
  const fullData = window.createFullJsonFromMinimalInput(testMinimalData);
  console.log("✅ Conversion successful!");
  console.log("📊 Full JSON data:", fullData);
  
  // Test loading into Cytoscape if available
  if (window.cy) {
    console.log("🎯 Testing with Cytoscape...");
    try {
      window.cy.elements().remove();
      window.cy.add(fullData.graph);
      window.cy.layout({ name: 'preset' }).run();
      window.cy.fit();
      console.log("✅ Successfully loaded into Cytoscape!");
      console.log(`📈 Loaded ${fullData.graph.filter(el => el.group === 'nodes').length} nodes and ${fullData.graph.filter(el => el.group === 'edges').length} edges`);
    } catch (error) {
      console.error("❌ Error loading into Cytoscape:", error);
    }
  } else {
    console.log("ℹ️ Cytoscape not available for testing");
  }
} else {
  console.error("❌ Converter function not available");
  console.log("Available functions:", Object.keys(window).filter(key => key.includes('minimal') || key.includes('Minimal')));
}
