// format.js - Friendly re-export wrapper for minimal format core utilities
// Public API (module-style):
//   import { exportMinimalGraph, importAnyGraph, detectFormat, normalizeAny, expandToElements } from './format.js'
// Internally depends on format-core.js which attaches BeliefGraphFormatCore to window.
// This wrapper provides a stable module interface for code using ES module imports.

function getCore() {
	if (typeof window !== 'undefined' && window.BeliefGraphFormatCore) return window.BeliefGraphFormatCore;
	throw new Error('BeliefGraphFormatCore not loaded. Ensure format-core.js is included before format.js.');
}

export function exportMinimalGraph(cy, opts) {
	return getCore().exportMinimalGraph(cy, opts);
}

export function detectFormat(json) { return getCore().detectFormat(json); }
export function normalizeAny(json) { return getCore().normalizeAny(json); }
export function expandToElements(minimal) { return getCore().expandToElements(minimal); }

export function importAnyGraph(cy, json, { fit = true, validate = false, validationOptions } = {}) {
	const core = getCore();
	const minimal = core.normalizeAny(json);
	if (validate && typeof window !== 'undefined' && window.BeliefGraphFormatValidate) {
		const result = window.BeliefGraphFormatValidate.validateMinimal(minimal, validationOptions || {});
		if (!result.valid) {
			console.error('[BeliefGraphFormat] Validation errors:', result.errors);
			throw new Error('Minimal graph validation failed');
		}
		if (result.warnings.length) console.warn('[BeliefGraphFormat] Validation warnings:', result.warnings);
	}
	const elements = core.expandToElements(minimal);
	cy.elements().remove();
	cy.add(elements);
	window.convergeAll?.({ cy });
	window.computeVisuals?.(cy);
	if (fit) {
		cy.layout({ name: 'preset' }).run();
		cy.fit();
		cy.resize();
		// Align with app behavior: run reset layout after imports
		window.resetLayout?.();
	}
	if (minimal.annotations && window.textAnnotations) {
		window.textAnnotations.importAnnotations(minimal.annotations);
	}
	return { minimal, elements };
}

// Optional global convenience (non-invasive): attach only if not present
if (typeof window !== 'undefined') {
	window.BeliefGraphFormat = window.BeliefGraphFormat || {
		exportMinimalGraph,
		importAnyGraph,
		detectFormat,
		normalizeAny,
		expandToElements
	};
}

// End format.js
