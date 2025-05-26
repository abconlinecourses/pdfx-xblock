/**
 * PDF.js Initialization
 *
 * This module initializes the PDF.js library with proper configuration.
 * It must be loaded before any other PDF.js-dependent modules.
 */

// Global function to reset pointer events, ensuring buttons remain clickable
// This is the original implementation for backward compatibility
function resetPointerEvents(blockId) {
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
}

// Global tool activation/deactivation functions
window.activateToolByName = function(toolName, blockId) {
    // Check for modular system first
    const instance = window[`pdfxInstance_${blockId}`];
    if (instance && instance.tools) {
        return instance.tools.activateTool(toolName);
    }

    // Handle specific tools first
    if (toolName === 'marker') {
        // Apply emergency canvas fix when marker tool is activated
        if (typeof window.emergencyFixCanvasContainer === 'function') {
            window.emergencyFixCanvasContainer(blockId);
        }

        var scribbleInstance = window[`scribbleInstance_${blockId}`];
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
                    window.emergencyFixCanvasContainer(blockId);
                }

                if (typeof window.fixCanvasContainerSize === 'function') {
                    window.fixCanvasContainerSize(blockId);
                }

                if (scribbleInstance && typeof scribbleInstance.forceCanvasResize === 'function') {
                    scribbleInstance.forceCanvasResize();
                }

                // Direct DOM manipulation as last resort
                var pdfContainer = document.getElementById(`pdf-container-${blockId}`);
                var canvasContainer = document.querySelector(`#draw-container-${blockId} .canvas-container`);

                if (pdfContainer && canvasContainer) {
                    var width = pdfContainer.offsetWidth;
                    var height = pdfContainer.offsetHeight;

                    canvasContainer.style.width = width + 'px';
                    canvasContainer.style.height = height + 'px';

                    var canvases = canvasContainer.querySelectorAll('canvas');
                    canvases.forEach(function(canvas) {
                        canvas.width = width;
                        canvas.height = height;
                        canvas.style.width = width + 'px';
                        canvas.style.height = height + 'px';
                    });
                }
            }, 100);

            return;
        } else {
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
                return;
            }

            if (typeof highlightInstance.enableTextHighlighting !== 'function') {
                return;
            }

            // Make sure text layer is visible and prepared
            var textLayer = document.getElementById(`text-layer-${blockId}`);
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

            return;
        } catch (highlightError) {
            return;
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
        }
    }
};

// Generic function to deactivate a tool by name
window.deactivateToolByName = function(toolName, blockId) {
    // Check for modular system first
    const instance = window[`pdfxInstance_${blockId}`];
    if (instance && instance.tools) {
        return instance.tools.deactivateTool(toolName);
    }

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
            }

            // Ensure tool buttons are still clickable
            var toolButtons = document.querySelectorAll(`[id$="-tool-${blockId}"]`);
            toolButtons.forEach(function(button) {
                button.style.pointerEvents = 'auto';
            });

            // Force a small delay to ensure UI responsiveness
            setTimeout(function() {
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
                // Fallback: try to manually disable text highlighting
                var textLayer = document.getElementById(`text-layer-${blockId}`);
                if (textLayer) {
                    textLayer.style.pointerEvents = 'none';
                    $(textLayer).removeClass('active highlight-tool-active');
                }
                return;
            }

            if (typeof highlightInstance.disableTextHighlighting !== 'function') {
                // Fallback: try to manually disable text highlighting
                var textLayer = document.getElementById(`text-layer-${blockId}`);
                if (textLayer) {
                    textLayer.style.pointerEvents = 'none';
                    $(textLayer).removeClass('active highlight-tool-active');
                }
                return;
            }

            // Call disableTextHighlighting
            var result = highlightInstance.disableTextHighlighting();

            // Reset text layer properties even if the method fails
            var textLayer = document.getElementById(`text-layer-${blockId}`);
            if (textLayer) {
                textLayer.style.pointerEvents = 'none';
                $(textLayer).removeClass('highlight-tool-active');
            }

            return;
        } catch (error) {
            // Emergency fallback
            try {
                var textLayer = document.getElementById(`text-layer-${blockId}`);
                if (textLayer) {
                    textLayer.style.pointerEvents = 'none';
                    textLayer.style.cursor = 'default';
                    $(textLayer).removeClass('active highlight-tool-active');
                }
            } catch (e) {
                return;
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

    var block = document.getElementById(`pdfx-block-${blockId}`);
    var drawContainer = document.getElementById(`draw-container-${blockId}`);
    var pdfContainer = document.getElementById(`pdf-container-${blockId}`);
    var dataElement = document.getElementById(`pdfx-data-${blockId}`);

    if (!block || !drawContainer || !pdfContainer) {
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

        // Set correct dimensions
        fabricCanvas.setWidth(pdfContainer.offsetWidth);
        fabricCanvas.setHeight(pdfContainer.offsetHeight);

        // Fix canvas container size
        var canvasContainer = fabricCanvas.wrapperEl;
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

            return scribbleInstance;
        }
    } catch (error) {
        return null;
    }

    return null;
};

