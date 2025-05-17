/**
 * PDF.js Initialization
 *
 * This module initializes the PDF.js library with proper configuration.
 * It must be loaded before any other PDF.js-dependent modules.
 */

// Global tool activation/deactivation functions
window.activateToolByName = function(toolName, blockId) {
    console.log(`[TOOL] Activating tool: ${toolName} for block ${blockId}`);

    // Handle specific tools first
    if (toolName === 'marker') {
        var scribbleInstance = window[`scribbleInstance_${blockId}`];
        if (scribbleInstance && typeof scribbleInstance.enable === 'function') {
            scribbleInstance.enable();
            return;
        } else {
            console.log(`[TOOL] Scribble instance not found for ${blockId}, attempting to initialize`);
            // Try to re-initialize the scribble instance
            if (typeof window.initScribbleInstance === 'function') {
                window.initScribbleInstance(blockId, {});
                // Try again with the newly created instance
                scribbleInstance = window[`scribbleInstance_${blockId}`];
                if (scribbleInstance && typeof scribbleInstance.enable === 'function') {
                    scribbleInstance.enable();
                    return;
                }
            } else {
                // Manual fallback if initScribbleInstance is not available
                var block = document.getElementById(`pdfx-block-${blockId}`);
                var fabricCanvas = window[`fabricCanvas_${blockId}`];

                if (fabricCanvas) {
                    // Configure canvas for marker mode
                    fabricCanvas.isDrawingMode = true;

                    if (fabricCanvas.freeDrawingBrush) {
                        var colorInput = document.getElementById(`color-input-${blockId}`);
                        fabricCanvas.freeDrawingBrush.color = colorInput ? colorInput.value : '#FF0000';
                        fabricCanvas.freeDrawingBrush.width = 5;
                        fabricCanvas.freeDrawingBrush.scribbleMode = true;
                        fabricCanvas.freeDrawingBrush.markerMode = true;
                    }

                    if (fabricCanvas.upperCanvasEl) {
                        fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                        fabricCanvas.upperCanvasEl.style.cursor = 'crosshair';
                    }

                    // Enable draw container
                    var drawContainer = document.getElementById(`draw-container-${blockId}`);
                    if (drawContainer) {
                        drawContainer.style.pointerEvents = 'auto';
                        drawContainer.classList.add('draw-mode');
                        drawContainer.style.cursor = 'crosshair';
                        drawContainer.setAttribute('data-current-tool', 'marker');
                    }

                    console.log(`[TOOL] Manual marker activation for ${blockId} complete`);
                    return;
                }
            }
        }
    } else if (toolName === 'highlight') {
        var highlightInstance = window[`highlightInstance_${blockId}`];

        // Better handling for highlight tool initialization
        try {
            // Check if the highlight instance exists
            if (!highlightInstance) {
                console.error(`[TOOL] Highlight instance not found for ${blockId}`);
                console.log(`[TOOL] Available global variables:`, Object.keys(window).filter(k => k.includes(blockId)));
                return;
            }

            if (typeof highlightInstance.enableTextHighlighting !== 'function') {
                console.error(`[TOOL] Highlight instance exists but is missing enableTextHighlighting method for ${blockId}`);
                console.log(`[TOOL] Highlight instance methods:`, Object.keys(highlightInstance).filter(k => typeof highlightInstance[k] === 'function'));
                return;
            }

            console.log(`[TOOL] Found highlight instance for ${blockId}, enabling text highlighting`);

            // Make sure text layer is visible and prepared
            var textLayer = document.getElementById(`text-layer-${blockId}`);
            if (textLayer) {
                // Ensure text layer is interactive
                textLayer.style.pointerEvents = 'auto';
                textLayer.style.cursor = 'text';

                console.log(`[TOOL] Prepared text layer for highlighting`);
            }

            // Now enable highlighting
            var result = highlightInstance.enableTextHighlighting();

            if (result === false) {
                console.error(`[TOOL] Failed to enable text highlighting for ${blockId}`);
                // Try to repair text layer if highlighting fails
                if (textLayer) {
                    console.log(`[TOOL] Attempting to repair text layer`);
                    textLayer.style.pointerEvents = 'auto';
                    textLayer.style.userSelect = 'text';
                    textLayer.style.webkitUserSelect = 'text';
                    textLayer.style.MozUserSelect = 'text';
                    textLayer.style.msUserSelect = 'text';
                }
            }

            return;
        } catch (highlightError) {
            console.error(`[TOOL] Error activating highlight tool: ${highlightError.message}`);
        }
    } else if (toolName === 'text') {
        var textInstance = window[`textInstance_${blockId}`];
        if (textInstance && typeof textInstance.enable === 'function') {
            textInstance.enable();
            return;
        }
    } else if (toolName === 'shape') {
        var shapeInstance = window[`shapeInstance_${blockId}`];
        if (shapeInstance && typeof shapeInstance.enable === 'function') {
            shapeInstance.enable();
            return;
        }
    } else if (toolName === 'note') {
        var noteInstance = window[`noteInstance_${blockId}`];
        if (noteInstance && typeof noteInstance.enable === 'function') {
            noteInstance.enable();
            return;
        }
    }

    // For other tools, try to find a generic tool instance
    var toolInstance = window[`${toolName}Instance_${blockId}`];
    if (toolInstance) {
        // Try to call enable or activate method if available
        if (typeof toolInstance.enable === 'function') {
            toolInstance.enable();
        } else if (typeof toolInstance.activate === 'function') {
            toolInstance.activate();
        } else {
            console.log(`[TOOL] No activation method found for ${toolName}`);
        }
    } else {
        console.log(`[TOOL] Tool instance not found for ${toolName}`);

        // Set appropriate cursor based on tool type
        var drawContainer = document.querySelector(`#draw-container-${blockId}`);
        if (drawContainer) {
            // Set tool-specific cursor styles
            switch(toolName) {
                case 'text':
                    drawContainer.style.cursor = 'text';
                    break;
                case 'shape':
                    drawContainer.style.cursor = 'crosshair';
                    break;
                case 'note':
                    drawContainer.style.cursor = 'cell';
                    break;
                case 'select':
                    drawContainer.style.cursor = 'pointer';
                    break;
                case 'eraser':
                    // Special cursor for eraser (uses SVG in CSS)
                    drawContainer.style.cursor = 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 0 1-5.66 0L2.81 17a2.998 2.998 0 0 1 0-4.24l9.24-9.21c1.21-1.21 3.17-1.21 4.19.01z"/></svg>\') 12 12, auto';
                    break;
                default:
                    drawContainer.style.cursor = 'default';
            }

            // Enable pointer events on container for any interactive tool
            drawContainer.style.pointerEvents = 'auto';
            drawContainer.classList.add('draw-mode');
        }
    }
};

// Generic function to deactivate a tool by name
window.deactivateToolByName = function(toolName, blockId) {
    console.log(`[TOOL] Deactivating tool: ${toolName} for block ${blockId}`);

    // Handle specific tools first
    if (toolName === 'marker' || toolName === 'scribble') {
        var scribbleInstance = window[`scribbleInstance_${blockId}`];
        if (scribbleInstance && typeof scribbleInstance.disable === 'function') {
            scribbleInstance.disable();

            // Extra cleanup to ensure everything is reset
            var drawContainer = document.querySelector(`#draw-container-${blockId}`);
            var fabricCanvas = window[`fabricCanvas_${blockId}`];

            if (drawContainer) {
                // Ensure the draw container's pointer events are disabled
                drawContainer.style.pointerEvents = 'none';
                drawContainer.classList.remove('draw-mode');
                drawContainer.removeAttribute('data-current-tool');
                console.log(`[TOOL] Reset draw container for marker tool`);
            }

            if (fabricCanvas) {
                // Disable drawing mode
                fabricCanvas.isDrawingMode = false;

                // Reset the drawing brush
                if (fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush.markerMode = false;
                    fabricCanvas.freeDrawingBrush.scribbleMode = false;
                }

                // Ensure all canvas elements are disabled
                if (fabricCanvas.upperCanvasEl) {
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                }

                if (fabricCanvas.lowerCanvasEl) {
                    fabricCanvas.lowerCanvasEl.style.pointerEvents = 'none';
                }

                // Ensure canvas container is also disabled
                var canvasContainer = document.querySelector(`#draw-container-${blockId} .canvas-container`);
                if (canvasContainer) {
                    canvasContainer.style.pointerEvents = 'none';
                }

                console.log(`[TOOL] Reset fabric canvas for marker tool`);
            }

            // Ensure tool buttons are still clickable
            var toolButtons = document.querySelectorAll(`[id$="-tool-${blockId}"]`);
            toolButtons.forEach(function(button) {
                button.style.pointerEvents = 'auto';
            });

            // Force a small delay to ensure UI responsiveness
            setTimeout(function() {
                console.log(`[TOOL] Performing final cleanup for marker tool`);
                // Double-check that the tool is fully deactivated
                if (drawContainer) {
                    drawContainer.style.pointerEvents = 'none';
                }

                // Ensure drawing mode is off
                if (fabricCanvas) {
                    fabricCanvas.isDrawingMode = false;
                }

                // Re-enable tool button interactivity
                resetPointerEvents(blockId);
            }, 100);

            return;
        }
    } else if (toolName === 'highlight' || toolName === 'highlighter') {
        var highlightInstance = window[`highlightInstance_${blockId}`];
        try {
            if (!highlightInstance) {
                console.error(`[TOOL] Highlight instance not found for ${blockId} when trying to deactivate`);
                console.log(`[TOOL] Available global variables:`, Object.keys(window).filter(k => k.includes(blockId)));

                // Fallback: try to manually disable text highlighting
                var textLayer = document.getElementById(`text-layer-${blockId}`);
                if (textLayer) {
                    textLayer.style.pointerEvents = 'none';
                    $(textLayer).removeClass('active highlight-tool-active');
                    console.log(`[TOOL] Used fallback to disable text layer`);
                }
                return;
            }

            if (typeof highlightInstance.disableTextHighlighting !== 'function') {
                console.error(`[TOOL] Highlight instance exists but is missing disableTextHighlighting method for ${blockId}`);
                console.log(`[TOOL] Highlight instance methods:`, Object.keys(highlightInstance).filter(k => typeof highlightInstance[k] === 'function'));

                // Fallback: try to manually disable text highlighting
                var textLayer = document.getElementById(`text-layer-${blockId}`);
                if (textLayer) {
                    textLayer.style.pointerEvents = 'none';
                    $(textLayer).removeClass('active highlight-tool-active');
                    console.log(`[TOOL] Used fallback to disable text layer`);
                }
                return;
            }

            console.log(`[TOOL] Found highlight instance for ${blockId}, disabling text highlighting`);

            // Call disableTextHighlighting
            var result = highlightInstance.disableTextHighlighting();

            // Reset text layer properties even if the method fails
            var textLayer = document.getElementById(`text-layer-${blockId}`);
            if (textLayer) {
                textLayer.style.pointerEvents = 'none';
                console.log(`[TOOL] Reset text layer pointer events`);
                $(textLayer).removeClass('highlight-tool-active');
            }

            return;
        } catch (error) {
            console.error(`[TOOL] Error deactivating highlight tool: ${error.message}`);

            // Emergency fallback
            try {
                var textLayer = document.getElementById(`text-layer-${blockId}`);
                if (textLayer) {
                    textLayer.style.pointerEvents = 'none';
                    textLayer.style.cursor = 'default';
                    $(textLayer).removeClass('active highlight-tool-active');
                }
            } catch (e) {
                console.error(`[TOOL] Emergency fallback also failed: ${e.message}`);
            }
        }
    } else if (toolName === 'text') {
        var textInstance = window[`textInstance_${blockId}`];
        if (textInstance && typeof textInstance.disable === 'function') {
            textInstance.disable();
            return;
        }
    } else if (toolName === 'shape') {
        var shapeInstance = window[`shapeInstance_${blockId}`];
        if (shapeInstance && typeof shapeInstance.disable === 'function') {
            shapeInstance.disable();
            return;
        }
    } else if (toolName === 'note') {
        var noteInstance = window[`noteInstance_${blockId}`];
        if (noteInstance && typeof noteInstance.disable === 'function') {
            noteInstance.disable();
            return;
        }
    }

    // For other tools, try to find a generic tool instance
    var toolInstance = window[`${toolName}Instance_${blockId}`];
    if (toolInstance) {
        // Try to call disable or deactivate method if available
        if (typeof toolInstance.disable === 'function') {
            toolInstance.disable();
        } else if (typeof toolInstance.deactivate === 'function') {
            toolInstance.deactivate();
        } else {
            console.log(`[TOOL] No deactivation method found for ${toolName}`);
        }
    } else {
        console.log(`[TOOL] Tool instance not found for ${toolName}`);

        // Reset cursor and pointer events
        var drawContainer = document.querySelector(`#draw-container-${blockId}`);
        if (drawContainer) {
            drawContainer.style.cursor = 'default';
            drawContainer.style.pointerEvents = 'none';
            drawContainer.classList.remove('draw-mode');
        }
    }
};

