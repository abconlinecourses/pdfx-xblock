/**
 * PDF.js Modular Architecture
 *
 * This module defines the core structure for the PDF XBlock
 * with separate concerns and consistent tool handling.
 */

// Namespace for our PDF XBlock functionality
window.PDFX = window.PDFX || {};

// Utility functions that need to be globally accessible
window.resetPointerEvents = function(blockId) {
    // Ensure all tool buttons remain clickable
    var toolButtons = document.querySelectorAll(`[id$="-tool-${blockId}"]`);
    toolButtons.forEach(function(button) {
        button.style.pointerEvents = 'auto';
    });

    // Also make sure the toolbar container is clickable
    var toolbar = document.querySelector(`#toolbar-${blockId}`);
    if (toolbar) {
        toolbar.style.pointerEvents = 'auto';
    }
};

// Module: Core PDF functionality
PDFX.Core = {
    // Initialization functions
    init: function(blockId, options) {
        this.blockId = blockId;
        this.options = options || {};
        this.pdfDoc = null;
        this.currentPage = options.currentPage || 1;
        this.scale = 1.0;
        this.viewMode = 'fit-width';

        // Set debug mode from options or default to false
        this.debugMode = options.debugMode || false;

        this.log('Initializing PDF XBlock Core for ' + blockId);

        // Initialize PDF.js if needed
        this.initPDFJS();

        return this;
    },

    // Controlled logging function that respects debug mode
    log: function(message, force) {
        if (this.debugMode || force) {
        }
    },

    // Initialize PDF.js library and worker
    initPDFJS: function() {
        if (typeof pdfjsLib === 'undefined') {
            this.log('PDF.js library not loaded, attempting to load');
            // Attempt to load PDF.js
            return false;
        }

        // Set worker source if not already set
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs';
            this.log('Set PDF.js worker source to CDN');
        }

        return true;
    },

    // Load a PDF document
    loadDocument: function(url) {
        if (!url) {
            this.log('No PDF URL provided', true);
            return Promise.reject(new Error('No PDF URL provided'));
        }

        this.log('Loading PDF from: ' + url);

        if (!pdfjsLib) {
            return Promise.reject(new Error('PDF.js not loaded'));
        }

        return pdfjsLib.getDocument(url).promise
            .then(doc => {
                this.pdfDoc = doc;
                this.log('PDF loaded successfully with ' + doc.numPages + ' pages');
                return doc;
            })
            .catch(error => {
                this.log('Error loading PDF: ' + error.message, true);
                throw error;
            });
    },

    // Navigate to a specific page
    navigateToPage: function(pageNum) {
        if (!this.pdfDoc) {
            this.log('No PDF document loaded', true);
            return Promise.reject(new Error('No PDF document loaded'));
        }

        if (pageNum < 1 || pageNum > this.pdfDoc.numPages) {
            this.log('Page number out of range: ' + pageNum, true);
            return Promise.reject(new Error('Page number out of range'));
        }

        this.currentPage = pageNum;

        this.log('Navigating to page ' + pageNum);

        // Trigger page change event
        document.dispatchEvent(new CustomEvent('pdfx:pagechanged', {
            detail: {
                blockId: this.blockId,
                pageNum: pageNum
            }
        }));

        return this.renderCurrentPage();
    },

    // Render the current page
    renderCurrentPage: function() {
        return this.renderPage(this.currentPage);
    },

    // Render a specific page
    renderPage: function(pageNum) {
        if (!this.pdfDoc) {
            this.log('No PDF document loaded', true);
            return Promise.reject(new Error('No PDF document loaded'));
        }

        this.log('Rendering page ' + pageNum);

        return this.pdfDoc.getPage(pageNum)
            .then(page => {
                // Dispatch event for page rendering
                document.dispatchEvent(new CustomEvent('pdfx:beforerenderpage', {
                    detail: {
                        blockId: this.blockId,
                        page: page,
                        pageNum: pageNum
                    }
                }));

                return page;
            });
    }
};

