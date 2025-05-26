/**
 * PDF.js Modular Architecture
 *
 * This module defines the core structure for the PDF XBlock
 * with separate concerns and consistent tool handling.
 */

// Namespace for our PDF XBlock functionality
window.PDFX = window.PDFX || {};

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
            console.debug(`[PDFX Core] ${message}`);
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

        console.log(`[PDFX Tools] Initializing Tools Manager for ${blockId}`);

        // Register built-in tools
        this.registerBuiltInTools();

        // Set up tool click handlers
        this.setupToolButtons();

        // Register global activation/deactivation methods for this block ID
        this.registerGlobalHelpers();

        return this;
    },

    log: function(message, force) {
        if (this.debugMode || force) {
            console.debug(`[PDFX Tools] ${message}`);
        }
    },

    // Register basic built-in tools
    registerBuiltInTools: function() {
        console.log(`[PDFX Tools] Registering built-in tools for block ${this.blockId}`);

        // Get the instance to access other modules
        const instance = PDFX.getInstance(this.blockId);

        // Register marker tool
        this.registerTool('marker', {
            enable: () => {
                console.log('[PDFX Tools] Enabling marker tool');

                // If we have a Scribble module, use that
                if (instance && instance.scribble) {
                    console.log('[PDFX Tools] Using Scribble module for marker tool');

                    // Check if scribble has enable method
                    if (typeof instance.scribble.enable === 'function') {
                        return instance.scribble.enable();
                    }
                }

                // Check for global scribble instance
                const scribbleInstance = window[`scribbleInstance_${this.blockId}`];
                if (scribbleInstance && typeof scribbleInstance.enable === 'function') {
                    console.log('[PDFX Tools] Using global scribble instance');
                    scribbleInstance.enable();
                    return true;
                }

                // Otherwise, use our internal implementation
                console.log('[PDFX Tools] Using internal marker implementation');
                return this._activateMarkerTool();
            },
            disable: () => {
                console.log('[PDFX Tools] Disabling marker tool');

                // If we have a Scribble module, use that
                if (instance && instance.scribble) {
                    if (typeof instance.scribble.disable === 'function') {
                        return instance.scribble.disable();
                    }
                }

                // Check for global scribble instance
                const scribbleInstance = window[`scribbleInstance_${this.blockId}`];
                if (scribbleInstance && typeof scribbleInstance.disable === 'function') {
                    scribbleInstance.disable();
                    return true;
                }

                // Reset canvas if we have one
                if (instance && instance.canvas && instance.canvas.fabricCanvas) {
                    instance.canvas.fabricCanvas.isDrawingMode = false;

                    if (instance.canvas.fabricCanvas.upperCanvasEl) {
                        instance.canvas.fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                        instance.canvas.fabricCanvas.upperCanvasEl.style.cursor = 'default';
                    }
                }

                // Reset draw container
                const drawContainer = document.getElementById(`draw-container-${this.blockId}`);
                if (drawContainer) {
                    drawContainer.style.pointerEvents = 'none';
                    drawContainer.classList.remove('draw-mode');
                    drawContainer.style.cursor = 'default';
                }

                return true;
            },
            setColor: (color) => {
                if (instance && instance.scribble) {
                    if (typeof instance.scribble.setColor === 'function') {
                        return instance.scribble.setColor(color);
                    }
                }

                // Check for global scribble instance
                const scribbleInstance = window[`scribbleInstance_${this.blockId}`];
                if (scribbleInstance && typeof scribbleInstance.setColor === 'function') {
                    scribbleInstance.setColor(color);
                    return true;
                }

                if (instance && instance.canvas && instance.canvas.fabricCanvas &&
                    instance.canvas.fabricCanvas.freeDrawingBrush) {
                    instance.canvas.fabricCanvas.freeDrawingBrush.color = color;
                    return true;
                }

                return false;
            }
        });

        // Register highlight tool - minimal implementation
        this.registerTool('highlight', {
            enable: () => {
                console.log('[PDFX Tools] Enabling highlight tool');

                // Make text layer interactive
                const textLayer = document.getElementById(`text-layer-${this.blockId}`);
                if (textLayer) {
                    textLayer.style.pointerEvents = 'auto';
                    textLayer.style.cursor = 'text';
                    textLayer.classList.add('highlight-tool-active');
                }

                // Try to use legacy highlight instance if available
                const highlightInstance = window[`highlightInstance_${this.blockId}`];
                if (highlightInstance && typeof highlightInstance.enableTextHighlighting === 'function') {
                    highlightInstance.enableTextHighlighting();
                }

                return true;
            },
            disable: () => {
                console.log('[PDFX Tools] Disabling highlight tool');

                // Make text layer non-interactive
                const textLayer = document.getElementById(`text-layer-${this.blockId}`);
                if (textLayer) {
                    textLayer.style.pointerEvents = 'none';
                    textLayer.style.cursor = 'default';
                    textLayer.classList.remove('highlight-tool-active');
                }

                // Try to use legacy highlight instance if available
                const highlightInstance = window[`highlightInstance_${this.blockId}`];
                if (highlightInstance && typeof highlightInstance.disableTextHighlighting === 'function') {
                    highlightInstance.disableTextHighlighting();
                }

                return true;
            }
        });

        // Register text tool - minimal implementation
        this.registerTool('text', {
            enable: () => {
                console.log('[PDFX Tools] Enabling text tool');

                // Try to use legacy text instance if available
                const textInstance = window[`textInstance_${this.blockId}`];
                if (textInstance && typeof textInstance.enable === 'function') {
                    textInstance.enable();
                }

                return true;
            },
            disable: () => {
                console.log('[PDFX Tools] Disabling text tool');

                // Try to use legacy text instance if available
                const textInstance = window[`textInstance_${this.blockId}`];
                if (textInstance && typeof textInstance.disable === 'function') {
                    textInstance.disable();
                }

                return true;
            }
        });

        // Register shape tool - minimal implementation
        this.registerTool('shape', {
            enable: () => {
                console.log('[PDFX Tools] Enabling shape tool');

                // Try to use legacy shape instance if available
                const shapeInstance = window[`shapeInstance_${this.blockId}`];
                if (shapeInstance && typeof shapeInstance.enable === 'function') {
                    shapeInstance.enable();
                }

                return true;
            },
            disable: () => {
                console.log('[PDFX Tools] Disabling shape tool');

                // Try to use legacy shape instance if available
                const shapeInstance = window[`shapeInstance_${this.blockId}`];
                if (shapeInstance && typeof shapeInstance.disable === 'function') {
                    shapeInstance.disable();
                }

                return true;
            }
        });

        // Register note tool - minimal implementation
        this.registerTool('note', {
            enable: () => {
                console.log('[PDFX Tools] Enabling note tool');

                // Try to use legacy note instance if available
                const noteInstance = window[`noteInstance_${this.blockId}`];
                if (noteInstance && typeof noteInstance.enable === 'function') {
                    noteInstance.enable();
                }

                return true;
            },
            disable: () => {
                console.log('[PDFX Tools] Disabling note tool');

                // Try to use legacy note instance if available
                const noteInstance = window[`noteInstance_${this.blockId}`];
                if (noteInstance && typeof noteInstance.disable === 'function') {
                    noteInstance.disable();
                }

                return true;
            }
        });

        // Register select tool - minimal implementation
        this.registerTool('select', {
            enable: () => {
                console.log('[PDFX Tools] Enabling select tool');

                // If we have canvas module, disable drawing mode
                if (instance && instance.canvas && instance.canvas.fabricCanvas) {
                    instance.canvas.fabricCanvas.isDrawingMode = false;
                    instance.canvas.fabricCanvas.selection = true;

                    if (instance.canvas.fabricCanvas.upperCanvasEl) {
                        instance.canvas.fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                        instance.canvas.fabricCanvas.upperCanvasEl.style.cursor = 'pointer';
                    }
                }

                return true;
            },
            disable: () => {
                console.log('[PDFX Tools] Disabling select tool');

                // If we have canvas module, reset selection
                if (instance && instance.canvas && instance.canvas.fabricCanvas) {
                    instance.canvas.fabricCanvas.selection = false;

                    if (instance.canvas.fabricCanvas.upperCanvasEl) {
                        instance.canvas.fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                    }
                }

                return true;
            }
        });

        // Register clear tool - minimal implementation
        this.registerTool('clear', {
            enable: () => {
                console.log('[PDFX Tools] Clear tool activated');

                // Create and show custom confirmation dialog
                this.showConfirmationDialog(
                    'Delete annotations',
                    'Are you sure you want to delete all annotations on this page? This action cannot be undone.',
                    () => {
                        // On confirm callback
                        console.log('[PDFX Tools] Clearing annotations - confirmed');

                        // Get current page
                        const instance = PDFX.getInstance(this.blockId);
                        const currentPage = instance?.core?.currentPage || 1;

                        // 1. Clear scribble/marker strokes specifically
                        this._clearScribbleStrokes(currentPage);

                        // 2. Use our comprehensive clearAllAnnotations method
                        if (this.clearAllAnnotations()) {
                            // Show success message on completion
                            this.showSuccessNotification('Annotations deleted successfully!');
                        }

                        // Immediately deactivate after clearing
                        this.deactivateTool('clear');
                    },
                    () => {
                        // On cancel callback
                        console.log('[PDFX Tools] Clearing annotations - cancelled');
                        this.deactivateTool('clear');
                    }
                );

                return true;
            },
            disable: () => {
                console.log('[PDFX Tools] Clear tool disabled');
                return true;
            }
        });

        console.log('[PDFX Tools] Clear tool registered successfully');

        this.log('Built-in tools registered');
    },

    // Register global helper methods for backward compatibility
    registerGlobalHelpers: function() {
        const blockId = this.blockId;
        const toolsManager = this;

        // Register the activateToolByName function
        window.activateToolByName = window.activateToolByName || function(toolName, targetBlockId) {
            console.log(`[PDFX Tools] Global activateToolByName called for ${toolName} in block ${targetBlockId}`);

            // Only handle if this is for our block ID
            if (targetBlockId === blockId) {
                return toolsManager.activateTool(toolName);
            }

            // If there's another instance handling this block ID, let it handle the call
            const instance = PDFX.getInstance(targetBlockId);
            if (instance && instance.tools) {
                return instance.tools.activateTool(toolName);
            }

            // Fallback to legacy code for backward compatibility
            if (toolName === 'marker') {
                // Apply emergency canvas fix when marker tool is activated
                if (typeof window.emergencyFixCanvasContainer === 'function') {
                    window.emergencyFixCanvasContainer(targetBlockId);
                }

                var scribbleInstance = window[`scribbleInstance_${targetBlockId}`];
                if (scribbleInstance && typeof scribbleInstance.enable === 'function') {
                    // Before enabling, make sure canvas dimensions are correct
                    if (typeof scribbleInstance.forceCanvasResize === 'function') {
                        scribbleInstance.forceCanvasResize();
                    }

                    scribbleInstance.enable();

                    // Fix canvas container again after enabling
                    setTimeout(function() {
                        // Try all available methods to fix canvas sizing
                        if (typeof window.emergencyFixCanvasContainer === 'function') {
                            window.emergencyFixCanvasContainer(targetBlockId);
                        }

                        if (typeof window.fixCanvasContainerSize === 'function') {
                            window.fixCanvasContainerSize(targetBlockId);
                        }

                        if (scribbleInstance && typeof scribbleInstance.forceCanvasResize === 'function') {
                            scribbleInstance.forceCanvasResize();
                        }
                    }, 100);

                    return true;
                } else {
                    // Try to re-initialize the scribble instance
                    if (typeof window.initScribbleInstance === 'function') {
                        window.initScribbleInstance(targetBlockId, {});
                        // Try again with the newly created instance
                        scribbleInstance = window[`scribbleInstance_${targetBlockId}`];
                        if (scribbleInstance && typeof scribbleInstance.enable === 'function') {
                            scribbleInstance.enable();
                            return true;
                        }
                    }
                }
            } else if (toolName === 'highlight') {
                var highlightInstance = window[`highlightInstance_${targetBlockId}`];

                // Better handling for highlight tool initialization
                try {
                    // Check if the highlight instance exists
                    if (!highlightInstance) {
                        return false;
                    }

                    if (typeof highlightInstance.enableTextHighlighting !== 'function') {
                        return false;
                    }

                    // Make sure text layer is visible and prepared
                    var textLayer = document.getElementById(`text-layer-${targetBlockId}`);
                    if (textLayer) {
                        // Ensure text layer is interactive
                        textLayer.style.pointerEvents = 'auto';
                        textLayer.style.cursor = 'text';
                    }

                    // Now enable highlighting
                    var result = highlightInstance.enableTextHighlighting();

                    if (result === false) {
                        // Try to repair text layer if highlighting fails
                        if (textLayer) {
                            textLayer.style.pointerEvents = 'auto';
                            textLayer.style.userSelect = 'text';
                            textLayer.style.webkitUserSelect = 'text';
                            textLayer.style.MozUserSelect = 'text';
                            textLayer.style.msUserSelect = 'text';
                        }
                    }

                    return true;
                } catch (highlightError) {
                    return false;
                }
            } else if (toolName === 'text') {
                var textInstance = window[`textInstance_${targetBlockId}`];
                if (textInstance && typeof textInstance.enable === 'function') {
                    textInstance.enable();
                    return true;
                }
            } else if (toolName === 'shape') {
                var shapeInstance = window[`shapeInstance_${targetBlockId}`];
                if (shapeInstance && typeof shapeInstance.enable === 'function') {
                    shapeInstance.enable();
                    return true;
                }
            } else if (toolName === 'note') {
                var noteInstance = window[`noteInstance_${targetBlockId}`];
                if (noteInstance && typeof noteInstance.enable === 'function') {
                    noteInstance.enable();
                    return true;
                }
            }

            // For other tools, try to find a generic tool instance
            var toolInstance = window[`${toolName}Instance_${targetBlockId}`];
            if (toolInstance) {
                // Try to call enable or activate method if available
                if (typeof toolInstance.enable === 'function') {
                    toolInstance.enable();
                    return true;
                } else if (typeof toolInstance.activate === 'function') {
                    toolInstance.activate();
                    return true;
                }
            }

            console.error(`[PDFX Tools] No instance found for block ${targetBlockId} to activate tool ${toolName}`);
            return false;
        };

        // Register the deactivateToolByName function
        window.deactivateToolByName = window.deactivateToolByName || function(toolName, targetBlockId) {
            console.log(`[PDFX Tools] Global deactivateToolByName called for ${toolName} in block ${targetBlockId}`);

            // Only handle if this is for our block ID
            if (targetBlockId === blockId) {
                return toolsManager.deactivateTool(toolName);
            }

            // If there's another instance handling this block ID, let it handle the call
            const instance = PDFX.getInstance(targetBlockId);
            if (instance && instance.tools) {
                return instance.tools.deactivateTool(toolName);
            }

            // Fallback to legacy code for backward compatibility
            if (toolName === 'marker' || toolName === 'scribble') {
                var scribbleInstance = window[`scribbleInstance_${targetBlockId}`];
                if (scribbleInstance && typeof scribbleInstance.disable === 'function') {
                    scribbleInstance.disable();

                    // Extra cleanup to ensure everything is reset
                    var drawContainer = document.querySelector(`#draw-container-${targetBlockId}`);
                    var fabricCanvas = window[`fabricCanvas_${targetBlockId}`];

                    if (drawContainer) {
                        // Ensure the draw container's pointer events are disabled
                        drawContainer.style.pointerEvents = 'none';
                        drawContainer.classList.remove('draw-mode');
                        drawContainer.removeAttribute('data-current-tool');
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
                    }

                    return true;
                }
            } else if (toolName === 'highlight' || toolName === 'highlighter') {
                var highlightInstance = window[`highlightInstance_${targetBlockId}`];
                try {
                    if (!highlightInstance) {
                        // Fallback: try to manually disable text highlighting
                        var textLayer = document.getElementById(`text-layer-${targetBlockId}`);
                        if (textLayer) {
                            textLayer.style.pointerEvents = 'none';
                            $(textLayer).removeClass('active highlight-tool-active');
                        }
                        return true;
                    }

                    if (typeof highlightInstance.disableTextHighlighting !== 'function') {
                        // Fallback: try to manually disable text highlighting
                        var textLayer = document.getElementById(`text-layer-${targetBlockId}`);
                        if (textLayer) {
                            textLayer.style.pointerEvents = 'none';
                            $(textLayer).removeClass('active highlight-tool-active');
                        }
                        return true;
                    }

                    // Call disableTextHighlighting
                    var result = highlightInstance.disableTextHighlighting();

                    // Reset text layer properties even if the method fails
                    var textLayer = document.getElementById(`text-layer-${targetBlockId}`);
                    if (textLayer) {
                        textLayer.style.pointerEvents = 'none';
                        $(textLayer).removeClass('highlight-tool-active');
                    }

                    return true;
                } catch (error) {
                    // Emergency fallback
                    try {
                        var textLayer = document.getElementById(`text-layer-${targetBlockId}`);
                        if (textLayer) {
                            textLayer.style.pointerEvents = 'none';
                            textLayer.style.cursor = 'default';
                            $(textLayer).removeClass('active highlight-tool-active');
                        }
                    } catch (e) {}
                    return true;
                }
            } else if (toolName === 'text') {
                var textInstance = window[`textInstance_${targetBlockId}`];
                if (textInstance && typeof textInstance.disable === 'function') {
                    textInstance.disable();
                    return true;
                }
            } else if (toolName === 'shape') {
                var shapeInstance = window[`shapeInstance_${targetBlockId}`];
                if (shapeInstance && typeof shapeInstance.disable === 'function') {
                    shapeInstance.disable();
                    return true;
                }
            } else if (toolName === 'note') {
                var noteInstance = window[`noteInstance_${targetBlockId}`];
                if (noteInstance && typeof noteInstance.disable === 'function') {
                    noteInstance.disable();
                    return true;
                }
            }

            // For other tools, try to find a generic tool instance
            var toolInstance = window[`${toolName}Instance_${targetBlockId}`];
            if (toolInstance) {
                // Try to call disable or deactivate method if available
                if (typeof toolInstance.disable === 'function') {
                    toolInstance.disable();
                    return true;
                } else if (typeof toolInstance.deactivate === 'function') {
                    toolInstance.deactivate();
                    return true;
                }
            }

            console.error(`[PDFX Tools] No instance found for block ${targetBlockId} to deactivate tool ${toolName}`);
            return false;
        };
    },

    // Register a tool instance
    registerTool: function(toolName, instance) {
        this.toolInstances[toolName] = instance;
        this.log('Registered tool: ' + toolName);
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

        // Make sure toolbar buttons remain clickable
        this.ensureToolButtonsRemainClickable();

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

        // Make sure toolbar buttons remain clickable
        this.ensureToolButtonsRemainClickable();

        // Dispatch event
        document.dispatchEvent(new CustomEvent('pdfx:tooldeactivated', {
            detail: {
                blockId: this.blockId,
                toolName: toolName
            }
        }));

        return true;
    },

    // Ensure tool buttons remain clickable
    ensureToolButtonsRemainClickable: function() {
        // Ensure all tool buttons remain clickable
        const toolButtons = document.querySelectorAll(`[id$="-tool-${this.blockId}"]`);
        toolButtons.forEach(function(button) {
            button.style.pointerEvents = 'auto';
        });

        // Also make sure the toolbar container is clickable
        const toolbar = document.querySelector(`#toolbar-${this.blockId}`);
        if (toolbar) {
            toolbar.style.pointerEvents = 'auto';
        }
    },

    // Setup event handlers for tool buttons
    setupToolButtons: function() {
        console.log('Setting up tool button handlers');

        const blockId = this.blockId;
        const toolsManager = this;

        // Define tool types to handle
        const toolTypes = [
            'marker', 'highlight', 'text', 'shape',
            'note', 'select', 'eraser', 'clear',
            'undo', 'redo'
        ];

        // Function to set up a single tool button
        const setupSingleButton = function(toolType) {
            const button = document.getElementById(`${toolType}-tool-${blockId}`);

            if (!button) {
                console.warn(`[PDFX Tools] Button not found: ${toolType}-tool-${blockId}`);
                return false;
            }

            // Remove any existing click handlers to avoid duplicates
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);

            // Add the click handler to the new button
            newButton.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();

                // Reset pointer events first to ensure buttons remain clickable
                toolsManager.ensureToolButtonsRemainClickable();

                toolsManager.log(`Tool button clicked: ${toolType}`);

                // Toggle tool state
                if (newButton.classList.contains('active')) {
                    toolsManager.deactivateTool(toolType);
                } else {
                    toolsManager.activateTool(toolType);
                }
            });

            // Log that we set up this button
            toolsManager.log(`Set up tool button handler for ${toolType}`);
            return true;
        };

        // Function to attempt setup with retry mechanism
        const attemptSetup = function(attempt = 1) {
            const maxAttempts = 5;
            let successCount = 0;
            let totalButtons = toolTypes.length;

            // Try to set up each tool button
            toolTypes.forEach(function(toolType) {
                if (setupSingleButton(toolType)) {
                    successCount++;
                }
            });

            console.log(`[PDFX Tools] Setup attempt ${attempt}: ${successCount}/${totalButtons} buttons found`);

            // If we didn't find all buttons and haven't exceeded max attempts, retry
            if (successCount < totalButtons && attempt < maxAttempts) {
                console.log(`[PDFX Tools] Retrying button setup in 200ms (attempt ${attempt + 1}/${maxAttempts})`);
                setTimeout(() => attemptSetup(attempt + 1), 200);
            } else if (successCount === totalButtons) {
                console.log(`[PDFX Tools] All tool buttons successfully set up`);

                // Set up color input handler after successful button setup
                setupColorInput();

                // Test the clear button setup
                setTimeout(() => {
                    toolsManager.testClearButton();
                }, 100);
            } else {
                console.warn(`[PDFX Tools] Could not set up all buttons after ${maxAttempts} attempts. ${successCount}/${totalButtons} buttons found.`);

                // Still try to set up color input
                setupColorInput();
            }
        };

        // Function to set up color input
        const setupColorInput = function() {
            const colorInput = document.getElementById(`color-input-${blockId}`);
            if (colorInput) {
                // Remove any existing event handlers
                const newColorInput = colorInput.cloneNode(true);
                colorInput.parentNode.replaceChild(newColorInput, colorInput);

                // Add the event handler to the new input
                newColorInput.addEventListener('change', function(event) {
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

                console.log(`[PDFX Tools] Color input handler set up`);
            } else {
                console.warn(`[PDFX Tools] Color input not found: color-input-${blockId}`);
            }
        };

        // Start the setup process
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            // DOM is ready, try setup immediately
            attemptSetup();
        } else {
            // Wait for DOM to be ready
            document.addEventListener('DOMContentLoaded', function() {
                attemptSetup();
            });
        }
    },

    _activateMarkerTool: function() {
        const instance = PDFX.getInstance(this.blockId);

        // Check if instance exists first
        if (!instance) {
            this.log('Instance not found', true);

            // Fallback to using global scribble instance
            const scribbleInstance = window[`scribbleInstance_${this.blockId}`];
            if (scribbleInstance && typeof scribbleInstance.enable === 'function') {
                scribbleInstance.enable();
                return true;
            }

            return false;
        }

        // Check if canvas exists in the instance
        const canvas = instance.canvas;
        if (!canvas) {
            this.log('Canvas module not available for marker tool', true);

            // Try to use the scribble module directly if available
            if (instance.scribble) {
                return instance.scribble.enable();
            }

            // Fallback to using global scribble instance
            const scribbleInstance = window[`scribbleInstance_${this.blockId}`];
            if (scribbleInstance && typeof scribbleInstance.enable === 'function') {
                scribbleInstance.enable();
                return true;
            }

            return false;
        }

        // Try to get the fabric canvas
        let fabricCanvas = canvas.fabricCanvas;
        if (!fabricCanvas) {
            this.log('Fabric canvas not available for marker tool', true);

            // Try to initialize the fabric canvas
            if (typeof canvas.initFabricCanvas === 'function') {
                fabricCanvas = canvas.initFabricCanvas();

                // If initialization still failed, use alternatives
                if (!fabricCanvas) {
                    // Try to use scribble module
                    if (instance.scribble) {
                        return instance.scribble.enable();
                    }

                    return false;
                }
            } else {
                // Try to use scribble module as fallback
                if (instance.scribble) {
                    return instance.scribble.enable();
                }

                return false;
            }
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

        return true;
    },

    // Clear CSS-based annotations (like highlights) for the current page
    clearCSSAnnotations: function() {
        const blockId = this.blockId;
        const instance = PDFX.getInstance(blockId);
        const currentPage = instance?.core?.currentPage || 1;

        console.log(`[PDFX Tools] Clearing CSS annotations for page ${currentPage}`);

        try {
            // Clear highlight spans in the text layer
            const textLayer = document.getElementById(`text-layer-${blockId}`);
            if (textLayer) {
                // Remove highlight styles
                const highlightSpans = textLayer.querySelectorAll('.pdfx-highlight');
                highlightSpans.forEach(span => {
                    // Check if this highlight is for the current page
                    if (!span.getAttribute('data-page') ||
                        parseInt(span.getAttribute('data-page')) === currentPage) {
                        span.remove();
                    }
                });
            }

            // Clear highlight div overlays
            const highlightLayer = document.getElementById(`highlight-layer-${blockId}`);
            if (highlightLayer) {
                const highlights = highlightLayer.querySelectorAll('.pdfx-highlight-overlay');
                highlights.forEach(highlight => {
                    // Check if this highlight is for the current page
                    if (!highlight.getAttribute('data-page') ||
                        parseInt(highlight.getAttribute('data-page')) === currentPage) {
                        highlight.remove();
                    }
                });
            }

            // Clear text annotations in the draw container
            const drawContainer = document.getElementById(`draw-container-${blockId}`);
            if (drawContainer) {
                // Clear text annotations
                const textAnnotations = drawContainer.querySelectorAll('.pdf-text-annotation, .pdf-text-annotation-display');
                textAnnotations.forEach(annotation => {
                    // Check if this annotation is for the current page
                    if (!annotation.getAttribute('data-page') ||
                        parseInt(annotation.getAttribute('data-page')) === currentPage) {
                        annotation.remove();
                    }
                });

                // Clear note annotations (might be in different containers)
                const noteAnnotations = document.querySelectorAll(`.pdf-note-annotation[data-block-id="${blockId}"]`);
                noteAnnotations.forEach(annotation => {
                    // Check if this annotation is for the current page
                    if (!annotation.getAttribute('data-page') ||
                        parseInt(annotation.getAttribute('data-page')) === currentPage) {
                        annotation.remove();
                    }
                });
            }

            console.log(`[PDFX Tools] CSS annotations cleared for page ${currentPage}`);
            return true;
        } catch (error) {
            console.error(`[PDFX Tools] Error clearing CSS annotations: ${error.message}`);
            return false;
        }
    },

    // Clear all annotations for the current page
    clearAllAnnotations: function() {
        const blockId = this.blockId;
        const instance = PDFX.getInstance(blockId);
        const currentPage = instance?.core?.currentPage || 1;

        console.log(`[PDFX Tools] Clearing ALL annotations for page ${currentPage}`);

        try {
            // STEP 1: Clear fabric canvas
            this._clearFabricCanvasAnnotations(currentPage);

            // STEP 2: Clear CSS-based annotations
            this.clearCSSAnnotations();

            // STEP 3: Clear from all tool instances
            this._clearToolAnnotations(currentPage);

            // STEP 4: Clear from storage to prevent reappearing on page change
            this._clearStoredAnnotations(currentPage);

            console.log(`[PDFX Tools] Successfully cleared all annotations for page ${currentPage}`);
            return true;
        } catch (error) {
            console.error(`[PDFX Tools] Error clearing annotations: ${error.message}`);
            return false;
        }
    },

    // Private helper to clear fabric canvas annotations
    _clearFabricCanvasAnnotations: function(currentPage) {
        const blockId = this.blockId;
        const instance = PDFX.getInstance(blockId);

        // Try all possible canvas sources

        // 1. Canvas from instance
        if (instance && instance.canvas && instance.canvas.fabricCanvas) {
            const fabricCanvas = instance.canvas.fabricCanvas;
            // Get a copy of the objects array to avoid modification during iteration
            const objects = [...fabricCanvas.getObjects()];

            // Remove all objects that belong to the current page
            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];
                if (!obj.page || parseInt(obj.page) === currentPage) {
                    fabricCanvas.remove(obj);
                }
            }

            fabricCanvas.renderAll();
            console.log(`[PDFX Tools] Cleared ${objects.length} objects from instance canvas`);
        }

        // 2. Scribble's fabric canvas
        if (instance && instance.scribble && instance.scribble.fabricCanvas) {
            const fabricCanvas = instance.scribble.fabricCanvas;
            const objects = [...fabricCanvas.getObjects()];

            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];
                if (!obj.page || parseInt(obj.page) === currentPage) {
                    fabricCanvas.remove(obj);
                }
            }

            fabricCanvas.renderAll();
            console.log(`[PDFX Tools] Cleared ${objects.length} objects from scribble canvas`);
        }

        // 3. Global fabric canvas
        const globalFabricCanvas = window[`fabricCanvas_${blockId}`];
        if (globalFabricCanvas) {
            const objects = [...globalFabricCanvas.getObjects()];

            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];
                if (!obj.page || parseInt(obj.page) === currentPage) {
                    globalFabricCanvas.remove(obj);
                }
            }

            globalFabricCanvas.renderAll();
            console.log(`[PDFX Tools] Cleared ${objects.length} objects from global fabric canvas`);
        }

        // 4. Redraw the page to ensure all canvas elements are reset
        if (instance && instance.core) {
            instance.core.renderCurrentPage();
        }
    },

    // Private helper to clear annotations from tool instances
    _clearToolAnnotations: function(currentPage) {
        const blockId = this.blockId;
        const instance = PDFX.getInstance(blockId);

        // 1. Clear via instance tools
        if (instance && instance.tools) {
            // Try all possible tools
            const toolNames = ['highlight', 'marker', 'text', 'shape', 'note', 'scribble'];

            toolNames.forEach(toolName => {
                const tool = instance.tools.getTool(toolName);
                if (tool) {
                    // Try various clear methods
                    if (typeof tool.clearCurrentPage === 'function') {
                        tool.clearCurrentPage(currentPage);
                    } else if (typeof tool.clearPage === 'function') {
                        tool.clearPage(currentPage);
                    } else if (typeof tool.clear === 'function') {
                        tool.clear();
                    }
                }
            });
        }

        // 2. Try global scribble instance
        const scribbleInstance = window[`scribbleInstance_${blockId}`];
        if (scribbleInstance) {
            // Try various clear methods
            if (typeof scribbleInstance.clearCurrentPage === 'function') {
                scribbleInstance.clearCurrentPage(currentPage);
            } else if (typeof scribbleInstance.clearPage === 'function') {
                scribbleInstance.clearPage(currentPage);
            } else if (typeof scribbleInstance.clear === 'function') {
                scribbleInstance.clear();
            }

            // Additional: Clear strokes array if it exists
            if (scribbleInstance.strokes) {
                if (Array.isArray(scribbleInstance.strokes)) {
                    // Filter out strokes for the current page
                    scribbleInstance.strokes = scribbleInstance.strokes.filter(
                        stroke => stroke.page && parseInt(stroke.page) !== currentPage
                    );
                } else if (typeof scribbleInstance.strokes === 'object') {
                    // If organized by page, clear the current page
                    delete scribbleInstance.strokes[currentPage];
                }
            }
        }

        // 3. Try legacy tool instances directly
        const legacyToolNames = ['highlight', 'marker', 'text', 'shape', 'note', 'scribble'];

        legacyToolNames.forEach(toolName => {
            const toolInstance = window[`${toolName}Instance_${blockId}`];
            if (toolInstance) {
                // Try various clear methods
                if (typeof toolInstance.clearCurrentPage === 'function') {
                    toolInstance.clearCurrentPage(currentPage);
                } else if (typeof toolInstance.clearPage === 'function') {
                    toolInstance.clearPage(currentPage);
                } else if (typeof toolInstance.clear === 'function') {
                    toolInstance.clear();
                }
            }
        });
    },

    // Private helper to clear annotations from storage
    _clearStoredAnnotations: function(currentPage) {
        const blockId = this.blockId;
        const instance = PDFX.getInstance(blockId);

        console.log(`[PDFX Tools] Clearing stored annotations for page ${currentPage}`);

        // 1. Clear via instance storage
        if (instance && instance.storage) {
            // Save empty annotations to overwrite the existing ones
            instance.storage.saveAnnotations({
                type: 'clear',
                page: currentPage,
                userId: instance.options.userId || 'anonymous',
                blockId: blockId,
                timestamp: new Date().toISOString(),
                // Include empty arrays for all annotation types
                highlights: [],
                strokes: [],
                textAnnotations: [],
                shapeAnnotations: [],
                noteAnnotations: [],
                markerStrokes: {}  // Clear marker strokes
            });
        }

        // 2. Send clear request to backend via XBlock handler
        try {
            const dataElement = document.getElementById(`pdfx-data-${blockId}`);
            const handlerUrl = dataElement ? dataElement.dataset.handlerUrl : null;

            if (handlerUrl) {
                // Prepare data to clear annotations for the current page
                const clearData = {
                    currentPage: currentPage,
                    annotations: {},
                    drawingStrokes: {},
                    highlights: {},
                    markerStrokes: {},  // Clear marker strokes
                    textAnnotations: {},
                    shapeAnnotations: {},
                    noteAnnotations: {},
                    action: 'clear_page'
                };

                // Send the clear request
                fetch(handlerUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this._getCSRFToken()
                    },
                    body: JSON.stringify(clearData)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.result === 'success') {
                        console.log(`[PDFX Tools] Successfully cleared annotations on server for page ${currentPage}`);
                    } else {
                        console.error(`[PDFX Tools] Server error clearing annotations: ${data.message}`);
                    }
                })
                .catch(error => {
                    console.error(`[PDFX Tools] Network error clearing annotations: ${error.message}`);
                });
            }
        } catch (error) {
            console.error(`[PDFX Tools] Error sending clear request to server: ${error.message}`);
        }

        // 3. Clear global storage
        try {
            // Check for legacy localStorage data
            const storageKey = `pdfx_annotations_${blockId}`;
            const storedData = window.localStorage.getItem(storageKey);

            if (storedData) {
                // Parse stored data
                let annotations = JSON.parse(storedData);

                // Filter out annotations for this page
                if (Array.isArray(annotations)) {
                    annotations = annotations.filter(
                        anno => anno.page && parseInt(anno.page) !== currentPage
                    );
                } else if (typeof annotations === 'object') {
                    // Handle page-indexed annotations
                    delete annotations[currentPage];
                    // Handle type-indexed annotations
                    ['highlights', 'strokes', 'text', 'shapes', 'notes', 'markerStrokes'].forEach(annoType => {
                        if (annotations[annoType]) {
                            if (Array.isArray(annotations[annoType])) {
                                annotations[annoType] = annotations[annoType].filter(
                                    anno => anno.page && parseInt(anno.page) !== currentPage
                                );
                            } else if (typeof annotations[annoType] === 'object') {
                                delete annotations[annoType][currentPage];
                            }
                        }
                    });
                }

                // Save back to localStorage
                window.localStorage.setItem(storageKey, JSON.stringify(annotations));
            }
        } catch (error) {
            console.error(`[PDFX Tools] Error clearing localStorage: ${error.message}`);
        }
    },

    // Helper method to get CSRF token
    _getCSRFToken: function() {
        // Try to get CSRF token from various sources
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
                         document.querySelector('meta[name=csrf-token]')?.content ||
                         window.csrfToken ||
                         '';
        return csrfToken;
    },

    // Show a modern confirmation dialog
    showConfirmationDialog: function(title, message, onConfirm, onCancel) {
        const blockId = this.blockId;
        const blockContainer = document.getElementById(`pdfx-block-${blockId}`);

        if (!blockContainer) {
            console.error(`[PDFX Tools] Block container not found for ID ${blockId}`);
            return;
        }

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'pdfx-modal-overlay';
        overlay.style.position = 'absolute'; // Changed from fixed to absolute
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.zIndex = '200'; // Higher than other elements in the PDF container

        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'pdfx-modal-dialog';

        // Create icon
        const iconContainer = document.createElement('div');
        iconContainer.className = 'pdfx-modal-icon';

        const iconCircle = document.createElement('div');
        iconCircle.className = 'pdfx-modal-icon-circle';

        const iconExclamation = document.createElement('div');
        iconExclamation.className = 'pdfx-modal-icon-exclamation';
        iconExclamation.textContent = '!';

        iconCircle.appendChild(iconExclamation);
        iconContainer.appendChild(iconCircle);

        // Create title
        const titleElement = document.createElement('div');
        titleElement.className = 'pdfx-modal-title';
        titleElement.textContent = title;

        // Create message
        const messageElement = document.createElement('div');
        messageElement.className = 'pdfx-modal-message';
        messageElement.textContent = message;

        // Create buttons
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'pdfx-modal-buttons';

        const cancelButton = document.createElement('button');
        cancelButton.className = 'pdfx-modal-button pdfx-modal-button-cancel';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => {
            blockContainer.removeChild(overlay);
            if (typeof onCancel === 'function') {
                onCancel();
            }
        });

        const deleteButton = document.createElement('button');
        deleteButton.className = 'pdfx-modal-button pdfx-modal-button-delete';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => {
            blockContainer.removeChild(overlay);
            if (typeof onConfirm === 'function') {
                onConfirm();
            }
        });

        buttonsContainer.appendChild(cancelButton);
        buttonsContainer.appendChild(deleteButton);

        // Assemble dialog
        dialog.appendChild(iconContainer);
        dialog.appendChild(titleElement);
        dialog.appendChild(messageElement);
        dialog.appendChild(buttonsContainer);

        overlay.appendChild(dialog);

        // Add to block container instead of document.body
        blockContainer.appendChild(overlay);
    },

    // Show a success notification
    showSuccessNotification: function(message) {
        const blockId = this.blockId;
        const blockContainer = document.getElementById(`pdfx-block-${blockId}`);

        if (!blockContainer) {
            console.error(`[PDFX Tools] Block container not found for ID ${blockId}`);
            return;
        }

        const notification = document.createElement('div');
        notification.className = 'pdfx-notification';
        notification.textContent = message;

        // Position relative to the block container
        notification.style.position = 'absolute';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '201'; // Higher than the modal overlay

        blockContainer.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    },

    // Test function to verify clear button setup
    testClearButton: function() {
        const blockId = this.blockId;
        const clearButton = document.getElementById(`clear-tool-${blockId}`);

        if (!clearButton) {
            console.error(`[PDFX Tools] Clear button not found: clear-tool-${blockId}`);
            return false;
        }

        console.log(`[PDFX Tools] Clear button found: clear-tool-${blockId}`);
        console.log(`[PDFX Tools] Clear button classes:`, clearButton.className);
        console.log(`[PDFX Tools] Clear button title:`, clearButton.title);

        // Check if the button has event listeners
        const hasClickListener = clearButton.onclick !== null ||
                                clearButton.addEventListener !== undefined;
        console.log(`[PDFX Tools] Clear button has click handler:`, hasClickListener);

        // Test if the clear tool is registered
        const clearTool = this.getTool('clear');
        console.log(`[PDFX Tools] Clear tool registered:`, !!clearTool);

        if (clearTool) {
            console.log(`[PDFX Tools] Clear tool has enable method:`, typeof clearTool.enable === 'function');
            console.log(`[PDFX Tools] Clear tool has disable method:`, typeof clearTool.disable === 'function');
        }

        return true;
    },

    // Private helper to clear scribble/marker strokes specifically
    _clearScribbleStrokes: function(currentPage) {
        const blockId = this.blockId;
        const instance = PDFX.getInstance(blockId);

        console.log(`[PDFX Tools] Clearing scribble strokes for page ${currentPage}`);

        // 1. Clear from main scribble instance
        if (instance && instance.scribble) {
            if (typeof instance.scribble.clearPage === 'function') {
                instance.scribble.clearPage(currentPage);
                console.log(`[PDFX Tools] Cleared strokes from main scribble instance`);
            } else if (typeof instance.scribble.clearCurrentPage === 'function') {
                instance.scribble.clearCurrentPage();
                console.log(`[PDFX Tools] Cleared strokes from main scribble instance (current page)`);
            }
        }

        // 2. Clear from global scribble instance
        const globalScribbleInstance = window[`scribbleInstance_${blockId}`];
        if (globalScribbleInstance) {
            if (typeof globalScribbleInstance.clearPage === 'function') {
                globalScribbleInstance.clearPage(currentPage);
                console.log(`[PDFX Tools] Cleared strokes from global scribble instance`);
            } else if (typeof globalScribbleInstance.clearCurrentPage === 'function') {
                globalScribbleInstance.clearCurrentPage();
                console.log(`[PDFX Tools] Cleared strokes from global scribble instance (current page)`);
            }
        }

        // 3. Clear from tools scribble instance
        if (this.scribbleInstance) {
            if (typeof this.scribbleInstance.clearPage === 'function') {
                this.scribbleInstance.clearPage(currentPage);
                console.log(`[PDFX Tools] Cleared strokes from tools scribble instance`);
            } else if (typeof this.scribbleInstance.clearCurrentPage === 'function') {
                this.scribbleInstance.clearCurrentPage();
                console.log(`[PDFX Tools] Cleared strokes from tools scribble instance (current page)`);
            }
        }

        // 4. Clear from any PdfxScribble instances
        if (window.PdfxScribble && window.PdfxScribble.instances) {
            const scribbleInstances = window.PdfxScribble.instances;
            for (const instanceId in scribbleInstances) {
                const scribbleInstance = scribbleInstances[instanceId];
                if (scribbleInstance.blockId === blockId) {
                    if (typeof scribbleInstance.clearPage === 'function') {
                        scribbleInstance.clearPage(currentPage);
                        console.log(`[PDFX Tools] Cleared strokes from PdfxScribble instance ${instanceId}`);
                    }
                }
            }
        }

        console.log(`[PDFX Tools] Completed clearing scribble strokes for page ${currentPage}`);
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
            console.debug(`[PDFX UI] ${message}`);
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
            console.debug(`[PDFX Canvas] ${message}`);
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

    // Fix canvas container size and position
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
            console.debug(`[PDFX Storage] ${message}`);
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

// Get an instance by block ID
PDFX.getInstance = function(blockId) {
    return PDFX.instances && PDFX.instances[blockId] || null;
};

// Module: PDF.js Initializer (Migrated from pdfx_init.js)
PDFX.PDFJSInitializer = {
    init: function() {
        // Add a global event listener to check when DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            // Find all PDF blocks and initialize their tool buttons if not already done
            const pdfBlocks = document.querySelectorAll('[id^="pdfx-block-"]');
            pdfBlocks.forEach(block => {
                const blockId = block.id.replace('pdfx-block-', '');

                // Check if we need to initialize tools - only if a PDFX instance doesn't exist yet
                const instance = PDFX.getInstance(blockId);
                if (!instance) {
                    console.debug(`[PDFX] Block ${blockId} found without instance, initializing basic tools`);

                    // Create a minimal tool manager for this block without a full instance
                    const toolsManager = Object.create(PDFX.Tools);
                    toolsManager.init(blockId, { debugMode: false });
                }
            });

            this.setupResizeHandler();

            // Check if PDF.js is loaded immediately
            if (typeof pdfjsLib !== 'undefined') {
                this.setupPDFJSWorker();
            } else {
                // Wait a short time to ensure pdfjsLib has loaded
                setTimeout(() => {
                    this.initPDFJS();
                }, 500);
            }
        });

        // Expose initialization function for manual use
        window.initPdfJsWorker = this.initPDFJS.bind(this);

        return this;
    },

    // Set up window resize handler
    setupResizeHandler: function() {
        window.addEventListener('resize', function() {
            // Find all PDF blocks
            const pdfBlocks = document.querySelectorAll('[id^="pdfx-block-"]');

            pdfBlocks.forEach(function(block) {
                const blockId = block.id.replace('pdfx-block-', '');

                // Get the instance and fix canvas if available
                const instance = PDFX.getInstance(blockId);
                if (instance && instance.canvas) {
                    instance.canvas.fixCanvasContainer();
                }
            });
        });
    },

    // Initialize PDF.js library
    initPDFJS: function() {
        // If PDF.js is already loaded, we're done
        if (typeof pdfjsLib !== 'undefined') {
            return Promise.resolve();
        }

        return new Promise(function(resolve, reject) {
            // Wait a short time to ensure pdfjsLib has loaded (it might be loading asynchronously)
            setTimeout(function() {
                if (typeof pdfjsLib !== 'undefined') {
                    resolve();
                    return;
                }

                // If PDF.js is still not loaded, try to load it
                if (typeof pdfjsLib === 'undefined') {
                    // Use the new version that's compatible with the text layer rendering
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.min.mjs';
                    script.type = 'module';
                    script.onload = function() {
                        if (typeof pdfjsLib !== 'undefined') {
                            PDFX.PDFJSInitializer.setupPDFJSWorker();
                            resolve();
                        } else {
                            reject(new Error('Failed to load PDF.js'));
                        }
                    };
                    script.onerror = function() {
                        reject(new Error('Failed to load PDF.js'));
                    };
                    document.head.appendChild(script);
                } else {
                    resolve();
                }
            }, 500);
        });
    },

    // Helper function to load scripts
    tryLoadScript: function(url, callback) {
        const script = document.createElement('script');
        script.src = url;
        script.onload = callback;
        script.onerror = function() {};

        // If loading an MJS file, set type to module
        if (url.endsWith('.mjs')) {
            script.type = 'module';
        }
        document.head.appendChild(script);
    },

    // Set up PDF.js worker
    setupPDFJSWorker: function() {
        if (typeof pdfjsLib === 'undefined') {
            return;
        }

        // First check if the worker is already set
        if (pdfjsLib.GlobalWorkerOptions.workerSrc) {
            return;
        }

        // Try multiple approaches to find the worker

        // 1. Find the script tag for the worker (if dynamically added by Python)
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const scriptContent = scripts[i].textContent || scripts[i].innerText;
            if (scriptContent && scriptContent.indexOf('pdfjsLib.GlobalWorkerOptions.workerSrc') !== -1) {
                // The worker should already be configured by this script
                return;
            }
        }

        // 2. Try to use a local worker URL (from the same path as pdf.min.js)
        try {
            const scripts = document.getElementsByTagName('script');
            let pdfJsScript = null;

            // Find the pdf.min.js script tag
            for (let i = 0; i < scripts.length; i++) {
                if (scripts[i].src && (scripts[i].src.indexOf('pdf.min.js') !== -1 || scripts[i].src.indexOf('pdf.min.mjs') !== -1)) {
                    pdfJsScript = scripts[i];
                    break;
                }
            }

            if (pdfJsScript) {
                // If we found the script, try to figure out if it's local or CDN
                const scriptSrc = pdfJsScript.src;
                const workerSrc = scriptSrc.replace('pdf.min.js', 'pdf.worker.min.js').replace('pdf.min.mjs', 'pdf.worker.min.js');

                pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
                return;
            }
        } catch (e) {
            // Silently fail and move to fallback
        }

        // 3. Default fallback to CDN
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs';
    }
};

