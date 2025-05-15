/**
 * PDF XBlock - Debug Utilities Module
 *
 * This module provides clean, structured debugging tools for the PDF XBlock.
 * It's designed for development use and can be excluded from production builds.
 */
(function() {
    'use strict';

    // Debug namespace to avoid polluting global scope
    window.pdfxDebug = window.pdfxDebug || {};

    /**
     * Find a PDF XBlock ID if none is provided
     * @returns {string|null} Block ID or null if not found
     */
    function findBlockId() {
        var pdfxBlocks = document.querySelectorAll('.pdfx_block');
        if (pdfxBlocks.length > 0) {
            return pdfxBlocks[0].id.replace('pdfx-block-', '');
        }
        return null;
    }

    /**
     * Check the status of PDF XBlock tools for a specific block
     * @param {string} [blockId] - The block ID to check (optional)
     * @returns {string} Status message
     */
    window.pdfxDebug.checkTools = function(blockId) {
        blockId = blockId || findBlockId();

        if (!blockId) {
            console.error('No PDF XBlock found on the page');
            return 'No PDF XBlock found';
        }

        console.log('%c[PDF DEBUG] Checking tools for block: ' + blockId,
                   'background:#3498db;color:white;padding:3px;border-radius:3px;');

        // Check dependencies
        var checks = {
            fabric: typeof fabric !== 'undefined',
            pdfjs: typeof pdfjsLib !== 'undefined'
        };

        console.log('Dependencies:', checks);

        // Check DOM elements
        var elements = {
            drawContainer: document.getElementById('draw-container-' + blockId),
            pdfContainer: document.getElementById('pdf-container-' + blockId),
            canvas: document.getElementById('drawing-canvas-' + blockId),
            scribbleButton: document.getElementById('scribble-tool-' + blockId) ||
                           document.getElementById('marker-tool-' + blockId),
            textLayer: document.getElementById('text-layer-' + blockId),
            highlightLayer: document.getElementById('highlight-layer-' + blockId)
        };

        console.log('Elements found:', {
            drawContainer: !!elements.drawContainer,
            pdfContainer: !!elements.pdfContainer,
            canvas: !!elements.canvas,
            scribbleButton: !!elements.scribbleButton,
            textLayer: !!elements.textLayer,
            highlightLayer: !!elements.highlightLayer
        });

        // Check element configurations
        if (elements.drawContainer) {
            console.log('Draw container styles:', {
                position: window.getComputedStyle(elements.drawContainer).position,
                zIndex: window.getComputedStyle(elements.drawContainer).zIndex,
                pointerEvents: window.getComputedStyle(elements.drawContainer).pointerEvents,
                className: elements.drawContainer.className
            });
        }

        if (elements.scribbleButton) {
            console.log('Scribble button active:', elements.scribbleButton.classList.contains('active'));
        }

        // Check fabric canvas
        var fabricCanvas = window[`fabricCanvas_${blockId}`];

        if (fabricCanvas) {
            console.log('Fabric canvas configuration:', {
                isDrawingMode: fabricCanvas.isDrawingMode,
                width: fabricCanvas.width,
                height: fabricCanvas.height,
                objectCount: fabricCanvas.getObjects().length
            });

            if (fabricCanvas.freeDrawingBrush) {
                console.log('Drawing brush:', {
                    color: fabricCanvas.freeDrawingBrush.color,
                    width: fabricCanvas.freeDrawingBrush.width,
                    scribbleMode: fabricCanvas.freeDrawingBrush.scribbleMode
                });
            }
        } else {
            console.log('Fabric canvas not initialized for this block');
        }

        return 'Check complete - see console for details';
    };

    /**
     * Initialize the scribble tool for a specific block
     * @param {string} [blockId] - The block ID to initialize (optional)
     * @returns {string} Status message
     */
    window.pdfxDebug.initScribble = function(blockId) {
        blockId = blockId || findBlockId();

        if (!blockId) {
            console.error('No PDF XBlock found on the page');
            return 'No PDF XBlock found';
        }

        console.log('%c[PDF DEBUG] Initializing scribble for block: ' + blockId,
                   'background:#9b59b6;color:white;padding:3px;border-radius:3px;');

        // Use the main initialization function if available
        if (typeof window.initScribbleTool === 'function') {
            var result = window.initScribbleTool(blockId);
            return result ? 'Scribble tool initialized' : 'Initialization failed';
        }

        // Manual initialization if the main function isn't available
        var scribbleBtn = document.getElementById('scribble-tool-' + blockId) ||
                         document.getElementById('marker-tool-' + blockId);

        if (scribbleBtn) {
            console.log('Clicking scribble button...');
            scribbleBtn.click();
            return 'Initialization attempted via button click';
        }

        return 'Scribble button not found - initialization failed';
    };

    /**
     * Fix common issues with the fabric canvas for a block
     * @param {string} [blockId] - The block ID to fix (optional)
     * @returns {string} Status message
     */
    window.pdfxDebug.fixCanvas = function(blockId) {
        blockId = blockId || findBlockId();

        if (!blockId) {
            console.error('No PDF XBlock found on the page');
            return 'No PDF XBlock found';
        }

        console.log('%c[PDF DEBUG] Fixing canvas for block: ' + blockId,
                   'background:#e74c3c;color:white;padding:3px;border-radius:3px;');

        // Check if fabric is loaded
        if (typeof fabric === 'undefined') {
            console.error('fabric.js not loaded!');

            // Try loading fabric.js
            var script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js';
            script.onload = function() {
                console.log('fabric.js loaded, try running fixCanvas again');
            };
            document.head.appendChild(script);

            return 'fabric.js not loaded, attempting to load it';
        }

        // Get necessary elements
        var drawContainer = document.getElementById('draw-container-' + blockId);
        var pdfContainer = document.getElementById('pdf-container-' + blockId);

        if (!drawContainer) {
            console.error('Draw container not found');
            return 'Draw container not found';
        }

        if (!pdfContainer) {
            console.error('PDF container not found');
            return 'PDF container not found';
        }

        // Set up the canvas
        var canvas = document.getElementById('drawing-canvas-' + blockId);

        if (!canvas) {
            console.log('Creating new canvas element');
            canvas = document.createElement('canvas');
            canvas.id = 'drawing-canvas-' + blockId;
            canvas.width = pdfContainer.offsetWidth;
            canvas.height = pdfContainer.offsetHeight;
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';

            drawContainer.innerHTML = '';
            drawContainer.appendChild(canvas);
        }

        // Initialize or reconfigure fabric canvas
        var fabricCanvas;

        try {
            console.log('Setting up fabric canvas');

            // Remove any existing fabric canvases on this element
            if (window[`fabricCanvas_${blockId}`]) {
                console.log('Disposing existing canvas');
                window[`fabricCanvas_${blockId}`].dispose();
            }

            // Create new canvas
            fabricCanvas = new fabric.Canvas(canvas, {
                isDrawingMode: true,
                selection: false,
                renderOnAddRemove: true,
                backgroundColor: null
            });

            // Configure brush
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
            fabricCanvas.freeDrawingBrush.color = '#FF0000';
            fabricCanvas.freeDrawingBrush.width = 5;
            fabricCanvas.freeDrawingBrush.scribbleMode = true;

            // Set pointer events
            fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

            // Set draw container properties
            drawContainer.style.position = 'absolute';
            drawContainer.style.top = '0';
            drawContainer.style.left = '0';
            drawContainer.style.width = '100%';
            drawContainer.style.height = '100%';
            drawContainer.style.zIndex = '30';
            drawContainer.style.pointerEvents = 'auto';
            drawContainer.classList.add('draw-mode');
            drawContainer.dataset.currentTool = 'scribble';

            // Store canvas reference
            window[`fabricCanvas_${blockId}`] = fabricCanvas;

            console.log('Fabric canvas initialized successfully');
            return 'Canvas fixed successfully';
        } catch (err) {
            console.error('Error initializing fabric canvas:', err);
            return 'Error fixing canvas: ' + err.message;
        }
    };

    // Export functions to the global debug namespace
    console.log('PDF XBlock debug utilities registered');
})();