// Module: Tool management
PDFX.Tools = {
    init: function(blockId, options) {
        this.blockId = blockId;
        this.options = options || {};
        this.activeToolName = null;
        this.toolInstances = {};
        this.debugMode = options.debugMode || false;

        this.log('Initializing Tools Manager for ' + blockId);

        // Set up tool click handlers
        this.setupToolButtons();

        return this;
    },

    log: function(message, force) {
        if (this.debugMode || force) {
        }
    },

    // Register a tool instance
    registerTool: function(toolName, instance) {
        this.toolInstances[toolName] = instance;
        this.log('Registered tool: ' + toolName);

        // Also store globally for backward compatibility
        window[`${toolName}Instance_${this.blockId}`] = instance;

        return instance;
    },

    // Get a tool instance by name
    getTool: function(toolName) {
        return this.toolInstances[toolName] || null;
    },

    // Activate a specific tool by name
    activateTool: function(toolName) {
        if (this.activeToolName === toolName) {
            this.log('Tool ' + toolName + ' already active');
            return true;
        }

        this.log('Activating tool: ' + toolName);

        // First deactivate any active tool
        if (this.activeToolName) {
            this.deactivateTool(this.activeToolName);
        }

        // Get tool instance
        const tool = this.getTool(toolName);

        if (!tool) {
            this.log('Tool not found: ' + toolName, true);
            return false;
        }

        // Call enable method if available
        if (typeof tool.enable === 'function') {
            tool.enable();
        } else if (typeof tool.activate === 'function') {
            tool.activate();
        } else {
            this.log('Tool has no enable/activate method: ' + toolName, true);
            return false;
        }

        // Update active tool
        this.activeToolName = toolName;

        // Update UI
        const button = document.getElementById(`${toolName}-tool-${this.blockId}`);
        if (button) {
            button.classList.add('active');
        }

        // Update draw container
        const drawContainer = document.getElementById(`draw-container-${this.blockId}`);
        if (drawContainer) {
            drawContainer.setAttribute('data-current-tool', toolName);
            drawContainer.style.pointerEvents = 'auto';
            drawContainer.classList.add('draw-mode');
        }

        // Make sure buttons remain clickable
        window.resetPointerEvents(this.blockId);

        // Dispatch event
        document.dispatchEvent(new CustomEvent('pdfx:toolactivated', {
            detail: {
                blockId: this.blockId,
                toolName: toolName
            }
        }));

        return true;
    },

    // Deactivate a specific tool by name
    deactivateTool: function(toolName) {
        this.log('Deactivating tool: ' + toolName);

        // Only deactivate if this is the active tool
        if (this.activeToolName !== toolName) {
            this.log('Tool not active: ' + toolName);
            return true;
        }

        // Get tool instance
        const tool = this.getTool(toolName);

        if (!tool) {
            this.log('Tool not found: ' + toolName, true);
            return false;
        }

        // Call disable method if available
        if (typeof tool.disable === 'function') {
            tool.disable();
        } else if (typeof tool.deactivate === 'function') {
            tool.deactivate();
        } else {
            this.log('Tool has no disable/deactivate method: ' + toolName, true);
        }

        // Clear active tool
        this.activeToolName = null;

        // Update UI
        const button = document.getElementById(`${toolName}-tool-${this.blockId}`);
        if (button) {
            button.classList.remove('active');
        }

        // Update draw container
        const drawContainer = document.getElementById(`draw-container-${this.blockId}`);
        if (drawContainer) {
            drawContainer.removeAttribute('data-current-tool');
            drawContainer.style.pointerEvents = 'none';
            drawContainer.classList.remove('draw-mode');
        }

        // Make sure buttons remain clickable
        window.resetPointerEvents(this.blockId);

        // Dispatch event
        document.dispatchEvent(new CustomEvent('pdfx:tooldeactivated', {
            detail: {
                blockId: this.blockId,
                toolName: toolName
            }
        }));

        return true;
    },

    // Setup event handlers for tool buttons
    setupToolButtons: function() {
        this.log('Setting up tool button handlers');

        const blockId = this.blockId;
        const toolsManager = this;

        // Define tool types to handle
        const toolTypes = [
            'marker', 'highlight', 'text', 'shape',
            'note', 'select', 'eraser', 'clear',
            'undo', 'redo'
        ];

        // Add click handler to each tool button
        toolTypes.forEach(function(toolType) {
            const button = document.getElementById(`${toolType}-tool-${blockId}`);

            if (!button) {
                return;
            }

            button.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();

                // Reset pointer events first to ensure buttons remain clickable
                window.resetPointerEvents(blockId);

                toolsManager.log(`Tool button clicked: ${toolType}`);

                // Toggle tool state
                if (button.classList.contains('active')) {
                    toolsManager.deactivateTool(toolType);
                } else {
                    toolsManager.activateTool(toolType);
                }
            });
        });

        // Set up color input handler
        const colorInput = document.getElementById(`color-input-${blockId}`);
        if (colorInput) {
            colorInput.addEventListener('change', function(event) {
                const color = event.target.value;
                toolsManager.log(`Color changed to ${color}`);

                // Update color for active tool
                if (toolsManager.activeToolName) {
                    const tool = toolsManager.getTool(toolsManager.activeToolName);
                    if (tool && typeof tool.setColor === 'function') {
                        tool.setColor(color);
                    }
                }
            });
        }
    },

    _activateMarkerTool: function() {
        const canvas = window.PDFX.getInstance(this.blockId).canvas;
        const fabricCanvas = canvas ? canvas.fabricCanvas : null;

        if (!fabricCanvas) {
            this.log('Fabric canvas not available for marker tool', true);
            return;
        }

        // Make sure the canvas container is properly sized
        if (typeof canvas.fixCanvasContainer === 'function') {
            canvas.fixCanvasContainer();
        }

        // Enable drawing mode
        fabricCanvas.isDrawingMode = true;

        // Configure brush
        if (fabricCanvas.freeDrawingBrush) {
            const colorInput = document.getElementById(`color-input-${this.blockId}`);
            fabricCanvas.freeDrawingBrush.color = colorInput ? colorInput.value : '#FF0000';
            fabricCanvas.freeDrawingBrush.width = 5;
            fabricCanvas.freeDrawingBrush.scribbleMode = true;
            fabricCanvas.freeDrawingBrush.markerMode = true;
        }

        // Enable canvas interaction
        if (typeof canvas.enableCanvasInteraction === 'function') {
            canvas.enableCanvasInteraction('crosshair');
        } else {
            // Fallback for older code
            if (fabricCanvas.upperCanvasEl) {
                fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                fabricCanvas.upperCanvasEl.style.cursor = 'crosshair';
            }

            const drawContainer = document.getElementById(`draw-container-${this.blockId}`);
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'auto';
                drawContainer.classList.add('draw-mode');
                drawContainer.style.cursor = 'crosshair';
            }
        }

        // Mark draw container with current tool
        const drawContainer = document.getElementById(`draw-container-${this.blockId}`);
        if (drawContainer) {
            drawContainer.setAttribute('data-current-tool', 'marker');
        }
    }
};

