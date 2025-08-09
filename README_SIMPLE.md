# Belief Graph: Super Simple Guide (Plain Language)

This guide explains ONLY the new/changed files that were recently added or cleaned up. It uses very plain language. No fancy terms.

---
## 1. Why These New Files Exist
You used to have scattered code for saving/loading graphs. Now there is a **small set of focused files** that:
- Turn the live graph in the app into a clean JSON ("minimal format").
- Take that minimal JSON (or older styles) and rebuild the graph in the app.
- Optionally check ("validate") that the JSON is OK before loading.

Think of it like a funnel:
```
Existing graph (in the browser)
        ↓ exportMinimalGraph
Clean minimal JSON
        ↓ importAnyGraph (with optional validation)
Graph appears in the app again
```
Older/legacy formats are still recognized so nothing breaks.

---
## 2. The Important New/Changed Files
| File | What It Does | Use It When |
|------|--------------|-------------|
| `format-core.js` | The heart. Knows how to detect JSON style, export minimal JSON, and expand minimal JSON back into full graph elements. | You rarely call this directly. Loaded before others. |
| `format.js` | Friendly wrapper. Gives you easy functions: `exportMinimalGraph`, `importAnyGraph`, etc. Adds optional validation step. | Use these functions in the browser console or future UI buttons. |
| `validation.js` | Checks a minimal JSON file for common mistakes (bad IDs, cycles, missing nodes, etc.). Returns errors + warnings. | Use if you want to be sure the JSON is safe before loading. |
| `minimal-format.schema.json` | A formal machine-readable schema version of the minimal JSON structure. | Useful for external tools or AI prompt examples. Not required to run. |
| `minimal-format-analysis.js` | Old prototype kept only for examples + test harness. Now very quiet. | Ignore unless exploring example inputs. |
| `tests/minimal-json/test-minimal-converter.html` | A manual playground: load a minimal JSON, convert it, validate it, inspect results. | Open this page to experiment. |
| `tests/minimal-json/test-validation.html` | Quick visual check of validator on sample cases (good, bad, cycles, etc.). | Open to see how validation reacts. |
| `README.md` | Existing detailed AI-facing format doc (kept). | For deeper explanation. |
| `README_SIMPLE.md` (this file) | Plain-language cheat sheet. | When you just need the gist. |

---
## 3. The Main Functions (Plain English)
### exportMinimalGraph(cy)
Takes the current graph shown in the app (the Cytoscape instance `cy`) and gives you a **clean, small JSON** with only the essential stuff.

### importAnyGraph(cy, json, options?)
Takes ANY of these shapes:
- Minimal format (the small one)
- Old `{ graph: [...] }` format
- Raw Cytoscape elements array
...and loads it into the app. Optional: `validate: true` to check first.

### validateMinimal(minimal, options?)
Looks at a minimal JSON object and tells you:
- `valid` (true/false)
- `errors` (must fix)
- `warnings` (nice to fix)
It **does NOT** change your JSON.

---
## 4. Minimal JSON: What You Usually Need
Bare minimum example:
```json
{
  "nodes": [ { "id": "a" }, { "id": "b" } ],
  "edges": [ { "source": "a", "target": "b" } ]
}
```
Add labels and weights for influence:
```json
{
  "nodes": [
    { "id": "evidence", "label": "Eyewitness" },
    { "id": "claim", "label": "Suspect was present" }
  ],
  "edges": [
    { "source": "evidence", "target": "claim", "weight": 0.85 }
  ]
}
```
Optional things you *can* add (leave out if not needed):
- `type` (fact, assertion, and, or, note)
- `description` (hover text)
- `prob` (0–1)
- `style` (textColor, sizeIndex, floretColor)
- `rationale` (edge explanation)
- `weight` (-1 to 1)
- `layout.positions` (if you want fixed positions)

---
## 5. How To Try This (Step by Step)
### A. From the main app (index.html)
Open browser console after the graph loads:
```js
const minimal = BeliefGraphFormat.exportMinimalGraph(window.cy);
console.log(minimal);
```
To load one back (with validation):
```js
BeliefGraphFormat.importAnyGraph(window.cy, minimal, { validate: true });
```

### B. Using the test page
1. Open: `tests/minimal-json/test-minimal-converter.html`
2. Click a load button.
3. Click "Validate Minimal JSON" if you want to see issues.
4. Click "Convert to Full JSON" to see expanded version.
5. (Optional) Use the full JSON in the main app.

### C. Just Validation
Open console (any page where `validation.js` is loaded):
```js
const result = BeliefGraphFormatValidate.validateMinimal(minimal, { checkCycles: true });
console.log(result.valid, result.errors, result.warnings);
```

---
## 6. Common Errors (What They Mean)
| Message | Meaning | Fix |
|---------|---------|-----|
| `nodes must be array` | You passed something else. | Make sure `nodes` is `[ ... ]`. |
| `Duplicate node id` | Two nodes share the same id. | Make IDs unique. |
| `edges[x] source/target not in nodes` | Edge points to missing node. | Add the node or fix the id. |
| `Cycle detected` | Graph loops back on itself (not allowed). | Remove or redirect one edge. |
| `edges[x] connects to note node` | A note was linked; notes must stand alone. | Remove that edge or change node type. |

Warnings (you *can* still load):
- Missing description on a note.
- Duplicate edge pair (same source→target again).
- Missing type (will be inferred).

---
## 7. When To Use Validation
| Situation | Use Validation? | Reason |
|-----------|-----------------|--------|
| Hand-written JSON | Yes | Catch typos early. |
| Generated by trusted export | Optional | Probably already clean. |
| AI-generated JSON | Yes | Prevent broken imports. |
| Bulk import pipeline | Yes (batch) | Fail fast & summarize. |

---
## 8. What NOT To Worry About
You do NOT need to:
- Manually assign positions (layout happens automatically if you skip them).
- Provide edge IDs (they’re auto-generated if missing).
- Include visual styling (defaults applied later).
- Use the schema file unless you want external tooling.

---
## 9. Future-Friendly Hooks (Optional Ideas)
You *could* later add:
- Round-trip checker: export → import → export and diff.
- Auto-fix helper: propose fixes for some warnings.
- Batch validation CLI script.

---
## 10. Quick Reference (TL;DR)
- Use `exportMinimalGraph` to get clean JSON of current graph.
- Use `importAnyGraph` to load any supported JSON (add `{ validate: true }` for safety).
- Use `validateMinimal` to check JSON before loading.
- Edit/play with JSON using the test pages in `tests/minimal-json/`.

That’s it. This file is the “explain it like I’m tired” version. For deeper details, go back to the main `README.md`.
