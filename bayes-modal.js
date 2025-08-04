
import { propagateBayesHeavy } from './bayes-logic.js';
import { TOOLTIP_TEXTS, attachTooltip } from './config.js';

let clickOutHandler = null;

// Centralized modal close function
function closeModal() {
  document.getElementById('bayes-modal').classList.add('hidden');
  if (clickOutHandler) {
    document.removeEventListener('click', clickOutHandler);
    clickOutHandler = null;
  }
}

let stepIndex = 0; // 0 = baseline, 1 = condTrue, 2 = condFalse, 3 = summary

    // State
    let baseline = 50, condTrue = 50, condFalse = 50, inverse = false;
    let isUpdating = false; // Flag to prevent infinite loops
    
    // Helper function to safely update slider values without triggering events
    function safeSetSliderValue(slider, value, updateFunction) {
      isUpdating = true;
      slider.value = value;
      updateFunction();
      isUpdating = false;
    }

    // DOM refs
    const stepBaseline = document.getElementById('step-baseline');
    const stepCondTrue = document.getElementById('step-cond-true');
    const stepCondFalse = document.getElementById('step-cond-false');
    const stepSummary = document.getElementById('step-summary');
    const modal = document.getElementById('bayes-modal');
let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;

// Make the first step title draggable
const firstStepTitle = document.querySelector('#step-baseline .step-title');
firstStepTitle.style.cursor = 'move';
firstStepTitle.style.userSelect = 'none';

firstStepTitle.addEventListener('mousedown', function(e) {
  e.preventDefault();
  isDragging = true;
  
  // Get the current computed position of the modal
  const rect = modal.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
  
  // Convert to pixel-based positioning immediately
  modal.style.left = rect.left + 'px';
  modal.style.top = rect.top + 'px';
  modal.style.transform = 'none';
  modal.style.position = 'fixed';
  
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'move';
});

document.addEventListener('mouseup', function() {
  if (isDragging) {
    isDragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }
});

document.addEventListener('mousemove', function(e) {
  if (isDragging) {
    e.preventDefault();
    const newLeft = e.clientX - dragOffsetX;
    const newTop = e.clientY - dragOffsetY;
    
    // Keep modal within viewport bounds
    const maxLeft = window.innerWidth - modal.offsetWidth;
    const maxTop = window.innerHeight - modal.offsetHeight;
    
    modal.style.left = Math.max(0, Math.min(maxLeft, newLeft)) + 'px';
    modal.style.top = Math.max(0, Math.min(maxTop, newTop)) + 'px';
  }
});


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
attachTooltip(document.getElementById('baseline-info-icon'), TOOLTIP_TEXTS.baseline);

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
  document.getElementById('bayes-modal').classList.add('hidden');
});
document.getElementById('cancel-btn').addEventListener('click', function() {
  document.getElementById('bayes-modal').classList.add('hidden');
});

    // --- Baseline ---
    function updateBaseline() {
      if (isUpdating) return; // Prevent infinite loops
      isUpdating = true;
      
      baseline = Number(baselineSlider.value);
      baselineValue.textContent = baseline + "%";
      
      // Show the value display when user interacts with slider
      baselineValue.style.visibility = 'visible';
      
      isUpdating = false; // Reset flag
    }
    baselineSlider.addEventListener('input', updateBaseline);
    inverseCheckbox.addEventListener('change', () => {
      inverse = inverseCheckbox.checked;
      parentTrueWord.textContent = inverse ? "false" : "true";
      parentTrueWord2.textContent = inverse ? "false" : "true";
      parentFalseWord.textContent = inverse ? "true" : "false";
      parentFalseWord2.textContent = inverse ? "true" : "false";
      
      // Note: Constraints will update when user clicks "Set Baseline"
    });
