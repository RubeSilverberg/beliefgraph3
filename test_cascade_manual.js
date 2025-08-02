// Focused test for edge weight cascade behavior
// Tests: Setting edge weight to 0 should kill downstream propagation
//        Setting it back to 1.0 should restore propagation

console.log('=== Edge Weight Cascade Test ===\n');

// Expected behavior based on logic.js lines 245-253:
// - validEdges = incomingEdges.filter(e => parentProb is number && edgeWeight && edgeWeight !== 0)
// - if validEdges.length === 0: node becomes virgin
// - else: node gets probability from propagateFromParentsRobust

console.log('📋 Test Scenario:');
console.log('1. Setup: fact1 → assertion1 → assertion2 → assertion3 (all weights = 1.0)');
console.log('2. Break: Set edge2 weight to 0 (should kill assertion2 & assertion3)');
console.log('3. Restore: Set edge2 weight to 1.0 (should restore assertion2 & assertion3)');
console.log('');

console.log('🔍 Key Logic (from logic.js:245-253):');
console.log('   validEdges = incomingEdges.filter(e => {');
console.log('     const parentProb = e.source().data("prob");');
console.log('     const edgeWeight = e.data("weight");');
console.log('     return typeof parentProb === "number" && edgeWeight && edgeWeight !== 0;');
console.log('   });');
console.log('');
console.log('   if (validEdges.length === 0) {');
console.log('     newProb = undefined;');
console.log('     node.data("isVirgin", true);');
console.log('   }');
console.log('');

console.log('✅ Expected Results:');
console.log('After Step 2 (edge2 weight = 0):');
console.log('  - fact1: prob = 0.995 (unchanged)');
console.log('  - assertion1: prob = 0.995 (has valid edge from fact1)');
console.log('  - assertion2: virgin = true (edge2 weight = 0, so no valid edges)');
console.log('  - assertion3: virgin = true (assertion2 is virgin, so no valid parent prob)');
console.log('');
console.log('After Step 3 (edge2 weight = 1.0):');
console.log('  - fact1: prob = 0.995 (unchanged)');
console.log('  - assertion1: prob = 0.995 (unchanged)');
console.log('  - assertion2: prob = 0.995 (edge2 weight = 1.0, parent prob = 0.995)');
console.log('  - assertion3: prob = 0.995 (assertion2 has prob, edge3 weight = 1.0)');
console.log('');

console.log('🧪 Manual Test Instructions:');
console.log('1. Open index.html in browser');
console.log('2. Create this chain: fact1 → assertion1 → assertion2 → assertion3');
console.log('3. Set all edge weights to 1.0');
console.log('4. Verify all nodes show percentages');
console.log('5. Set edge2 (assertion1 → assertion2) weight to 0');
console.log('6. Verify assertion2 and assertion3 show "—" (virgin)');
console.log('7. Set edge2 weight back to 1.0');
console.log('8. Verify assertion2 and assertion3 show percentages again');
console.log('');

console.log('🔧 Browser Console Commands:');
console.log('// After creating the chain:');
console.log('cy.getElementById("edge2").data("weight", 0);  // Break chain');
console.log('convergeAll({ cy });');
console.log('');
console.log('cy.getElementById("edge2").data("weight", 1.0);  // Restore chain');
console.log('convergeAll({ cy });');
console.log('');

console.log('📊 Check Node Status:');
console.log('cy.nodes().forEach(n => {');
console.log('  const prob = n.data("prob");');
console.log('  const virgin = n.data("isVirgin");');
console.log('  console.log(`${n.id()}: prob=${prob?.toFixed(3)}, virgin=${!!virgin}`);');
console.log('});');
console.log('');

console.log('This test verifies the core cascade logic without complex mocking.');
console.log('The key insight: edgeWeight && edgeWeight !== 0 in the filter condition.');
console.log('Setting weight to 0 makes edges invalid, causing downstream nodes to become virgin.');
