# Belief Graph Tests

This folder contains all test files and development utilities for the Belief Graph tool.

## Folder Structure

### `/tests/minimal-json/`
Tests for the minimal JSON format converter:
- `test-minimal.json` - Complex test case with styling, logic nodes, notes, and custom positioning
- `test-ultra-minimal.json` - Ultra-simple test case with just IDs and connections
- `test-minimal-converter.html` - Interactive test page for format conversion
- `test-console.js` - Console test script

### `/tests/annotations/`
Tests for the text annotations system:
- `test-annotations.html` - Interactive test page for text annotations

### `/tests/` (root)
General test files:
- `quick_test.html` - Quick functionality tests
- `test_restore.html` - Autosave/restore testing
- `test_validation.py` - Python validation scripts

## How to Run Tests

### Minimal JSON Format Tests
1. **Interactive Testing**: Open `tests/minimal-json/test-minimal-converter.html` in browser
2. **Console Testing**: In main app, run `window.testMinimalJson()` or `window.testUltraMinimalJson()`
3. **All Examples**: Run `window.testMinimalInputConverter()` in browser console

### Text Annotations Tests
1. Open `tests/annotations/test-annotations.html` in browser
2. Test annotation creation, editing, and menu interactions

### Main App Testing
The main application includes test functions:
- `window.testMinimalJson()` - Tests complex minimal format
- `window.testUltraMinimalJson()` - Tests simple minimal format
- `window.testMinimalInputConverter()` - Tests all built-in examples

## Test Data Examples

### Ultra-Minimal Format
```json
{
  "nodes": [{ "id": "evidence" }, { "id": "conclusion" }],
  "edges": [{ "source": "evidence", "target": "conclusion" }]
}
```

### Complex Format
```json
{
  "nodes": [
    {
      "id": "witness_testimony",
      "label": "Witness saw suspect at scene",
      "description": "Multiple witnesses independently identified the suspect",
      "textColor": "#ffffff",
      "sizeIndex": 4,
      "position": { "x": 100, "y": 100 }
    }
  ],
  "edges": [
    {
      "source": "witness_testimony",
      "target": "guilty_verdict",
      "weight": 0.6,
      "rationale": "Witness testimony provides support"
    }
  ],
  "layoutType": "custom"
}
```

## Features Tested

✅ Minimal format conversion to full Cytoscape format  
✅ Smart defaults for missing information  
✅ Node type auto-detection (fact vs assertion)  
✅ Layout generation (grid, circle, tree, force, custom)  
✅ Color styling and visual customization  
✅ Logic nodes (AND/OR) and note nodes  
✅ Edge weights and rationales  
✅ Position handling and layout systems  
✅ Text annotations system  
✅ Autosave and restore functionality  