// Expose the initScribbleInstance function globally for easier access
window.initScribbleInstance = function(blockId, serverData) {
    // If the function exists in the scribble_init.js script, use that
    if (typeof initScribbleInstance === 'function') {
        return initScribbleInstance(blockId, serverData || {});
    }

    // Fallback implementation if the function from scribble_init.js is not available
    console.log(`[TOOL] Using fallback initScribbleInstance for ${blockId}`);

    var block = document.getElementById(`pdfx-block-${blockId}`);
    var drawContainer = document.getElementById(`draw-container-${blockId}`);
    var pdfContainer = document.getElementById(`pdf-container-${blockId}`);
    var dataElement = document.getElementById(`pdfx-data-${blockId}`);

    if (!block || !drawContainer || !pdfContainer) {
        console.error(`[TOOL] Required elements missing for block ${blockId}`);
        return null;
    }

    // Create a canvas if it doesn't exist
    var canvas = document.getElementById(`drawing-canvas-${blockId}`);
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = `drawing-canvas-${blockId}`;
        canvas.width = pdfContainer.offsetWidth || 800;
        canvas.height = pdfContainer.offsetHeight || 600;
        drawContainer.innerHTML = '';
        drawContainer.appendChild(canvas);
    }

    // Create fabric canvas
    var fabricCanvas = null;
    try {
        fabricCanvas = new fabric.Canvas(canvas, {
            isDrawingMode: false,
            selection: false
        });

        fabricCanvas.setWidth(pdfContainer.offsetWidth);
        fabricCanvas.setHeight(pdfContainer.offsetHeight);

        // Store reference globally
        window[`fabricCanvas_${blockId}`] = fabricCanvas;

        // Initialize brush
        if (!fabricCanvas.freeDrawingBrush) {
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        }
        fabricCanvas.freeDrawingBrush.width = 5;
        fabricCanvas.freeDrawingBrush.color = '#FF0000';
        fabricCanvas.freeDrawingBrush.scribbleMode = false;
        fabricCanvas.freeDrawingBrush.markerMode = false;
    } catch (error) {
        console.error(`[TOOL] Error creating fabric canvas: ${error.message}`);
        return null;
    }

    // Create scribble options
    var scribbleOptions = {
        blockId: blockId,
        userId: block.getAttribute('data-user-id') || 'anonymous',
        courseId: block.getAttribute('data-course-id') || '',
        color: '#FF0000',
        width: 5,
        saveIntervalTime: 10000
    };

    // Try to create scribble instance
    try {
        if (typeof PdfxScribble === 'function') {
            var scribbleInstance = new PdfxScribble(block, scribbleOptions);
            scribbleInstance.init(fabricCanvas);

            // Store globally
            window[`scribbleInstance_${blockId}`] = scribbleInstance;
            console.log(`[TOOL] Successfully created scribble instance for ${blockId}`);

            return scribbleInstance;
        } else {
            console.error(`[TOOL] PdfxScribble constructor not found`);
        }
    } catch (error) {
        console.error(`[TOOL] Error creating scribble instance: ${error.message}`);
    }

    return null;
};

(function() {
    'use strict';

    console.log('PDF XBlock initialization script loaded at: ' + new Date().toISOString());

    // Add a global event listener to check when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        console.log('PDF XBlock DOM content loaded at: ' + new Date().toISOString());

        // Define all tool button types to look for
        var toolTypes = [
            'marker', 'highlight', 'text', 'shape', 'note',
            'select', 'eraser', 'clear', 'undo', 'redo'
        ];

        // Store all buttons in a single object for easy access
        var toolButtons = {};

        // Find all tool buttons and log counts in a single loop
        toolTypes.forEach(function(toolType) {
            var selector = `[id^="${toolType}-tool-"]`;
            var buttons = document.querySelectorAll(selector);
            toolButtons[toolType] = buttons;
            console.log(`Found ${buttons.length} ${toolType} tool buttons`);

            // Add click event listeners to each button
            buttons.forEach(function(button) {
                console.log(`Setting up click listener for: ${button.id}`);
                button.addEventListener('click', function(event) {
                    var toolName = this.id.split('-tool-')[0];
                    var blockId = this.id.split('-tool-')[1];

                    // Stop propagation immediately to prevent any interference
                    event.stopPropagation();
                    event.preventDefault();

                    console.log(`%c[TOOL CLICK] ${toolName} button clicked`, 'background:#3498db;color:white;padding:3px;border-radius:3px;');

                    // First, reset all pointer events to ensure buttons remain clickable
                    resetPointerEvents(blockId);

                    // Since the active class toggle hasn't happened yet, we need to
                    // determine if the button will be activated or deactivated
                    var willBeActive = !this.classList.contains('active');

                    // Special handling for marker tool deactivation - more aggressive cleanup
                    if ((toolName === 'marker' || toolName === 'scribble') && this.classList.contains('active')) {
                        console.log(`[TOOL CLICK] Deactivating marker tool with special handling`);

                        // Get the scribble instance
                        var scribbleInstance = window[`scribbleInstance_${blockId}`];
                        if (scribbleInstance && typeof scribbleInstance.disable === 'function') {
                            // Force disable the scribble tool
                            scribbleInstance.disable();
                        }

                        // Extra cleanup
                        var fabricCanvas = window[`fabricCanvas_${blockId}`];
                        if (fabricCanvas) {
                            fabricCanvas.isDrawingMode = false;
                            if (fabricCanvas.upperCanvasEl) {
                                fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                            }
                        }

                        // Reset draw container
                        var drawContainer = document.querySelector(`#draw-container-${blockId}`);
                        if (drawContainer) {
                            drawContainer.style.pointerEvents = 'none';
                            drawContainer.classList.remove('draw-mode');
                            drawContainer.removeAttribute('data-current-tool');
                        }
                    }

                    // Ensure exclusive selection by first deactivating all tools
                    var allToolButtons = document.querySelectorAll(`[id$="-tool-${blockId}"]`);
                    console.log(`Found ${allToolButtons.length} tools to deactivate`);

                    allToolButtons.forEach(function(otherBtn) {
                        if (otherBtn.id !== button.id && otherBtn.classList.contains('active')) {
                            console.log(`Deactivating other tool: ${otherBtn.id}`);
                            otherBtn.classList.remove('active');

                            // Also deactivate the tool functionality
                            var otherToolName = otherBtn.id.split('-tool-')[0];

                            // Clear the current tool attribute when another tool is activated
                            var drawContainer = document.querySelector(`#draw-container-${blockId}`);
                            if (drawContainer) {
                                drawContainer.removeAttribute('data-current-tool');
                                console.log(`[TOOL] Cleared draw container data-current-tool when deactivating ${otherToolName}`);
                            }

                            // Deactivate the tool using a generic approach
                            deactivateToolByName(otherToolName, blockId);
                        }
                    });

                    // If activating, add active class to this button
                    if (willBeActive) {
                        this.classList.add('active');

                        // Set the current tool attribute on the draw container for cursor styling
                        var drawContainer = document.querySelector(`#draw-container-${blockId}`);
                        if (drawContainer) {
                            drawContainer.setAttribute('data-current-tool', toolName);
                            console.log(`[TOOL] Set draw container data-current-tool to ${toolName}`);
                        }
                    } else {
                        this.classList.remove('active');

                        // Clear the current tool attribute when deactivated
                        var drawContainer = document.querySelector(`#draw-container-${blockId}`);
                        if (drawContainer) {
                            drawContainer.removeAttribute('data-current-tool');
                            console.log(`[TOOL] Cleared draw container data-current-tool`);
                        }
                    }

                    // Log with the correct state information
                    console.log(`${toolName} tool button ${willBeActive ? 'activated' : 'deactivated'}: ${this.id} at ${new Date().toISOString()}`);

                    // Log more detailed information about the click
                    console.log(`Tool interaction: type=${toolName}, blockId=${blockId}, willBeActive=${willBeActive}, currentActive=${this.classList.contains('active')}, timeStamp=${event.timeStamp}`);

                    // For debugging, listen for after the event has been processed
                    setTimeout(() => {
                        console.log(`Tool state after click: ${this.id}, active=${this.classList.contains('active')}`);

                        // Handle tool activation/deactivation using the global functions
                        if (willBeActive) {
                            window.activateToolByName(toolName, blockId);
                        } else {
                            window.deactivateToolByName(toolName, blockId);
                        }

                        // Make sure tool buttons remain clickable after tool activation/deactivation
                        var toolButtons = document.querySelectorAll(`[id$="-tool-${blockId}"]`);
                        toolButtons.forEach(function(btn) {
                            btn.style.pointerEvents = 'auto';
                        });
                    }, 0);
                });
            });
        });
    });

    // Check if PDF.js is loaded immediately
    if (typeof pdfjsLib !== 'undefined') {
        console.log('PDF XBlock: PDF.js library already loaded');
        setupPDFJSWorker();
    } else {
        // Wait a short time to ensure pdfjsLib has loaded (it might be loading asynchronously)
        console.log('PDF XBlock: Waiting for PDF.js to load...');
        setTimeout(function() {
            initPDFJS();
        }, 500);
    }

    function initPDFJS() {
        console.log('PDF XBlock: Initializing PDF.js');

        // If PDF.js is already loaded, we're done
        if (typeof pdfjsLib !== 'undefined') {
            console.log('PDF XBlock: PDF.js already loaded');
            return Promise.resolve();
        }

        return new Promise(function(resolve, reject) {
            // Wait a short time to ensure pdfjsLib has loaded (it might be loading asynchronously)
            setTimeout(function() {
                if (typeof pdfjsLib !== 'undefined') {
                    console.log('PDF XBlock: PDF.js loaded after short delay');
                    resolve();
                    return;
                }

                // If PDF.js is still not loaded, try to load it
                if (typeof pdfjsLib === 'undefined') {
                    console.log('PDF XBlock: PDF.js not found, loading from CDN');

                    // Use the new version that's compatible with the text layer rendering
                    var script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.min.mjs';
                    script.type = 'module';
                    script.onload = function() {
                        if (typeof pdfjsLib !== 'undefined') {
                            console.log('PDF XBlock: PDF.js loaded from CDN');
                            setupPDFJSWorker();
                            resolve();
                        } else {
                            console.error('PDF XBlock: Failed to load PDF.js from CDN');
                            reject(new Error('Failed to load PDF.js'));
                        }
                    };
                    script.onerror = function() {
                        console.error('PDF XBlock: Failed to load PDF.js from CDN');
                        reject(new Error('Failed to load PDF.js'));
                    };
                    document.head.appendChild(script);
                } else {
                    console.log('PDF XBlock: PDF.js already loaded');
                    resolve();
                }
            }, 500);
        });
    }

    function tryLoadScript(url, callback) {
        var script = document.createElement('script');
        script.src = url;
        script.onload = callback;
        script.onerror = function() {
            console.error('PDF XBlock: Failed to load script from: ' + url);
        };
        // If loading an MJS file, set type to module
        if (url.endsWith('.mjs')) {
            script.type = 'module';
        }
        document.head.appendChild(script);
    }

    function setupPDFJSWorker() {
        if (typeof pdfjsLib === 'undefined') {
            console.error('PDF XBlock: PDF.js still not available after loading attempt');
            return;
        }

        // First check if the worker is already set
        if (pdfjsLib.GlobalWorkerOptions.workerSrc) {
            console.log('PDF XBlock: PDF.js worker already configured: ' + pdfjsLib.GlobalWorkerOptions.workerSrc);
            return;
        }

        // Try multiple approaches to find the worker

        // 1. Find the script tag for the worker (if dynamically added by Python)
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var scriptContent = scripts[i].textContent || scripts[i].innerText;
            if (scriptContent && scriptContent.indexOf('pdfjsLib.GlobalWorkerOptions.workerSrc') !== -1) {
                console.log('PDF XBlock: Worker configuration found in script tag');
                // The worker should already be configured by this script
                return;
            }
        }

        // 2. Try to use a local worker URL (from the same path as pdf.min.js)
        try {
            var scripts = document.getElementsByTagName('script');
            var pdfJsScript = null;

            // Find the pdf.min.js script tag
            for (var i = 0; i < scripts.length; i++) {
                if (scripts[i].src && (scripts[i].src.indexOf('pdf.min.js') !== -1 || scripts[i].src.indexOf('pdf.min.mjs') !== -1)) {
                    pdfJsScript = scripts[i];
                    break;
                }
            }

            if (pdfJsScript) {
                // If we found the script, try to figure out if it's local or CDN
                var scriptSrc = pdfJsScript.src;
                var workerSrc = scriptSrc.replace('pdf.min.js', 'pdf.worker.min.js').replace('pdf.min.mjs', 'pdf.worker.min.js');

                console.log('PDF XBlock: Setting worker from script path: ' + workerSrc);
                pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
                return;
            }
        } catch (e) {
            console.error('PDF XBlock: Error setting up worker src from script tag: ', e);
        }

        // 3. Default fallback to CDN
        console.log('PDF XBlock: Using fallback CDN worker');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs';
    }

    // Also expose this function globally to allow manual initialization
    window.initPdfJsWorker = initPDFJS;
})();

console.log('[PDFX INIT][DEBUG] Loading PDF XBlock initialization script at: ' + new Date().toISOString());