// Module: UI management
PDFX.UI = {
    init: function(blockId, options) {
        this.blockId = blockId;
        this.options = options || {};
        this.debugMode = options.debugMode || false;

        this.log('Initializing UI for ' + blockId);

        // Setup UI event handlers
        this.setupUI();

        return this;
    },

    log: function(message, force) {
        if (this.debugMode || force) {
        }
    },

    // Setup UI event handlers
    setupUI: function() {
        const blockId = this.blockId;
        const ui = this;

        // Page navigation
        const prevBtn = document.getElementById(`prev-page-${blockId}`);
        const nextBtn = document.getElementById(`next-page-${blockId}`);

        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                document.dispatchEvent(new CustomEvent('pdfx:prevpage', {
                    detail: { blockId: blockId }
                }));
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                document.dispatchEvent(new CustomEvent('pdfx:nextpage', {
                    detail: { blockId: blockId }
                }));
            });
        }

        // Zoom controls
        const zoomInBtn = document.getElementById(`zoom-in-${blockId}`);
        const zoomOutBtn = document.getElementById(`zoom-out-${blockId}`);

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', function() {
                document.dispatchEvent(new CustomEvent('pdfx:zoomin', {
                    detail: { blockId: blockId }
                }));
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', function() {
                document.dispatchEvent(new CustomEvent('pdfx:zoomout', {
                    detail: { blockId: blockId }
                }));
            });
        }

        // Fit to page/width
        const fitWidthBtn = document.getElementById(`fit-to-width-${blockId}`);
        const fitPageBtn = document.getElementById(`fit-to-page-${blockId}`);

        if (fitWidthBtn) {
            fitWidthBtn.addEventListener('click', function() {
                document.dispatchEvent(new CustomEvent('pdfx:fitwidth', {
                    detail: { blockId: blockId }
                }));
            });
        }

        if (fitPageBtn) {
            fitPageBtn.addEventListener('click', function() {
                document.dispatchEvent(new CustomEvent('pdfx:fitpage', {
                    detail: { blockId: blockId }
                }));
            });
        }

        // Fullscreen button
        const fullscreenBtn = document.getElementById(`fullscreen-btn-${blockId}`);

        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', function() {
                document.dispatchEvent(new CustomEvent('pdfx:togglefullscreen', {
                    detail: { blockId: blockId }
                }));
            });
        }
    },

    // Update page display
    updatePageDisplay: function(currentPage, totalPages) {
        const pageNumElement = document.getElementById(`page-num-${this.blockId}`);
        const totalPagesElement = document.getElementById(`page-count-${this.blockId}`);

        if (pageNumElement) {
            pageNumElement.textContent = currentPage;
        }

        if (totalPagesElement) {
            totalPagesElement.textContent = totalPages;
        }
    },

    // Update zoom display
    updateZoomDisplay: function(zoomLevel) {
        const zoomDisplay = document.getElementById(`zoom-level-${this.blockId}`);

        if (zoomDisplay) {
            zoomDisplay.textContent = Math.round(zoomLevel * 100) + '%';
        }
    }
};

