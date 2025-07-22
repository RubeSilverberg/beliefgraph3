    // State
    let baseline = 50, condTrue = 70, condFalse = 30, inverse = false;

    // DOM refs
    const stepBaseline = document.getElementById('step-baseline');
    const stepCondTrue = document.getElementById('step-cond-true');
    const stepCondFalse = document.getElementById('step-cond-false');
    const stepSummary = document.getElementById('step-summary');

    // Baseline
    const baselineSlider = document.getElementById('baseline-slider');
    const baselineValue = document.getElementById('baseline-value');
    const setBaselineBtn = document.getElementById('set-baseline-btn');
    const baselineInputRow = document.getElementById('baseline-input-row');
    const baselineLockedRow = document.getElementById('baseline-locked-row');
    const baselineLockedValue = document.getElementById('baseline-locked-value');
    const inverseCheckbox = document.getElementById('inverse-checkbox');

    // Cond True
    const condTrueSlider = document.getElementById('cond-true-slider');
    const condTrueValue = document.getElementById('cond-true-value');
    const setCondTrueBtn = document.getElementById('set-cond-true-btn');
    const condTrueInputRow = document.getElementById('cond-true-input-row');
    const condTrueLockedRow = document.getElementById('cond-true-locked-row');
    const condTrueLockedValue = document.getElementById('cond-true-locked-value');
    const regionTrueLabel = document.getElementById('region-true-label');
    const ratioTrueLabel = document.getElementById('ratio-true-label');
    const condTrueWarning = document.getElementById('cond-true-warning');
    const parentTrueWord = document.getElementById('parent-true-word');
    const parentTrueWord2 = document.getElementById('parent-true-word2');

    // Cond False
    const condFalseSlider = document.getElementById('cond-false-slider');
    const condFalseValue = document.getElementById('cond-false-value');
    const setCondFalseBtn = document.getElementById('set-cond-false-btn');
    const condFalseInputRow = document.getElementById('cond-false-input-row');
    const condFalseLockedRow = document.getElementById('cond-false-locked-row');
    const condFalseLockedValue = document.getElementById('cond-false-locked-value');
    const regionFalseLabel = document.getElementById('region-false-label');
    const ratioFalseLabel = document.getElementById('ratio-false-label');
    const condFalseWarning = document.getElementById('cond-false-warning');
    const parentFalseWord = document.getElementById('parent-false-word');
    const parentFalseWord2 = document.getElementById('parent-false-word2');

    // Summary
    const summaryText = document.getElementById('summary-text');
    const okBtn = document.getElementById('ok-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    // Qualitative labels
    function qualitativeRatio(ratio) {
      if (ratio < 0.85) return "Somewhat less likely";
      if (ratio < 1.10) return "About the same";
      if (ratio < 1.40) return "A bit more likely";
      if (ratio < 1.80) return "One and a half times more likely";
      if (ratio < 2.6) return "Twice as likely";
      if (ratio < 4.5) return "Much more likely";
      return "VASTLY more likely";
    }
document.getElementById('ok-btn').addEventListener('click', function() {
  document.getElementById('bayes-modal').style.display = 'none';
});
document.getElementById('cancel-btn').addEventListener('click', function() {
  document.getElementById('bayes-modal').style.display = 'none';
});

    // --- Baseline ---
    function updateBaseline() {
      baseline = Number(baselineSlider.value);
      baselineValue.textContent = baseline + "%";
    }
    baselineSlider.addEventListener('input', updateBaseline);
    inverseCheckbox.addEventListener('change', () => {
      inverse = inverseCheckbox.checked;
      parentTrueWord.textContent = inverse ? "false" : "true";
      parentTrueWord2.textContent = inverse ? "false" : "true";
      parentFalseWord.textContent = inverse ? "true" : "false";
      parentFalseWord2.textContent = inverse ? "true" : "false";
    });
    setBaselineBtn.addEventListener('click', () => {
      baselineInputRow.classList.add('hidden');
      baselineLockedRow.classList.remove('hidden');
      baselineLockedValue.textContent = baseline + "%";
      // Reveal next step
      stepCondTrue.classList.remove('hidden');
      // Init condTrue
      condTrueSlider.value = Math.max(baseline, 50);
      condTrueValue.textContent = condTrueSlider.value + "%";
      updateCondTrue();
    });
    document.getElementById('edit-baseline-btn').addEventListener('click', () => {
      baselineInputRow.classList.remove('hidden');
      baselineLockedRow.classList.add('hidden');
      stepCondTrue.classList.add('hidden');
      stepCondFalse.classList.add('hidden');
      stepSummary.classList.add('hidden');
    });

    // --- Cond True ---
    function updateCondTrue() {
      condTrue = Number(condTrueSlider.value);
      condTrueValue.textContent = condTrue + "%";
      regionTrueLabel.textContent = `Allowed: ${baseline}%–100%`;
      let ratio = baseline === 0 ? 99 : condTrue / baseline;
      if (baseline === 0 && condTrue === 0) ratio = 1;
      ratioTrueLabel.textContent = `(${ratio.toFixed(2)}× baseline) — ${qualitativeRatio(ratio)}`;
      const legal = condTrue >= baseline && condTrue <= 100;
      setCondTrueBtn.disabled = !legal;
      condTrueWarning.textContent = legal ? "" : `Value must be between baseline (${baseline}%) and 100%`;
    }
    condTrueSlider.addEventListener('input', updateCondTrue);
    setCondTrueBtn.addEventListener('click', () => {
      condTrueInputRow.classList.add('hidden');
      condTrueLockedRow.classList.remove('hidden');
      condTrueLockedValue.textContent = condTrue + "%";
      // Reveal next step
      stepCondFalse.classList.remove('hidden');
      condFalseSlider.value = Math.min(baseline, 50);
      condFalseValue.textContent = condFalseSlider.value + "%";
      updateCondFalse();
    });
    document.getElementById('edit-cond-true-btn').addEventListener('click', () => {
      condTrueInputRow.classList.remove('hidden');
      condTrueLockedRow.classList.add('hidden');
      stepCondFalse.classList.add('hidden');
      stepSummary.classList.add('hidden');
    });

    // --- Cond False ---
    function updateCondFalse() {
      condFalse = Number(condFalseSlider.value);
      condFalseValue.textContent = condFalse + "%";
      regionFalseLabel.textContent = `Allowed: 0%–${baseline}%`;
      let ratio = baseline === 0 ? 1 : condFalse / baseline;
      ratioFalseLabel.textContent = `(${ratio.toFixed(2)}× baseline) — ${qualitativeRatio(ratio)}`;
      const legal = condFalse >= 0 && condFalse <= baseline;
      setCondFalseBtn.disabled = !legal;
      condFalseWarning.textContent = legal ? "" : `Value must be between 0% and baseline (${baseline}%)`;
    }
    condFalseSlider.addEventListener('input', updateCondFalse);
    setCondFalseBtn.addEventListener('click', () => {
      condFalseInputRow.classList.add('hidden');
      condFalseLockedRow.classList.remove('hidden');
      condFalseLockedValue.textContent = condFalse + "%";
      // Reveal summary
      stepSummary.classList.remove('hidden');
      updateSummary();
    });
    document.getElementById('edit-cond-false-btn').addEventListener('click', () => {
      condFalseInputRow.classList.remove('hidden');
      condFalseLockedRow.classList.add('hidden');
      stepSummary.classList.add('hidden');
    });

    // --- Summary ---
    function updateSummary() {
      let pos = inverse ? condFalse : condTrue;
      let neg = inverse ? condTrue : condFalse;
      let posTxt = inverse ? parentFalseWord.textContent : parentTrueWord.textContent;
      let negTxt = inverse ? parentTrueWord.textContent : parentFalseWord.textContent;
      let msg = `<b>Baseline:</b> ${baseline}%<br>
      <b>P([Child] | [Parent] is ${posTxt}):</b> ${pos}%<br>
      <b>P([Child] | [Parent] is ${negTxt}):</b> ${neg}%<br><br>`;
      let ratio = baseline === 0 ? 1 : pos / baseline;
      msg += `Conditional likelihood ratio: <b>${ratio.toFixed(2)}×</b> baseline<br>`;
      msg += qualitativeRatio(ratio);
      summaryText.innerHTML = msg;
    }
    okBtn.addEventListener('click', () => {
document.getElementById('bayes-modal').style.display = 'none';
      location.reload();
    });
    cancelBtn.addEventListener('click', () => {
  document.getElementById('bayes-modal').style.display = 'none';
  if (confirm('Cancel and discard?')) location.reload();
    });

    // Initial render
    updateBaseline();
    updateCondTrue();
    updateCondFalse();
    updateSummary();


window.openBayesModalForEdge = function(edge) {
    console.log('openBayesModalForEdge called with:', edge);
  window._currentBayesEdge = edge;

  // If you want to prefill, set the modal's fields here from edge.data('cpt'):
  const cpt = edge.data('cpt') || {};
  document.getElementById('baseline-slider').value = cpt.baseline !== undefined ? cpt.baseline : 50;
  document.getElementById('baseline-value').textContent = (cpt.baseline !== undefined ? cpt.baseline : 50) + '%';
  document.getElementById('cond-true-slider').value = cpt.condTrue !== undefined ? cpt.condTrue : 70;
  document.getElementById('cond-true-value').textContent = (cpt.condTrue !== undefined ? cpt.condTrue : 70) + '%';
  document.getElementById('cond-false-slider').value = cpt.condFalse !== undefined ? cpt.condFalse : 30;
  document.getElementById('cond-false-value').textContent = (cpt.condFalse !== undefined ? cpt.condFalse : 30) + '%';
  document.getElementById('inverse-checkbox').checked = !!cpt.inverse;

document.getElementById('bayes-modal').style.display = 'block';
};