setBaselineBtn.onclick = () => {
  baselineInputRow.classList.add('hidden');
  baselineLockedRow.classList.remove('hidden');
  baselineLockedValue.textContent = baseline + "%";
  stepIndex = 1;
  renderStep();
  
  // Set initial slider values based on inverse mode
  if (inverse) {
    // Inverse mode: True should be <= baseline, False should be >= baseline
    safeSetSliderValue(condTrueSlider, baseline, updateCondTrue);
  } else {
    // Normal mode: True should be >= baseline, False should be <= baseline  
    safeSetSliderValue(condTrueSlider, baseline, updateCondTrue);
  }
};

    document.getElementById('edit-baseline-btn').addEventListener('click', () => {
stepIndex = 0;
renderStep();
    });

    // --- Cond True ---
    function updateCondTrue() {
      if (isUpdating) {
        return; // Prevent infinite loops
      }
      isUpdating = true;
      
      condTrue = Number(condTrueSlider.value);
      condTrueValue.textContent = condTrue + "%";
      
      // Show the value display when user interacts with slider
      condTrueValue.style.visibility = 'visible';
      
      // Flip constraints based on inverse setting
      if (inverse) {
        regionTrueLabel.textContent = `Allowed: 0%–${baseline}%`;
        const legal = condTrue >= 0 && condTrue <= baseline;
        setCondTrueBtn.disabled = !legal;
        condTrueWarning.textContent = legal ? "" : `Value must be between 0% and baseline (${baseline}%)`;
      } else {
        regionTrueLabel.textContent = `Allowed: ${baseline}%–100%`;
        const legal = condTrue >= baseline && condTrue <= 100;
        setCondTrueBtn.disabled = !legal;
        condTrueWarning.textContent = legal ? "" : `Value must be between baseline (${baseline}%) and 100%`;
      }
      
      let ratio = baseline === 0 ? 99 : condTrue / baseline;
      if (baseline === 0 && condTrue === 0) ratio = 1;
      ratioTrueLabel.textContent = `(${ratio.toFixed(2)}× baseline) — ${qualitativeRatio(ratio)}`;
      
      isUpdating = false; // Reset flag
    }
    condTrueSlider.addEventListener('input', updateCondTrue);
setCondTrueBtn.onclick = () => {
  condTrueInputRow.classList.add('hidden');
  condTrueLockedRow.classList.remove('hidden');
  condTrueLockedValue.textContent = condTrue + "%";
  stepIndex = 2;
  renderStep();
  
  // Set initial slider value for false conditional based on inverse mode
  if (inverse) {
    // Inverse mode: False should be >= baseline
    safeSetSliderValue(condFalseSlider, baseline, updateCondFalse);
  } else {
    // Normal mode: False should be <= baseline
    safeSetSliderValue(condFalseSlider, baseline, updateCondFalse);
  }
};

    document.getElementById('edit-cond-true-btn').addEventListener('click', () => {
  stepIndex = 1;
  renderStep();
});

    // --- Cond False ---
    function updateCondFalse() {
      if (isUpdating) return; // Prevent infinite loops
      isUpdating = true;
      
      condFalse = Number(condFalseSlider.value);
      condFalseValue.textContent = condFalse + "%";
      
      // Show the value display when user interacts with slider
      condFalseValue.style.visibility = 'visible';
      
      // Flip constraints based on inverse setting
      if (inverse) {
        regionFalseLabel.textContent = `Allowed: ${baseline}%–100%`;
        const legal = condFalse >= baseline && condFalse <= 100;
        setCondFalseBtn.disabled = !legal;
        condFalseWarning.textContent = legal ? "" : `Value must be between baseline (${baseline}%) and 100%`;
      } else {
        regionFalseLabel.textContent = `Allowed: 0%–${baseline}%`;
        const legal = condFalse >= 0 && condFalse <= baseline;
        setCondFalseBtn.disabled = !legal;
        condFalseWarning.textContent = legal ? "" : `Value must be between 0% and baseline (${baseline}%)`;
      }
      
      let ratio = baseline === 0 ? 1 : condFalse / baseline;
      ratioFalseLabel.textContent = `(${ratio.toFixed(2)}× baseline) — ${qualitativeRatio(ratio)}`;
      
      isUpdating = false; // Reset flag
    }
    condFalseSlider.addEventListener('input', updateCondFalse);
