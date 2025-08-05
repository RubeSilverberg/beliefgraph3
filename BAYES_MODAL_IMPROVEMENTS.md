# Bayes Modal UI Improvements

## Changes Made

### 1. Removed Redundant Numbering
- **Before**: "1. Baseline Probability", "2. If [Parent] is true", "3. If [Parent] is false", "4. Summary"
- **After**: "Baseline Probability", "When [Parent] is true", "When [Parent] is false", "Summary"

### 2. Improved Step 2 & 3 Clarity
- **Before**: "If [Parent] is true/false" (confusing conditional language)
- **After**: "When [Parent] is true/false" (clearer situational language)

### 3. Reduced Visual Prominence of Baseline
- **Before**: Baseline had special blue color (#2c5aa0), larger font (16px), and heavier weight (700)
- **After**: Baseline uses same styling as other steps (15px, weight 600, neutral #333 color)
- **Preserved**: Bottom border and draggable functionality

## Preserved Functionality
✅ **Dragging**: First step title remains draggable (cursor: move)  
✅ **Tooltip**: Baseline info icon and tooltip preserved  
✅ **Logic**: No changes to slider logic, event handlers, or validation  
✅ **Positioning**: Modal positioning and bounds checking intact  

## Technical Details
- Modified HTML structure in `index.html` (removed numbers, improved wording)
- Updated CSS in `style.css` (normalized baseline step styling)  
- No changes to JavaScript logic in `bayes-modal.js`
- Tooltip configuration in `config.js` remains unchanged

## Result
The modal now has:
- Cleaner, less hierarchical appearance
- More intuitive step labels
- Equal visual weight for all sections
- Maintained full functionality and user interaction
