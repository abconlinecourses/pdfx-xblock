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
        // Get any data passed from the backend
        var dataElement = document.getElementById(`pdfx-data-${blockId}`);
        var scribbleData = {};

        if (dataElement && dataElement.dataset.markerStrokes) {
            try {
                scribbleData = JSON.parse(dataElement.dataset.markerStrokes);
            } catch (e) {
                // Silently continue with empty data
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
        console.debug(`[PdfX Debug] Initializing scribble instance for block ${blockId}`);

        var block = document.getElementById(`pdfx-block-${blockId}`);
        var pdfContainer = document.getElementById(`pdf-container-${blockId}`);
        var drawContainer = document.getElementById(`draw-container-${blockId}`);
        var dataElement = document.getElementById(`pdfx-data-${blockId}`);

        if (!block || !pdfContainer || !drawContainer) {
            console.error(`[PdfX Debug] Missing required elements for block ${blockId}`);
            return null;
        }

        // Log the data we received
        console.debug(`[PdfX Debug] Server data provided to scribble init:`, serverData);
        console.debug(`[PdfX Debug] PDF Container dimensions: ${pdfContainer.offsetWidth}x${pdfContainer.offsetHeight}`);

        // Use our emergency canvas fixing function if available
        if (typeof window.emergencyFixCanvasContainer === 'function') {
            console.debug(`[PdfX Debug] Running emergency canvas fix for block ${blockId}`);
            window.emergencyFixCanvasContainer(blockId);
        }

        // Get the actual PDF container dimensions
        var containerWidth = pdfContainer.offsetWidth;
        var containerHeight = pdfContainer.offsetHeight;

        console.debug(`[PdfX Debug] Container dimensions: ${containerWidth}x${containerHeight}`);

        // Create a canvas if it doesn't exist
        var canvas = document.getElementById(`drawing-canvas-${blockId}`);
        var canvasCreated = false;

        if (!canvas) {
            console.debug(`[PdfX Debug] Creating new canvas for block ${blockId}`);
            canvasCreated = true;
            canvas = document.createElement('canvas');
            canvas.id = `drawing-canvas-${blockId}`;

            // Use the exact dimensions of the PDF container
            canvas.width = containerWidth;
            canvas.height = containerHeight;

            drawContainer.innerHTML = '';
            drawContainer.appendChild(canvas);

            // Set dimensions on the draw container itself
            drawContainer.style.width = containerWidth + 'px';
            drawContainer.style.height = containerHeight + 'px';
        } else {
            console.debug(`[PdfX Debug] Canvas already exists for block ${blockId}, dimensions: ${canvas.width}x${canvas.height}`);
        }

        // Create fabric canvas - use our helper if available
        var fabricCanvas = null;
        if (typeof window.ensureFabricCanvas === 'function') {
            console.debug(`[PdfX Debug] Using ensureFabricCanvas helper for block ${blockId}`);
            fabricCanvas = window.ensureFabricCanvas(blockId);
        }

        // Fallback to manual creation if the helper failed
        if (!fabricCanvas) {
            try {
                console.debug(`[PdfX Debug] Creating fabric canvas manually for block ${blockId}`);
                fabricCanvas = new fabric.Canvas(canvas, {
                    isDrawingMode: false,
                    selection: false,
                    width: containerWidth,
                    height: containerHeight
                });

                // Set correct dimensions immediately
                fabricCanvas.setWidth(containerWidth);
                fabricCanvas.setHeight(containerHeight);

                // Fix canvas container size
                fixCanvasContainer(fabricCanvas, pdfContainer);

                // Store reference globally
                window[`fabricCanvas_${blockId}`] = fabricCanvas;

                // Initialize brush
                if (!fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
                }
                fabricCanvas.freeDrawingBrush.width = 5;
                fabricCanvas.freeDrawingBrush.color = '#FF0000';

                console.debug(`[PdfX Debug] Fabric canvas created with dimensions ${fabricCanvas.width}x${fabricCanvas.height}`);
            } catch (error) {
                console.error(`[PdfX Debug] Failed to create fabric canvas: ${error.message}`);
                return null;
            }
        }

        // Create scribble instance
        try {
            // Get user data
            var userId = block.getAttribute('data-user-id') || 'anonymous';
            var courseId = block.getAttribute('data-course-id') || '';

            // Get handler URL
            var handlerUrl = '';
            if (dataElement && dataElement.dataset.handlerUrl) {
                handlerUrl = dataElement.dataset.handlerUrl;
            }

            console.debug(`[PdfX Debug] Creating scribble instance with user ${userId}, course ${courseId}`);

            // Create options - always enable debug mode
            var scribbleOptions = {
                blockId: blockId,
                userId: userId,
                courseId: courseId,
                color: '#FF0000',
                width: 5,
                saveInterval: 10000, // Save every 10 seconds
                defaultMode: 'marker',
                handlerUrl: handlerUrl,
                debug: true  // Enable debug mode
            };

            // Create scribble instance
            var scribbleInstance = new PdfxScribble(block, scribbleOptions);

            // Pre-apply canvas fix before initialization
            if (typeof window.emergencyFixCanvasContainer === 'function') {
                window.emergencyFixCanvasContainer(blockId);
            }

            // Initialize the scribble instance
            console.debug(`[PdfX Debug] Initializing scribble instance for block ${blockId}`);
            scribbleInstance.init(fabricCanvas);

            // Store the instance globally for access by canvas fixing utilities
            window[`scribbleInstance_${blockId}`] = scribbleInstance;

            // Register with our central registry if available
            if (typeof window.registerPdfxScribbleInstance === 'function') {
                window.registerPdfxScribbleInstance(blockId, scribbleInstance);
            }

            // Process server data if available
            if (serverData && typeof serverData === 'object') {
                console.debug(`[PdfX Debug] Processing server data, keys: ${Object.keys(serverData).join(', ')}`);

                // If we have marker strokes data, load it
                if (serverData.markerStrokes) {
                    let allStrokes = {};

                    // First, apply canvas fix to ensure proper dimensions
                    if (typeof window.emergencyFixCanvasContainer === 'function') {
                        window.emergencyFixCanvasContainer(blockId);
                    }

                    // Log number of pages in marker strokes
                    console.debug(`[PdfX Debug] Server data contains marker strokes with keys: ${Object.keys(serverData.markerStrokes).join(', ')}`);

                    // Process the marker strokes - ensure they're organized by page
                    Object.keys(serverData.markerStrokes).forEach(key => {
                        // Skip metadata fields
                        if (key === '_last_saved' || key === 'strokeCount' || key === '_lastSynced') {
                            return;
                        }

                        // Convert page key to number if it's a string
                        const pageNum = parseInt(key, 10);

                        // If it's a valid page number and the strokes are an array
                        if (!isNaN(pageNum) && Array.isArray(serverData.markerStrokes[key])) {
                            console.debug(`[PdfX Debug] Processing ${serverData.markerStrokes[key].length} strokes for page ${pageNum}`);

                            if (!allStrokes[pageNum]) {
                                allStrokes[pageNum] = [];
                            }

                            // Add each stroke, ensuring it has the page number
                            serverData.markerStrokes[key].forEach(stroke => {
                                // Make sure stroke has the page number as an integer
                                stroke.page = parseInt(pageNum, 10);

                                // Add additional metadata if missing
                                if (!stroke.blockId) stroke.blockId = blockId;
                                if (!stroke.userId) stroke.userId = userId;
                                if (!stroke.courseId) stroke.courseId = courseId;

                                // Ensure stroke color properties
                                if (!stroke.stroke) {
                                    stroke.stroke = '#FF0000'; // Default red
                                }

                                // Ensure stroke width
                                if (!stroke.strokeWidth || stroke.strokeWidth < 1) {
                                    stroke.strokeWidth = 3;
                                }

                                allStrokes[pageNum].push(stroke);
                            });

                            console.debug(`[PdfX Debug] Added ${allStrokes[pageNum].length} strokes for page ${pageNum}`);
                        }
                    });

                    // Check if we have any strokes to render
                    const totalStrokeCount = Object.values(allStrokes).reduce((sum, arr) => sum + arr.length, 0);
                    console.debug(`[PdfX Debug] Total strokes to be rendered: ${totalStrokeCount} across ${Object.keys(allStrokes).length} pages`);

                    if (totalStrokeCount > 0) {
                        // Before setting strokes, ensure canvas dimensions are correct
                        console.debug(`[PdfX Debug] Fixing canvas size before loading strokes`);
                        if (scribbleInstance.fixCanvasSizeBeforeLoading) {
                            scribbleInstance.fixCanvasSizeBeforeLoading();
                        }
                        if (typeof window.emergencyFixCanvasContainer === 'function') {
                            window.emergencyFixCanvasContainer(blockId);
                        }

                        // Set the strokes in the scribble instance
                        console.debug(`[PdfX Debug] Setting all strokes in scribble instance`);
                        scribbleInstance.setAllStrokes(allStrokes);

                        // Get and render the current page
                        const currentPage = getCurrentPageNumber(blockId);
                        console.debug(`[PdfX Debug] Setting current page to ${currentPage}`);
                        scribbleInstance.setCurrentPage(currentPage);

                        // Apply force visibility to ensure strokes are visible
                        setTimeout(() => {
                            console.debug(`[PdfX Debug] Forcing stroke visibility after delay`);
                            if (typeof scribbleInstance.forceStrokesVisibility === 'function') {
                                scribbleInstance.forceStrokesVisibility('#FF0000', 5);
                            }

                            // Check if strokes are actually visible
                            const objects = fabricCanvas ? fabricCanvas.getObjects() : [];
                            console.debug(`[PdfX Debug] Canvas has ${objects.length} objects after forcing visibility`);

                            // If still no objects, try rendering again with more aggressive settings
                            if (objects.length === 0 && allStrokes[currentPage] && allStrokes[currentPage].length > 0) {
                                console.warn(`[PdfX Debug] Still no visible objects on canvas despite forcing visibility, applying emergency fixes`);

                                // Fix canvas size again
                                window.emergencyFixCanvasContainer(blockId);

                                // Re-render with a delay
                                setTimeout(() => {
                                    scribbleInstance.renderPage(currentPage);
                                }, 200);
                            }
                        }, 1000);
                    } else {
                        console.debug(`[PdfX Debug] No strokes to render from server data`);
                    }
                } else {
                    console.debug(`[PdfX Debug] No markerStrokes found in server data`);
                }
            } else {
                console.debug(`[PdfX Debug] No server data provided or invalid format`);
            }

            // Add debug controls to the UI if debug mode is on
            if (scribbleInstance.debug && typeof scribbleInstance.addDebugControls === 'function') {
                scribbleInstance.addDebugControls();
            }

            console.debug(`[PdfX Debug] Scribble instance initialization complete for block ${blockId}`);

            // Return the instance
            return scribbleInstance;
        } catch (error) {
            console.error(`[PdfX Debug] Error initializing scribble instance: ${error.message}`);
            return null;
        }
    }

    /**
     * Fix the canvas container size to match the PDF container
     * This addresses the issue where canvas-container is not sized correctly
     */
    function fixCanvasContainer(fabricCanvas, pdfContainer) {
        if (!fabricCanvas || !pdfContainer) {
            return;
        }

        try {
            const width = pdfContainer.offsetWidth;
            const height = pdfContainer.offsetHeight;

            // Set canvas dimensions
            fabricCanvas.setWidth(width);
            fabricCanvas.setHeight(height);

            // Fix the canvas container dimensions
            const canvasContainer = fabricCanvas.wrapperEl;
            if (canvasContainer) {
                // Apply all possible dimension properties to ensure correct sizing
                canvasContainer.style.width = width + 'px';
                canvasContainer.style.height = height + 'px';
                canvasContainer.style.minWidth = width + 'px';
                canvasContainer.style.minHeight = height + 'px';
                canvasContainer.style.maxWidth = width + 'px';
                canvasContainer.style.maxHeight = height + 'px';

                // Set attributes as well
                canvasContainer.setAttribute('width', width);
                canvasContainer.setAttribute('height', height);
            }

            // Fix both lower and upper canvas dimensions
            if (fabricCanvas.lowerCanvasEl) {
                fabricCanvas.lowerCanvasEl.width = width;
                fabricCanvas.lowerCanvasEl.height = height;
                fabricCanvas.lowerCanvasEl.style.width = width + 'px';
                fabricCanvas.lowerCanvasEl.style.height = height + 'px';
            }

            if (fabricCanvas.upperCanvasEl) {
                fabricCanvas.upperCanvasEl.width = width;
                fabricCanvas.upperCanvasEl.height = height;
                fabricCanvas.upperCanvasEl.style.width = width + 'px';
                fabricCanvas.upperCanvasEl.style.height = height + 'px';
            }

            // Also apply to the draw container
            const blockId = pdfContainer.id.replace('pdf-container-', '');
            const drawContainer = document.getElementById(`draw-container-${blockId}`);
            if (drawContainer) {
                drawContainer.style.width = width + 'px';
                drawContainer.style.height = height + 'px';
            }
        } catch (error) {
            // Silently fail
        }
    }

    // Add method to PdfxScribble prototype for fixing canvas container
    PdfxScribble.prototype.fixCanvasContainer = function() {
        if (this.canvas && this.blockId) {
            const pdfContainer = document.getElementById(`pdf-container-${this.blockId}`);
            if (pdfContainer) {
                fixCanvasContainer(this.canvas, pdfContainer);
            }
        }
    };

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

    /**
     * Get the current page number
     */
    function getCurrentPageNumber(blockId) {
        // Try to get current page from page display
        const pageNumElement = document.getElementById(`page-num-${blockId}`);
        if (pageNumElement) {
            return parseInt(pageNumElement.textContent, 10) || 1;
        }
        return 1;
    }
})();