setCondFalseBtn.onclick = () => {
  condFalseInputRow.classList.add('hidden');
  condFalseLockedRow.classList.remove('hidden');
  condFalseLockedValue.textContent = condFalse + "%";
  stepIndex = 3;
  renderStep();
};
    document.getElementById('edit-cond-false-btn').addEventListener('click', () => {
  stepIndex = 2;
  renderStep();
    });

    // --- Summary ---
    function updateSummary() {
      const parentLabel = window._modalParentLabel || 'Parent';
      const childLabel = window._modalChildLabel || 'Child';
      
      // The summary should always show the direct mapping:
      // P(Child | Parent is true) = condTrue value
      // P(Child | Parent is false) = condFalse value
      // The inverse flag affects the UI flow but not the final summary display
      let trueCondition = condTrue;   // P(Child | Parent is true)
      let falseCondition = condFalse; // P(Child | Parent is false)
      
      let msg = `<b>Baseline:</b> ${baseline}%<br>
      <b>P("${childLabel}" | "${parentLabel}" is true):</b> ${trueCondition}%<br>
      <b>P("${childLabel}" | "${parentLabel}" is false):</b> ${falseCondition}%<br><br>`;
      let ratio = falseCondition === 0 ? (trueCondition === 0 ? 1 : 99) : trueCondition / falseCondition;
      msg += `Conditional likelihood ratio: <b>${ratio.toFixed(2)}×</b><br>`;
      msg += qualitativeRatio(ratio);
      summaryText.innerHTML = msg;
    }
okBtn.addEventListener('click', () => {
  closeModal();
  
  // Save modal values to the edge - HEAVY MODE DATA ONLY
  if (window._currentBayesEdge) {
    // Store CPT data in heavy-mode namespace
    window._currentBayesEdge.data('cpt', {
      baseline,
      condTrue,
      condFalse,
      inverse
    });
    
    // Mark as non-virgin for heavy mode only (don't touch lite mode data)
    // Note: We don't use 'isVirgin' since that conflicts with lite mode
    
    // Trigger unified convergence (in Heavy mode: single-pass calculation only)
    if (window.convergeAll && window.cy) {
      window.convergeAll({ cy: window.cy });
    }
    
    // Update visuals to reflect heavy mode changes
    if (window.computeVisuals && window.cy) {
      window.computeVisuals(window.cy);
    }
  }
});

cancelBtn.addEventListener('click', () => {
  closeModal();
  // Optionally, reset any Bayes modal state here.
});

// Handle early cancel button
document.getElementById('cancel-btn-early').addEventListener('click', () => {
  closeModal();
});