// This code has been migrated to PDFX.PDFJSInitializer in pdfx_modules.js
// The IIFE implementation has been removed to avoid code duplication

console.debug('[PDFX] Using module-based initialization from pdfx_modules.js');
if (typeof PDFX === 'undefined' || !PDFX.PDFJSInitializer) {
    console.error('[PDFX] Module system not loaded. Please ensure pdfx_modules.js is included before this file.');
}

// PDF XBlock initialization
function PdfxInit(runtime, element, options) {
    'use strict';

    // Extract block ID from element ID
    var blockId = element.id.replace('pdfx-block-', '');

    // Check if the modular system is available
    if (window.PDFX && typeof window.PDFX.initInstance === 'function') {
        // Extended options with runtime
        const extendedOptions = {
            ...options,
            runtime: runtime,
            handlerUrl: runtime.handlerUrl(element, 'save_annotations'),
            debugMode: options.debugMode || false
        };

        // Initialize using the modular system
        var instance = window.PDFX.initInstance(blockId, extendedOptions);

        // Initialize fabric canvas
        if (instance.canvas) {
            instance.canvas.initFabricCanvas();
        }

        // Load the PDF document
        if (instance.core && options.pdfUrl) {
            instance.core.loadDocument(options.pdfUrl)
                .then(function(pdfDoc) {
                    // Update page count in UI
                    if (instance.ui) {
                        instance.ui.updatePageDisplay(instance.core.currentPage, pdfDoc.numPages);
                    }

                    // Navigate to initial page
                    return instance.core.navigateToPage(options.currentPage || 1);
                })
                .catch(function(error) {
                    $(element).find('.loading-indicator').hide();
                    $(element).find('.pdf-fallback').show();
                });
        }

        // Setup event listeners for the modular system
        setupModularEventListeners(instance, element, options);

        return;
    }

    // Legacy initialization (to ensure backward compatibility)

    // ... rest of the original initialization code can remain for backward compatibility
    // ... but we will eventually remove it once the modular system is fully adopted
}

// Setup event listeners for the modular system
function setupModularEventListeners(instance, element, options) {
    const blockId = instance.blockId;

    // Page navigation events
    document.addEventListener('pdfx:prevpage', function(event) {
        if (event.detail.blockId === blockId && instance.core) {
            const prevPage = instance.core.currentPage - 1;
            if (prevPage >= 1) {
                instance.core.navigateToPage(prevPage);
            }
        }
    });

    document.addEventListener('pdfx:nextpage', function(event) {
        if (event.detail.blockId === blockId && instance.core) {
            const nextPage = instance.core.currentPage + 1;
            if (instance.core.pdfDoc && nextPage <= instance.core.pdfDoc.numPages) {
                instance.core.navigateToPage(nextPage);
            }
        }
    });

    // Zoom events
    document.addEventListener('pdfx:zoomin', function(event) {
        if (event.detail.blockId === blockId && instance.core) {
            instance.core.scale *= 1.2;
            instance.core.viewMode = 'custom';
            instance.core.renderCurrentPage();

            // Update zoom display
            if (instance.ui) {
                instance.ui.updateZoomDisplay(instance.core.scale);
            }
        }
    });

    document.addEventListener('pdfx:zoomout', function(event) {
        if (event.detail.blockId === blockId && instance.core) {
            instance.core.scale *= 0.8;
            instance.core.viewMode = 'custom';
            instance.core.renderCurrentPage();

            // Update zoom display
            if (instance.ui) {
                instance.ui.updateZoomDisplay(instance.core.scale);
            }
        }
    });

    // Page render events
    document.addEventListener('pdfx:beforerenderpage', function(event) {
        if (event.detail.blockId === blockId) {
            // This event is fired before rendering a page
            // We can prepare the canvas, text layer, etc. here
            const page = event.detail.page;
            const pageNum = event.detail.pageNum;

            // Let's implement the actual rendering logic
            renderPageImplementation(instance, page, pageNum, element);
        }
    });

    // Tool activation events
    document.addEventListener('pdfx:toolactivated', function(event) {
        if (event.detail.blockId === blockId) {
            // A tool was activated
            const toolName = event.detail.toolName;

            // Apply any tool-specific UI changes here
            updateUIForActivatedTool(instance, toolName, element);
        }
    });

    document.addEventListener('pdfx:tooldeactivated', function(event) {
        if (event.detail.blockId === blockId) {
            // A tool was deactivated
            const toolName = event.detail.toolName;

            // Reset UI as needed
            resetUIAfterToolDeactivation(instance, toolName, element);
        }
    });
}

