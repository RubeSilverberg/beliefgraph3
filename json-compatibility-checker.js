// JSON Compatibility Analysis
// This script analyzes field expectations vs old JSON format compatibility

console.log("🔍 JSON COMPATIBILITY ANALYSIS");

// Current field expectations based on code analysis
const CURRENT_NODE_FIELDS = {
  // Core identification
  id: { required: true, type: 'string', default: null },
  
  // Visual properties
  label: { required: false, type: 'string', default: null },
  origLabel: { required: false, type: 'string', default: null },
  displayLabel: { required: false, type: 'string', default: null },
  hoverLabel: { required: false, type: 'string', default: null },
  
  // Node type and logic
  type: { required: true, type: 'string', default: 'assertion', 
          allowed: ['fact', 'assertion', 'and', 'or', 'note'] },
  
  // Bayes probability fields  
  prob: { required: false, type: 'number', default: 0.5 },
  heavyProb: { required: false, type: 'number', default: null },
  explicitHeavyProb: { required: false, type: 'number', default: null },
  baseline: { required: false, type: 'number', default: 0.5 },
  isVirgin: { required: false, type: 'boolean', default: null },
  
  // Visual sizing and layout
  width: { required: false, type: 'number', default: null },
  height: { required: false, type: 'number', default: null },
  sizeIndex: { required: false, type: 'number', default: 3 },
  fontSize: { required: false, type: 'number', default: null },
  textMaxWidth: { required: false, type: 'number', default: null },
  
  // Visual styling
  textColor: { required: false, type: 'string', default: null },
  borderWidth: { required: false, type: 'number', default: null },
  borderColor: { required: false, type: 'string', default: null },
  shape: { required: false, type: 'string', default: 'rectangle' }
};

const CURRENT_EDGE_FIELDS = {
  // Core identification  
  id: { required: true, type: 'string', default: null },
  source: { required: true, type: 'string', default: null },
  target: { required: true, type: 'string', default: null },
  
  // Edge type and relationship
  type: { required: false, type: 'string', default: 'supports',
          allowed: ['supports', 'opposes'] },
  relationship: { required: false, type: 'string', default: null },
  displayType: { required: false, type: 'string', default: null },
  
  // CPT (Conditional Probability Table) data
  cpt: {
    required: false, 
    type: 'object',
    default: null,
    subfields: {
      condTrue: { required: false, type: 'number', default: null },
      condFalse: { required: false, type: 'number', default: null },
      baseline: { required: false, type: 'number', default: 50 },
      parentTrue: { required: false, type: 'number', default: null },  // Legacy?
      parentFalse: { required: false, type: 'number', default: null }, // Legacy?
      inverse: { required: false, type: 'boolean', default: false }
    }
  }
};

function analyzeJSONCompatibility(elements) {
  console.log("\n📊 Analyzing JSON compatibility...");
  
  const issues = [];
  const warnings = [];
  const migrations = [];
  
  elements.forEach((element, index) => {
    const isNode = element.group === 'nodes' || !element.data.source;
    const elementType = isNode ? 'node' : 'edge';
    const fields = isNode ? CURRENT_NODE_FIELDS : CURRENT_EDGE_FIELDS;
    const data = element.data || {};
    
    console.log(`\n${elementType.toUpperCase()} ${index}: ${data.id || 'no-id'}`);
    
    // Check for missing required fields
    Object.entries(fields).forEach(([fieldName, fieldSpec]) => {
      if (fieldSpec.required && !(fieldName in data)) {
        issues.push({
          element: data.id || `${elementType}-${index}`,
          type: 'MISSING_REQUIRED',
          field: fieldName,
          fix: `Add default: ${fieldSpec.default}`
        });
      }
    });
    
    // Check for unexpected fields (might indicate schema changes)
    Object.keys(data).forEach(fieldName => {
      if (!(fieldName in fields)) {
        warnings.push({
          element: data.id || `${elementType}-${index}`,
          type: 'UNEXPECTED_FIELD',
          field: fieldName,
          value: data[fieldName]
        });
      }
    });
    
    // Check field types
    Object.entries(data).forEach(([fieldName, value]) => {
      const fieldSpec = fields[fieldName];
      if (fieldSpec && fieldSpec.type && value !== null && value !== undefined) {
        const actualType = typeof value;
        if (actualType !== fieldSpec.type) {
          issues.push({
            element: data.id || `${elementType}-${index}`,
            type: 'TYPE_MISMATCH',
            field: fieldName,
            expected: fieldSpec.type,
            actual: actualType,
            value: value
          });
        }
      }
    });
    
    // Special checks for CPT structure changes
    if (!isNode && data.cpt) {
      const cpt = data.cpt;
      
      // Check if old format uses parentTrue/parentFalse instead of condTrue/condFalse
      if ('parentTrue' in cpt && !('condTrue' in cpt)) {
        migrations.push({
          element: data.id || `edge-${index}`,
          type: 'CPT_FIELD_RENAME',
          action: 'Rename parentTrue → condTrue, parentFalse → condFalse'
        });
      }
      
      // Check if baseline is missing (new requirement)
      if (!('baseline' in cpt)) {
        migrations.push({
          element: data.id || `edge-${index}`,
          type: 'MISSING_BASELINE',
          action: 'Add baseline: 50 (default)'
        });
      }
    }
    
    // Check for legacy node type issues
    if (isNode) {
      if (data.type && !CURRENT_NODE_FIELDS.type.allowed.includes(data.type)) {
        issues.push({
          element: data.id || `node-${index}`,
          type: 'INVALID_NODE_TYPE',
          field: 'type',
          value: data.type,
          allowed: CURRENT_NODE_FIELDS.type.allowed
        });
      }
    }
  });
  
  return { issues, warnings, migrations };
}