window.openBayesModalForEdge = function(edge) {
  window._currentBayesEdge = edge;

  // Get actual node labels and clean them
  const sourceNode = edge.source();
  const targetNode = edge.target();
  const targetType = targetNode.data('type');
  
  // Check if this is an edge to a logic node (AND/OR)
  if (targetType === 'and' || targetType === 'or') {
    // Show simplified modal for logic nodes
    openLogicEdgeModal(edge, sourceNode, targetNode);
    return;
  }
  
  // Continue with regular CPT modal for assertion nodes
  // Extract clean labels by removing probability indicators
  function cleanLabel(rawLabel) {
    if (!rawLabel) return 'Node';
    // Remove everything from the last newline onward (probability display)
    const cleanedLabel = rawLabel.split('\n')[0].trim();
    return cleanedLabel || 'Node';
  }
  
  const parentLabel = cleanLabel(sourceNode.data('label'));
  const childLabel = cleanLabel(targetNode.data('label'));
  
  // Store labels for use in modal text
  window._modalParentLabel = parentLabel;
  window._modalChildLabel = childLabel;

  // If you want to prefill, set the modal's fields here from edge.data('cpt'):
  const cpt = edge.data('cpt') || {};
  
  // Update local variables first
  baseline = cpt.baseline !== undefined ? cpt.baseline : 50;
  condTrue = cpt.condTrue !== undefined ? cpt.condTrue : baseline;
  condFalse = cpt.condFalse !== undefined ? cpt.condFalse : baseline;
  inverse = !!cpt.inverse;
  
  // Then update the DOM elements safely
  isUpdating = true;
  document.getElementById('baseline-slider').value = baseline;
  document.getElementById('cond-true-slider').value = condTrue;
  document.getElementById('cond-false-slider').value = condFalse;
  document.getElementById('inverse-checkbox').checked = inverse;
  
  // Hide the value displays initially - they'll show when user interacts with sliders
  document.getElementById('baseline-value').style.visibility = 'hidden';
  document.getElementById('cond-true-value').style.visibility = 'hidden';
  document.getElementById('cond-false-value').style.visibility = 'hidden';
  
  // Use a small delay to ensure DOM updates have taken effect, then call update functions
  setTimeout(() => {
    updateBaseline();
    updateCondTrue();
    updateCondFalse();
    
    // Now that initialization is complete, allow normal slider interactions
    isUpdating = false;
  }, 10);

  // Update the modal text with actual labels
  updateModalLabels();
  
  // Update the true/false word displays (but don't call update functions yet to avoid loops)
  parentTrueWord.textContent = inverse ? "false" : "true";
  parentTrueWord2.textContent = inverse ? "false" : "true";
  parentFalseWord.textContent = inverse ? "true" : "false";
  parentFalseWord2.textContent = inverse ? "true" : "false";

  document.getElementById('bayes-modal').classList.remove('hidden');
  stepIndex = 0;
  renderStep();

  // Add click-out functionality - use a more robust approach
  clickOutHandler = (e) => {
    // Only close if clicking directly on the modal background, not on any child elements
    if (e.target === document.getElementById('bayes-modal')) {
      closeModal();
    }
  };
  // Use document-level listener with slight delay to avoid immediate closure
  setTimeout(() => {
    document.addEventListener('click', clickOutHandler);
  }, 100);
};

// Function to update all the modal text with actual node labels
function updateModalLabels() {
  const parentLabel = window._modalParentLabel || 'Parent';
  const childLabel = window._modalChildLabel || 'Child';
  
  // Update step titles - add quotation marks around node labels
  document.querySelector('#step-cond-true .step-title').innerHTML = 
    `2. If <b>"${parentLabel}"</b> is <span id="parent-true-word">true</span>`;
  document.querySelector('#step-cond-false .step-title').innerHTML = 
    `3. If <b>"${parentLabel}"</b> is <span id="parent-false-word">false</span>`;
  
  // Update step descriptions - add quotation marks around node labels
  document.querySelector('#step-baseline .step-sub').textContent = 
    `Chance "${childLabel}" is true if nothing is known about "${parentLabel}".`;
  
  document.querySelector('#step-cond-true .step-sub').innerHTML = 
    `Chance <b>"${childLabel}"</b> is true if <b>"${parentLabel}"</b> is <span id="parent-true-word2">true</span>.`;
    
  document.querySelector('#step-cond-false .step-sub').innerHTML = 
    `Chance <b>"${childLabel}"</b> is true if <b>"${parentLabel}"</b> is <span id="parent-false-word2">false</span>.`;
    
  // Update the inverse checkbox label (preserve the existing checkbox element)
  const inverseLabel = document.querySelector('#step-baseline label');
  if (inverseLabel) {
    // Find the existing checkbox and preserve it
    const existingCheckbox = inverseLabel.querySelector('#inverse-checkbox');
    const checkboxChecked = existingCheckbox ? existingCheckbox.checked : false;
    
    // Update the label text while preserving the checkbox - add quotation marks around node labels
    inverseLabel.innerHTML = `<input type="checkbox" id="inverse-checkbox" ${checkboxChecked ? 'checked' : ''}>
      Inverse relationship: "${childLabel}" more likely if "${parentLabel}" is <b>false</b>`;
    
    // Re-attach the event listener since we recreated the element
    const newCheckbox = document.getElementById('inverse-checkbox');
    newCheckbox.addEventListener('change', () => {
      inverse = newCheckbox.checked;
      parentTrueWord.textContent = inverse ? "false" : "true";
      parentTrueWord2.textContent = inverse ? "false" : "true";
      parentFalseWord.textContent = inverse ? "true" : "false";
      parentFalseWord2.textContent = inverse ? "true" : "false";
      
      // Note: Constraints will update when user clicks "Set Baseline"
    });
  }
}
function renderStep() {
  // Step visibility
  stepBaseline.classList.remove('hidden');
  stepCondTrue.classList.toggle('hidden', stepIndex < 1);
  stepCondFalse.classList.toggle('hidden', stepIndex < 2);
  stepSummary.classList.toggle('hidden', stepIndex !== 3);

  // Baseline row
  baselineInputRow.classList.toggle('hidden', stepIndex !== 0);
  baselineLockedRow.classList.toggle('hidden', stepIndex === 0);

  // Cond True row
  condTrueInputRow.classList.toggle('hidden', stepIndex !== 1);
  condTrueLockedRow.classList.toggle('hidden', stepIndex === 1 || stepIndex === 0);

  // Cond False row
  condFalseInputRow.classList.toggle('hidden', stepIndex !== 2);
  condFalseLockedRow.classList.toggle('hidden', stepIndex === 2 || stepIndex < 2);

  // Summary
  if (stepIndex === 3) updateSummary();
}