// Module: Canvas and drawing management
PDFX.Canvas = {
    init: function(blockId, options) {
        this.blockId = blockId;
        this.options = options || {};
        this.fabricCanvas = null;
        this.debugMode = options.debugMode || false;

        this.log('Initializing Canvas Manager for ' + blockId);

        // Add window resize handler
        const self = this;
        window.addEventListener('resize', function() {
            self.log('Window resized, fixing canvas container');
            if (self.fabricCanvas) {
                // Delay slightly to ensure other elements have resized
                setTimeout(function() {
                    self.fixCanvasContainer();
                }, 100);
            }
        });

        return this;
    },

    log: function(message, force) {
        if (this.debugMode || force) {
        }
    },

    initFabricCanvas: function() {
        const canvasId = `drawing-canvas-${this.blockId}`;
        const drawContainer = document.getElementById(`draw-container-${this.blockId}`);

        if (!drawContainer) {
            this.log('Draw container not found', true);
            return null;
        }

        this.log('Initializing fabric canvas');

        // Create canvas if it doesn't exist
        let canvas = document.getElementById(canvasId);
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = canvasId;
            canvas.className = 'drawing-canvas';
            drawContainer.innerHTML = '';
            drawContainer.appendChild(canvas);
        }

        // Get dimensions from PDF container
        const pdfContainer = document.getElementById(`pdf-container-${this.blockId}`);
        if (!pdfContainer) {
            this.log('PDF container not found', true);
            return null;
        }

        // Initialize fabric canvas
        try {
            this.fabricCanvas = new fabric.Canvas(canvas, {
                isDrawingMode: false,
                selection: false
            });

            // Set initial dimensions
            const width = pdfContainer.offsetWidth;
            const height = pdfContainer.offsetHeight;
            this.fabricCanvas.setWidth(width);
            this.fabricCanvas.setHeight(height);

            // Store reference globally
            window[`fabricCanvas_${this.blockId}`] = this.fabricCanvas;

            // Initialize drawing brush
            if (!this.fabricCanvas.freeDrawingBrush) {
                this.fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(this.fabricCanvas);
            }

            // Set default brush properties
            this.fabricCanvas.freeDrawingBrush.width = 5;
            this.fabricCanvas.freeDrawingBrush.color = '#FF0000';

            // Fix canvas container after initialization
            this.fixCanvasContainer();

            this.log('Fabric canvas initialized');
            return this.fabricCanvas;
        } catch (error) {
            return null;
        }
    },

    // NEW FUNCTION: Fix canvas container size and position
    fixCanvasContainer: function() {
        if (!this.fabricCanvas) {
            this.log('No fabric canvas available', true);
            return;
        }

        this.log('Fixing canvas container position and size');

        // Get the canvas-container created by fabric.js
        const canvasContainer = document.querySelector(`#draw-container-${this.blockId} .canvas-container`);
        if (!canvasContainer) {
            this.log('Canvas container element not found', true);
            return;
        }

        // Get the PDF container dimensions
        const pdfContainer = document.getElementById(`pdf-container-${this.blockId}`);
        if (!pdfContainer) {
            this.log('PDF container not found', true);
            return;
        }

        const width = pdfContainer.offsetWidth;
        const height = pdfContainer.offsetHeight;

        // Apply sizing to canvas container
        canvasContainer.style.position = 'absolute';
        canvasContainer.style.top = '0';
        canvasContainer.style.left = '0';
        canvasContainer.style.width = width + 'px';
        canvasContainer.style.height = height + 'px';

        // Also fix the upper and lower canvas elements
        const upperCanvas = this.fabricCanvas.upperCanvasEl;
        const lowerCanvas = this.fabricCanvas.lowerCanvasEl;

        if (upperCanvas) {
            upperCanvas.style.position = 'absolute';
            upperCanvas.style.left = '0';
            upperCanvas.style.top = '0';
            upperCanvas.style.width = '100%';
            upperCanvas.style.height = '100%';
        }

        if (lowerCanvas) {
            lowerCanvas.style.position = 'absolute';
            lowerCanvas.style.left = '0';
            lowerCanvas.style.top = '0';
            lowerCanvas.style.width = '100%';
            lowerCanvas.style.height = '100%';
        }

        this.log(`Canvas container fixed to ${width}x${height}`);
    },

    resizeCanvas: function(width, height) {
        if (!this.fabricCanvas) {
            this.log('No fabric canvas available', true);
            return;
        }

        this.log(`Resizing canvas to ${width}x${height}`);

        // Update canvas dimensions
        this.fabricCanvas.setWidth(width);
        this.fabricCanvas.setHeight(height);

        // Fix the canvas container after resize
        this.fixCanvasContainer();
    }
};