// PDF XBlock initialization
function PdfxInit(runtime, element, options) {
    'use strict';

    console.log('[PDFX INIT][DEBUG] Initializing PDF XBlock with runtime, element and options');

    // Check if element is valid
    if (!element) {
        console.error('[PDFX INIT][DEBUG] Invalid element provided to PdfxInit');
        return;
    }

    // Extract block ID from element ID
    var blockId = element.id.replace('pdfx-block-', '');
    console.log('[PDFX INIT][DEBUG] Initializing block with ID: ' + blockId);

    // Debug runtime
    if (runtime) {
        console.log('[PDFX INIT][DEBUG] Runtime provided:', {
            handlerUrl: typeof runtime.handlerUrl === 'function' ? 'function available' : 'not available'
        });
    } else {
        console.error('[PDFX INIT][DEBUG] No runtime provided to PdfxInit');
    }

    // Debug options
    if (options) {
        console.log('[PDFX INIT][DEBUG] Options provided:', Object.keys(options));
    } else {
        console.warn('[PDFX INIT][DEBUG] No options provided to PdfxInit');
    }

    // Create data element if it doesn't exist
    var dataElement = document.getElementById(`pdfx-data-${blockId}`);
    if (!dataElement) {
        console.log('[PDFX INIT][DEBUG] Creating data element for block ' + blockId);
        dataElement = document.createElement('div');
        dataElement.id = `pdfx-data-${blockId}`;
        dataElement.style.display = 'none';
        element.appendChild(dataElement);
    } else {
        console.log('[PDFX INIT][DEBUG] Data element already exists for block ' + blockId);
    }

    // Ensure handler URL is set in the data element
    if (runtime && typeof runtime.handlerUrl === 'function') {
        var saveAnnotationsUrl = runtime.handlerUrl(element, 'save_annotations');
        console.log('[PDFX INIT][DEBUG] Setting handler URL: ' + saveAnnotationsUrl);
        dataElement.dataset.handlerUrl = saveAnnotationsUrl;
    } else {
        console.error('[PDFX INIT][DEBUG] Unable to set handler URL - runtime.handlerUrl not available');
    }

    // Initialize PDF viewer once loaded
    var pdfViewer = null;
    var pdfDoc = null;
    var pdfPages = [];
    var currentPage = options.currentPage || 1;
    var viewMode = 'fit-width';
    var scale = 1.0;
    var pdfOriginalWidth = 0;
    var pdfOriginalHeight = 0;
    var brightness = options.brightness || 100;
    var isGrayscale = options.isGrayscale || false;

    // FabricJS canvas for both drawing and highlighting
    var fabricCanvas = null;

    // User and course information
    var userId = options.userId || 'anonymous';
    var username = options.username;
    var email = options.email;
    var courseId = options.courseId;
    var documentInfo = options.documentInfo || {
        title: 'PDF Document',
        url: options.pdfUrl
    };

    // Initialize tools and components
    var highlighter = new PdfxHighlight(element, {
        blockId: blockId,
        userId: userId,
        debugCallback: debugLog,
        saveCallback: saveAnnotations,
        getHighlightColor: getHighlightColor,
        allowAnnotation: options.allowAnnotation,
        courseId: courseId,
        documentInfo: documentInfo
    });

    // Store highlighter in global scope for tool activation
    window[`highlightInstance_${blockId}`] = highlighter;

    var marker = new PdfxScribble(element, {
        blockId: blockId,
        userId: userId,
        debugCallback: debugLog,
        saveCallback: saveAnnotations,
        color: '#FF0000',
        width: 5,
        courseId: courseId,
        documentInfo: documentInfo,
        saveIntervalTime: 10000 // Save to server every 10 seconds
    });

    // Store marker in global scope under both naming conventions for tool activation
    window[`markerInstance_${blockId}`] = marker;
    window[`scribbleInstance_${blockId}`] = marker; // This might be redundant but ensures both names work

    // Initialize text tool
    var textTool = null;
    try {
        if (typeof PdfxText === 'function') {
            textTool = new PdfxText(element, {
                blockId: blockId,
                userId: userId,
                debugCallback: debugLog,
                saveCallback: saveAnnotations,
                courseId: courseId,
                documentInfo: documentInfo
            });

            // Store text tool in global scope for tool activation
            window[`textInstance_${blockId}`] = textTool;
        }
    } catch (e) {
        console.warn('[PDFX INIT] Could not initialize text tool:', e);
    }

    // Initialize shape tool
    var shapeTool = null;
    try {
        if (typeof PdfxShape === 'function') {
            shapeTool = new PdfxShape(element, {
                blockId: blockId,
                userId: userId,
                debugCallback: debugLog,
                saveCallback: saveAnnotations,
                courseId: courseId,
                documentInfo: documentInfo
            });

            // Store shape tool in global scope for tool activation
            window[`shapeInstance_${blockId}`] = shapeTool;
        }
    } catch (e) {
        console.warn('[PDFX INIT] Could not initialize shape tool:', e);
    }

    // Initialize note tool
    var noteTool = null;
    try {
        if (typeof PdfxNote === 'function') {
            noteTool = new PdfxNote(element, {
                blockId: blockId,
                userId: userId,
                debugCallback: debugLog,
                saveCallback: saveAnnotations,
                courseId: courseId,
                documentInfo: documentInfo
            });

            // Store note tool in global scope for tool activation
            window[`noteInstance_${blockId}`] = noteTool;
        }
    } catch (e) {
        console.warn('[PDFX INIT] Could not initialize note tool:', e);
    }

    // Text highlighting is disabled by default until user selects highlighter tool
    var highlightingEnabled = false;

    // Add global debug functions immediately
    console.log("Initializing PdfxXBlock with ID:", options.blockId || 'default');
    window.pdfxDebug = window.pdfxDebug || {};
    window.pdfxDebug[options.blockId || 'default'] = {
        checkStatus: function() {
            console.log("=== PDF XBLOCK DEBUG INFO ===");
            console.log("Block ID:", options.blockId || 'default');
            console.log("FabricCanvas available:", !!fabricCanvas);
            if (fabricCanvas) {
                console.log("Drawing mode:", fabricCanvas.isDrawingMode);
                console.log("Marker mode:", fabricCanvas.freeDrawingBrush?.markerMode);
                console.log("Upper canvas pointer events:", fabricCanvas.upperCanvasEl.style.pointerEvents);
            }

            var drawContainer = $(element).find(`#draw-container-${options.blockId || 'default'}`)[0];
            if (drawContainer) {
                console.log("Draw container pointer events:", drawContainer.style.pointerEvents);
                console.log("Draw container class list:", drawContainer.classList);
            }

            return "Debug info logged to console";
        },

        checkIndexedDB: function() {
            console.log("=== CHECKING INDEXEDDB STORAGE ===");
            if (marker && typeof marker.checkIndexedDBStorage === 'function') {
                return marker.checkIndexedDBStorage()
                    .then(function(result) {
                        console.log("IndexedDB check complete");
                        return result;
                    })
                    .catch(function(error) {
                        console.error("IndexedDB check failed:", error);
                        return {error: error.message};
                    });
            } else {
                console.log("Marker or IndexedDB check function not available");
                return Promise.resolve({error: "Function not available"});
            }
        },

        marker: marker, // Expose marker object for direct debugging
        fabricCanvas: function() { return fabricCanvas; }
    };

    console.log("Global debug functions added to window.pdfxDebug['" + (options.blockId || 'default') + "']");

    // Set up UI elements and event handlers
    function setupUI() {
        // Page navigation
        $(element).find('.prev-page').click(function() {
            if (currentPage > 1) {
                setPage(currentPage - 1);
            }
        });

        $(element).find('.next-page').click(function() {
            if (currentPage < pdfDoc.numPages) {
                setPage(currentPage + 1);
            }
        });

        // Page input
        $(element).find('.page-input').on('change', function() {
            var page = parseInt($(this).val());
            if (!isNaN(page) && page >= 1 && page <= pdfDoc.numPages) {
                setPage(page);
            } else {
                $(this).val(currentPage);
            }
        });

        // View mode (fit to page/width)
        $(element).find('.fit-page').click(function() {
            fitToPage();
        });

        $(element).find('.fit-width').click(function() {
            viewMode = 'fit-width';
            renderCurrentPage();
        });

        // Fullscreen button
        $(element).find('.fullscreen-btn').click(function() {
            toggleFullscreen();
        });

        // Zoom controls
        $(element).find('.zoom-in').click(function() {
            setZoom(scale * 1.2);
        });

        $(element).find('.zoom-out').click(function() {
            setZoom(scale * 0.8);
        });

        // Grayscale toggle
        $(element).find('.toggle-grayscale').click(function() {
            toggleGrayscale();
        });

        // Brightness controls
        $(element).find('.brightness-up').click(function() {
            brightness = Math.min(150, brightness + 10);
            applyFilters();
            saveViewSettings();
        });

        $(element).find('.brightness-down').click(function() {
            brightness = Math.max(50, brightness - 10);
            applyFilters();
            saveViewSettings();
        });

        // Set initial state for grayscale toggle
        if (isGrayscale) {
            $(element).find('.toggle-grayscale').addClass('active');
        }

        // Download button
        if (options.allowDownload) {
            $(element).find('.download-pdf').show().click(function() {
                window.open(options.pdfUrl, '_blank');
            });
        } else {
            $(element).find('.download-pdf').hide();
        }

        // Annotation tools
        if (options.allowAnnotation) {
            $(element).find('.annotation-tools').show();

            // Color picker for highlighting and drawing
            var colorPicker = $(element).find(`#color-input-${blockId}`);
            colorPicker.on('change', function() {
                var selectedColor = $(this).val();
                debugLog(`Color changed to: ${selectedColor}`);

                // If using the highlighter tool, update highlight color with some transparency
                if (highlightingEnabled) {
                    // Convert hex to rgba with transparency
                    var hex = selectedColor.replace('#', '');
                    var r = parseInt(hex.substring(0, 2), 16);
                    var g = parseInt(hex.substring(2, 4), 16);
                    var b = parseInt(hex.substring(4, 6), 16);

                    // Use the selected color with 50% transparency for highlighting
                    highlighter.setHighlightColor(`rgba(${r}, ${g}, ${b}, 0.5)`);
                }
            });

            // Text highlighting
            $(element).find('.highlight-text').click(function() {
                if ($(this).hasClass('active')) {
                    $(this).removeClass('active');
                    highlighter.disableTextHighlighting();
                } else {
                    $(this).addClass('active');
                    highlighter.enableTextHighlighting();
                }
            });

            // Clear highlights
            $(element).find('.clear-highlights').click(function() {
                highlighter.clearHighlights();
            });
        } else {
            $(element).find('.annotation-tools').hide();
        }

        // Show user info if available
        if (username) {
            $(element).find('.user-info').text(`User: ${username}`).show();
        }
    }

    // Toggle fullscreen mode
    function toggleFullscreen() {
        const docElement = document.documentElement;

        if (!document.fullscreenElement &&
            !document.mozFullScreenElement &&
            !document.webkitFullscreenElement &&
            !document.msFullscreenElement) {
            // Enter fullscreen
            if (docElement.requestFullscreen) {
                docElement.requestFullscreen();
            } else if (docElement.mozRequestFullScreen) { // Firefox
                docElement.mozRequestFullScreen();
            } else if (docElement.webkitRequestFullscreen) { // Chrome, Safari, Opera
                docElement.webkitRequestFullscreen();
            } else if (docElement.msRequestFullscreen) { // IE/Edge
                docElement.msRequestFullscreen();
            }
            $(element).find('.fullscreen-btn').html('<i class="fas fa-compress"></i><span>Exit</span>');
            $(element).find('.fullscreen-btn').attr('title', 'Exit Fullscreen');
            debugLog('Entered fullscreen mode');
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { // Firefox
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { // Chrome, Safari, Opera
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { // IE/Edge
                document.msExitFullscreen();
            }
            $(element).find('.fullscreen-btn').html('<i class="fas fa-expand"></i><span>Fullscreen</span>');
            $(element).find('.fullscreen-btn').attr('title', 'Fullscreen');
            debugLog('Exited fullscreen mode');
        }
    }

    // Fit page to viewport
    function fitToPage() {
        const pdfViewer = $(element).find('.pdf-viewer');
        const viewerWidth = pdfViewer.width() - 40; // Account for padding
        const viewerHeight = pdfViewer.height() - 40;

        // Calculate scale to fit width and height
        const scaleX = viewerWidth / pdfOriginalWidth;
        const scaleY = viewerHeight / pdfOriginalHeight;

        // Use the smaller scale to ensure the entire page fits
        viewMode = 'fit-page';
        const fitScale = Math.min(scaleX, scaleY);

        // Apply the new zoom
        scale = fitScale;
        renderCurrentPage();
        debugLog(`Page fit applied. Scale: ${fitScale.toFixed(2)}`);
    }

    // Toggle grayscale mode
    function toggleGrayscale() {
        isGrayscale = !isGrayscale;

        debugLog(`Toggled grayscale mode to: ${isGrayscale}`);

        // Apply filters with new grayscale setting
        applyFilters();

        // Save the setting
        saveViewSettings();
    }

    // Set zoom level
    function setZoom(newScale) {
        scale = newScale;
        viewMode = 'custom';
        renderCurrentPage();
    }

    // Apply brightness and grayscale filters
    function applyFilters() {
        var canvasContainer = $(element).find(`#pdf-container-${blockId}`);
        var canvas = $(element).find(`#pdf-canvas-${blockId}`)[0];

        if (!canvas) {
            debugLog('Canvas element not found for applying filters');
            return;
        }

        // Apply brightness
        var brightnessValue = brightness / 100;

        // Apply grayscale if enabled
        var filterValue = '';
        if (isGrayscale) {
            filterValue += 'grayscale(1) ';
            $(element).find('.toggle-grayscale').addClass('active');
        } else {
            filterValue += 'grayscale(0) '; // Explicitly set grayscale to 0
            $(element).find('.toggle-grayscale').removeClass('active');
        }

        // Apply brightness filter
        filterValue += `brightness(${brightnessValue})`;

        // Set the filter on the canvas element directly, not the container
        canvas.style.filter = filterValue;

        // Make sure container doesn't have filter applied
        canvasContainer.css('filter', '');

        debugLog(`Applied filters: ${filterValue}`);
    }

    // Save view settings
    function saveViewSettings() {
        saveAnnotations({
            brightness: brightness,
            isGrayscale: isGrayscale
        });
    }

    // Get highlight color from color picker
    function getHighlightColor() {
        var colorPicker = $(element).find(`#color-input-${blockId}`);
        var selectedColor = colorPicker.val() || '#FFFF00';

        // Convert hex to rgba with transparency
        var hex = selectedColor.replace('#', '');
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);

        return `rgba(${r}, ${g}, ${b}, 0.5)`;
    }

    // Debug logging
    function debugLog(message) {
        console.log(`PDF XBlock (${blockId}): ${message}`);
    }

    // Save annotations including user highlights (local implementation)
    function _saveAnnotations(data) {
        // If no specific data is provided, collect all annotations
        if (!data) {
            data = {
                currentPage: currentPage,
                drawings: fabricCanvas ? getDrawingsForStorage() : {},
                highlights: highlighter ? highlighter.getAllHighlights() : {},
                userHighlights: highlighter ? highlighter.getUserHighlightsForStorage() : {},
                markerStrokes: marker ? marker.getAllMarkerStrokes() : {},
                textAnnotations: textTool ? textTool.getAllAnnotations() : {},
                shapeAnnotations: shapeTool ? shapeTool.getAllShapeAnnotations() : {},
                noteAnnotations: noteTool ? noteTool.getAllNoteAnnotations() : {},
                brightness: brightness,
                isGrayscale: isGrayscale
            };
        }

        // If this is a force save request, make sure marker saves to browser storage
        if (data.forceSave && marker) {
            console.log('[DEBUG] Force save requested, saving to browser storage first');
            if (typeof marker.saveScribbleStrokesToBrowser === 'function') {
                marker.saveScribbleStrokesToBrowser();
            }
        }

        // Send annotations to server via XBlock handler
        $.ajax({
            type: "POST",
            url: runtime.handlerUrl(element, 'save_annotations'),
            data: JSON.stringify(data),
            success: function(response) {
                if (response.result !== 'success') {
                    debugLog('Error saving annotations: ' + (response.message || 'Unknown error'));
                } else {
                    console.log('[DEBUG] Annotations saved successfully to server');
                }
            },
            error: function(jqXHR) {
                debugLog('Error saving annotations: ' + jqXHR.responseText);
            }
        });
    }

    // Make a global saveAnnotations function available
    window.saveAnnotations = function(callerBlockId, data) {
        // If called from external tool with a blockId, make sure it matches this instance
        if (callerBlockId && callerBlockId !== blockId) {
            console.log(`[SAVE ANNOTATIONS] Called with mismatched blockId: ${callerBlockId}, this instance: ${blockId}`);
            return; // Don't save for a different block
        }

        // Call the internal implementation
        _saveAnnotations(data);
    };

    // Create a local reference to the saveAnnotations function for use in this file
    var saveAnnotations = _saveAnnotations;

    // Setup tool buttons in left sidebar
    function setupToolButtons() {
        console.log(`[PDFX INIT] Setting up tool buttons for block ${blockId}`);

        // We no longer need to add click handlers here since they're handled globally
        // Just ensure the color picker functionality is available

        // Set up real-time color picker interaction
        var colorInput = $(`#color-input-${blockId}`);
        if (colorInput.length) {
            console.log(`[PDFX INIT] Set up color picker for block ${blockId}`);

            // Remove existing handlers to avoid duplicates
            colorInput.off('change input');

            colorInput.on('change input', function(e) {
                var newColor = $(this).val();
                console.log(`[PDFX INIT] Color changed to ${newColor}`);

                // Update active tool with new color
                var activeToolBtn = $('.tool-btn.active');
                if (activeToolBtn.length) {
                    var toolId = activeToolBtn.attr('id');
                    console.log(`[PDFX INIT] Updating color for active tool: ${toolId}`);

                    if (toolId.includes('marker') || toolId.includes('scribble')) {
                        var scribbleInstance = window[`scribbleInstance_${blockId}`];
                        if (scribbleInstance) {
                            console.log(`[PDFX INIT] Updating scribble tool color to ${newColor}`);
                            scribbleInstance.setColor(newColor);
                        }
                    } else if (toolId.includes('highlight')) {
                        var highlightInstance = window[`highlightInstance_${blockId}`];
                        if (highlightInstance) {
                            // Add 50% transparency for highlights
                            var newColorWithTransparency = newColor + '80';
                            console.log(`[PDFX INIT] Updating highlight tool color to ${newColorWithTransparency}`);
                            highlightInstance.setHighlightColor(newColorWithTransparency);
                        }
                    }
                }
            });
        }

        // Just to be sure, deactivate all tools at initialization
        $('.tool-btn').removeClass('active');
    }

    // Wait for PDF.js to be loaded
    function initializeWhenReady() {
        if (typeof pdfjsLib === 'undefined') {
            console.log('PDF XBlock: PDF.js library not loaded! Attempting to reload...');
            setTimeout(initializeWhenReady, 100);
            return;
        }

        // Set up tool selection handlers
        setupToolButtons();

        // Initialize the PDF viewer
        loadPdfDocument(options.pdfUrl);

        // Set up UI elements and event handlers
        setupUI();

        // Set initial view state
        if (isGrayscale) {
            $(element).find('.toggle-grayscale').addClass('active');
        }

        // Enable features based on permissions
        if (options.allowAnnotation) {
            // Set metadata for the highlighter
            highlighter.setMetadata(courseId, documentInfo);

            // Text highlighting is disabled by default - user must select highlighter tool
            highlighter.disableTextHighlighting();
        }

        // After page is loaded, we should restore user highlights for viewing (but not enable highlighting)
        loadUserHighlights();

        // Ensure all tool instances are globally accessible for the tool activation functions
        console.log(`[PDFX INIT] Making all tool instances globally accessible for block ${blockId}`);

        // Most tools already store themselves globally during construction,
        // but we'll ensure they're all properly registered here for consistency
        if (highlighter) {
            window[`highlightInstance_${blockId}`] = highlighter;
        }

        if (marker) {
            window[`markerInstance_${blockId}`] = marker;
            window[`scribbleInstance_${blockId}`] = marker;
        }

        if (textTool) {
            window[`textInstance_${blockId}`] = textTool;
        }

        if (shapeTool) {
            window[`shapeInstance_${blockId}`] = shapeTool;
        }

        if (noteTool) {
            window[`noteInstance_${blockId}`] = noteTool;
        }

        // Create data element with necessary URLs
        var dataElement = document.getElementById(`pdfx-data-${blockId}`);
        if (dataElement && runtime && typeof runtime.handlerUrl === 'function') {
            dataElement.dataset.handlerUrl = runtime.handlerUrl(element, 'save_annotations');
            console.log(`[PDFX INIT] Set handler URL in data element for block ${blockId}`);
        }
    }

    // Load the PDF document
    function loadPdfDocument(url) {
        if (!url) {
            console.error('PDF XBlock: No PDF URL provided');
            return;
        }

        var loadingTask = pdfjsLib.getDocument(url);
        $(element).find('.loading-indicator').show();

        loadingTask.promise.then(function(pdf) {
            pdfDoc = pdf;

            // Update page count
            $(element).find('.total-pages').text(pdf.numPages);

            // Initialize with current page
            setPage(currentPage);

            $(element).find('.loading-indicator').hide();
        }).catch(function(error) {
            console.error('PDF XBlock: Error loading PDF:', error);
            $(element).find('.loading-indicator').hide();
            $(element).find('.pdf-fallback').show();
        });
    }

    // Set and render a specific page
    function setPage(pageNum) {
        if (pageNum < 1 || pageNum > pdfDoc.numPages) {
            return;
        }

        currentPage = pageNum;
        renderPage(pageNum);

        // Update marker's current page
        marker.setCurrentPage(pageNum);

        // Update other tools' current page
        if (textTool && typeof textTool.setCurrentPage === 'function') {
            textTool.setCurrentPage(pageNum);
        }

        if (shapeTool && typeof shapeTool.setCurrentPage === 'function') {
            shapeTool.setCurrentPage(pageNum);
        }

        if (noteTool && typeof noteTool.setCurrentPage === 'function') {
            noteTool.setCurrentPage(pageNum);
        }

        // Update navigation display
        $(element).find(`#page-num-${blockId}`).text(pageNum);

        // Save current page
        saveAnnotations({
            currentPage: pageNum
        });

        // For debugging
        debugLog(`Navigated to page ${pageNum}`);
    }

    // Update the renderCurrentPage function to properly handle drawing tools state
    function renderCurrentPage() {
        debugLog('Rendering current page: ' + currentPage);

        // Clear any existing page content
        $(element).find(`#pdf-page-${blockId}`).empty();

        // Get the page from cache if available
        if (pdfPages[currentPage - 1]) {
            renderPage(currentPage);
            // Do not automatically enable drawing tools when rendering pages
            if (marker) {
                // Only update the current page in the marker without enabling it
                marker.setCurrentPage(currentPage);
            }
            return;
        }

        // Otherwise, get the page from the PDF document
        pdfDoc.getPage(currentPage).then(function(page) {
            // Cache the page
            pdfPages[currentPage - 1] = page;
            renderPage(currentPage);

            // Do not automatically enable drawing tools when rendering pages
            if (marker) {
                // Only update the current page in the marker without enabling it
                marker.setCurrentPage(currentPage);
            }
        });
    }

    // Add this function to fix any text layer styling issues
    function applyTextLayerFixes() {
        var textLayer = $(element).find(`#text-layer-${blockId}`)[0];
        if (!textLayer) {
            debugLog('Text layer not found for fixing');
            return;
        }
        textLayer.innerHTML = '';
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;
        textLayer.style.setProperty('--scale-factor', currentZoom);

        // Apply styles to all spans in the text layer
        var textSpans = textLayer.querySelectorAll('span');
        debugLog(`Applying fixes to ${textSpans.length} text spans`);

        textSpans.forEach(function(span) {
            // Ensure spans are transparent but selectable
            span.style.color = 'transparent';
            span.style.userSelect = 'text';
            span.style.webkitUserSelect = 'text';
            span.style.MozUserSelect = 'text';
            span.style.msUserSelect = 'text';
            span.style.cursor = 'text';
            span.style.pointerEvents = 'all';

            // Keep original transform settings but ensure line height is correct
            if (!span.style.lineHeight) {
                span.style.lineHeight = '1.0';
            }

            // Fix font issues - ensure proper font rendering
            if (span.style.fontFamily) {
                // Keep original font family but add fallbacks
                var currentFont = span.style.fontFamily;
                if (!currentFont.includes(',')) {
                    span.style.fontFamily = `${currentFont}, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
                }
            }
        });

        debugLog('Text layer fixes applied');
    }

    // Update text layer for highlighting
    function updateTextLayer(page, viewport) {
        var textLayer = $(element).find(`#text-layer-${blockId}`);
        textLayer.empty();

        page.getTextContent().then(function(textContent) {
            // Position text layer
            textLayer.css({
                width: viewport.width + 'px',
                height: viewport.height + 'px'
            });

            // Set scale factor CSS variable for proper text sizing
            textLayer[0].style.setProperty('--scale-factor', viewport.scale);

            // Check if we have the newer version of PDF.js with the renderTextLayer function
            if (typeof pdfjsLib.renderTextLayer === 'function') {
                // Newer PDF.js (3.x versions)
                debugLog('Using PDF.js 3.x text layer renderer');

                const renderTextLayerTask = pdfjsLib.renderTextLayer({
                    textContentSource: textContent,
                    container: textLayer[0],
                    viewport: viewport,
                    textDivs: []
                });

                renderTextLayerTask.promise.then(function() {
                    debugLog('Text layer rendered successfully');

                    // Make text spans selectable but invisible
                    const textSpans = textLayer[0].querySelectorAll('span');
                    debugLog(`Found ${textSpans.length} text spans to make selectable`);

                    // Apply text layer fixes for consistency
                    applyTextLayerFixes();

                    // Apply text cursors to ensure mouse pointer shows I-beam on text
                    if (highlighter && typeof highlighter.applyTextCursors === 'function') {
                        highlighter.applyTextCursors();
                        debugLog('Applied text selection cursors to text layer');
                    }
                }).catch(function(error) {
                    debugLog('Error rendering text layer: ' + error);
                });
            } else {
                // Older PDF.js (2.x versions) or custom implementation
                debugLog('Using older/custom text layer rendering');

                // Render text spans manually
                textContent.items.forEach(function(item) {
                    try {
                        var tx = pdfjsLib.Util.transform(
                            viewport.transform,
                            [1, 0, 0, -1, item.transform[4], item.transform[5]]
                        );

                        var style = textContent.styles[item.fontName];

                        // Create text span
                        var span = document.createElement('span');
                        span.textContent = item.str;

                        // Apply font styling with fallbacks to ensure consistent rendering
                        if (style && style.fontFamily) {
                            span.style.fontFamily = style.fontFamily + ', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
                        }

                        span.style.fontSize = Math.floor(item.height) + 'px';
                        span.style.position = 'absolute';
                        span.style.left = Math.floor(tx[0]) + 'px';
                        span.style.top = Math.floor(tx[1]) + 'px';
                        span.style.transform = 'scaleY(-1)';
                        span.style.color = 'transparent';
                        span.style.lineHeight = '1.0';
                        span.style.whiteSpace = 'pre';
                        span.style.pointerEvents = 'all';
                        span.style.userSelect = 'text';
                        span.style.webkitUserSelect = 'text';
                        span.style.MozUserSelect = 'text';
                        span.style.msUserSelect = 'text';
                        span.style.cursor = 'text';

                        textLayer.append(span);
                    } catch (e) {
                        debugLog(`Error rendering text span: ${e.message}`);
                    }
                });

                debugLog(`Rendered ${textContent.items.length} text spans manually`);

                // Apply text cursors to ensure mouse pointer shows I-beam on text
                if (highlighter && typeof highlighter.applyTextCursors === 'function') {
                    highlighter.applyTextCursors();
                    debugLog('Applied text selection cursors to text layer');
                }
            }
        }).catch(function(error) {
            debugLog('Error getting text content: ' + error);
        });
    }

    // Load user highlights from MongoDB and initialize highlighter
    function loadUserHighlights() {
        $.ajax({
            type: "POST",
            url: runtime.handlerUrl(element, 'get_user_highlights'),
            data: JSON.stringify({includeAll: options.isStaff}),
            success: function(response) {
                if (response.result === 'success') {
                    // Load highlight annotations
                    if (highlighter && response.highlights) {
                        highlighter.setAllHighlights(response.highlights || {});
                        debugLog('Loaded user highlights');
                    }

                    // If we have marker strokes, load them
                    if (marker && response.markerStrokes) {
                        marker.loadMarkerStrokes(response.markerStrokes);
                        debugLog('Loaded marker strokes');
                    }

                    // Load text annotations if available
                    if (textTool && response.textAnnotations) {
                        textTool.setAnnotations(response.textAnnotations);
                        debugLog('Loaded text annotations');
                    }

                    // Load shape annotations if available
                    if (shapeTool && response.shapeAnnotations) {
                        shapeTool.setShapeAnnotations(response.shapeAnnotations);
                        debugLog('Loaded shape annotations');
                    }

                    // Load note annotations if available
                    if (noteTool && response.noteAnnotations) {
                        noteTool.setNoteAnnotations(response.noteAnnotations);
                        debugLog('Loaded note annotations');
                    }
                } else {
                    debugLog('Error loading highlights: ' + (response.message || 'Unknown error'));
                }
            },
            error: function(jqXHR) {
                debugLog('Error loading highlights: ' + jqXHR.responseText);
            }
        });
    }

    // Update the initFabricCanvas function to better handle drawing canvas initialization
    function initFabricCanvas() {
        console.log("%c[FABRIC] Initializing fabric canvas", "background:#2c3e50;color:white;padding:3px;border-radius:3px;");
        debugLog('Initializing fabric canvas');

        var drawContainer = $(element).find(`#draw-container-${blockId}`)[0];
        var pdfContainer = $(element).find(`#pdf-container-${blockId}`)[0];

        if (!drawContainer || !pdfContainer) {
            console.error("%c[FABRIC] Required containers not found:", "background:red;color:white;padding:3px;border-radius:3px;", {
                drawContainerFound: !!drawContainer,
                pdfContainerFound: !!pdfContainer,
                blockId: blockId
            });
            debugLog('Error: Required containers not found');
            return false;
        }

        try {
            console.log("[FABRIC] Container found, dimensions:", {
                drawContainer: drawContainer.getBoundingClientRect(),
                pdfContainer: pdfContainer.getBoundingClientRect()
            });

            // Create canvas element
            var canvas = document.createElement('canvas');
            canvas.id = `drawing-canvas-${blockId}`;
            canvas.width = pdfContainer.offsetWidth;
            canvas.height = pdfContainer.offsetHeight;
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';

            console.log("[FABRIC] Created canvas with dimensions:", {
                width: canvas.width,
                height: canvas.height
            });

            // Append canvas to draw container
            drawContainer.innerHTML = ''; // Clear any existing canvas
            drawContainer.appendChild(canvas);

            // Manually set critical styles on draw container
            drawContainer.style.position = 'absolute';
            drawContainer.style.top = '0';
            drawContainer.style.left = '0';
            drawContainer.style.width = '100%';
            drawContainer.style.height = '100%';
            drawContainer.style.zIndex = '20';

            // Check if fabric is loaded
            if (typeof fabric === 'undefined') {
                console.error("%c[FABRIC] fabric.js library not loaded!", "background:red;color:white;padding:3px;border-radius:3px;");
                debugLog('Error: fabric.js library not loaded');
                return false;
            }

            // Initialize fabric canvas with proper settings
            try {
                fabricCanvas = new fabric.Canvas(canvas, {
                    isDrawingMode: false,
                    selection: false,
                    renderOnAddRemove: true,
                    backgroundColor: null
                });

                console.log("%c[FABRIC] Canvas created successfully", "background:#27ae60;color:white;padding:3px;border-radius:3px;", fabricCanvas);
            } catch (err) {
                console.error("%c[FABRIC] Error creating fabric canvas:", "background:red;color:white;padding:3px;border-radius:3px;", err);
                debugLog('Error creating fabric canvas: ' + err.message);
                return false;
            }

            debugLog('Fabric canvas created');

            // Initialize the marker with fabric canvas
            if (marker && typeof marker.init === 'function') {
                console.log("[FABRIC] Initializing marker with fabric canvas");
                marker.init(fabricCanvas);
            } else {
                console.error("%c[FABRIC] Marker object not available or init method missing!", "background:red;color:white;padding:3px;border-radius:3px;");
            }

            // Initialize the text tool with fabric canvas if available
            if (textTool && typeof textTool.init === 'function') {
                console.log("[FABRIC] Initializing text tool with fabric canvas");
                textTool.init(fabricCanvas);
            }

            // Initialize the shape tool with fabric canvas if available
            if (shapeTool && typeof shapeTool.init === 'function') {
                console.log("[FABRIC] Initializing shape tool with fabric canvas");
                shapeTool.init(fabricCanvas);
            }

            // Initialize the note tool with fabric canvas if available
            if (noteTool && typeof noteTool.init === 'function') {
                console.log("[FABRIC] Initializing note tool with fabric canvas");
                noteTool.init(fabricCanvas);
            }

            // Set up brush
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
            fabricCanvas.freeDrawingBrush.color = $(element).find(`#color-input-${blockId}`).val() || '#FF0000';
            fabricCanvas.freeDrawingBrush.width = parseInt($(element).find(`#width-input-${blockId}`).val() || 5);

            // Update the fabric mouse event handlers to include more detailed logging
            fabricCanvas.on('mouse:down', function(e) {
                console.log("%c[MOUSE EVENT] mouse:down", "background:#9b59b6;color:white;padding:3px;border-radius:3px;", {
                    isDrawingMode: fabricCanvas.isDrawingMode,
                    markerMode: fabricCanvas.freeDrawingBrush?.markerMode,
                    activeTool: $(".tool-btn.active").attr('id')
                });

                debugLog('Canvas mouse:down event');
                if (fabricCanvas.isDrawingMode) {
                    // Important: Make sure pointer events are enabled during drawing
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                    drawContainer.style.pointerEvents = 'auto';
                    console.log("[MOUSE EVENT] Drawing mode active, set pointer-events to auto");
                }
            });

            fabricCanvas.on('mouse:move', function(e) {
                // Don't log every mouse move to avoid console spam
                // For marker tool, make sure pointer events stay enabled
                if (fabricCanvas.isDrawingMode && fabricCanvas.freeDrawingBrush.markerMode) {
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                    drawContainer.style.pointerEvents = 'auto';
                }
            });

            fabricCanvas.on('mouse:up', function(e) {
                console.log("%c[MOUSE EVENT] mouse:up", "background:#9b59b6;color:white;padding:3px;border-radius:3px;", {
                    isDrawingMode: fabricCanvas.isDrawingMode,
                    markerMode: fabricCanvas.freeDrawingBrush?.markerMode,
                    activeTool: $(".tool-btn.active").attr('id')
                });

                debugLog('Canvas mouse:up event');
                // Don't disable pointer events if still in drawing mode and marker is active
                if (fabricCanvas.isDrawingMode && fabricCanvas.freeDrawingBrush.markerMode) {
                    console.log("[MOUSE EVENT] Marker still active, keeping pointer-events auto");
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                    drawContainer.style.pointerEvents = 'auto';
                } else if (!fabricCanvas.isDrawingMode) {
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                }
            });

            // Path created event
            fabricCanvas.on('path:created', function(e) {
                console.log("%c[FABRIC EVENT] path:created", "background:#e74c3c;color:white;padding:3px;border-radius:3px;", {
                    isDrawingMode: fabricCanvas.isDrawingMode,
                    markerMode: fabricCanvas.freeDrawingBrush?.markerMode
                });

                debugLog('Path created on canvas');
                // Make sure drawing mode stays active for marker tool
                if (fabricCanvas.freeDrawingBrush.markerMode) {
                    console.log("[FABRIC EVENT] Keeping marker mode active after path creation");
                    fabricCanvas.isDrawingMode = true;
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                    drawContainer.style.pointerEvents = 'auto';
                }
            });

            // Store reference to fabricCanvas in draw container
            drawContainer._fabricCanvas = fabricCanvas;

            // Set up color picker event handler
            $(element).find(`#color-input-${blockId}`).on('change', function() {
                var color = $(this).val();
                if (fabricCanvas && fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush.color = color;
                    marker.setColor(color);
                    debugLog(`Color changed to ${color}`);
                }
            });

            // Set up width slider event handler
            $(element).find(`#width-input-${blockId}`).on('input', function() {
                var width = parseInt($(this).val());
                if (fabricCanvas && fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush.width = width;
                    marker.setWidth(width);
                    $(element).find(`#width-value-${blockId}`).text(width + 'px');
                    debugLog(`Width changed to ${width}px`);
                }
            });

            debugLog('Fabric canvas fully initialized');
            return true;
        } catch (error) {
            debugLog(`Error initializing fabric canvas: ${error.message}`);
            return false;
        }
    }

    // Set up the drawing and highlighting areas after PDF rendering
    function setupDrawingLayers(width, height) {
        var drawContainer = document.getElementById(`draw-container-${blockId}`);
        if (!drawContainer) {
            debugLog('Draw container not found for setup');
            return;
        }

        // Set the container dimensions
        drawContainer.style.width = width + 'px';
        drawContainer.style.height = height + 'px';

        // Ensure tools are disabled by default when setting up drawing layers
        drawContainer.classList.remove('draw-mode');
        drawContainer.style.pointerEvents = 'none';

        // Update highlighter dimensions
        var highlightLayer = $(element).find(`#highlight-layer-${blockId}`);
        highlightLayer.css({
            width: width + 'px',
            height: height + 'px'
        });

        // Update text layer dimensions
        var textLayer = $(element).find(`#text-layer-${blockId}`);
        textLayer.css({
            width: width + 'px',
            height: height + 'px'
        });

        // Resize fabric canvas if it exists
        if (fabricCanvas) {
            // Completely resize the canvas to match the PDF dimensions exactly
            fabricCanvas.setWidth(width);
            fabricCanvas.setHeight(height);

            // Also update the canvas-container wrapper to match
            var canvasWrapper = $(drawContainer).find('.canvas-container');
            if (canvasWrapper.length) {
                canvasWrapper.css({
                    width: width + 'px',
                    height: height + 'px'
                });
            }

            // Force re-render
            fabricCanvas.calcOffset();
            fabricCanvas.renderAll();

            // Ensure drawing mode is OFF by default on page render
            fabricCanvas.isDrawingMode = false;
            fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';

            // Make sure marker knows about new dimensions
            if (marker) {
                marker.setCurrentPage(currentPage);
            }
        }

        debugLog(`Drawing layers set up with dimensions: ${width}x${height}`);
    }

    // Modify the renderPage function to ensure filters are applied correctly
    function renderPage(pageNum) {
        if (!pdfDoc) {
            debug('No PDF document loaded');
            return;
        }

        if (pageNum < 1 || pageNum > pdfDoc.numPages) {
            debug('Page number out of range: ' + pageNum);
            return;
        }

        // Update current page
        currentPage = pageNum;
        jq('#page-num-' + blockId).text(pageNum);

        // First reset scroll position of pdf-viewer to ensure proper rendering position
        var pdfViewer = element.querySelector('.pdf-viewer');
        if (pdfViewer) {
            pdfViewer.scrollTop = 0;
        }

        // Get the page
        pdfDoc.getPage(pageNum).then(function(page) {
            debug('Rendering page ' + pageNum);

            // Get viewport with initial scale
            var viewport = page.getViewport({ scale: 1.0 });

            // Get canvas and drawing container
            var pdfCanvas = document.getElementById('pdf-canvas-' + blockId);
            var drawContainer = document.getElementById('draw-container-' + blockId);
            var pdfContainer = document.getElementById('pdf-container-' + blockId);
            var pdfViewer = element.querySelector('.pdf-viewer');

            if (!pdfCanvas || !pdfContainer || !pdfViewer) {
                debug('Required elements not found');
                return;
            }

            var context = pdfCanvas.getContext('2d');

            // Store original PDF dimensions
            pdfOriginalWidth = viewport.width;
            pdfOriginalHeight = viewport.height;

            // Determine container width based on viewer and mode
            var containerWidth = pdfViewer.offsetWidth - 30; // Subtracting padding
            var containerHeight = null;

            // Set orientation class
            if (viewport.width > viewport.height) {
                pdfContainer.classList.remove('portrait');
                pdfContainer.classList.add('landscape');
                debug('Page orientation: landscape');
            } else {
                pdfContainer.classList.remove('landscape');
                pdfContainer.classList.add('portrait');
                debug('Page orientation: portrait');
            }

            // Scale based on viewing mode
            var computedScale;
            if (viewMode === 'fit-width') {
                computedScale = containerWidth / viewport.width;
            } else if (viewMode === 'fit-page') {
                // Get available height
                var availableHeight = pdfViewer.offsetHeight - 30;
                var scaleW = containerWidth / viewport.width;
                var scaleH = availableHeight / viewport.height;
                computedScale = Math.min(scaleW, scaleH);
            } else {
                // Custom scale
                computedScale = scale;
            }

            debug('Computing scale: ' + computedScale);

            // Apply computed scale to viewport
            viewport = page.getViewport({ scale: computedScale });

            // Set canvas dimensions
            pdfCanvas.width = viewport.width;
            pdfCanvas.height = viewport.height;

            // Set container dimensions to match viewport
            containerWidth = viewport.width;
            containerHeight = viewport.height;
            pdfContainer.style.width = containerWidth + 'px';
            pdfContainer.style.height = containerHeight + 'px';

            // Set up drawing and highlighting layers
            setupDrawingLayers(containerWidth, containerHeight);

            // Reset any filter that might be on the PDF container
            pdfContainer.style.filter = '';

            // Default: make sure the canvas doesn't have grayscale applied
            if (!isGrayscale) {
                pdfCanvas.style.filter = `brightness(${brightness / 100}) grayscale(0)`;
            } else {
                pdfCanvas.style.filter = `brightness(${brightness / 100}) grayscale(100%)`;
            }

            // Hide the loading indicator
            jq('.loading-indicator').hide();

            // Render PDF page into canvas context
            var renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            var renderTask = page.render(renderContext);

            renderTask.promise.then(function() {
                debug('Page ' + pageNum + ' rendered successfully');

                // Apply filters after page is rendered
                applyFilters();

                // Update text layer for highlighting
                updateTextLayer(page, viewport);

                // Restore highlights after rendering but after a short delay to ensure text layer is ready
                setTimeout(function() {
                    if (highlighter) {
                        highlighter.restoreHighlights();
                    }
                }, 100);
            }).catch(function(error) {
                debug('Error rendering page: ' + error);
            });
        }).catch(function(error) {
            debug('Error getting page: ' + error);
        });
    }

    // Add this function after the debugLog function
    function checkDrawingStatus() {
        var status = {
            drawContainer: $(element).find(`#draw-container-${blockId}`)[0],
            fabricCanvas: fabricCanvas,
            isDrawingMode: fabricCanvas ? fabricCanvas.isDrawingMode : false,
            freeDrawingBrush: fabricCanvas ? fabricCanvas.freeDrawingBrush : null,
            upperCanvasPointerEvents: fabricCanvas ? fabricCanvas.upperCanvasEl.style.pointerEvents : 'none',
            drawContainerPointerEvents: $(element).find(`#draw-container-${blockId}`)[0] ?
                $(element).find(`#draw-container-${blockId}`)[0].style.pointerEvents : 'none',
            activeTools: {
                marker: $(element).find(`#marker-tool-${blockId}`).hasClass('active'),
                highlight: $(element).find(`#highlight-tool-${blockId}`).hasClass('active')
            }
        };

        console.log('===== DRAWING STATUS =====');
        console.log(JSON.stringify(status, null, 2));

        if (fabricCanvas) {
            console.log('Canvas size:', fabricCanvas.width, 'x', fabricCanvas.height);
            console.log('Objects on canvas:', fabricCanvas.getObjects().length);

            if (fabricCanvas.freeDrawingBrush) {
                console.log('Drawing brush:',
                    'color =', fabricCanvas.freeDrawingBrush.color,
                    'width =', fabricCanvas.freeDrawingBrush.width,
                    'markerMode =', fabricCanvas.freeDrawingBrush.markerMode);
            }
        }

        debugLog('Drawing status checked - see console for details');

        // Do NOT force any mode changes in the status check function
        // This caused tools to be unexpectedly enabled

        return status;
    }

    // Add this to window for debugging if needed
    window.checkPdfDrawingStatus = function() {
        var blocks = document.querySelectorAll('.pdfx_block');
        blocks.forEach(function(block) {
            var blockId = block.id.replace('pdfx-block-', '');
            console.log('Checking PDF block:', blockId);
            if (window['checkDrawingStatus_' + blockId]) {
                window['checkDrawingStatus_' + blockId]();
            } else {
                console.log('No check function available for this block');
            }
        });
    };

    // Expose the check function with a block-specific name
    window['checkDrawingStatus_' + blockId] = checkDrawingStatus;

    // Add this function to the end of the file, before the initializeWhenReady() call
    function fixMarkerToolIssues() {
        debugLog('Attempting to fix marker tool issues...');

        // Force enable drawing mode
        if (fabricCanvas) {
            // Reset drawing mode
            fabricCanvas.isDrawingMode = true;

            // Configure brush
            fabricCanvas.freeDrawingBrush.color = $(element).find(`#color-input-${blockId}`).val() || '#FF0000';
            fabricCanvas.freeDrawingBrush.width = parseInt($(element).find(`#width-input-${blockId}`).val() || 5);
            fabricCanvas.freeDrawingBrush.markerMode = true;

            // Fix pointer events
            fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

            // Fix draw container
            var drawContainer = $(element).find(`#draw-container-${blockId}`)[0];
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'auto';
                drawContainer.classList.add('draw-mode');
                drawContainer.dataset.currentTool = 'marker';
            }

            // Set active state on marker button
            $(element).find(`#marker-tool-${blockId}`).addClass('active');

            // Explicitly call marker enable
            marker.enable();

            debugLog('Marker tool fixed and re-enabled');
        } else {
            debugLog('ERROR: Cannot fix marker tool - fabric canvas not available');
        }
    }

    // Expose the function globally for debugging purposes
    window[`fixMarkerTool_${blockId}`] = fixMarkerToolIssues;

    // Add global debug functions
    window.pdfxDebug = window.pdfxDebug || {};

    // Function to force initialize the marker tool
    window.forcePdfxInit = function(blockId) {
        console.log("%c[FORCE INIT] Forcing PDF XBlock initialization", "background:#9b59b6;color:white;padding:3px;border-radius:3px;");

        // If no blockId provided, try to find one
        if (!blockId) {
            var pdfxBlocks = document.querySelectorAll('.pdfx_block');
            if (pdfxBlocks.length > 0) {
                blockId = pdfxBlocks[0].id.replace('pdfx-block-', '');
                console.log("[FORCE INIT] Found block ID:", blockId);
            } else {
                console.error("[FORCE INIT] No PDF XBlock found on the page!");
                return false;
            }
        }

        // Find the marker tool button
        var markerBtn = document.getElementById('marker-tool-' + blockId);
        if (markerBtn) {
            console.log("[FORCE INIT] Found marker button, clicking it...");
            markerBtn.click();

            // Try to fix drawing issues
            setTimeout(function() {
                // Access our debug object if available
                if (window.pdfxDebug[blockId] && typeof window.pdfxDebug[blockId].fixMarker === 'function') {
                    console.log("[FORCE INIT] Running fixMarker()...");
                    window.pdfxDebug[blockId].fixMarker();
                } else {
                    console.log("[FORCE INIT] Debug functions not available, trying manual fix...");

                    // Manual fix - find the draw container and force drawing mode
                    var drawContainer = document.getElementById('draw-container-' + blockId);
                    if (drawContainer) {
                        drawContainer.style.pointerEvents = 'auto';
                        drawContainer.classList.add('draw-mode');
                        drawContainer.dataset.currentTool = 'marker';

                        // Find the canvas container
                        var canvasEl = drawContainer.querySelector('.upper-canvas');
                        if (canvasEl) {
                            canvasEl.style.pointerEvents = 'auto';
                        }

                        console.log("[FORCE INIT] Manual fix applied to draw container and canvas");
                    }
                }
            }, 500);

            return true;
        } else {
            console.error("[FORCE INIT] Marker button not found for block:", blockId);
            return false;
        }
    };

    // Global function to check all debug functions
    window.checkPdfxTools = function() {
        console.log("%c[DEBUG CHECK] Checking PDF XBlock tools", "background:#3498db;color:white;padding:3px;border-radius:3px;");

        // Check for fabric.js
        console.log("fabric.js loaded:", typeof fabric !== 'undefined');

        // Find all PDF XBlocks
        var pdfxBlocks = document.querySelectorAll('.pdfx_block');
        console.log("PDF XBlocks found:", pdfxBlocks.length);

        pdfxBlocks.forEach(function(block) {
            var blockId = block.id.replace('pdfx-block-', '');
            console.log("Checking block:", blockId);

            // Check draw container
            var drawContainer = document.getElementById('draw-container-' + blockId);
            console.log("Draw container:", !!drawContainer);
            if (drawContainer) {
                console.log("Draw container styles:", {
                    position: drawContainer.style.position,
                    zIndex: drawContainer.style.zIndex,
                    pointerEvents: drawContainer.style.pointerEvents,
                    className: drawContainer.className,
                    currentTool: drawContainer.getAttribute('data-current-tool')
                });
            }

            // Check marker button
            var markerBtn = document.getElementById('marker-tool-' + blockId);
            console.log("Marker button:", !!markerBtn);
            if (markerBtn) {
                console.log("Marker button active:", markerBtn.classList.contains('active'));
            }

            // Check debug functions
            console.log("Debug functions available:", !!window.pdfxDebug[blockId]);

            // Check scribble instance
            var scribbleInstance = window[`scribbleInstance_${blockId}`];
            console.log("Scribble instance available:", !!scribbleInstance);
            if (scribbleInstance && typeof scribbleInstance.checkStatus === 'function') {
                var status = scribbleInstance.checkStatus();
                console.log("Scribble status:", status);
            }

            // Check fabric canvas
            var fabricCanvas = window[`fabricCanvas_${blockId}`];
            console.log("Fabric canvas available:", !!fabricCanvas);
            if (fabricCanvas) {
                console.log("Canvas properties:", {
                    isDrawingMode: fabricCanvas.isDrawingMode,
                    width: fabricCanvas.width,
                    height: fabricCanvas.height,
                    objectCount: fabricCanvas.getObjects().length,
                    hasMarkerBrush: fabricCanvas.freeDrawingBrush &&
                                  (fabricCanvas.freeDrawingBrush.markerMode !== undefined ||
                                   fabricCanvas.freeDrawingBrush.scribbleMode !== undefined)
                });
            }
        });

        return "Check complete - see console for details";
    };

    // New function to test and fix marker tool
    window.testMarkerTool = function(blockId) {
        console.log("%c[MARKER TEST] Testing marker tool for block " + blockId, "background:#e74c3c;color:white;padding:3px;border-radius:3px;");

        if (!blockId) {
            // Find the first PDF XBlock if none specified
            var blocks = document.querySelectorAll('.pdfx_block');
            if (blocks.length > 0) {
                blockId = blocks[0].id.replace('pdfx-block-', '');
            } else {
                console.error("[MARKER TEST] No PDF XBlocks found in the document");
                return false;
            }
        }

        // Get the marker button
        var markerBtn = document.getElementById('marker-tool-' + blockId);
        if (!markerBtn) {
            console.error("[MARKER TEST] Marker button not found for block " + blockId);
            return false;
        }

        // Get the scribble instance
        var scribbleInstance = window[`scribbleInstance_${blockId}`];
        if (!scribbleInstance) {
            console.error("[MARKER TEST] Scribble instance not found for block " + blockId);
            return false;
        }

        // Get the fabric canvas
        var fabricCanvas = window[`fabricCanvas_${blockId}`];
        if (!fabricCanvas) {
            console.error("[MARKER TEST] Fabric canvas not found for block " + blockId);
            return false;
        }

        console.log("[MARKER TEST] Initial state:", {
            markerActive: markerBtn.classList.contains('active'),
            scribbleActive: scribbleInstance.checkStatus ? scribbleInstance.checkStatus().isActive : false,
            canvasDrawMode: fabricCanvas.isDrawingMode
        });

        // Click the marker button to activate/deactivate
        console.log("[MARKER TEST] Clicking marker button");
        markerBtn.click();

        // Check the state after clicking
        setTimeout(function() {
            console.log("[MARKER TEST] State after click:", {
                markerActive: markerBtn.classList.contains('active'),
                scribbleActive: scribbleInstance.checkStatus ? scribbleInstance.checkStatus().isActive : false,
                canvasDrawMode: fabricCanvas.isDrawingMode
            });

            var drawContainer = document.getElementById('draw-container-' + blockId);
            console.log("[MARKER TEST] Draw container state:", {
                pointerEvents: drawContainer.style.pointerEvents,
                drawMode: drawContainer.classList.contains('draw-mode'),
                currentTool: drawContainer.getAttribute('data-current-tool')
            });

            // Log canvas state
            console.log("[MARKER TEST] Canvas element state:", {
                upperCanvasPointerEvents: fabricCanvas.upperCanvasEl ? fabricCanvas.upperCanvasEl.style.pointerEvents : 'unknown'
            });

            // Also test explicitly enabling via the instance
            if (typeof scribbleInstance.enable === 'function') {
                console.log("[MARKER TEST] Explicitly enabling via scribbleInstance.enable()");
                scribbleInstance.enable();

                setTimeout(function() {
                    console.log("[MARKER TEST] State after explicit enable:", {
                        markerActive: markerBtn.classList.contains('active'),
                        scribbleActive: scribbleInstance.checkStatus ? scribbleInstance.checkStatus().isActive : false,
                        canvasDrawMode: fabricCanvas.isDrawingMode,
                        upperCanvasPointerEvents: fabricCanvas.upperCanvasEl ? fabricCanvas.upperCanvasEl.style.pointerEvents : 'unknown',
                        drawContainerPointerEvents: drawContainer.style.pointerEvents
                    });
                }, 100);
            }
        }, 100);

        return "Test running, check console for details";
    };

    // Function to add debug button to the debug panel
    function addDebugButtons() {
        // Add a button to check IndexedDB
        var debugPanel = $(element).find(`#pdf-debug-${blockId}`);
        if (debugPanel.length) {
            var btnContainer = debugPanel.find('div').last();
            if (btnContainer.length) {
                // Add a "Fix Strokes Array" button
                var fixStrokesArrayBtn = $('<button id="fix-strokes-array-' + blockId + '" class="debug-btn fix-strokes-array">Fix Strokes Array</button>');
                fixStrokesArrayBtn.click(function() {
                    console.log('[DEBUG] Attempting to fix strokes array structure...');
                    if (marker) {
                        try {
                            // Get the current strokes
                            var currentStrokes = marker.getAllMarkerStrokes ? marker.getAllMarkerStrokes() : [];
                            console.log('[DEBUG] Current strokes structure:', {
                                type: typeof currentStrokes,
                                isArray: Array.isArray(currentStrokes),
                                length: Array.isArray(currentStrokes) ? currentStrokes.length : Object.keys(currentStrokes).length
                            });

                            // Create a new fixed array
                            var fixedStrokesArray = [];

                            // If it's already an array, make sure each page has an array
                            if (Array.isArray(currentStrokes)) {
                                // Copy the array but ensure each page has a proper array
                                for (var i = 0; i < currentStrokes.length; i++) {
                                    if (currentStrokes[i] && currentStrokes[i].length > 0) {
                                        // Copy existing strokes at this index
                                        fixedStrokesArray[i] = [...currentStrokes[i]];
                                    } else {
                                        // Initialize an empty array at this index
                                        fixedStrokesArray[i] = [];
                                    }
                                }
                            } else if (typeof currentStrokes === 'object') {
                                // Convert from object to array
                                var maxPage = 0;
                                for (var pageKey in currentStrokes) {
                                    var pageNum = parseInt(pageKey, 10);
                                    if (!isNaN(pageNum) && pageNum > maxPage) {
                                        maxPage = pageNum;
                                    }
                                }

                                // Create array of right size
                                fixedStrokesArray = new Array(maxPage + 1);

                                // Initialize all pages with empty arrays
                                for (var i = 0; i <= maxPage; i++) {
                                    fixedStrokesArray[i] = [];
                                }

                                // Copy strokes from object to array
                                for (var pageKey in currentStrokes) {
                                    var pageNum = parseInt(pageKey, 10);
                                    if (!isNaN(pageNum) && currentStrokes[pageKey] && currentStrokes[pageKey].length > 0) {
                                        fixedStrokesArray[pageNum] = [...currentStrokes[pageKey]];
                                    }
                                }
                            }

                            console.log('[DEBUG] Fixed strokes array:', {
                                isArray: Array.isArray(fixedStrokesArray),
                                length: fixedStrokesArray.length,
                                nonEmptyPages: fixedStrokesArray.filter(page => page && page.length > 0).length
                            });

                            // Replace the strokes in the marker
                            if (marker._setScribbleStrokes) {
                                marker._setScribbleStrokes(fixedStrokesArray);
                                console.log('[DEBUG] Replaced strokes with fixed array');

                                // Force save to IndexedDB
                                if (marker.saveScribbleStrokesToBrowser) {
                                    marker.saveScribbleStrokesToBrowser();
                                    console.log('[DEBUG] Saved fixed array to browser storage');
                                }

                                alert('Fixed strokes array structure. Check console for details.');
                            } else {
                                console.error('[DEBUG] Cannot replace strokes, _setScribbleStrokes not available');
                                alert('Could not replace strokes, method not available');
                            }
                        } catch (error) {
                            console.error('[DEBUG] Error fixing strokes array:', error);
                            alert('Error fixing strokes array: ' + error.message);
                        }
                    } else {
                        alert('Marker object not available');
                    }
                });
                btnContainer.append(fixStrokesArrayBtn);

                // Other buttons...
                var checkIndexedDBBtn = $('<button id="check-indexeddb-' + blockId + '" class="debug-btn check-indexeddb">Check IndexedDB Storage</button>');
                checkIndexedDBBtn.click(function() {
                    console.log('[DEBUG] Checking IndexedDB storage...');
                    if (marker && typeof marker.checkIndexedDBStorage === 'function') {
                        marker.checkIndexedDBStorage()
                            .then(function(result) {
                                alert('IndexedDB check complete. See console for details.');
                            })
                            .catch(function(error) {
                                alert('Error checking IndexedDB: ' + error.message);
                            });
                    } else {
                        alert('Marker or IndexedDB check function not available');
                    }
                });
                btnContainer.append(checkIndexedDBBtn);

                // Add force save button
                var forceSaveBtn = $('<button id="force-save-' + blockId + '" class="debug-btn force-save">Force Save Drawings</button>');
                forceSaveBtn.click(function() {
                    console.log('[DEBUG] Forcing save of drawings...');
                    if (marker) {
                        // Set pending changes flag to true to force save
                        marker._pendingChanges = true;
                        // Call saveScribbleStrokesToBrowser directly
                        if (typeof marker.saveScribbleStrokesToBrowser === 'function') {
                            marker.saveScribbleStrokesToBrowser();
                            alert('Forced save of drawings to browser storage');
                        } else {
                            // Try to trigger save through public API
                            saveAnnotations({
                                forceSave: true
                            });
                            alert('Forced save through annotations API');
                        }
                    } else {
                        alert('Marker object not available');
                    }
                });
                btnContainer.append(forceSaveBtn);
            }
        }
    }

    // Add this function to override any automatic marker tool activations
    function setupAntiMarkerInit() {
        debugLog('Setting up anti-marker initialization protection');

        // First run immediately - but only disable marker, not other tools
        disableMarkerTool();

        // Continue to run periodically to counteract any auto-init scripts, but less frequently
        // to reduce potential interference with other tools
        var antiMarkerInterval = setInterval(disableMarkerTool, 5000);

        // Watch for DOM changes that might re-add active class ONLY to marker button
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // Only process class attribute changes on marker/scribble tools
                if (mutation.type === 'attributes' &&
                    mutation.attributeName === 'class' &&
                    mutation.target.id &&
                    (mutation.target.id.includes('marker-tool') ||
                     mutation.target.id.includes('scribble-tool'))) {

                    // If marker button gets 'active' class, remove it
                    if (mutation.target.classList.contains('active')) {
                        debugLog('Detected marker tool activation, disabling it');

                        // Don't call full disableMarkerTool to avoid affecting other tools
                        // Just remove active class from the specific button
                        mutation.target.classList.remove('active');

                        // Ensure marker is disabled only if it was auto-activated
                        if (marker && typeof marker.disable === 'function') {
                            marker.disable();
                        }
                    }
                }
            });
        });

        // Set up observers ONLY for marker/scribble tool buttons
        var markerButtons = document.querySelectorAll(
            `#marker-tool-${blockId}, #scribble-tool-${blockId}`
        );

        markerButtons.forEach(function(button) {
            observer.observe(button, { attributes: true });
        });

        // Override direct marker fix functions to prevent them from running
        if (window['directMarkerFix_' + blockId]) {
            var originalFix = window['directMarkerFix_' + blockId];
            window['directMarkerFix_' + blockId] = function() {
                console.log('Prevented automatic marker fix for ' + blockId);

                // Just ensure the marker button isn't active, don't affect other tools
                var markerButton = document.getElementById(`marker-tool-${blockId}`);
                if (markerButton) {
                    markerButton.classList.remove('active');
                }

                var scribbleButton = document.getElementById(`scribble-tool-${blockId}`);
                if (scribbleButton) {
                    scribbleButton.classList.remove('active');
                }

                return false;
            };
            debugLog('Overrode directMarkerFix function');
        }

        // Store interval ID in window so it can be cleared if needed
        window['antiMarkerInterval_' + blockId] = antiMarkerInterval;

        debugLog('Anti-marker initialization setup complete');
    }

    // Function to forcibly disable the marker tool
    function disableMarkerTool() {
        debugLog('Disabling marker tool');

        // Make sure the marker button is not active
        $(element).find(`#marker-tool-${blockId}, #scribble-tool-${blockId}`).removeClass('active');

        // Make sure drawing mode is disabled only if no other tool needs drawing mode
        var activeTools = $(element).find('.tool-btn.active').map(function() {
            return this.id.replace(`-${blockId}`, '');
        }).get();

        var hasOtherDrawingTools = activeTools.some(function(toolId) {
            return toolId !== 'marker-tool' && toolId !== 'scribble-tool';
        });

        if (!hasOtherDrawingTools && fabricCanvas) {
            fabricCanvas.isDrawingMode = false;
            if (fabricCanvas.upperCanvasEl) {
                fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
            }
        }

        // Make sure the draw container is not in draw mode when appropriate
        var drawContainer = $(element).find(`#draw-container-${blockId}`)[0];
        if (drawContainer) {
            // Only modify the container if its current tool is marker/scribble
            if (drawContainer.dataset.currentTool === 'marker' ||
                drawContainer.dataset.currentTool === 'scribble') {

                // Remove draw mode only if no other drawing tool is active
                if (!hasOtherDrawingTools) {
                    drawContainer.classList.remove('draw-mode');
                    drawContainer.style.pointerEvents = 'none';
                }

                // Clear the current tool attribute
                drawContainer.dataset.currentTool = '';
            }
        }

        // Disable the marker object
        if (marker && typeof marker.disable === 'function') {
            marker.disable();
        }

        // Only activate the select tool if no other tools are active and select tool exists
        if ($(element).find('.tool-btn.active').length === 0 &&
            $(element).find(`#select-tool-${blockId}`).length > 0) {
            $(element).find(`#select-tool-${blockId}`).addClass('active');
        }
    }

    // Start initialization
    initializeWhenReady();
}