// Simplified modal for logic node edges (AND/OR) - only shows inverse checkbox
function openLogicEdgeModal(edge, sourceNode, targetNode) {
  // Clean labels
  function cleanLabel(rawLabel) {
    if (!rawLabel) return 'Node';
    const cleanedLabel = rawLabel.split('\n')[0].trim();
    return cleanedLabel || 'Node';
  }
  
  const parentLabel = cleanLabel(sourceNode.data('label'));
  const childLabel = cleanLabel(targetNode.data('label'));
  
  // Create modal (same styling as lite mode)
  const modal = document.createElement('div');
  modal.id = 'logic-edge-modal';
  modal.className = 'modifier-modal';
  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border: 2px solid #444;
    border-radius: 8px;
    padding: 20px;
    z-index: 1000;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    min-width: 300px;
  `;
  
  // Title (same format as lite mode)
  const label = document.createElement('div');
  label.textContent = `${parentLabel} → ${childLabel}`;
  label.className = "modifier-modal-title";
  label.style.fontWeight = 'bold';
  label.style.marginBottom = '10px';
  modal.appendChild(label);
  
  // Opposing checkbox (exactly same as lite mode)
  const opposesContainer = document.createElement('div');
  opposesContainer.style.marginBottom = '8px';
  const opposesCheckbox = document.createElement('input');
  opposesCheckbox.type = 'checkbox';
  opposesCheckbox.id = 'opposes-checkbox';
  
  // Get current value from cpt.inverse (heavy mode storage)
  const cpt = edge.data('cpt') || {};
  opposesCheckbox.checked = !!cpt.inverse;
  
  const opposesLabel = document.createElement('label');
  opposesLabel.textContent = "Opposing ('not') influence";
  opposesLabel.htmlFor = 'opposes-checkbox';
  opposesContainer.appendChild(opposesCheckbox);
  opposesContainer.appendChild(opposesLabel);
  modal.appendChild(opposesContainer);
  
  // Buttons (same as lite mode)
  const btn = document.createElement('button');
  btn.textContent = 'OK';
  btn.style.margin = '10px 5px 0 0';
  btn.onclick = function () {
    const opposes = opposesCheckbox.checked;
    
    // Save to cpt.inverse (heavy mode storage)
    const newCpt = { ...cpt, inverse: opposes };
    edge.data('cpt', newCpt);
    
    document.body.removeChild(modal);
    setTimeout(() => {
      // Trigger unified convergence (in Heavy mode: single-pass calculation only)
      if (window.convergeAll && window.cy) {
        window.convergeAll({ cy: window.cy });
      }
      
      // Update visuals
      if (window.computeVisuals && window.cy) {
        window.computeVisuals(window.cy);
      }
    }, 10);
  };
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.margin = '10px 5px 0 5px';
  cancelBtn.onclick = function () {
    document.body.removeChild(modal);
  };
  
  modal.appendChild(btn);
  modal.appendChild(cancelBtn);
  
  document.body.appendChild(modal);
}
