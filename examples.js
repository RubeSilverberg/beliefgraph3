// examples.js - Example graph library manager

export const EXAMPLE_GRAPHS = [
  {
    name: "Investigative Example",
    description: "Credibility focused forensic investigation, lite and heavy mode",
    filename: "investigative-example.json"
  },
  {
    name: "AND OR logic node example",
    description: "Simple usage of logic nodes: breakfast",
    filename: "AND OR logic node example.json"
  },
  {
    name: "Policy Analysis: Rent Control",
    description: "Weighing arguments for / against expanding rent control",
    filename: "Policy analysis example_rent control.json"
  },
  {
    name: "D&D NPC Favorability Graph",
    description: "Track how party actions affect NPC factions in a D&D campaign.",
    filename: "dnd-npc-favorability.json"
  }
];

export async function loadExampleGraph(filename) {
  try {
    const response = await fetch(`examples/${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load example: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading example graph:', error);
    throw error;
  }
}

export function showExamplesMenu() {
  if (EXAMPLE_GRAPHS.length === 0) {
    alert('No example graphs available yet.');
    return;
  }

  let message = 'Choose an example graph to load:\n\n';
  EXAMPLE_GRAPHS.forEach((example, index) => {
    message += `${index + 1}. ${example.name}\n   ${example.description}\n\n`;
  });
  message += 'Enter a number (1-' + EXAMPLE_GRAPHS.length + ') or 0 to cancel:';

  const choice = prompt(message);
  if (choice === null || choice.trim() === '0') {
    return;
  }

  const choiceNum = parseInt(choice.trim());
  if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > EXAMPLE_GRAPHS.length) {
    alert(`Invalid choice "${choice}". Please enter a number between 1 and ${EXAMPLE_GRAPHS.length}.`);
    return;
  }

  const selectedExample = EXAMPLE_GRAPHS[choiceNum - 1];
  // Add more examples here as needed
  
  if (!confirm(`Load "${selectedExample.name}"? Current work will be lost.`)) {
    return;
  }

  loadExampleAndApply(selectedExample.filename);
}

async function loadExampleAndApply(filename) {
  try {
    const data = await loadExampleGraph(filename);
    
    // Clear current graph
    const cy = window.cy;
    if (!cy) {
      alert('Graph not loaded.');
      return;
    }

    // Load the example data
    cy.elements().remove();
    
    if (data.graph) {
      // New format with graph + annotations
      cy.add(data.graph);
      if (data.textAnnotations && window.textAnnotations) {
        window.textAnnotations.importAnnotations(data.textAnnotations);
      }
    } else {
      // Legacy format - direct array
      cy.add(data);
    }

    // Initialize nodes and run convergence
    cy.nodes().forEach(n => {
      if (n.data('type') !== 'fact') {
        n.data('prob', n.data('initialProb'));
      }
    });

    if (window.convergeAll) {
      window.convergeAll({ cy });
    }
    if (window.computeVisuals) {
      window.computeVisuals(cy);
    }
    if (window.resetLayout) {
      window.resetLayout();
    }
    // Apply softened color palette if available
    if (window.refreshSoftColors) {
      window.refreshSoftColors();
    }

    console.log(`Example "${filename}" loaded successfully`);
    alert('Example graph loaded successfully!');
    
  } catch (error) {
    console.error('Failed to load example:', error);
    alert('Failed to load example graph. Check console for details.');
  }
}