// Add this function at the end of the file
window.fixMarkerTool = function(blockId) {
    console.log("%c[MARKER FIX] Attempting to fix marker tool", "background:#e67e22;color:white;padding:3px;border-radius:3px;");

    if (!blockId) {
        // Find the first PDF XBlock if none specified
        var blocks = document.querySelectorAll('.pdfx_block');
        if (blocks.length > 0) {
            blockId = blocks[0].id.replace('pdfx-block-', '');
        } else {
            console.error("[MARKER FIX] No PDF XBlocks found in the document");
            return false;
        }
    }

    // Get components
    var markerBtn = document.getElementById('marker-tool-' + blockId);
    var scribbleInstance = window[`scribbleInstance_${blockId}`];
    var fabricCanvas = window[`fabricCanvas_${blockId}`];
    var drawContainer = document.getElementById('draw-container-' + blockId);
    var pdfContainer = document.getElementById('pdf-container-' + blockId);

    if (!markerBtn || !scribbleInstance || !fabricCanvas || !drawContainer) {
        console.error("[MARKER FIX] One or more required components not found");
        return false;
    }

    console.log("[MARKER FIX] Starting with state:", {
        markerActive: markerBtn.classList.contains('active'),
        drawContainerMode: drawContainer.classList.contains('draw-mode'),
        drawContainerPointerEvents: drawContainer.style.pointerEvents,
        currentTool: drawContainer.getAttribute('data-current-tool'),
        fabricDrawingMode: fabricCanvas.isDrawingMode,
        upperCanvasPointerEvents: fabricCanvas.upperCanvasEl ? fabricCanvas.upperCanvasEl.style.pointerEvents : 'unknown'
    });

    // First, ensure marker button is active
    markerBtn.classList.add('active');

    // Set draw container properties
    drawContainer.style.pointerEvents = 'auto';
    drawContainer.classList.add('draw-mode');
    drawContainer.setAttribute('data-current-tool', 'marker');
    drawContainer.style.cursor = 'crosshair';

    // Configure fabric canvas
    fabricCanvas.isDrawingMode = true;
    fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

    // Configure brush
    if (fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush.color = document.getElementById(`color-input-${blockId}`) ?
            document.getElementById(`color-input-${blockId}`).value : '#FF0000';
        fabricCanvas.freeDrawingBrush.width = 5;
        fabricCanvas.freeDrawingBrush.markerMode = true;
        fabricCanvas.freeDrawingBrush.scribbleMode = true;
    }

    // Directly activate the scribble instance
    if (typeof scribbleInstance.enable === 'function') {
        scribbleInstance.enable();
    }

    // Fix canvas size issues
    if (pdfContainer && fabricCanvas) {
        // Get the actual PDF container dimensions
        var pdfWidth = pdfContainer.offsetWidth;
        var pdfHeight = pdfContainer.offsetHeight;

        console.log(`[MARKER FIX] PDF container dimensions: ${pdfWidth}x${pdfHeight}`);
        console.log(`[MARKER FIX] Current canvas dimensions: ${fabricCanvas.width}x${fabricCanvas.height}`);

        // Resize canvas to match PDF container exactly
        fabricCanvas.setWidth(pdfWidth);
        fabricCanvas.setHeight(pdfHeight);

        // Also update the canvas-container wrapper
        var canvasWrapper = document.querySelector(`#draw-container-${blockId} .canvas-container`);
        if (canvasWrapper) {
            canvasWrapper.style.width = pdfWidth + 'px';
            canvasWrapper.style.height = pdfHeight + 'px';
        }

        // Force re-render
        fabricCanvas.calcOffset();
        fabricCanvas.renderAll();

        console.log(`[MARKER FIX] Resized canvas to: ${fabricCanvas.width}x${fabricCanvas.height}`);
    }

    console.log("[MARKER FIX] Fix applied. New state:", {
        markerActive: markerBtn.classList.contains('active'),
        drawContainerMode: drawContainer.classList.contains('draw-mode'),
        drawContainerPointerEvents: drawContainer.style.pointerEvents,
        currentTool: drawContainer.getAttribute('data-current-tool'),
        fabricDrawingMode: fabricCanvas.isDrawingMode,
        upperCanvasPointerEvents: fabricCanvas.upperCanvasEl ? fabricCanvas.upperCanvasEl.style.pointerEvents : 'unknown',
        canvasDimensions: fabricCanvas ? `${fabricCanvas.width}x${fabricCanvas.height}` : 'unknown'
    });

    return "Marker tool fix applied, check console for details";
};

