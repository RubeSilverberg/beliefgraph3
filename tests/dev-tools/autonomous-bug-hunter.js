// Autonomous Bug Hunter - Fully Automated Testing
// Will run silently and only report bugs/issues found

(function() {
    let bugCount = 0;
    let testCount = 0;
    const bugs = [];
    
    function reportBug(severity, category, description, details) {
        bugCount++;
        bugs.push({ severity, category, description, details, testNumber: testCount });
        
        // Only log bugs, not normal test progress
        console.log(`🐛 BUG #${bugCount} [${severity}] ${category}: ${description}`);
        if (details) console.log(`   Details: ${details}`);
    }
    
    function runTest(testName, testFunction) {
        testCount++;
        try {
            return testFunction();
        } catch (error) {
            reportBug('ERROR', 'Test Framework', `Test "${testName}" crashed`, error.message);
            return false;
        }
    }
    
    // Test 1: Basic single-parent Bayesian calculation
    function testBasicBayes() {
        if (!window.cy) return false;
        
        // Clear graph
        window.cy.elements().remove();
        
        // Create Rain → Wet scenario with CONSISTENT baseline
        window.cy.add([
            { data: { id: 'rain', type: 'assertion', heavyProb: 0.6 }},
            { data: { id: 'wet', type: 'assertion' }}
        ]);
        
        // Use consistent baseline: 50% baseline, higher when raining, lower when not
        window.cy.add({
            data: {
                id: 'edge1',
                source: 'rain',
                target: 'wet',
                cpt: { condTrue: 90, condFalse: 10, baseline: 50 }
            }
        });
        
        // Calculate - Expected: 0.90*0.60 + 0.10*0.40 = 0.58
        if (window.propagateBayesHeavy) {
            window.propagateBayesHeavy(window.cy);
            const result = window.cy.getElementById('wet').data('heavyProb');
            const expected = 0.58;
            
            if (Math.abs(result - expected) > 0.02) {
                reportBug('HIGH', 'Math Error', 'Basic Bayesian calculation incorrect', 
                    `Expected ~${expected}, got ${result}`);
                return false;
            }
            return true;
        }
        return false;
    }
    
    // Test 2: Independence test (should equal baseline)
    function testIndependence() {
        if (!window.cy) return false;
        
        window.cy.elements().remove();
        window.cy.add([
            { data: { id: 'parent', type: 'assertion', heavyProb: 0.7 }},
            { data: { id: 'child', type: 'assertion' }}
        ]);
        
        // TRUE independence: condTrue = condFalse = baseline (no correlation)
        window.cy.add({
            data: {
                id: 'edge2',
                source: 'parent',
                target: 'child',
                cpt: { condTrue: 40, condFalse: 40, baseline: 40 }
            }
        });
        
        if (window.propagateBayesHeavy) {
            window.propagateBayesHeavy(window.cy);
            const result = window.cy.getElementById('child').data('heavyProb');
            const expected = 0.40; // Should equal baseline (independence)
            
            if (Math.abs(result - expected) > 0.01) {
                reportBug('HIGH', 'Math Error', 'Independence test failed', 
                    `Expected ${expected} (baseline), got ${result}`);
                return false;
            }
            return true;
        }
        return false;
    }
    
    // Test 3: Extreme values (near 0 and 1) with consistent baseline
    function testExtremeValues() {
        if (!window.cy) return false;
        
        window.cy.elements().remove();
        window.cy.add([
            { data: { id: 'extreme_parent', type: 'assertion', heavyProb: 0.999 }},
            { data: { id: 'extreme_child', type: 'assertion' }}
        ]);
        
        // Use consistent baseline - extreme inverse relationship
        window.cy.add({
            data: {
                id: 'edge3',
                source: 'extreme_parent',
                target: 'extreme_child',
                cpt: { condTrue: 1, condFalse: 99, baseline: 50 }  // Baseline consistent
            }
        });
        
        if (window.propagateBayesHeavy) {
            window.propagateBayesHeavy(window.cy);
            const result = window.cy.getElementById('extreme_child').data('heavyProb');
            
            // Check for numerical instability
            if (isNaN(result) || !isFinite(result)) {
                reportBug('CRITICAL', 'Numerical Instability', 'Extreme values caused NaN/Infinity', 
                    `Result: ${result}`);
                return false;
            }
            
            if (result < 0 || result > 1) {
                reportBug('CRITICAL', 'Math Error', 'Probability outside valid range', 
                    `Result: ${result} (should be 0-1)`);
                return false;
            }
            
            return true;
        }
        return false;
    }
    
    // Test 4: Multi-parent consistency
    function testMultiParent() {
        if (!window.cy) return false;
        
        window.cy.elements().remove();
        window.cy.add([
            { data: { id: 'A', type: 'assertion', heavyProb: 0.6 }},
            { data: { id: 'B', type: 'assertion', heavyProb: 0.4 }},
            { data: { id: 'C', type: 'assertion' }}
        ]);
        
        window.cy.add([
            {
                data: {
                    id: 'A_to_C',
                    source: 'A',
                    target: 'C',
                    cpt: { condTrue: 80, condFalse: 20, baseline: 50 }
                }
            },
            {
                data: {
                    id: 'B_to_C',
                    source: 'B',
                    target: 'C',
                    cpt: { condTrue: 70, condFalse: 30, baseline: 50 }
                }
            }
        ]);
        
        if (window.propagateBayesHeavy) {
            window.propagateBayesHeavy(window.cy);
            const result = window.cy.getElementById('C').data('heavyProb');
            
            if (isNaN(result) || !isFinite(result)) {
                reportBug('CRITICAL', 'Multi-parent Error', 'Multi-parent calculation failed', 
                    `Result: ${result}`);
                return false;
            }
            
            if (result < 0 || result > 1) {
                reportBug('CRITICAL', 'Math Error', 'Multi-parent probability out of range', 
                    `Result: ${result}`);
                return false;
            }
            
            return true;
        }
        return false;
    }
    
    // Test 5: Inconsistent baselines (should trigger warning)
    function testBaselineConsistency() {
        if (!window.cy) return false;
        
        window.cy.elements().remove();
        window.cy.add([
            { data: { id: 'P1', type: 'assertion', heavyProb: 0.5 }},
            { data: { id: 'P2', type: 'assertion', heavyProb: 0.5 }},
            { data: { id: 'target', type: 'assertion' }}
        ]);
        
        // Deliberately inconsistent baselines
        window.cy.add([
            {
                data: {
                    id: 'edge_inconsistent1',
                    source: 'P1',
                    target: 'target',
                    cpt: { condTrue: 80, condFalse: 20, baseline: 30 } // 30% baseline
                }
            },
            {
                data: {
                    id: 'edge_inconsistent2',
                    source: 'P2',
                    target: 'target',
                    cpt: { condTrue: 70, condFalse: 30, baseline: 60 } // 60% baseline - should warn
                }
            }
        ]);
        
        // Override alert to capture warnings
        let alertCalled = false;
        const originalAlert = window.alert;
        window.alert = function(message) {
            if (message.includes('Inconsistent Baselines')) {
                alertCalled = true;
            }
        };
        
        if (window.propagateBayesHeavy) {
            window.propagateBayesHeavy(window.cy);
            
            // Restore alert
            window.alert = originalAlert;
            
            if (!alertCalled) {
                reportBug('MEDIUM', 'Warning System', 'Baseline inconsistency not detected', 
                    'Should have warned about 30% vs 60% baseline difference');
                return false;
            }
            
            return true;
        }
        
        window.alert = originalAlert;
        return false;
    }
    
    // Test 6: Large network performance
    function testLargeNetwork() {
        if (!window.cy) return false;
        
        window.cy.elements().remove();
        
        const startTime = performance.now();
        
        // Create 20 nodes with complex dependencies
        for (let i = 0; i < 20; i++) {
            window.cy.add({
                data: { 
                    id: `node_${i}`, 
                    type: 'assertion',
                    heavyProb: Math.random() 
                }
            });
        }
        
        // Create edges (each node depends on 2-3 previous nodes)
        // Use CONSISTENT baseline across all edges to avoid warnings
        const CONSISTENT_BASELINE = 50; // Fixed baseline for all edges
        let edgeCount = 0;
        for (let i = 3; i < 20; i++) {
            for (let j = 0; j < Math.min(2, i); j++) {
                const sourceIdx = Math.floor(Math.random() * i);
                window.cy.add({
                    data: {
                        id: `edge_${edgeCount++}`,  // Use unique counter instead
                        source: `node_${sourceIdx}`,
                        target: `node_${i}`,
                        cpt: {
                            condTrue: 30 + Math.random() * 40,
                            condFalse: 10 + Math.random() * 30,
                            baseline: CONSISTENT_BASELINE  // Same baseline for all edges
                        }
                    }
                });
            }
        }
        
        if (window.propagateBayesHeavy) {
            try {
                window.propagateBayesHeavy(window.cy);
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                // Check if it took too long (performance issue)
                // Reduced from 5s to 3s for better performance standards
                if (duration > 3000) { // 3 seconds for 20 nodes
                    reportBug('MEDIUM', 'Performance', 'Large network calculation too slow', 
                        `Took ${duration.toFixed(0)}ms for 20 nodes (target: <3000ms)`);
                }
                
                // Check all results are valid
                let invalidCount = 0;
                window.cy.nodes().forEach(node => {
                    const prob = node.data('heavyProb');
                    if (prob !== undefined && (isNaN(prob) || prob < 0 || prob > 1)) {
                        invalidCount++;
                    }
                });
                
                if (invalidCount > 0) {
                    reportBug('HIGH', 'Math Error', 'Large network produced invalid probabilities', 
                        `${invalidCount} nodes with invalid probabilities`);
                    return false;
                }
                
                return true;
            } catch (error) {
                reportBug('CRITICAL', 'Large Network Error', 'Large network calculation crashed', 
                    error.message);
                return false;
            }
        }
        return false;
    }
    
    // Test 7: AND/OR node logic
    function testAndOrNodes() {
        if (!window.cy) return false;
        
        window.cy.elements().remove();
        
        // Test AND node
        window.cy.add([
            { data: { id: 'input1', type: 'assertion', heavyProb: 0.8 }},
            { data: { id: 'input2', type: 'assertion', heavyProb: 0.6 }},
            { data: { id: 'and_result', type: 'and' }}
        ]);
        
        window.cy.add([
            { data: { id: 'and_edge1', source: 'input1', target: 'and_result' }},
            { data: { id: 'and_edge2', source: 'input2', target: 'and_result' }}
        ]);
        
        if (window.propagateBayesHeavy) {
            window.propagateBayesHeavy(window.cy);
            const andResult = window.cy.getElementById('and_result').data('heavyProb');
            const expected = 0.8 * 0.6; // AND = product
            
            if (Math.abs(andResult - expected) > 0.01) {
                reportBug('HIGH', 'Logic Error', 'AND node calculation incorrect', 
                    `Expected ${expected}, got ${andResult}`);
                return false;
            }
        }
        
        // Test OR node
        window.cy.elements().remove();
        window.cy.add([
            { data: { id: 'input3', type: 'assertion', heavyProb: 0.3 }},
            { data: { id: 'input4', type: 'assertion', heavyProb: 0.4 }},
            { data: { id: 'or_result', type: 'or' }}
        ]);
        
        window.cy.add([
            { data: { id: 'or_edge1', source: 'input3', target: 'or_result' }},
            { data: { id: 'or_edge2', source: 'input4', target: 'or_result' }}
        ]);
        
        if (window.propagateBayesHeavy) {
            window.propagateBayesHeavy(window.cy);
            const orResult = window.cy.getElementById('or_result').data('heavyProb');
            const expected = 1 - (1 - 0.3) * (1 - 0.4); // OR = 1 - product of complements
            
            if (Math.abs(orResult - expected) > 0.01) {
                reportBug('HIGH', 'Logic Error', 'OR node calculation incorrect', 
                    `Expected ${expected}, got ${orResult}`);
                return false;
            }
        }
        
        return true;
    }
    
    // ============= LITE MODE TESTS =============
    
    // Test L1: Basic weight propagation in Lite mode
    function testBasicLite() {
        if (!window.cy || !window.setBayesMode || !window.convergeAll) return false;
        
        // Switch to Lite mode
        window.setBayesMode('lite');
        
        window.cy.elements().remove();
        
        // Create simple A → B with strong positive weight
        window.cy.add([
            { data: { id: 'A_lite', type: 'assertion', isVirgin: false, prob: 0.8 }},
            { data: { id: 'B_lite', type: 'assertion', isVirgin: true }}
        ]);
        
        window.cy.add({
            data: {
                id: 'edge_lite1',
                source: 'A_lite',
                target: 'B_lite',
                type: 'supports',
                weight: 0.9  // Strong positive influence
            }
        });
        
        // Run Lite convergence
        window.convergeAll({ cy: window.cy });
        
        const resultB = window.cy.getElementById('B_lite').data('prob');
        
        // In Lite mode, strong positive weight + high parent prob should yield high child prob
        if (isNaN(resultB) || !isFinite(resultB)) {
            reportBug('CRITICAL', 'Lite Mode Error', 'Basic Lite calculation failed', 
                `Result: ${resultB}`);
            return false;
        }
        
        if (resultB < 0 || resultB > 1) {
            reportBug('CRITICAL', 'Lite Mode Error', 'Lite probability out of range', 
                `Result: ${resultB} (should be 0-1)`);
            return false;
        }
        
        // Should be significantly higher than 50% baseline due to strong positive influence
        if (resultB < 0.6) {
            reportBug('MEDIUM', 'Lite Logic', 'Weak positive influence in Lite mode', 
                `Expected >0.6 with weight 0.9 and parent 0.8, got ${resultB}`);
        }
        
        return true;
    }
    
    // Test L2: Independence in Lite mode (weight ≈ 0)
    function testIndependenceLite() {
        if (!window.cy || !window.setBayesMode || !window.convergeAll) return false;
        
        window.setBayesMode('lite');
        window.cy.elements().remove();
        
        window.cy.add([
            { data: { id: 'parent_lite', type: 'assertion', isVirgin: false, prob: 0.9 }},
            { data: { id: 'child_lite', type: 'assertion', isVirgin: true }}
        ]);
        
        // Near-zero weight = independence
        window.cy.add({
            data: {
                id: 'edge_indep_lite',
                source: 'parent_lite',
                target: 'child_lite',
                type: 'supports',
                weight: 0.05  // Very weak influence
            }
        });
        
        window.convergeAll({ cy: window.cy });
        
        const result = window.cy.getElementById('child_lite').data('prob');
        
        // With very weak weight, result should be close to 50% baseline regardless of parent
        if (Math.abs(result - 0.5) > 0.15) {  // Allow some influence but not much
            reportBug('MEDIUM', 'Lite Independence', 'Weak weight showing too much influence', 
                `Expected ~0.5 with weight 0.05, got ${result}`);
        }
        
        return true;
    }
    
    // Test L3: Extreme weights in Lite mode
    function testExtremeWeightsLite() {
        if (!window.cy || !window.setBayesMode || !window.convergeAll) return false;
        
        window.setBayesMode('lite');
        window.cy.elements().remove();
        
        // Test extreme positive weight
        window.cy.add([
            { data: { id: 'extreme_parent_lite', type: 'assertion', isVirgin: false, prob: 0.1 }},
            { data: { id: 'extreme_child_lite', type: 'assertion', isVirgin: true }}
        ]);
        
        window.cy.add({
            data: {
                id: 'edge_extreme_lite',
                source: 'extreme_parent_lite',
                target: 'extreme_child_lite',
                type: 'supports',
                weight: 0.99  // Near-maximum weight
            }
        });
        
        window.convergeAll({ cy: window.cy });
        
        const result = window.cy.getElementById('extreme_child_lite').data('prob');
        
        // Check for numerical stability
        if (isNaN(result) || !isFinite(result)) {
            reportBug('CRITICAL', 'Lite Numerical', 'Extreme weight caused instability', 
                `Result: ${result}`);
            return false;
        }
        
        if (result < 0 || result > 1) {
            reportBug('CRITICAL', 'Lite Range Error', 'Extreme weight caused out-of-range', 
                `Result: ${result}`);
            return false;
        }
        
        return true;
    }
    
    // Test L4: Multi-parent in Lite mode
    function testMultiParentLite() {
        if (!window.cy || !window.setBayesMode || !window.convergeAll) return false;
        
        window.setBayesMode('lite');
        window.cy.elements().remove();
        
        window.cy.add([
            { data: { id: 'P1_lite', type: 'assertion', isVirgin: false, prob: 0.7 }},
            { data: { id: 'P2_lite', type: 'assertion', isVirgin: false, prob: 0.3 }},
            { data: { id: 'child_multi_lite', type: 'assertion', isVirgin: true }}
        ]);
        
        window.cy.add([
            {
                data: {
                    id: 'edge_multi1_lite',
                    source: 'P1_lite',
                    target: 'child_multi_lite',
                    type: 'supports',
                    weight: 0.8
                }
            },
            {
                data: {
                    id: 'edge_multi2_lite',
                    source: 'P2_lite',
                    target: 'child_multi_lite',
                    type: 'opposes',
                    weight: 0.6
                }
            }
        ]);
        
        window.convergeAll({ cy: window.cy });
        
        const result = window.cy.getElementById('child_multi_lite').data('prob');
        
        if (isNaN(result) || !isFinite(result) || result < 0 || result > 1) {
            reportBug('CRITICAL', 'Lite Multi-parent', 'Multi-parent Lite calculation failed', 
                `Result: ${result}`);
            return false;
        }
        
        return true;
    }
    
    // Test L5: Large network performance in Lite mode
    function testLargeNetworkLite() {
        if (!window.cy || !window.setBayesMode || !window.convergeAll) return false;
        
        window.setBayesMode('lite');
        window.cy.elements().remove();
        
        const startTime = performance.now();
        
        // Create 15 nodes in Lite mode (slightly smaller for speed)
        for (let i = 0; i < 15; i++) {
            window.cy.add({
                data: { 
                    id: `node_lite_${i}`, 
                    type: 'assertion',
                    isVirgin: i < 3 ? false : true,  // First 3 are evidence
                    prob: i < 3 ? Math.random() : undefined
                }
            });
        }
        
        // Create edges with random weights
        let edgeCount = 0;
        for (let i = 3; i < 15; i++) {
            for (let j = 0; j < Math.min(2, i); j++) {
                const sourceIdx = Math.floor(Math.random() * i);
                window.cy.add({
                    data: {
                        id: `edge_lite_${edgeCount++}`,
                        source: `node_lite_${sourceIdx}`,
                        target: `node_lite_${i}`,
                        type: Math.random() > 0.5 ? 'supports' : 'opposes',
                        weight: 0.3 + Math.random() * 0.4  // Moderate weights
                    }
                });
            }
        }
        
        window.convergeAll({ cy: window.cy });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // Lite mode should be reasonably fast
        if (duration > 2000) { // 2 seconds for 15 nodes
            reportBug('MEDIUM', 'Lite Performance', 'Large Lite network too slow', 
                `Took ${duration.toFixed(0)}ms for 15 nodes (target: <2000ms)`);
        }
        
        // Check all results are valid
        let invalidCount = 0;
        window.cy.nodes().forEach(node => {
            const prob = node.data('prob');
            if (prob !== undefined && (isNaN(prob) || prob < 0 || prob > 1)) {
                invalidCount++;
            }
        });
        
        if (invalidCount > 0) {
            reportBug('HIGH', 'Lite Network Error', 'Large Lite network produced invalid probabilities', 
                `${invalidCount} nodes with invalid probabilities`);
            return false;
        }
        
        return true;
    }
    
    // Test L6: Convergence speed in Lite mode
    function testConvergenceSpeed() {
        if (!window.cy || !window.setBayesMode || !window.convergeAll) return false;
        
        window.setBayesMode('lite');
        window.cy.elements().remove();
        
        // Create chain: A → B → C → D with moderate weights
        const nodes = ['A', 'B', 'C', 'D'];
        nodes.forEach((id, i) => {
            window.cy.add({
                data: { 
                    id: `chain_${id}`, 
                    type: 'assertion',
                    isVirgin: i === 0 ? false : true,
                    prob: i === 0 ? 0.9 : undefined
                }
            });
        });
        
        for (let i = 0; i < nodes.length - 1; i++) {
            window.cy.add({
                data: {
                    id: `chain_edge_${i}`,
                    source: `chain_${nodes[i]}`,
                    target: `chain_${nodes[i + 1]}`,
                    type: 'supports',
                    weight: 0.7
                }
            });
        }
        
        const startTime = performance.now();
        window.convergeAll({ cy: window.cy });
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // Check if convergence happened reasonably fast
        if (duration > 1000) { // 1 second for simple chain
            reportBug('MEDIUM', 'Lite Convergence', 'Simple chain convergence too slow', 
                `Took ${duration.toFixed(0)}ms for 4-node chain`);
        }
        
        // Check that influence propagated through the chain
        const endProb = window.cy.getElementById('chain_D').data('prob');
        if (isNaN(endProb) || endProb === undefined) {
            reportBug('HIGH', 'Lite Propagation', 'Chain propagation failed', 
                `End node probability: ${endProb}`);
            return false;
        }
        
        // End should be influenced by start (not exactly 50%)
        if (Math.abs(endProb - 0.5) < 0.05) {
            reportBug('LOW', 'Lite Weak Propagation', 'Chain shows weak influence propagation', 
                `End probability too close to baseline: ${endProb}`);
        }
        
        return true;
    }
    
    // Run all tests autonomously
    function runAutonomousTests() {
        // Wait for page to load
        setTimeout(() => {
            const tests = [
                // Heavy Mode Tests
                ['Basic Bayes (Heavy)', testBasicBayes],
                ['Independence (Heavy)', testIndependence],
                ['Extreme Values (Heavy)', testExtremeValues],
                ['Multi-parent (Heavy)', testMultiParent],
                ['Baseline Consistency (Heavy)', testBaselineConsistency],
                ['Large Network (Heavy)', testLargeNetwork],
                ['AND/OR Logic (Heavy)', testAndOrNodes],
                
                // Lite Mode Tests
                ['Basic Weight Propagation (Lite)', testBasicLite],
                ['Independence Lite', testIndependenceLite],
                ['Extreme Weights (Lite)', testExtremeWeightsLite],
                ['Multi-parent Lite', testMultiParentLite],
                ['Large Network Lite', testLargeNetworkLite],
                ['Convergence Speed (Lite)', testConvergenceSpeed]
            ];
            
            let currentTest = 0;
            
            function runNextTest() {
                if (currentTest >= tests.length) {
                    // All tests complete
                    if (bugCount === 0) {
                        console.log(`✅ AUTONOMOUS TESTING COMPLETE: ${testCount} tests passed, no bugs found`);
                        console.log(`📊 Tested both Heavy mode (7 tests) and Lite mode (6 tests)`);
                    } else {
                        console.log(`\n🚨 AUTONOMOUS TESTING COMPLETE: ${bugCount} bugs found in ${testCount} tests`);
                        console.log('\nBUG SUMMARY:');
                        bugs.forEach((bug, i) => {
                            console.log(`${i+1}. [${bug.severity}] ${bug.category}: ${bug.description}`);
                        });
                    }
                    return;
                }
                
                const [testName, testFunc] = tests[currentTest];
                runTest(testName, testFunc);
                currentTest++;
                
                // Small delay between tests
                setTimeout(runNextTest, 100);
            }
            
            console.log('🤖 Starting autonomous bug hunting (Heavy + Lite modes)...');
            runNextTest();
            
        }, 1000);
    }
    
    // Start autonomous testing
    runAutonomousTests();
    
})();