// Module: Scribble handling
PDFX.Scribble = {
    init: function(blockId, options) {
        this.blockId = blockId;
        this.options = options || {};
        this.fabricCanvas = null;
        this.scribbleInstance = null;
        this.debugMode = options.debugMode || false;

        console.log(`[PDFX Scribble] Initializing Scribble module for block ${blockId}`);

        // Register global helper method
        this.registerGlobalHelpers();

        return this;
    },

    log: function(message, force) {
        if (this.debugMode || force) {
            console.debug(`[PDFX Scribble] ${message}`);
        }
    },

    // Register global helper methods for backward compatibility
    registerGlobalHelpers: function() {
        const blockId = this.blockId;
        const scribbleModule = this;

        // Register the initScribbleInstance function
        window.initScribbleInstance = window.initScribbleInstance || function(targetBlockId, serverData) {
            console.log(`[PDFX Scribble] Global initScribbleInstance called for block ${targetBlockId}`);

            // If this is for our block ID, handle it directly
            if (targetBlockId === blockId) {
                return scribbleModule.initScribbleInstance(serverData);
            }

            // Otherwise, try to find an instance for that block ID
            const instance = PDFX.getInstance(targetBlockId);
            if (instance && instance.scribble) {
                return instance.scribble.initScribbleInstance(serverData);
            }

            // If no instance is found, use our fallback implementation
            console.warn(`[PDFX Scribble] No instance found for block ${targetBlockId}, using fallback implementation`);
            return scribbleModule.fallbackInitScribbleInstance(targetBlockId, serverData);
        };
    },

    // Initialize a scribble instance for this block
    initScribbleInstance: function(serverData) {
        console.log(`[PDFX Scribble] Initializing scribble instance for block ${this.blockId}`);

        // If the specific scribble_init.js script has its own implementation, use that
        if (typeof window.initScribbleInstanceFromScript === 'function') {
            this.log('Using external scribble initialization function');
            return window.initScribbleInstanceFromScript(this.blockId, serverData || {});
        }

        // Otherwise use our implementation
        return this.fallbackInitScribbleInstance(this.blockId, serverData);
    },

    // Fallback implementation for initializing a scribble instance
    fallbackInitScribbleInstance: function(blockId, serverData) {
        console.log(`[PDFX Scribble] Using fallback initialization for block ${blockId}`);

        const block = document.getElementById(`pdfx-block-${blockId}`);
        const drawContainer = document.getElementById(`draw-container-${blockId}`);
        const pdfContainer = document.getElementById(`pdf-container-${blockId}`);

        if (!block || !drawContainer || !pdfContainer) {
            console.error(`[PDFX Scribble] Missing required elements for block ${blockId}`);
            return null;
        }

        // Create a canvas if it doesn't exist
        let canvas = document.getElementById(`drawing-canvas-${blockId}`);
        if (!canvas) {
            console.log(`[PDFX Scribble] Creating new canvas for block ${blockId}`);
            canvas = document.createElement('canvas');
            canvas.id = `drawing-canvas-${blockId}`;
            canvas.width = pdfContainer.offsetWidth || 800;
            canvas.height = pdfContainer.offsetHeight || 600;
            drawContainer.innerHTML = '';
            drawContainer.appendChild(canvas);
        }

        // Create fabric canvas
        let fabricCanvas = null;
        try {
            fabricCanvas = new fabric.Canvas(canvas, {
                isDrawingMode: false,
                selection: false
            });

            // Set correct dimensions
            fabricCanvas.setWidth(pdfContainer.offsetWidth);
            fabricCanvas.setHeight(pdfContainer.offsetHeight);

            // Fix canvas container size
            const canvasContainer = fabricCanvas.wrapperEl;
            if (canvasContainer) {
                canvasContainer.style.width = pdfContainer.offsetWidth + 'px';
                canvasContainer.style.height = pdfContainer.offsetHeight + 'px';
            }

            // Fix both lower and upper canvas dimensions
            if (fabricCanvas.lowerCanvasEl) {
                fabricCanvas.lowerCanvasEl.style.width = pdfContainer.offsetWidth + 'px';
                fabricCanvas.lowerCanvasEl.style.height = pdfContainer.offsetHeight + 'px';
            }

            if (fabricCanvas.upperCanvasEl) {
                fabricCanvas.upperCanvasEl.style.width = pdfContainer.offsetWidth + 'px';
                fabricCanvas.upperCanvasEl.style.height = pdfContainer.offsetHeight + 'px';
            }

            // Store reference to this fabricCanvas
            this.fabricCanvas = fabricCanvas;

            // Initialize brush
            if (!fabricCanvas.freeDrawingBrush) {
                fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
            }
            fabricCanvas.freeDrawingBrush.width = 5;
            fabricCanvas.freeDrawingBrush.color = '#FF0000';
            fabricCanvas.freeDrawingBrush.scribbleMode = false;
            fabricCanvas.freeDrawingBrush.markerMode = false;
        } catch (error) {
            console.error(`[PDFX Scribble] Error creating fabric canvas: ${error.message}`);
            return null;
        }

        // Create scribble options
        const scribbleOptions = {
            blockId: blockId,
            userId: block.getAttribute('data-user-id') || 'anonymous',
            courseId: block.getAttribute('data-course-id') || '',
            color: '#FF0000',
            width: 5,
            saveIntervalTime: 10000,
            ...(serverData || {})
        };

        // Try to create scribble instance
        try {
            if (typeof PdfxScribble === 'function') {
                console.log(`[PDFX Scribble] Creating PdfxScribble instance for block ${blockId}`);
                const scribbleInstance = new PdfxScribble(block, scribbleOptions);
                scribbleInstance.init(fabricCanvas);

                // Store the instance
                this.scribbleInstance = scribbleInstance;

                return scribbleInstance;
            } else {
                console.error(`[PDFX Scribble] PdfxScribble class not found for block ${blockId}`);
            }
        } catch (error) {
            console.error(`[PDFX Scribble] Error creating scribble instance: ${error.message}`);
            return null;
        }

        return null;
    },

    // Fix canvas size
    fixCanvasSize: function() {
        if (!this.fabricCanvas) {
            this.log('No fabric canvas available for fixing size');
            return;
        }

        const blockId = this.blockId;
        const pdfContainer = document.getElementById(`pdf-container-${blockId}`);
        if (!pdfContainer) {
            this.log('PDF container not found');
            return;
        }

        console.log(`[PDFX Scribble] Fixing canvas size for block ${blockId}`);

        const width = pdfContainer.offsetWidth;
        const height = pdfContainer.offsetHeight;

        // Set fabric canvas dimensions
        this.fabricCanvas.setWidth(width);
        this.fabricCanvas.setHeight(height);

        // Fix canvas container
        const canvasContainer = this.fabricCanvas.wrapperEl;
        if (canvasContainer) {
            canvasContainer.style.width = width + 'px';
            canvasContainer.style.height = height + 'px';
        }

        // Fix both lower and upper canvas dimensions
        if (this.fabricCanvas.lowerCanvasEl) {
            this.fabricCanvas.lowerCanvasEl.style.width = width + 'px';
            this.fabricCanvas.lowerCanvasEl.style.height = height + 'px';
        }

        if (this.fabricCanvas.upperCanvasEl) {
            this.fabricCanvas.upperCanvasEl.style.width = width + 'px';
            this.fabricCanvas.upperCanvasEl.style.height = height + 'px';
        }

        this.log(`Canvas size fixed to ${width}x${height}`);
    },

    // Clear strokes on current page
    clearCurrentPage: function() {
        console.log(`[PDFX Scribble] Clearing current page for block ${this.blockId}`);

        // If we have our own fabricCanvas, clear it
        if (this.fabricCanvas) {
            try {
                // Get current page
                const instance = PDFX.getInstance(this.blockId);
                const currentPage = instance?.core?.currentPage || 1;

                // Remove all objects that are on the current page
                const objects = this.fabricCanvas.getObjects();
                for (let i = objects.length - 1; i >= 0; i--) {
                    const obj = objects[i];
                    if (!obj.page || obj.page === currentPage) {
                        this.fabricCanvas.remove(obj);
                    }
                }

                this.fabricCanvas.renderAll();
                console.log(`[PDFX Scribble] Canvas cleared for page ${currentPage}`);

                // If we have a scribble instance with stroke storage, clear that too
                if (this.scribbleInstance && typeof this.scribbleInstance.clearPage === 'function') {
                    this.scribbleInstance.clearPage(currentPage);
                }
            } catch (error) {
                console.error(`[PDFX Scribble] Error clearing canvas: ${error.message}`);
            }
        }

        // Check for global scribble instance
        const scribbleInstance = window[`scribbleInstance_${this.blockId}`];
        if (scribbleInstance) {
            // Try various methods that might exist
            if (typeof scribbleInstance.clearPage === 'function') {
                scribbleInstance.clearPage();
            } else if (typeof scribbleInstance.clearCurrentPage === 'function') {
                scribbleInstance.clearCurrentPage();
            } else if (typeof scribbleInstance.clear === 'function') {
                scribbleInstance.clear();
            }
        }

        // Check for global fabricCanvas
        const fabricCanvas = window[`fabricCanvas_${this.blockId}`];
        if (fabricCanvas) {
            try {
                const instance = PDFX.getInstance(this.blockId);
                const currentPage = instance?.core?.currentPage || 1;

                // Remove all drawing objects
                const objects = fabricCanvas.getObjects();
                for (let i = objects.length - 1; i >= 0; i--) {
                    const obj = objects[i];
                    if (!obj.page || obj.page === currentPage) {
                        fabricCanvas.remove(obj);
                    }
                }

                fabricCanvas.renderAll();
            } catch (error) {
                console.error(`[PDFX Scribble] Error clearing global fabric canvas: ${error.message}`);
            }
        }

        return true;
    }
};