// Global function to check the status of the marker tool
window.checkMarkerToolStatus = function(blockId) {
    if (!blockId) {
        // Find the first PDF XBlock if none specified
        var blocks = document.querySelectorAll('.pdfx_block');
        if (blocks.length > 0) {
            blockId = blocks[0].id.replace('pdfx-block-', '');
        } else {
            console.error("No PDF XBlocks found in the document");
            return { error: "No PDF XBlocks found" };
        }
    }

    // Get required components
    var scribbleInstance = window[`scribbleInstance_${blockId}`];
    var fabricCanvas = window[`fabricCanvas_${blockId}`];
    var drawContainer = document.getElementById(`draw-container-${blockId}`);
    var pdfContainer = document.getElementById(`pdf-container-${blockId}`);
    var canvasWrapper = drawContainer ? drawContainer.querySelector('.canvas-container') : null;

    var status = {
        components: {
            scribbleInstance: !!scribbleInstance,
            fabricCanvas: !!fabricCanvas,
            drawContainer: !!drawContainer,
            pdfContainer: !!pdfContainer,
            canvasWrapper: !!canvasWrapper
        },
        dimensions: {
            pdfContainer: pdfContainer ? {
                width: pdfContainer.offsetWidth,
                height: pdfContainer.offsetHeight
            } : null,
            fabricCanvas: fabricCanvas ? {
                width: fabricCanvas.width,
                height: fabricCanvas.height
            } : null,
            canvasWrapper: canvasWrapper ? {
                width: canvasWrapper.offsetWidth,
                height: canvasWrapper.offsetHeight
            } : null
        },
        state: {
            markerActive: document.getElementById(`marker-tool-${blockId}`) ?
                document.getElementById(`marker-tool-${blockId}`).classList.contains('active') : false,
            drawContainerMode: drawContainer ? drawContainer.classList.contains('draw-mode') : false,
            currentTool: drawContainer ? drawContainer.getAttribute('data-current-tool') : null,
            isDrawingMode: fabricCanvas ? fabricCanvas.isDrawingMode : false,
            pointerEvents: {
                drawContainer: drawContainer ? drawContainer.style.pointerEvents : null,
                upperCanvas: fabricCanvas && fabricCanvas.upperCanvasEl ?
                    fabricCanvas.upperCanvasEl.style.pointerEvents : null
            }
        },
        scribbleStatus: scribbleInstance && typeof scribbleInstance.checkStatus === 'function' ?
            scribbleInstance.checkStatus() : null
    };

    console.log("%c[MARKER STATUS] Tool status:", "background:#3498db;color:white;padding:3px;border-radius:3px;", status);
    return status;
};

