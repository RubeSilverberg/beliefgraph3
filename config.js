// --- NODE/EDGE TYPE CONSTANTS ---
export const NODE_TYPE_FACT = "fact";
export const NODE_TYPE_ASSERTION = "assertion";
export const NODE_TYPE_AND = "and";
export const NODE_TYPE_OR = "or";
export const NODE_TYPE_NOTE = "note";
export const EDGE_TYPE_SUPPORTS = "supports";
export const EDGE_TYPE_OPPOSES = "opposes";

export const ALLOWED_NODE_TYPES = [
  NODE_TYPE_FACT, NODE_TYPE_ASSERTION, NODE_TYPE_AND, NODE_TYPE_OR, NODE_TYPE_NOTE
];
export const ALLOWED_EDGE_TYPES = [EDGE_TYPE_SUPPORTS, EDGE_TYPE_OPPOSES];

// --- CONFIG ---
export const DEBUG = true;
export const WEIGHT_MIN = 0.01;
export const config = {
  bayesHeavyMode: false,
  epsilon: 0.01,
  // add more config fields as needed
};

// --- LOGGING ---
export function logMath(nodeId, msg) {
  if (DEBUG) console.log(`[${nodeId}] ${msg}`);
}

// --- EDGE WEIGHT/LIKERT UTILITIES ---
export function likertToWeight(val) {
  const weights = [-1, -0.85, -0.60, -0.35, -0.15, 0.15, 0.35, 0.60, 0.85, 1];
  if (val < 0) return weights[val + 5];
  if (val > 0) return weights[val + 4];
  return 0.15;
}

export function weightToLikert(w) {
  const weights = [0.15, 0.35, 0.60, 0.85, 1];
  const absW = Math.abs(w);
  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < weights.length; ++i) {
    const diff = Math.abs(absW - weights[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx + 1; // 1–5
}

export function likertDescriptor(val) {
  switch (val) {
    case  1: return "Minimal";
    case  2: return "Small";
    case  3: return "Medium";
    case  4: return "Strong";
    case  5: return "Maximal";
    default: return `Custom (${val})`;
  }
}

export function saturation(aei, k = 1) {
  return 1 - Math.exp(-k * aei);
}

// --- INFO ICON AND TOOLTIP REUSABLES ---

// SVG for info icon, used everywhere
export const INFO_ICON_SVG = `
  <svg width="16" height="16" style="vertical-align:middle;" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="9" fill="#0074D9"/>
    <text x="10" y="15" text-anchor="middle" font-size="14" fill="white" font-family="Arial" font-weight="bold">?</text>
  </svg>
`;

// Tooltip texts for each context (expand as needed)
export const TOOLTIP_TEXTS = {
  baseline: "The baseline probability isn’t used directly in calculations, but it helps you set a mental reference point for the conditional values below. If you’re unsure, just leave it at 50%. That’s a neutral, safe default.",
toggleBayes: "Switch between 'Bayes Lite' and 'Bayes Heavy'. Bayes Heavy disables structural edits, but you can toggle modes at any time. Basic Bayesian knowledge is helpful.",
};

// Helper to create an info icon with tooltip attached
export function createInfoIcon(id, tooltipText, attachTooltipFn) {
  const span = document.createElement('span');
  if (id) span.id = id;
  span.style.cursor = 'pointer';
  span.style.marginLeft = '6px';
  span.style.display = 'inline-block';
  span.innerHTML = INFO_ICON_SVG;
  if (attachTooltipFn) attachTooltipFn(span, tooltipText);
  return span;
}

// Attach tooltip functionality to an element
export function attachTooltip(element, tooltipText) {
  let tooltip = null;
  let showTimeout = null;
  let hideTimeout = null;
  
  element.addEventListener('mouseenter', (e) => {
    // Clear any pending hide timeout
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    
    // Set a delay before showing tooltip
    showTimeout = setTimeout(() => {
      // Remove any existing tooltip first
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
      
      // Create new tooltip
      tooltip = document.createElement('div');
      tooltip.className = 'custom-tooltip';
      tooltip.textContent = tooltipText;
      tooltip.style.display = 'block';
      document.body.appendChild(tooltip);
      
      // Position tooltip near the element
      const rect = element.getBoundingClientRect();
      tooltip.style.left = (rect.left + rect.width + 10) + 'px';
      tooltip.style.top = (rect.top + rect.height / 2 - tooltip.offsetHeight / 2) + 'px';
      
      // Ensure tooltip stays within viewport
      const tooltipRect = tooltip.getBoundingClientRect();
      if (tooltipRect.right > window.innerWidth) {
        tooltip.style.left = (rect.left - tooltip.offsetWidth - 10) + 'px';
      }
      if (tooltipRect.bottom > window.innerHeight) {
        tooltip.style.top = (window.innerHeight - tooltip.offsetHeight - 10) + 'px';
      }
      if (tooltipRect.top < 0) {
        tooltip.style.top = '10px';
      }
    }, 300); // 0.3 second delay
  });
  
  element.addEventListener('mouseleave', () => {
    // Clear any pending show timeout
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
    
    // Hide tooltip immediately when leaving
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
  });
}