// Module: Annotation storage and persistence
PDFX.Storage = {
    init: function(blockId, options) {
        this.blockId = blockId;
        this.options = options || {};
        this.debugMode = options.debugMode || false;
        this.saveQueue = [];
        this.isSaving = false;

        // Get handler URL from options or data element
        this.handlerUrl = options.handlerUrl || null;
        if (!this.handlerUrl) {
            const dataElement = document.getElementById(`pdfx-data-${blockId}`);
            if (dataElement) {
                this.handlerUrl = dataElement.dataset.handlerUrl || null;
            }
        }

        this.log('Initializing Storage for ' + blockId);
        this.log('Handler URL: ' + this.handlerUrl);

        return this;
    },

    log: function(message, force) {
        if (this.debugMode || force) {
        }
    },

    // Save annotations to server
    saveAnnotations: function(data) {
        if (!this.handlerUrl) {
            this.log('No handler URL available', true);
            return Promise.reject(new Error('No handler URL available'));
        }

        this.log('Saving annotations to server');

        // Add this save request to the queue
        return new Promise((resolve, reject) => {
            this.saveQueue.push({
                data: data,
                resolve: resolve,
                reject: reject
            });

            // Process the queue if we're not already saving
            if (!this.isSaving) {
                this.processSaveQueue();
            }
        });
    },

    // Process the save queue
    processSaveQueue: function() {
        if (this.saveQueue.length === 0 || this.isSaving) {
            return;
        }

        this.isSaving = true;
        const saveRequest = this.saveQueue.shift();

        this.log(`Processing save request, ${this.saveQueue.length} remaining in queue`);

        // Make sure we have valid data
        if (!saveRequest.data) {
            this.log('Invalid save data', true);
            saveRequest.reject(new Error('Invalid save data'));
            this.isSaving = false;
            this.processSaveQueue(); // Continue with the next request
            return;
        }

        // Use jQuery AJAX for better compatibility with XBlock
        $.ajax({
            url: this.handlerUrl,
            type: 'POST',
            data: JSON.stringify(saveRequest.data),
            contentType: 'application/json; charset=utf-8',
            dataType: 'json',
            success: (result) => {
                if (result.result !== 'success') {
                    this.log('Error saving annotations: ' + (result.message || 'Unknown error'), true);
                    saveRequest.reject(new Error(result.message || 'Unknown error'));
                } else {
                    this.log('Annotations saved successfully');
                    saveRequest.resolve(result);
                }

                // Continue with the next request
                this.isSaving = false;
                this.processSaveQueue();
            },
            error: (xhr, status, error) => {
                this.log('Error saving annotations: ' + error, true);
                saveRequest.reject(new Error(error));

                // Continue with the next request
                this.isSaving = false;
                this.processSaveQueue();
            }
        });
    },

    // Load annotations from server
    loadAnnotations: function() {
        if (!this.handlerUrl) {
            this.log('No handler URL available', true);
            return Promise.reject(new Error('No handler URL available'));
        }

        const getHandlerUrl = this.handlerUrl.replace('save_annotations', 'get_user_highlights');

        this.log('Loading annotations from server');

        return new Promise((resolve, reject) => {
            $.ajax({
                url: getHandlerUrl,
                type: 'POST',
                data: JSON.stringify({includeAll: this.options.isStaff || false}),
                contentType: 'application/json; charset=utf-8',
                dataType: 'json',
                success: (result) => {
                    if (result.result !== 'success') {
                        this.log('Error loading annotations: ' + (result.message || 'Unknown error'), true);
                        reject(new Error(result.message || 'Unknown error'));
                    } else {
                        this.log('Annotations loaded successfully');
                        resolve(result);
                    }
                },
                error: (xhr, status, error) => {
                    this.log('Error loading annotations: ' + error, true);
                    reject(new Error(error));
                }
            });
        });
    }
};