// Utility function to test the marker tool
window.testMarkerTool = function(blockId) {
    console.log("%c[MARKER TEST] Testing marker tool", "background:#e74c3c;color:white;padding:3px;border-radius:3px;");

    if (!blockId) {
        // Find the first PDF XBlock if none specified
        var blocks = document.querySelectorAll('.pdfx_block');
        if (blocks.length > 0) {
            blockId = blocks[0].id.replace('pdfx-block-', '');
        } else {
            console.error("No PDF XBlocks found in the document");
            return false;
        }
    }

    // Check before
    var beforeStatus = window.checkMarkerToolStatus(blockId);
    console.log("[MARKER TEST] Status before activating:", beforeStatus);

    // Try to activate the marker
    var markerBtn = document.getElementById(`marker-tool-${blockId}`);
    if (markerBtn) {
        console.log("[MARKER TEST] Clicking marker button");
        markerBtn.click();

        // Check after
        setTimeout(function() {
            var afterStatus = window.checkMarkerToolStatus(blockId);
            console.log("[MARKER TEST] Status after activating:", afterStatus);

            // If still not drawing properly, try fixing
            if (!afterStatus.state.isDrawingMode || !afterStatus.state.drawContainerMode) {
                console.log("[MARKER TEST] Tool not properly activated, trying fix");
                window.fixMarkerTool(blockId);
            }
        }, 100);

        return true;
    } else {
        console.error("[MARKER TEST] Marker button not found");
        return false;
    }
};