// Render a page with the modular system
function renderPageImplementation(instance, page, pageNum, element) {
    const blockId = instance.blockId;

    // Get canvas and container elements
    const pdfCanvas = document.getElementById(`pdf-canvas-${blockId}`);
    const pdfContainer = document.getElementById(`pdf-container-${blockId}`);

    if (!pdfCanvas || !pdfContainer) {
        return;
    }

    // Get viewport with current scale
    let viewport;
    const viewMode = instance.core.viewMode;
    const pdfViewer = element.querySelector('.pdf-viewer');

    if (viewMode === 'fit-width' && pdfViewer) {
        // Calculate scale to fit width
        const containerWidth = pdfViewer.offsetWidth - 30; // Subtract padding
        const originalViewport = page.getViewport({ scale: 1.0 });
        const scale = containerWidth / originalViewport.width;
        viewport = page.getViewport({ scale: scale });
        instance.core.scale = scale;
    } else if (viewMode === 'fit-page' && pdfViewer) {
        // Calculate scale to fit entire page
        const containerWidth = pdfViewer.offsetWidth - 30;
        const containerHeight = pdfViewer.offsetHeight - 30;
        const originalViewport = page.getViewport({ scale: 1.0 });
        const scaleX = containerWidth / originalViewport.width;
        const scaleY = containerHeight / originalViewport.height;
        const scale = Math.min(scaleX, scaleY);
        viewport = page.getViewport({ scale: scale });
        instance.core.scale = scale;
    } else {
        // Use custom scale
        viewport = page.getViewport({ scale: instance.core.scale });
    }

    // Set canvas dimensions
    const context = pdfCanvas.getContext('2d');
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;

    // Set container dimensions
    pdfContainer.style.width = viewport.width + 'px';
    pdfContainer.style.height = viewport.height + 'px';

    // Resize drawing canvas and properly fix the canvas container
    if (instance.canvas) {
        instance.canvas.resizeCanvas(viewport.width, viewport.height);

        // Make sure the canvas container is fixed correctly
        if (typeof instance.canvas.fixCanvasContainer === 'function') {
            instance.canvas.fixCanvasContainer();
        }
    }

    // Fix canvas container for scribble instance as well
    var scribbleInstance = window[`scribbleInstance_${blockId}`];
    if (scribbleInstance && typeof scribbleInstance.fixCanvasContainer === 'function') {
        scribbleInstance.fixCanvasContainer();
    } else {
        // Fallback for direct fabric canvas
        var fabricCanvas = window[`fabricCanvas_${blockId}`];
        if (fabricCanvas) {
            // Fix fabric canvas container size
            const canvasContainer = fabricCanvas.wrapperEl;
            if (canvasContainer) {
                canvasContainer.style.width = viewport.width + 'px';
                canvasContainer.style.height = viewport.height + 'px';
            }

            // Fix both lower and upper canvas dimensions
            if (fabricCanvas.lowerCanvasEl) {
                fabricCanvas.lowerCanvasEl.style.width = viewport.width + 'px';
                fabricCanvas.lowerCanvasEl.style.height = viewport.height + 'px';
            }

            if (fabricCanvas.upperCanvasEl) {
                fabricCanvas.upperCanvasEl.style.width = viewport.width + 'px';
                fabricCanvas.upperCanvasEl.style.height = viewport.height + 'px';
            }
        }
    }

    // Setup drawing and text layers
    setupDrawingLayers(instance, viewport.width, viewport.height);

    // Prepare text layer
    updateTextLayer(instance, page, viewport);

    // Render PDF page into canvas context
    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };

    // Render the page
    page.render(renderContext).promise
        .then(function() {
            // Apply filters (brightness, grayscale)
            applyFilters(instance, element);

            // Restore annotations after the page is rendered
            if (instance.storage) {
                // Delay slightly to ensure text layer is ready
                setTimeout(function() {
                    restoreAnnotations(instance);

                    // Fix canvas container again after annotations are restored
                    if (instance.canvas && typeof instance.canvas.fixCanvasContainer === 'function') {
                        instance.canvas.fixCanvasContainer();
                    }
                }, 100);
            }
        })
        .catch(function(error) {
        });

    // Update UI
    if (instance.ui) {
        instance.ui.updatePageDisplay(pageNum, instance.core.pdfDoc.numPages);
        instance.ui.updateZoomDisplay(instance.core.scale);
    }
}

