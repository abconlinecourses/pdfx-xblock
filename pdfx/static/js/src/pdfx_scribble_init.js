/**
 * PDF XBlock - Scribble Tool Initialization
 *
 * This module ensures the scribble tool is properly initialized.
 * It replaces the previous direct fix approach with a reliable,
 * clean initialization for the scribble tool.
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
        // Find the scribble tool button
        var scribbleBtn = document.getElementById(`scribble-tool-${blockId}`);

        // If scribble button doesn't exist, check for legacy marker button
        if (!scribbleBtn) {
            scribbleBtn = document.getElementById(`marker-tool-${blockId}`);
        }

        if (!scribbleBtn) {
            return;
        }

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

        // Attach click handler if not already present
        if (!scribbleBtn._hasScribbleClickHandler) {
            scribbleBtn.addEventListener('click', function() {
                ensureScribbleToolActive(blockId);
            });
            scribbleBtn._hasScribbleClickHandler = true;
        }

        // Initialize scribble instance even if not active yet
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
        var drawContainer = document.getElementById(`draw-container-${blockId}`);
        var pdfContainer = document.getElementById(`pdf-container-${blockId}`);

        if (!drawContainer || !pdfContainer) {
            console.warn(`[SCRIBBLE INIT] Cannot initialize scribble for block ${blockId} - missing containers`);
            return;
        }

        // Ensure fabric.js is loaded
        if (typeof fabric === 'undefined') {
            loadFabricJs(function() {
                // Make another attempt after loading fabric
                console.log('[SCRIBBLE INIT] Fabric.js loaded, initializing scribble');
                initScribbleInstance(blockId, serverData);
            });
            return;
        }

        // Get user and course info from the data element
        var dataElement = document.getElementById(`pdfx-data-${blockId}`);

        // Debug the data element to ensure it has everything we need
        validateDataElement(dataElement, blockId);

        var userId = (dataElement && dataElement.dataset.userId) || 'anonymous';
        var courseId = (dataElement && dataElement.dataset.courseId) || null;
        var documentInfo = (dataElement && dataElement.dataset.documentInfo) ?
            JSON.parse(dataElement.dataset.documentInfo) :
            { title: 'PDF Document' };

        // Create canvas if needed
        var canvas = document.getElementById(`drawing-canvas-${blockId}`);
        if (!canvas) {
            console.log(`[SCRIBBLE INIT] Creating new canvas for block ${blockId}`);
            canvas = document.createElement('canvas');
            canvas.id = `drawing-canvas-${blockId}`;
            canvas.width = pdfContainer.offsetWidth;
            canvas.height = pdfContainer.offsetHeight;
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            drawContainer.appendChild(canvas);
        }

        // Destroy existing fabric canvas if it exists to avoid conflicts
        if (window[`fabricCanvas_${blockId}`]) {
            console.log(`[SCRIBBLE INIT] Disposing existing fabric canvas for block ${blockId}`);
            try {
                window[`fabricCanvas_${blockId}`].dispose();
            } catch (e) {
                console.error('[SCRIBBLE INIT] Error disposing fabric canvas:', e);
            }
        }

        // Create fresh fabric canvas
        console.log(`[SCRIBBLE INIT] Creating new fabric canvas for block ${blockId}`);
        var fabricCanvas = new fabric.Canvas(canvas, {
            isDrawingMode: false,  // Start with drawing mode off
            selection: false,
            renderOnAddRemove: true,
            stateful: true
        });

        // Store canvas reference
        window[`fabricCanvas_${blockId}`] = fabricCanvas;

        // Configure brush for later use
        if (!fabricCanvas.freeDrawingBrush) {
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        }

        // Force fabric.js to calculate offsets correctly
        fabricCanvas.calcOffset();

        // Set pointer events to none initially - drawing tools should be disabled by default
        fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
        if (drawContainer) {
            drawContainer.style.pointerEvents = 'none';
            drawContainer.classList.remove('draw-mode');
        }

        // Create scribble instance if not already exists
        if (!window[`scribbleInstance_${blockId}`]) {
            // Create save callback function
            var saveCallback = function(data) {
                console.log(`[SCRIBBLE INIT][DEBUG] saveCallback invoked for block ${blockId} at ${new Date().toISOString()}`);

                try {
                    // Get the handler URL from the data element
                    var handlerUrl = dataElement.dataset.handlerUrl;

                    if (!handlerUrl) {
                        console.error('[SCRIBBLE INIT][DEBUG] No handler URL found in dataElement.dataset:', dataElement.dataset);
                        console.error('[SCRIBBLE INIT][DEBUG] Cannot save to server - missing handler URL');
                        return;
                    }

                    console.log(`[SCRIBBLE INIT][DEBUG] Handler URL found: ${handlerUrl}`);

                    // Prepare data for server - make sure it's properly formatted
                    var serverData = {
                        markerStrokes: data.scribbleStrokes || {},
                        currentPage: data.currentPage || 1,
                        userId: data.userId || 'anonymous',
                        courseId: data.courseId || null,
                        blockId: data.blockId || blockId
                    };

                    // Debug log for data being sent
                    var dataStats = {
                        pageCount: Object.keys(serverData.markerStrokes).length,
                        userId: serverData.userId,
                        courseId: serverData.courseId,
                        blockId: serverData.blockId,
                        currentPage: serverData.currentPage,
                        dataSize: JSON.stringify(serverData).length
                    };

                    console.log('[SCRIBBLE INIT][DEBUG] Sending data to server:', dataStats);

                    // Use Open edX's standard way to make AJAX requests
                    // This is more reliable than fetch API in the Open edX environment
                    $.ajax({
                        type: 'POST',
                        url: handlerUrl,
                        data: JSON.stringify(serverData),
                        contentType: 'application/json; charset=utf-8',
                        dataType: 'json',
                        success: function(response) {
                            console.log('[SCRIBBLE INIT][DEBUG] Server save successful:', response);
                        },
                        error: function(jqXHR, textStatus, errorThrown) {
                            console.error('[SCRIBBLE INIT][DEBUG] Server save failed:', {
                                status: jqXHR.status,
                                statusText: jqXHR.statusText,
                                textStatus: textStatus,
                                errorThrown: errorThrown,
                                responseText: jqXHR.responseText ? jqXHR.responseText.substring(0, 500) : '(none)'
                            });

                            // Try to fetch CSRF token in case that's the issue
                            var csrfToken = getCsrfToken();
                            console.log('[SCRIBBLE INIT][DEBUG] CSRF token found:', csrfToken ? 'Yes (length:' + csrfToken.length + ')' : 'No');

                            // Retry with explicit CSRF token
                            if (csrfToken) {
                                console.log('[SCRIBBLE INIT][DEBUG] Retrying with explicit CSRF token');
                                $.ajax({
                                    type: 'POST',
                                    url: handlerUrl,
                                    data: JSON.stringify(serverData),
                                    contentType: 'application/json; charset=utf-8',
                                    dataType: 'json',
                                    headers: {
                                        'X-CSRFToken': csrfToken
                                    },
                                    success: function(response) {
                                        console.log('[SCRIBBLE INIT][DEBUG] Retry with CSRF successful:', response);
                                    },
                                    error: function(retryXHR, retryStatus, retryError) {
                                        console.error('[SCRIBBLE INIT][DEBUG] Retry with CSRF also failed:', {
                                            status: retryXHR.status,
                                            statusText: retryXHR.statusText
                                        });
                                    }
                                });
                            }
                        }
                    });
                } catch (e) {
                    console.error('[SCRIBBLE INIT][DEBUG] Error in save callback:', e);
                    console.error('[SCRIBBLE INIT][DEBUG] Error stack:', e.stack);
                }
            };

            // Create debug callback function
            var debugCallback = function(message) {
                console.log(`[SCRIBBLE DEBUG] [${blockId}] ${message}`);
            };

            // Create scribble instance with all necessary parameters
            console.log(`[SCRIBBLE INIT] Creating new scribble instance for block ${blockId}`);
            var scribbleInstance = new PdfxScribble(document.getElementById(`pdfx-block-${blockId}`), {
                blockId: blockId,
                userId: userId,
                courseId: courseId,
                documentInfo: documentInfo,
                color: '#FF0000',
                width: 5,
                saveIntervalTime: 10000, // 10 seconds
                saveCallback: saveCallback,
                debugCallback: debugCallback
            });

            // Initialize with fabric canvas
            scribbleInstance.init(fabricCanvas);

            // Store instance in window for access
            window[`scribbleInstance_${blockId}`] = scribbleInstance;

            console.log(`[SCRIBBLE INIT] Created scribble instance for block ${blockId}`);

            // Load server data if available
            if (serverData && Object.keys(serverData).length > 0) {
                console.log(`[SCRIBBLE INIT] Loading server data for block ${blockId}`, serverData);
                scribbleInstance.loadScribbleStrokes(serverData);
            } else {
                console.log(`[SCRIBBLE INIT] No server data found for block ${blockId}`);
            }

            // Handle page changes
            var pageSelector = document.getElementById(`page-selector-${blockId}`);
            if (pageSelector) {
                pageSelector.addEventListener('change', function() {
                    var newPage = parseInt(this.value, 10);
                    if (!isNaN(newPage)) {
                        console.log(`[SCRIBBLE INIT] Page changed via selector to ${newPage}`);
                        scribbleInstance.setCurrentPage(newPage);
                    }
                });
            }

            // Also look for the standard navigation buttons
            var prevButton = document.getElementById(`prev-page-${blockId}`);
            var nextButton = document.getElementById(`next-page-${blockId}`);

            if (prevButton) {
                prevButton.addEventListener('click', function() {
                    // Get current page from navigation element
                    var pageDisplay = document.getElementById(`current-page-${blockId}`);
                    if (pageDisplay) {
                        var currentPage = parseInt(pageDisplay.textContent, 10);
                        if (!isNaN(currentPage) && currentPage > 1) {
                            console.log(`[SCRIBBLE INIT] Page changed via prev button to ${currentPage-1}`);
                            scribbleInstance.setCurrentPage(currentPage - 1);
                        }
                    }
                });
            }

            if (nextButton) {
                nextButton.addEventListener('click', function() {
                    // Get current page from navigation element
                    var pageDisplay = document.getElementById(`current-page-${blockId}`);
                    if (pageDisplay) {
                        var currentPage = parseInt(pageDisplay.textContent, 10);
                        if (!isNaN(currentPage)) {
                            console.log(`[SCRIBBLE INIT] Page changed via next button to ${currentPage+1}`);
                            scribbleInstance.setCurrentPage(currentPage + 1);
                        }
                    }
                });
            }

            // Add a custom event listener for page changes
            window.addEventListener('pdfx:pageChanged', function(e) {
                if (e.detail && e.detail.blockId === blockId && e.detail.page) {
                    console.log(`[SCRIBBLE INIT] Page changed via custom event to ${e.detail.page}`);
                    scribbleInstance.setCurrentPage(e.detail.page);
                }
            });
        }
    }

    /**
     * Validate that the data element has all required properties
     * @param {HTMLElement} dataElement - The data element to check
     * @param {string} blockId - The XBlock ID
     */
    function validateDataElement(dataElement, blockId) {
        console.log(`[SCRIBBLE INIT][DEBUG] Validating data element for block ${blockId}`);

        if (!dataElement) {
            console.error(`[SCRIBBLE INIT][DEBUG] Data element not found for block ${blockId}`);
            return;
        }

        // Check all required attributes
        var requiredAttributes = ['handlerUrl', 'userId', 'courseId'];
        var missingAttributes = [];
        var foundAttributes = {};

        for (var attr of requiredAttributes) {
            if (dataElement.dataset[attr]) {
                foundAttributes[attr] = dataElement.dataset[attr];
            } else {
                missingAttributes.push(attr);
            }
        }

        // Log results
        console.log(`[SCRIBBLE INIT][DEBUG] Data element validation results:`, {
            element: dataElement,
            dataset: dataElement.dataset,
            foundAttributes: foundAttributes,
            missingAttributes: missingAttributes
        });

        // Important check: Is the handler URL correct?
        if (dataElement.dataset.handlerUrl) {
            console.log(`[SCRIBBLE INIT][DEBUG] Handler URL: ${dataElement.dataset.handlerUrl}`);

            // Check handler URL format
            if (dataElement.dataset.handlerUrl.indexOf('/handler/save_annotations') === -1) {
                console.warn(`[SCRIBBLE INIT][DEBUG] Handler URL may be incorrect, doesn't contain expected pattern: ${dataElement.dataset.handlerUrl}`);
            }
        } else {
            console.error(`[SCRIBBLE INIT][DEBUG] Missing critical handler URL for block ${blockId}`);
        }
    }

    /**
     * Ensure scribble tool is active and working properly
     * @param {string} blockId - The XBlock ID
     */
    function ensureScribbleToolActive(blockId) {
        // Find necessary elements
        var drawContainer = document.getElementById(`draw-container-${blockId}`);
        var pdfContainer = document.getElementById(`pdf-container-${blockId}`);

        if (!drawContainer || !pdfContainer) {
            return;
        }

        // Ensure fabric.js is loaded
        if (typeof fabric === 'undefined') {
            // Load fabric.js if not available
            loadFabricJs(function() {
                ensureScribbleToolActive(blockId);
            });
            return;
        }

        // Configure draw container
        drawContainer.style.position = 'absolute';
        drawContainer.style.top = '0';
        drawContainer.style.left = '0';
        drawContainer.style.width = '100%';
        drawContainer.style.height = '100%';
        drawContainer.style.zIndex = '30';
        drawContainer.style.pointerEvents = 'auto';
        drawContainer.classList.add('draw-mode');
        drawContainer.dataset.currentTool = 'scribble';

        // Create or get the canvas
        var canvas = document.getElementById(`drawing-canvas-${blockId}`);
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = `drawing-canvas-${blockId}`;
            canvas.width = pdfContainer.offsetWidth;
            canvas.height = pdfContainer.offsetHeight;
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            drawContainer.appendChild(canvas);
        }

        // Initialize fabric canvas
        var fabricCanvas = window[`fabricCanvas_${blockId}`];
        if (!fabricCanvas) {
            fabricCanvas = new fabric.Canvas(canvas, {
                isDrawingMode: true,
                selection: false
            });

            // Store canvas reference
            window[`fabricCanvas_${blockId}`] = fabricCanvas;
        }

        // Configure brush
        fabricCanvas.isDrawingMode = true;
        if (!fabricCanvas.freeDrawingBrush) {
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        }
        fabricCanvas.freeDrawingBrush.color = '#FF0000';
        fabricCanvas.freeDrawingBrush.width = 5;
        fabricCanvas.freeDrawingBrush.scribbleMode = true;

        // Ensure upper canvas has correct pointer events
        if (fabricCanvas.upperCanvasEl) {
            fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
        }

        // Set active state on scribble button
        var scribbleBtn = document.getElementById(`scribble-tool-${blockId}`) ||
                         document.getElementById(`marker-tool-${blockId}`);
        if (scribbleBtn) {
            scribbleBtn.classList.add('active');
        }

        // Enable scribble in the instance if exists
        var scribbleInstance = window[`scribbleInstance_${blockId}`];
        if (scribbleInstance) {
            scribbleInstance.enable();
        }

        return true;
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

    /**
     * Get CSRF token from cookies
     * @returns {string} CSRF token
     */
    function getCsrfToken() {
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i].trim();
            if (cookie.indexOf('csrftoken=') === 0) {
                return cookie.substring('csrftoken='.length, cookie.length);
            }
        }
        return '';
    }

    // Expose global function to manually initialize a specific block
    window.initScribbleTool = function(blockId) {
        // If no blockId provided, get the first block
        if (!blockId) {
            var pdfxBlocks = document.querySelectorAll('.pdfx_block');
            if (pdfxBlocks.length > 0) {
                blockId = pdfxBlocks[0].id.replace('pdfx-block-', '');
            } else {
                return false;
            }
        }

        return ensureScribbleToolActive(blockId);
    };
})();