// Function to fix the marker tool dimensions
window.fixMarkerToolDimensions = function(blockId) {
    if (!blockId) {
        var blocks = document.querySelectorAll('.pdfx_block');
        if (blocks.length > 0) {
            blockId = blocks[0].id.replace('pdfx-block-', '');
        } else {
            console.error("No PDF XBlocks found in the document");
            return false;
        }
    }

    var fabricCanvas = window[`fabricCanvas_${blockId}`];
    var pdfContainer = document.getElementById(`pdf-container-${blockId}`);
    var drawContainer = document.getElementById(`draw-container-${blockId}`);

    if (!fabricCanvas || !pdfContainer || !drawContainer) {
        console.error("[DIMENSION FIX] Required components not found");
        return false;
    }

    // Get PDF container dimensions
    var containerWidth = pdfContainer.offsetWidth;
    var containerHeight = pdfContainer.offsetHeight;

    console.log(`[DIMENSION FIX] Setting canvas dimensions to match PDF: ${containerWidth}x${containerHeight}`);

    // Resize fabric canvas
    fabricCanvas.setWidth(containerWidth);
    fabricCanvas.setHeight(containerHeight);

    // Resize canvas wrapper
    var canvasWrapper = drawContainer.querySelector('.canvas-container');
    if (canvasWrapper) {
        canvasWrapper.style.width = containerWidth + 'px';
        canvasWrapper.style.height = containerHeight + 'px';
    }

    // Make sure draw container covers the entire PDF area
    drawContainer.style.width = containerWidth + 'px';
    drawContainer.style.height = containerHeight + 'px';

    // Force render
    fabricCanvas.calcOffset();
    fabricCanvas.renderAll();

    console.log("[DIMENSION FIX] Canvas dimensions fixed");
    return true;
};