function generateMigrationScript(issues, migrations) {
  console.log("\n🔧 MIGRATION SCRIPT:");
  console.log("// Add this to your load function to handle old JSON files\n");
  
  console.log("function migrateOldJSON(elements) {");
  console.log("  elements.forEach(element => {");
  console.log("    const data = element.data;");
  console.log("    if (!data) return;");
  console.log("    ");
  console.log("    const isNode = element.group === 'nodes' || !data.source;");
  console.log("    ");
  console.log("    if (isNode) {");
  console.log("      // Node migrations");
  console.log("      if (!data.type) data.type = 'assertion';");
  console.log("      if (!data.sizeIndex) data.sizeIndex = 3;");
  console.log("      // Add other node defaults as needed");
  console.log("    } else {");
  console.log("      // Edge migrations");
  console.log("      if (!data.type) data.type = 'supports';");
  console.log("      ");
  console.log("      // CPT field migrations");
  console.log("      if (data.cpt) {");
  console.log("        // Rename old parentTrue/parentFalse to condTrue/condFalse");
  console.log("        if ('parentTrue' in data.cpt && !('condTrue' in data.cpt)) {");
  console.log("          data.cpt.condTrue = data.cpt.parentTrue;");
  console.log("          delete data.cpt.parentTrue;");
  console.log("        }");
  console.log("        if ('parentFalse' in data.cpt && !('condFalse' in data.cpt)) {");
  console.log("          data.cpt.condFalse = data.cpt.parentFalse;");
  console.log("          delete data.cpt.parentFalse;");
  console.log("        }");
  console.log("        // Add baseline if missing");
  console.log("        if (!('baseline' in data.cpt)) {");
  console.log("          data.cpt.baseline = 50;");
  console.log("        }");
  console.log("      }");
  console.log("    }");
  console.log("  });");
  console.log("  return elements;");
  console.log("}");
}

// Test with existing JSON files
async function testExistingJSONFiles() {
  console.log("\n🧪 TESTING EXISTING JSON FILES:");
  
  const jsonFiles = [
    'sample-bayes-cytoscape.json',
    'investigation-graph.json', 
    'bayes-network-proper.json'
  ];
  
  for (const filename of jsonFiles) {
    try {
      const response = await fetch(filename);
      if (!response.ok) continue;
      
      const elements = await response.json();
      console.log(`\n📄 Testing ${filename}:`);
      
      const analysis = analyzeJSONCompatibility(elements);
      
      if (analysis.issues.length > 0) {
        console.log(`❌ ${analysis.issues.length} issues found:`);
        analysis.issues.forEach(issue => {
          console.log(`  - ${issue.element}: ${issue.type} (${issue.field})`);
        });
      }
      
      if (analysis.migrations.length > 0) {
        console.log(`🔄 ${analysis.migrations.length} migrations needed:`);
        analysis.migrations.forEach(migration => {
          console.log(`  - ${migration.element}: ${migration.type}`);
        });
      }
      
      if (analysis.warnings.length > 0) {
        console.log(`⚠️  ${analysis.warnings.length} warnings:`);
        analysis.warnings.forEach(warning => {
          console.log(`  - ${warning.element}: ${warning.type} (${warning.field})`);
        });
      }
      
      if (analysis.issues.length === 0 && analysis.migrations.length === 0) {
        console.log(`✅ ${filename} appears compatible`);
      }
      
    } catch (error) {
      console.log(`❌ Failed to test ${filename}: ${error.message}`);
    }
  }
}

// Make functions available
window.analyzeJSONCompatibility = analyzeJSONCompatibility;
window.testExistingJSONFiles = testExistingJSONFiles;
window.generateMigrationScript = generateMigrationScript;

console.log("\n💡 Functions available:");
console.log("- testExistingJSONFiles() - Test all JSON files in workspace");
console.log("- analyzeJSONCompatibility(elements) - Analyze specific JSON");
console.log("- generateMigrationScript() - Generate migration code");

// Auto-run test
testExistingJSONFiles();
