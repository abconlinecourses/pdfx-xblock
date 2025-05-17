/**
 * PDF XBlock - Scribble Tool Initialization
 *
 * This module ensures the scribble tool is properly initialized
 * and integrates with the tools management system.
 */
(function() {
    'use strict';

    // Wait for DOM to be fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        // Initialize scribble tools on all PDF XBlocks in the page
        initializeAllScribbleTools();
    });

    /**
     * Initialize scribble tools for all PDF XBlocks on the page
     * Only register and prepare the tools, don't auto-activate
     */
    function initializeAllScribbleTools() {
        // Find all PDF XBlocks on the page
        var pdfxBlocks = document.querySelectorAll('.pdfx_block');

        if (pdfxBlocks.length === 0) {
            return;
        }

        // Initialize each block
        pdfxBlocks.forEach(function(block) {
            var blockId = block.id.replace('pdfx-block-', '');
            initializeScribbleTool(blockId);
        });
    }

    /**
     * Initialize scribble tool for a specific XBlock
     * @param {string} blockId - The XBlock ID
     */
    function initializeScribbleTool(blockId) {
        console.log(`[SCRIBBLE INIT] Initializing scribble tool for block ${blockId}`);

        // Get any data passed from the backend
        var dataElement = document.getElementById(`pdfx-data-${blockId}`);
        var scribbleData = {};

        if (dataElement && dataElement.dataset.markerStrokes) {
            try {
                scribbleData = JSON.parse(dataElement.dataset.markerStrokes);
                console.log(`[SCRIBBLE INIT] Found server-side marker strokes for block ${blockId}`);
            } catch (e) {
                console.error(`[SCRIBBLE INIT] Error parsing marker strokes data: ${e.message}`);
            }
        }

        // Initialize scribble instance in preparation for tool activation
        initScribbleInstance(blockId, scribbleData);

        // Define initialization check function for this block
        window[`checkScribbleStatus_${blockId}`] = function() {
            return checkScribbleToolStatus(blockId);
        };
    }

    /**
     * Initialize the scribble instance with proper configuration
     * @param {string} blockId - The XBlock ID
     * @param {Object} serverData - Data from the server (if available)
     */
    function initScribbleInstance(blockId, serverData) {
        // Create canvas and fabric canvas if needed
        console.log(`[SCRIBBLE INIT] Initializing scribble instance for block ${blockId}`);

        // Find necessary elements
        var block = document.getElementById(`pdfx-block-${blockId}`);
        var drawContainer = document.getElementById(`draw-container-${blockId}`);
        var pdfContainer = document.getElementById(`pdf-container-${blockId}`);
        var dataElement = document.getElementById(`pdfx-data-${blockId}`);

        if (!block) {
            console.error(`[SCRIBBLE INIT] Block element not found for ID ${blockId}`);
            return;
        }

        if (!drawContainer || !pdfContainer || !dataElement) {
            console.error(`[SCRIBBLE INIT] Required elements not found for block ${blockId}`);
            return;
        }

        // Set up draw container for proper fabric.js positioning
        drawContainer.style.position = 'absolute';
        drawContainer.style.top = '0';
        drawContainer.style.left = '0';
        drawContainer.style.width = '100%';
        drawContainer.style.height = '100%';
        drawContainer.style.zIndex = '20';

        // Important: Do NOT set pointer events to auto by default
        // Let the tool selection handle that
        drawContainer.style.pointerEvents = 'none';

        // Do NOT add draw-mode class by default
        drawContainer.classList.remove('draw-mode');

        // Create a canvas element for fabric.js if one doesn't exist
        var canvas = document.getElementById(`drawing-canvas-${blockId}`);
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = `drawing-canvas-${blockId}`;
            canvas.width = pdfContainer.offsetWidth || 800;
            canvas.height = pdfContainer.offsetHeight || 600;

            // Replace any existing canvas
            drawContainer.innerHTML = '';
            drawContainer.appendChild(canvas);
        }

        // Create fabric canvas if it doesn't exist
        var fabricCanvas = drawContainer._fabricCanvas;
        if (!fabricCanvas) {
            try {
                fabricCanvas = new fabric.Canvas(canvas, {
                    isDrawingMode: false, // Default to NOT drawing mode
                    selection: false // Disable selection initially
                });

                // Set canvas dimensions to match PDF container exactly
                fabricCanvas.setWidth(pdfContainer.offsetWidth);
                fabricCanvas.setHeight(pdfContainer.offsetHeight);

                // Store reference to canvas
                drawContainer._fabricCanvas = fabricCanvas;
                window[`fabricCanvas_${blockId}`] = fabricCanvas;

                // Initialize free drawing brush but don't activate it
                if (!fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
                }
                fabricCanvas.freeDrawingBrush.width = 5;
                fabricCanvas.freeDrawingBrush.color = '#FF0000';

                // Add marker and scribble modes to brush
                fabricCanvas.freeDrawingBrush.markerMode = false;
                fabricCanvas.freeDrawingBrush.scribbleMode = false;

                // Set the pointer events to none by default
                if (fabricCanvas.upperCanvasEl) {
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                }

                console.log(`[SCRIBBLE INIT] Created new fabric canvas for block ${blockId}`);
            } catch (error) {
                console.error(`[SCRIBBLE INIT] Error creating fabric canvas: ${error.message}`);
                return;
            }
        } else {
            console.log(`[SCRIBBLE INIT] Using existing fabric canvas for block ${blockId}`);
        }

        // Initialize a scribble instance if it doesn't exist
        var scribbleInstance = window[`scribbleInstance_${blockId}`];
        if (!scribbleInstance) {
            console.log(`[SCRIBBLE INIT] Creating new scribble instance for block ${blockId}`);

            // Get course and user IDs from the block element
            var courseId = block ? block.getAttribute('data-course-id') : null;
            var userId = block ? block.getAttribute('data-user-id') : null;

            // Configure scribble options
            var scribbleOptions = {
                blockId: blockId,
                userId: userId || 'anonymous',
                courseId: courseId,
                debugCallback: function(message) {
                    console.log(`[SCRIBBLE DEBUG] ${blockId}: ${message}`);
                },
                saveCallback: function(data) {
                    // Call the handler to save annotations
                    console.log(`[SCRIBBLE INIT] Saving annotations via callback for block ${blockId}`);

                    // Try to find the handler URL from the data element
                    var dataElement = document.getElementById(`pdfx-data-${blockId}`);
                    if (dataElement && dataElement.dataset.handlerUrl) {
                        // We have a direct handler URL
                        $.ajax({
                            type: "POST",
                            url: dataElement.dataset.handlerUrl,
                            data: JSON.stringify(data),
                            success: function(response) {
                                console.log(`[SCRIBBLE] Saved annotations to server for block ${blockId}`);
                            },
                            error: function(jqXHR) {
                                console.error(`[SCRIBBLE] Error saving annotations for block ${blockId}:`, jqXHR.responseText);
                            }
                        });
                        return;
                    }

                    // Fallback to global methods
                    if (typeof window.saveAnnotations === 'function') {
                        window.saveAnnotations(blockId, data);
                    } else if (typeof $.fn.saveAnnotations === 'function') {
                        $(block).saveAnnotations(data);
                    } else {
                        console.error(`[SCRIBBLE INIT] No saveAnnotations function available for block ${blockId}`);
                    }
                },
                color: '#FF0000', // Default to red
                width: 5,
                saveIntervalTime: 10000, // Save every 10 seconds
                documentInfo: {
                    // Add document metadata if available
                    filename: block ? block.getAttribute('data-document-filename') : null,
                    pages: block ? parseInt(block.getAttribute('data-document-pages'), 10) || 1 : 1
                }
            };

            if (block) {
                // Create new instance
                scribbleInstance = new PdfxScribble(block, scribbleOptions);

                // Initialize with fabric canvas
                if (fabricCanvas) {
                    scribbleInstance.init(fabricCanvas);
                }

                // Make available globally
                window[`scribbleInstance_${blockId}`] = scribbleInstance;
                console.log(`[SCRIBBLE INIT] Created and initialized new scribble instance for block ${blockId}`);

                // If marker strokes data is available, load it
                if (serverData && typeof serverData === 'object' &&
                    (serverData.markerStrokes || Object.keys(serverData).length > 0)) {
                    console.log(`[SCRIBBLE INIT] Loading server marker strokes data for block ${blockId}`, serverData);
                    if (typeof scribbleInstance.loadMarkerStrokes === 'function') {
                        scribbleInstance.loadMarkerStrokes(serverData);
                    } else {
                        console.error(`[SCRIBBLE INIT] loadMarkerStrokes function not available on scribble instance for ${blockId}`);
                    }
                } else {
                    console.log(`[SCRIBBLE INIT] No server data available for block ${blockId}, will use browser storage only`);
                }
            } else {
                console.error(`[SCRIBBLE INIT] Block element not found for ID ${blockId}`);
            }
        } else {
            console.log(`[SCRIBBLE INIT] Using existing scribble instance for block ${blockId}`);
            // Make sure it's initialized with the fabric canvas
            if (fabricCanvas && typeof scribbleInstance.init === 'function') {
                scribbleInstance.init(fabricCanvas);
            }

            // Also load server data if available, even for existing instances
            if (serverData && typeof serverData === 'object' &&
                (serverData.markerStrokes || Object.keys(serverData).length > 0)) {
                console.log(`[SCRIBBLE INIT] Loading server data for existing scribble instance for block ${blockId}`);
                if (typeof scribbleInstance.loadMarkerStrokes === 'function') {
                    scribbleInstance.loadMarkerStrokes(serverData);
                }
            }
        }

        return fabricCanvas;
    }

    /**
     * Check the status of the scribble tool
     * @param {string} blockId - The XBlock ID
     * @returns {Object} Status information
     */
    function checkScribbleToolStatus(blockId) {
        var status = {
            fabricLoaded: typeof fabric !== 'undefined',
            elements: {
                drawContainer: !!document.getElementById(`draw-container-${blockId}`),
                pdfContainer: !!document.getElementById(`pdf-container-${blockId}`),
                canvas: !!document.getElementById(`drawing-canvas-${blockId}`),
                scribbleButton: !!(document.getElementById(`scribble-tool-${blockId}`) ||
                                 document.getElementById(`marker-tool-${blockId}`))
            },
            fabricCanvas: {
                initialized: !!window[`fabricCanvas_${blockId}`]
            },
            scribbleInstance: {
                initialized: !!window[`scribbleInstance_${blockId}`]
            },
            toolsManager: {
                initialized: !!window[`toolsManager_${blockId}`]
            }
        };

        return status;
    }

    /**
     * Load fabric.js if not already available
     * @param {Function} callback - Function to call when loaded
     */
    function loadFabricJs(callback) {
        var script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js';
        script.onload = callback;
        document.head.appendChild(script);
    }

    // Expose global function to check tool status
    window.checkScribbleStatus = function(blockId) {
        // If no blockId provided, check all blocks
        if (!blockId) {
            var results = {};
            var pdfxBlocks = document.querySelectorAll('.pdfx_block');
            pdfxBlocks.forEach(function(block) {
                var id = block.id.replace('pdfx-block-', '');
                results[id] = checkScribbleToolStatus(id);
            });
            return results;
        }
        return checkScribbleToolStatus(blockId);
    };
})();