// For easy access from browser console
window.fixPdfMarker = function() {
    console.log("%c[PDF MARKER FIX] Starting quick fix for PDF marker tool", "background:#2ecc71;color:white;padding:3px;border-radius:3px;");

    // Find all PDF XBlocks
    var blocks = document.querySelectorAll('.pdfx_block');
    var results = {};

    blocks.forEach(function(block) {
        var blockId = block.id.replace('pdfx-block-', '');
        console.log(`Fixing marker for block: ${blockId}`);

        try {
            // 1. Fix dimensions first
            window.fixMarkerToolDimensions(blockId);

            // 2. Fix marker tool state
            window.fixMarkerTool(blockId);

            results[blockId] = 'Fixed successfully';
        } catch (error) {
            console.error(`Error fixing block ${blockId}:`, error);
            results[blockId] = `Error: ${error.message}`;
        }
    });

    console.log("%c[PDF MARKER FIX] Fix attempt completed", "background:#2ecc71;color:white;padding:3px;border-radius:3px;", results);
    return "Fix attempted for " + blocks.length + " PDF blocks. Check console for details.";
};

// Function to help users activate marker tool from console
window.activateMarker = function() {
    var blocks = document.querySelectorAll('.pdfx_block');
    if (blocks.length === 0) {
        console.error("No PDF blocks found on page");
        return "No PDF blocks found";
    }

    var blockId = blocks[0].id.replace('pdfx-block-', '');
    var markerBtn = document.getElementById(`marker-tool-${blockId}`);

    if (!markerBtn) {
        console.error("Marker tool button not found");
        return "Marker button not found";
    }

    console.log("Activating marker tool for block:", blockId);
    markerBtn.click();

    // Run a check after activation
    setTimeout(function() {
        var status = window.checkMarkerToolStatus(blockId);

        // If not properly activated, try the fix
        if (!status.state.isDrawingMode) {
            console.log("Tool not properly activated, running fix");
            window.fixPdfMarker();
        }
    }, 100);

    return "Marker tool activated";
};

// Function to reset pointer events when switching tools
function resetPointerEvents(blockId) {
    console.log(`[TOOL] Resetting pointer events for block ${blockId}`);

    try {
        // Get the draw container
        var drawContainer = document.querySelector(`#draw-container-${blockId}`);
        if (drawContainer) {
            // Temporarily disable pointer events on the draw container
            // This prevents it from capturing clicks meant for tool buttons
            drawContainer.style.pointerEvents = 'none';

            // Check if the draw container has a canvas-container
            var canvasContainer = drawContainer.querySelector('.canvas-container');
            if (canvasContainer) {
                // Temporarily disable pointer events on the canvas container
                canvasContainer.style.pointerEvents = 'none';

                // Also disable all canvas elements inside
                var canvasElements = canvasContainer.querySelectorAll('canvas');
                canvasElements.forEach(function(canvas) {
                    canvas.style.pointerEvents = 'none';
                });
            }

            // Check for fabricCanvas
            var fabricCanvas = window[`fabricCanvas_${blockId}`];
            if (fabricCanvas) {
                // Temporarily disable drawing mode to prevent interference
                var wasDrawingMode = fabricCanvas.isDrawingMode;
                fabricCanvas.isDrawingMode = false;

                // Temporarily disable pointer events on the upper canvas
                if (fabricCanvas.upperCanvasEl) {
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                }

                // Schedule restoration of drawing mode if necessary
                if (wasDrawingMode) {
                    setTimeout(function() {
                        // Get currently active tool
                        var activeToolBtn = document.querySelector(`.tool-btn.active[id$="-tool-${blockId}"]`);
                        if (activeToolBtn && (activeToolBtn.id.includes('marker') || activeToolBtn.id.includes('scribble'))) {
                            fabricCanvas.isDrawingMode = true;
                            if (fabricCanvas.upperCanvasEl) {
                                fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                            }
                            drawContainer.style.pointerEvents = 'auto';
                        }
                    }, 100);
                }
            }

            // Make sure tool buttons are always clickable
            var toolButtons = document.querySelectorAll(`[id$="-tool-${blockId}"]`);
            toolButtons.forEach(function(button) {
                button.style.pointerEvents = 'auto';
            });

            // Allow the document to handle the click events
            document.body.style.pointerEvents = 'auto';

            // Log the reset
            console.log(`[TOOL] Successfully reset pointer events for block ${blockId}`);
        } else {
            console.log(`[TOOL] Draw container not found for block ${blockId}`);
        }
    } catch (error) {
        console.error(`[TOOL] Error resetting pointer events: ${error.message}`);
    }
}

// Add a global click handler to ensure UI can always be recovered
// if pointer events get stuck
document.addEventListener('click', function(event) {
    // Don't handle clicks on tool buttons - they have their own handlers
    if (event.target.closest('[id$="-tool-"]')) {
        return;
    }

    // Find any active PDF blocks
    var pdfxBlocks = document.querySelectorAll('.pdfx_block');
    if (pdfxBlocks.length === 0) {
        return;
    }

    // Reset pointer events for all blocks to ensure UI remains responsive
    pdfxBlocks.forEach(function(block) {
        var blockId = block.id.replace('pdfx-block-', '');

        // Check if any tool is active
        var activeToolBtn = block.querySelector('.tool-btn.active');
        if (!activeToolBtn) {
            // If no tool is active, ensure draw container has pointer-events:none
            var drawContainer = document.getElementById(`draw-container-${blockId}`);
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'none';
            }

            // Also ensure canvas has pointer-events:none
            var fabricCanvas = window[`fabricCanvas_${blockId}`];
            if (fabricCanvas && fabricCanvas.upperCanvasEl) {
                fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
            }
        }
    });
});