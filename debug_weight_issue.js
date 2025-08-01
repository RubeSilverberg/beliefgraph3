// Debug - FIXED TANH SATURATION with constant limit
const priorOdds = 0; // 50% base = 0 log odds
const pos_odds = 0.405; // 60% ≈ 0.405 log odds  
const neg_odds = 4.595; // 100% ≈ 4.595 log odds

console.log('=== FIXED TANH SATURATION (constant 3.0 limit) ===');

let prevProb = null;

[0.5, 0.7, 0.85, 0.9].forEach(posWeight => {
  const negWeight = -0.6; // opposing edge weight
  
  // Raw contributions
  const posContrib = posWeight * (pos_odds - priorOdds);
  const negContrib = negWeight * (neg_odds - priorOdds);
  const rawTotal = posContrib + negContrib;
  
  // FIXED tanh saturation with constant limit
  const maxOddsChange = 3.0;
  const fixedSaturated = Math.sign(rawTotal) * Math.tanh(Math.abs(rawTotal) / maxOddsChange) * maxOddsChange;
  
  // Compare with no saturation and old broken method
  const noSaturation = rawTotal;
  const oldBroken = rawTotal * (1 - Math.exp(-1 * (Math.abs(posWeight) + Math.abs(negWeight))));
  
  console.log(`\nWeight ${posWeight}:`);
  console.log(`  Raw total: ${rawTotal.toFixed(3)}`);
  console.log(`  No saturation: ${noSaturation.toFixed(3)}`);
  console.log(`  OLD (broken): ${oldBroken.toFixed(3)}`);
  console.log(`  NEW (fixed tanh): ${fixedSaturated.toFixed(3)}`);
  
  // Convert to probabilities
  const noSatProb = 1 / (1 + Math.exp(-noSaturation));
  const oldProb = 1 / (1 + Math.exp(-oldBroken));
  const newProb = 1 / (1 + Math.exp(-fixedSaturated));
  
  console.log(`  No sat probability: ${(noSatProb * 100).toFixed(1)}%`);
  console.log(`  OLD probability: ${(oldProb * 100).toFixed(1)}%`);
  console.log(`  NEW probability: ${(newProb * 100).toFixed(1)}%`);
  
  if (prevProb !== null) {
    const trend = newProb > prevProb ? 'INCREASING ✅' : 'DECREASING ❌';
    console.log(`  Trend: ${trend}`);
  }
  
  prevProb = newProb;
});