// Setup drawing layers
function setupDrawingLayers(instance, width, height) {
    const blockId = instance.blockId;

    // Get drawing container
    const drawContainer = document.getElementById(`draw-container-${blockId}`);
    if (!drawContainer) {
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
}

// Update text layer for highlighting
function updateTextLayer(instance, page, viewport) {
    const blockId = instance.blockId;
    const textLayer = document.getElementById(`text-layer-${blockId}`);

    if (!textLayer) {
        return;
    }

    // Clear any existing content
    textLayer.innerHTML = '';

    // Set dimensions
    textLayer.style.width = viewport.width + 'px';
    textLayer.style.height = viewport.height + 'px';

    // Set scale factor CSS variable for proper text sizing
    textLayer.style.setProperty('--scale-factor', viewport.scale);

    // Get text content
    page.getTextContent().then(function(textContent) {
        // Check if we have the newer version of PDF.js
        if (typeof pdfjsLib.renderTextLayer === 'function') {
            const renderTextLayerTask = pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayer,
                viewport: viewport,
                textDivs: []
            });

            renderTextLayerTask.promise.then(function() {
                applyTextLayerFixes(textLayer, viewport.scale);
            });
        } else {
            // Fallback for older PDF.js versions
            renderTextLayerManually(textLayer, textContent, viewport);
        }
    });
}

// Apply text layer fixes
function applyTextLayerFixes(textLayer, scale) {
    if (!textLayer) {
        return;
    }

    // Apply styles to text spans
    const textSpans = textLayer.querySelectorAll('span');

    textSpans.forEach(function(span) {
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
}

// Render text layer manually (for older PDF.js versions)
function renderTextLayerManually(textLayer, textContent, viewport) {
    textContent.items.forEach(function(item) {
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
        }
    });
}

// Apply filters (brightness, grayscale)
function applyFilters(instance, element) {
    const blockId = instance.blockId;
    const options = instance.options;

    const canvas = document.getElementById(`pdf-canvas-${blockId}`);
    if (!canvas) {
        return;
    }

    // Get filter settings from options
    const brightness = options.brightness || 100;
    const isGrayscale = options.isGrayscale || false;

    // Apply filters
    let filterValue = '';

    if (isGrayscale) {
        filterValue += 'grayscale(1) ';
        $(element).find('.toggle-grayscale').addClass('active');
    } else {
        filterValue += 'grayscale(0) ';
        $(element).find('.toggle-grayscale').removeClass('active');
    }

    // Apply brightness
    const brightnessValue = brightness / 100;
    filterValue += `brightness(${brightnessValue})`;

    // Apply filter to canvas
    canvas.style.filter = filterValue;
}

// Restore annotations after rendering
function restoreAnnotations(instance) {
    const blockId = instance.blockId;

    // Get tool instances
    const highlighter = instance.tools.getTool('highlight');
    const marker = instance.tools.getTool('marker');
    const textTool = instance.tools.getTool('text');
    const shapeTool = instance.tools.getTool('shape');
    const noteTool = instance.tools.getTool('note');

    // Restore highlights
    if (highlighter && typeof highlighter.restoreHighlights === 'function') {
        highlighter.restoreHighlights();
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
}

// Update UI when a tool is activated
function updateUIForActivatedTool(instance, toolName, element) {
    const blockId = instance.blockId;

    // Set cursor based on tool
    const drawContainer = document.getElementById(`draw-container-${blockId}`);
    if (!drawContainer) {
        return;
    }

    // Set appropriate cursor style
    switch (toolName) {
        case 'marker':
        case 'scribble':
            drawContainer.style.cursor = 'crosshair';
            break;
        case 'highlight':
            drawContainer.style.cursor = 'text';
            break;
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
            drawContainer.style.cursor = 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 0 1-5.66 0L2.81 17a2.998 2.998 0 0 1 0-4.24l9.24-9.21c1.21-1.21 3.17-1.21 4.19.01z"/></svg>\') 12 12, auto';
            break;
        default:
            drawContainer.style.cursor = 'default';
    }
}

// Reset UI after a tool is deactivated
function resetUIAfterToolDeactivation(instance, toolName, element) {
    const blockId = instance.blockId;

    // Reset cursor
    const drawContainer = document.getElementById(`draw-container-${blockId}`);
    if (drawContainer) {
        drawContainer.style.cursor = 'default';
    }

    // Reset text layer for highlight tool
    if (toolName === 'highlight') {
        const textLayer = document.getElementById(`text-layer-${blockId}`);
        if (textLayer) {
            textLayer.style.pointerEvents = 'none';
            $(textLayer).removeClass('active highlight-tool-active');
        }
    }
}

// Function to ensure tool buttons remain clickable
function ensureToolButtonsRemainClickable(blockId) {
    const toolButtons = document.querySelectorAll(`[id$="-tool-${blockId}"]`);
    toolButtons.forEach(function(button) {
        button.style.pointerEvents = 'auto';
    });
}