// Module: PDF Rendering
PDFX.Rendering = {
    init: function(blockId, options) {
        this.blockId = blockId;
        this.options = options || {};
        this.debugMode = options.debugMode || false;

        console.log(`[PDFX Rendering] Initializing Rendering module for block ${blockId}`);

        // Add event listeners for rendering events
        this.setupEventListeners();

        return this;
    },

    log: function(message, force) {
        if (this.debugMode || force) {
            console.debug(`[PDFX Rendering] ${message}`);
        }
    },

    // Set up event listeners for rendering events
    setupEventListeners: function() {
        const blockId = this.blockId;
        const renderingModule = this;

        // Listen for page rendering events
        document.addEventListener('pdfx:beforerenderpage', function(event) {
            if (event.detail.blockId === blockId) {
                console.log(`[PDFX Rendering] Before render page event for block ${blockId}, page ${event.detail.pageNum}`);

                // This event is fired before rendering a page
                const page = event.detail.page;
                const pageNum = event.detail.pageNum;

                // Let's implement the actual rendering logic
                renderingModule.renderPage(page, pageNum);
            }
        });
    },

    // Render a specific page
    renderPage: function(page, pageNum) {
        console.log(`[PDFX Rendering] Rendering page ${pageNum} for block ${this.blockId}`);

        const blockId = this.blockId;
        const instance = PDFX.getInstance(blockId);

        if (!instance || !instance.core) {
            console.error(`[PDFX Rendering] No instance or core module found for block ${blockId}`);
            return;
        }

        // Get canvas and container elements
        const pdfCanvas = document.getElementById(`pdf-canvas-${blockId}`);
        const pdfContainer = document.getElementById(`pdf-container-${blockId}`);

        if (!pdfCanvas || !pdfContainer) {
            console.error(`[PDFX Rendering] Canvas or container not found for block ${blockId}`);
            return;
        }

        // Get viewport with current scale
        let viewport;
        const viewMode = instance.core.viewMode;
        const pdfViewer = document.querySelector(`#pdfx-block-${blockId} .pdf-viewer`);

        if (viewMode === 'fit-width' && pdfViewer) {
            // Calculate scale to fit width
            const containerWidth = pdfViewer.offsetWidth - 30; // Subtract padding
            const originalViewport = page.getViewport({ scale: 1.0 });
            const scale = containerWidth / originalViewport.width;
            viewport = page.getViewport({ scale });
            instance.core.scale = scale;

            this.log(`Set fit-width scale to ${scale}`);
        } else if (viewMode === 'fit-page' && pdfViewer) {
            // Calculate scale to fit entire page
            const containerWidth = pdfViewer.offsetWidth - 30;
            const containerHeight = pdfViewer.offsetHeight - 30;
            const originalViewport = page.getViewport({ scale: 1.0 });
            const scaleX = containerWidth / originalViewport.width;
            const scaleY = containerHeight / originalViewport.height;
            const scale = Math.min(scaleX, scaleY);
            viewport = page.getViewport({ scale });
            instance.core.scale = scale;

            this.log(`Set fit-page scale to ${scale}`);
        } else {
            // Use custom scale
            viewport = page.getViewport({ scale: instance.core.scale });
            this.log(`Using custom scale: ${instance.core.scale}`);
        }

        // Set canvas dimensions
        const context = pdfCanvas.getContext('2d');
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;

        // Set container dimensions
        pdfContainer.style.width = viewport.width + 'px';
        pdfContainer.style.height = viewport.height + 'px';

        // Resize and fix drawing canvas
        this.setupDrawingLayers(viewport.width, viewport.height);

        // Prepare text layer for highlighting
        this.updateTextLayer(page, viewport);

        // Render PDF page into canvas context
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        console.log(`[PDFX Rendering] Rendering page ${pageNum} with dimensions ${viewport.width}x${viewport.height}`);

        // Render the page
        page.render(renderContext).promise
            .then(() => {
                // Apply filters (brightness, grayscale)
                this.applyFilters();

                // Restore annotations after the page is rendered
                if (instance.storage) {
                    // Delay slightly to ensure text layer is ready
                    setTimeout(() => {
                        this.restoreAnnotations();

                        // Fix canvas container again after annotations are restored
                        if (instance.canvas && typeof instance.canvas.fixCanvasContainer === 'function') {
                            instance.canvas.fixCanvasContainer();
                        }
                    }, 100);
                }

                console.log(`[PDFX Rendering] Page ${pageNum} rendered successfully`);
            })
            .catch(error => {
                console.error(`[PDFX Rendering] Error rendering page ${pageNum}: ${error.message}`);
            });

        // Update UI
        if (instance.ui) {
            instance.ui.updatePageDisplay(pageNum, instance.core.pdfDoc.numPages);
            instance.ui.updateZoomDisplay(instance.core.scale);
        }
    },

    // Set up drawing and text layers
    setupDrawingLayers: function(width, height) {
        const blockId = this.blockId;

        console.log(`[PDFX Rendering] Setting up drawing layers with size ${width}x${height}`);

        // Get drawing container
        const drawContainer = document.getElementById(`draw-container-${blockId}`);
        if (!drawContainer) {
            console.warn(`[PDFX Rendering] Draw container not found for block ${blockId}`);
            return;
        }

        // Update dimensions
        drawContainer.style.width = width + 'px';
        drawContainer.style.height = height + 'px';

        // Update text layer
        const textLayer = document.getElementById(`text-layer-${blockId}`);
        if (textLayer) {
            textLayer.style.width = width + 'px';
            textLayer.style.height = height + 'px';
        }

        // Update highlight layer
        const highlightLayer = document.getElementById(`highlight-layer-${blockId}`);
        if (highlightLayer) {
            highlightLayer.style.width = width + 'px';
            highlightLayer.style.height = height + 'px';
        }
    },

    // Update text layer for highlighting
    updateTextLayer: function(page, viewport) {
        const blockId = this.blockId;
        const textLayer = document.getElementById(`text-layer-${blockId}`);

        if (!textLayer) {
            this.log('Text layer not found');
            return;
        }

        console.log(`[PDFX Rendering] Updating text layer for block ${blockId}`);

        // Clear any existing content
        textLayer.innerHTML = '';

        // Set dimensions
        textLayer.style.width = viewport.width + 'px';
        textLayer.style.height = viewport.height + 'px';

        // Set scale factor CSS variable for proper text sizing
        textLayer.style.setProperty('--scale-factor', viewport.scale);

        // Get text content
        page.getTextContent().then(textContent => {
            // Check if we have the newer version of PDF.js
            if (typeof pdfjsLib.renderTextLayer === 'function') {
                console.log(`[PDFX Rendering] Using PDF.js native renderTextLayer`);

                const renderTextLayerTask = pdfjsLib.renderTextLayer({
                    textContentSource: textContent,
                    container: textLayer,
                    viewport: viewport,
                    textDivs: []
                });

                renderTextLayerTask.promise.then(() => {
                    this.applyTextLayerFixes(textLayer, viewport.scale);
                });
            } else {
                console.log(`[PDFX Rendering] Using manual text layer rendering`);
                // Fallback for older PDF.js versions
                this.renderTextLayerManually(textLayer, textContent, viewport);
            }
        });
    },

    // Apply text layer fixes
    applyTextLayerFixes: function(textLayer, scale) {
        if (!textLayer) {
            return;
        }

        console.log(`[PDFX Rendering] Applying text layer fixes at scale ${scale}`);

        // Apply styles to text spans
        const textSpans = textLayer.querySelectorAll('span');

        textSpans.forEach(span => {
            // Make text transparent but selectable
            span.style.color = 'transparent';
            span.style.userSelect = 'text';
            span.style.webkitUserSelect = 'text';
            span.style.MozUserSelect = 'text';
            span.style.msUserSelect = 'text';
            span.style.cursor = 'text';
            span.style.pointerEvents = 'all';

            // Ensure proper line height
            if (!span.style.lineHeight) {
                span.style.lineHeight = '1.0';
            }

            // Add font fallbacks
            if (span.style.fontFamily) {
                const currentFont = span.style.fontFamily;
                if (!currentFont.includes(',')) {
                    span.style.fontFamily = `${currentFont}, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
                }
            }
        });

        console.log(`[PDFX Rendering] Applied styles to ${textSpans.length} text spans`);
    },

    // Render text layer manually for older PDF.js versions
    renderTextLayerManually: function(textLayer, textContent, viewport) {
        console.log(`[PDFX Rendering] Manually rendering text layer with ${textContent.items.length} text items`);

        textContent.items.forEach(item => {
            try {
                const tx = pdfjsLib.Util.transform(
                    viewport.transform,
                    [1, 0, 0, -1, item.transform[4], item.transform[5]]
                );

                const style = textContent.styles[item.fontName];

                // Create text span
                const span = document.createElement('span');
                span.textContent = item.str;

                // Apply font styling
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

                textLayer.appendChild(span);
            } catch (e) {
                console.warn(`[PDFX Rendering] Error rendering text item: ${e.message}`);
            }
        });
    },

    // Apply filters (brightness, grayscale)
    applyFilters: function() {
        const blockId = this.blockId;
        const instance = PDFX.getInstance(blockId);

        if (!instance) {
            console.error(`[PDFX Rendering] No instance found for block ${blockId}`);
            return;
        }

        const options = instance.options;

        const canvas = document.getElementById(`pdf-canvas-${blockId}`);
        if (!canvas) {
            console.warn(`[PDFX Rendering] Canvas not found for block ${blockId}`);
            return;
        }

        console.log(`[PDFX Rendering] Applying filters to canvas for block ${blockId}`);

        // Get filter settings from options
        const brightness = options.brightness || 100;
        const isGrayscale = options.isGrayscale || false;

        // Apply filters
        let filterValue = '';

        if (isGrayscale) {
            filterValue += 'grayscale(1) ';
            document.querySelector(`#pdfx-block-${blockId} .toggle-grayscale`)?.classList.add('active');
            this.log('Applied grayscale filter');
        } else {
            filterValue += 'grayscale(0) ';
            document.querySelector(`#pdfx-block-${blockId} .toggle-grayscale`)?.classList.remove('active');
        }

        // Apply brightness
        const brightnessValue = brightness / 100;
        filterValue += `brightness(${brightnessValue})`;
        this.log(`Applied brightness filter: ${brightness}%`);

        // Apply filter to canvas
        canvas.style.filter = filterValue;
    },

    // Restore annotations after rendering
    restoreAnnotations: function() {
        const blockId = this.blockId;
        const instance = PDFX.getInstance(blockId);

        if (!instance || !instance.tools) {
            console.error(`[PDFX Rendering] No instance or tools module found for block ${blockId}`);
            return;
        }

        console.log(`[PDFX Rendering] Restoring annotations for block ${blockId}`);

        // Get tool instances
        const highlighter = instance.tools.getTool('highlight');
        const marker = instance.tools.getTool('marker');
        const textTool = instance.tools.getTool('text');
        const shapeTool = instance.tools.getTool('shape');
        const noteTool = instance.tools.getTool('note');

        // Restore highlights
        if (highlighter && typeof highlighter.restoreHighlights === 'function') {
            highlighter.restoreHighlights();
            this.log('Restored highlights');
        }

        // Notify tools about page change
        const currentPage = instance.core.currentPage;

        if (marker && typeof marker.setCurrentPage === 'function') {
            marker.setCurrentPage(currentPage);
        }

        if (textTool && typeof textTool.setCurrentPage === 'function') {
            textTool.setCurrentPage(currentPage);
        }

        if (shapeTool && typeof shapeTool.setCurrentPage === 'function') {
            shapeTool.setCurrentPage(currentPage);
        }

        if (noteTool && typeof noteTool.setCurrentPage === 'function') {
            noteTool.setCurrentPage(currentPage);
        }

        console.log(`[PDFX Rendering] All annotations restored for page ${currentPage}`);
    }
};

// Initialize a complete PDFX instance
PDFX.initInstance = function(blockId, options) {
    console.log(`[PDFX] Initializing instance for block ${blockId}`);

    if (PDFX.instances && PDFX.instances[blockId]) {
        console.log(`[PDFX] Instance for block ${blockId} already exists, returning existing instance`);
        return PDFX.instances[blockId];
    }

    // Create instance container
    const instance = {
        blockId: blockId,
        options: options || {},
        debugMode: options.debugMode || false
    };

    // Initialize all modules
    instance.core = Object.create(PDFX.Core);
    instance.core.init(blockId, options);

    instance.tools = Object.create(PDFX.Tools);
    instance.tools.init(blockId, options);

    instance.ui = Object.create(PDFX.UI);
    instance.ui.init(blockId, options);

    instance.canvas = Object.create(PDFX.Canvas);
    instance.canvas.init(blockId, options);

    instance.storage = Object.create(PDFX.Storage);
    instance.storage.init(blockId, options);

    // Initialize new modules
    instance.scribble = Object.create(PDFX.Scribble);
    instance.scribble.init(blockId, options);

    instance.rendering = Object.create(PDFX.Rendering);
    instance.rendering.init(blockId, options);

    // Store instance globally
    PDFX.instances = PDFX.instances || {};
    PDFX.instances[blockId] = instance;

    console.log(`[PDFX] Instance for block ${blockId} successfully initialized`);
    return instance;
};

// Initialize the PDFJSInitializer module
PDFX.PDFJSInitializer.init();