# Custom Edge Handles Implementation

## Overview

This document describes the implementation of custom edge handles for manual edge creation in the belief graph visualization, replacing the problematic cytoscape-edgehandles extension.

## Problem Solved

The user requested the ability to manually create edges by clicking and dragging from nodes, similar to many graph editing tools. The official cytoscape-edgehandles extension failed to load due to module dependency conflicts.

## Solution

Created a custom edge handles implementation (`custom-edge-handles.js`) that provides:

### Core Features
- **Visual edge handles**: Blue circular buttons with ⊕ symbol that appear on node hover
- **Drag-to-connect**: Click and drag from handle to create edges between nodes
- **Real-time feedback**: Visual drag line shows connection path during drag operation
- **Validation**: Prevents cycles, self-connections, and connections to/from note nodes
- **Mode awareness**: Automatically disabled in heavy mode, enabled in lite mode

### Technical Implementation

#### Event Handling Strategy
- **Challenge**: Cytoscape.js event namespacing doesn't work reliably
- **Solution**: Used non-namespaced `mouseover`/`mouseout` events that coexist with existing hover system
- **Discovery**: `mouseenter`/`mouseleave` events are not supported by Cytoscape.js

#### DOM Manipulation
- **Handle positioning**: Calculates absolute position based on node's rendered position
- **Z-index management**: Handles appear above graph (z-index: 1000), drag line below handles (z-index: 999)
- **CSS styling**: Styled handles with hover effects and smooth transitions

#### Integration Points
- **Node creation**: Fixed auto-typing system - new nodes properly convert from assertion→fact
- **Convergence**: Edge creation triggers existing convergence and visual update systems
- **Validation**: Uses existing cycle detection and type checking logic

## Files Modified

### New Files
- `custom-edge-handles.js` - Complete edge handles implementation

### Modified Files
- `script_current.js` - Updated imports to use custom edge handles
- `logic.js` - Fixed `addStatement()` to call `convergeAll()` for proper auto-typing
- `index.html` - Removed problematic edgehandles extension script tags  
- `modals.js` - Improved spacing in multi-node visual signals modal

### Removed Files
- `edgehandles-integration.js` - Abandoned due to extension loading failures

## Key Technical Decisions

1. **Custom DOM Implementation**: Instead of fighting with extension loading, created pure JavaScript solution
2. **Event Coexistence**: Multiple `mouseover` handlers work together rather than competing
3. **Positioning Strategy**: Direct calculation from Cytoscape rendered positions to DOM coordinates
4. **Validation Integration**: Reused existing graph logic rather than reimplementing

## User Experience Improvements

- **Intuitive interaction**: Hover over any node to see edge handle, click and drag to connect
- **Visual feedback**: Animated handles, drag lines, and hover effects
- **Seamless integration**: Works with existing selection, hover, and modal systems
- **Improved modal spacing**: Fixed cramped appearance in multi-node visual signals modal

## Validation Rules

The edge creation respects all existing graph constraints:
- No self-connections
- No cycles (uses existing `wouldCreateCycle()` function)
- No connections to/from note nodes
- Proper edge types based on target node type
- Weight initialization for assertion targets

## Mode Integration

- **Lite mode**: Edge handles enabled, full manual edge creation
- **Heavy mode**: Edge handles disabled automatically
- **Real-time switching**: Monitors mode changes and updates handle availability

This implementation provides the manual edge creation capability the user requested while maintaining all existing graph logic and visual systems.
