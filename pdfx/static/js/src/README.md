# PDF XBlock JavaScript Files

This directory contains the JavaScript files for the PDF XBlock plugin. These files provide functionality for viewing and interacting with PDF documents in Open edX.

## Recent Changes

The code has been refactored to eliminate workarounds and fix issues with the drawing functionality. Key changes include:

1. Renamed "marker" functionality to "scribble" throughout the codebase
2. Replaced workaround fixes with proper module-based solutions
3. Improved initialization and error handling
4. Added clean debug utilities for development
5. Removed old implementation files completely

## File Structure

- `pdfx.js` - Main entry point for the XBlock
- `pdfx_init.js` - PDF.js initialization and core functionality
- `pdfx_scribble.js` - Scribble tool for annotating PDFs
- `pdfx_scribble_init.js` - Clean initialization for the scribble tool
- `pdfx_highlight.js` - Highlighting functionality
- `pdfx_drawing.js` - General drawing capabilities
- `pdfx_navigation.js` - PDF navigation controls
- `pdfx_view.js` - View management (zooming, panning, etc.)
- `pdfx_edit.js` - Edit functionality
- `pdfx_debug_utils.js` - Debug utilities for development
- `pdfx_update.js` - Migration helper for updating from old to new code

## Usage

To properly initialize the scribble tool, use:

```javascript
// Initialize scribble tool for a specific block
window.initScribbleTool('blockId');

// Or let the automatic initialization handle it
// (happens on DOMContentLoaded)
```

## Debugging

Development debug utilities are available:

```javascript
// Check tools status
window.pdfxDebug.checkTools('blockId');

// Initialize scribble tool
window.pdfxDebug.initScribble('blockId');

// Fix canvas issues
window.pdfxDebug.fixCanvas('blockId');
```

## Migration

To help with migration from the old marker-based code to the new scribble-based code, use:

```javascript
// Update a specific block
window.updatePdfxBlock('blockId');

// Or let the automatic update handle all blocks
// (happens on DOMContentLoaded when pdfx_update.js is loaded)
```