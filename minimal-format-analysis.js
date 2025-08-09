// DEPRECATED PROTOTYPE (kept for examples & testing)
// File renamed intention: legacy prototype for minimal format experimentation.
// Core minimal format logic now lives in format-core.js
// Only retains examples + test harness. Conversion helpers delegated.

(function(){
  if (!window) return;
  if (!window.DEBUG_MIN_FORMAT) {
    // Silence previous verbose advocacy logs unless debug enabled
    console.log('[MinimalFormatPrototype] Loaded (quiet mode). Set window.DEBUG_MIN_FORMAT = true for verbose logs.');
  } else {
    console.log('[MinimalFormatPrototype] Verbose mode enabled.');
  }
})();

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

// (Former explanatory logs removed to reduce noise.)

// MIGRATION STRATEGY:
// Minimal save format now handled by format-core.js (exportMinimalGraph)
function createMinimalSaveFormat(cy) {
  if (!window.BeliefGraphFormatCore) {
    console.warn('[MinimalFormatPrototype] Core module not loaded (format-core.js).');
    return null;
  }
  return window.BeliefGraphFormatCore.exportMinimalGraph(cy, { version: '1.0' });
}

function extractUserCustomizations(nodeData) {
  const customStyle = {};
  // Simplified: prototype no longer imports default color helper; just capture explicit values
  if (nodeData.textColor) customStyle.textColor = nodeData.textColor;
  if (nodeData.sizeIndex && nodeData.sizeIndex !== 3) customStyle.sizeIndex = nodeData.sizeIndex;
  return Object.keys(customStyle).length ? customStyle : undefined;
}

function loadMinimalFormat(minimalData) {
  if (!window.BeliefGraphFormatCore) {
    console.warn('[MinimalFormatPrototype] Core module not loaded (format-core.js).');
    return [];
  }
  return window.BeliefGraphFormatCore.expandToElements(minimalData);
}

// MINIMAL INPUT TO FULL JSON CONVERTER
function createFullJsonFromMinimalInput(minimalInput) {
  if (!window.BeliefGraphFormatCore) {
    console.warn('[MinimalFormatPrototype] Core module not loaded (format-core.js). Using legacy expansion path.');
  }
  // Legacy kept simple: delegate to core then wrap into { graph } for compatibility tests
  try {
    const elements = window.BeliefGraphFormatCore
      ? window.BeliefGraphFormatCore.expandToElements(minimalInput)
      : [];
    return { graph: elements };
  } catch (e) {
    console.error('[MinimalFormatPrototype] Expansion failed:', e);
    return { graph: [] };
  }
}

// Legacy position generators removed in prototype; layouts handled elsewhere / core.

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
window.createMinimalSaveFormat = createMinimalSaveFormat; // kept for test harness compatibility
window.loadMinimalFormat = loadMinimalFormat;
window.createFullJsonFromMinimalInput = createFullJsonFromMinimalInput;
window.testMinimalInputConverter = testMinimalInputConverter;
window.MINIMAL_INPUT_EXAMPLES = MINIMAL_INPUT_EXAMPLES;

if (window.DEBUG_MIN_FORMAT) {
  console.log('[MinimalFormatPrototype] testMinimalInputConverter() available.');
}