// Initialize a complete PDFX instance
PDFX.initInstance = function(blockId, options) {

    // Create instance container
    const instance = {
        blockId: blockId,
        options: options || {}
    };

    // Initialize all modules
    instance.core = PDFX.Core.init(blockId, options);
    instance.tools = PDFX.Tools.init(blockId, options);
    instance.ui = PDFX.UI.init(blockId, options);
    instance.canvas = PDFX.Canvas.init(blockId, options);
    instance.storage = PDFX.Storage.init(blockId, options);

    // Store instance globally
    window[`pdfxInstance_${blockId}`] = instance;

    return instance;
};

// Backward compatibility functions
window.activateToolByName = function(toolName, blockId) {
    const instance = window[`pdfxInstance_${blockId}`];
    if (instance && instance.tools) {
        return instance.tools.activateTool(toolName);
    }

    // Legacy fallback for backward compatibility
    const tool = window[`${toolName}Instance_${blockId}`];
    if (tool && typeof tool.enable === 'function') {
        tool.enable();
        return true;
    }

    return false;
};

window.deactivateToolByName = function(toolName, blockId) {
    const instance = window[`pdfxInstance_${blockId}`];
    if (instance && instance.tools) {
        return instance.tools.deactivateTool(toolName);
    }

    // Legacy fallback for backward compatibility
    const tool = window[`${toolName}Instance_${blockId}`];
    if (tool && typeof tool.disable === 'function') {
        tool.disable();
        return true;
    }

    return false;
};