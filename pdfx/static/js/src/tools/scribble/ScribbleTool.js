/**
 * ScribbleTool - Drawing and scribble functionality for PDF.js integration
 * Integrates with pdfx-init.js PdfxViewer class
 */
window.ScribbleTool = class ScribbleTool {
    constructor(viewer, annotationInterface = null) {
        this.viewer = viewer;
        this.blockId = viewer.blockId;
        this.annotationInterface = annotationInterface;

        // Drawing configuration
        this.inkColor = '#FF0000';
        this.inkThickness = 1;
        this.inkOpacity = 1;

        // Drawing state
        this.isDrawing = false;
        this.currentStroke = [];
        this.allCanvases = [];

        // Zoom handling
        this.currentScale = 1;
        this.zoomHandler = null;

        this.init();
    }

    init() {
        console.log(`[ScribbleTool] Initializing for block: ${this.blockId}`);
        this.setupToolButton();
        this.initScribbleControls();
        this.setupZoomHandler();
    }

    setupToolButton() {
        const scribbleBtn = document.getElementById(`scribbleTool-${this.blockId}`);
        const scribbleToolbar = document.getElementById(`editorInkParamsToolbar-${this.blockId}`);

        if (scribbleBtn) {
            scribbleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewer.setActiveTool('scribble');
                this.viewer.toggleParameterToolbar(scribbleBtn, scribbleToolbar);
            });
        }
    }

    activate() {
        console.log(`[ScribbleTool] Activating drawing mode for block: ${this.blockId}`);
        this.enableDrawingMode();
    }

    deactivate() {
        console.log(`[ScribbleTool] Deactivating drawing mode for block: ${this.blockId}`);
        this.disableDrawingMode();
    }

    enableDrawingMode() {
        // Set scribbling flag for text layers (similar to highlighting)
        this.setTextLayerScribbleMode(true);

        // Add drawing mode class to viewer
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.classList.add('drawing-mode');
        }

        // Setup drawing canvas overlays for each page
        this.setupDrawingCanvases();

        // Activate all drawing canvases
        const canvases = document.querySelectorAll(`#pdfx-block-${this.blockId} .drawing-canvas`);
        canvases.forEach(canvas => {
            canvas.classList.add('active');
            canvas.style.pointerEvents = 'auto';
            canvas.style.cursor = 'crosshair';
        });

        // Get current ink settings
        this.updateInkSettings();

        console.log(`[ScribbleTool] Activated ${canvases.length} drawing canvases`);
    }

    disableDrawingMode() {
        // Remove scribbling flag from text layers
        this.setTextLayerScribbleMode(false);

        // Remove drawing mode class from viewer
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.classList.remove('drawing-mode');
        }

        // Deactivate drawing canvases
        const canvases = document.querySelectorAll(`#pdfx-block-${this.blockId} .drawing-canvas`);
        canvases.forEach(canvas => {
            canvas.classList.remove('active');
            canvas.style.pointerEvents = 'none';
            // Reset the listeners flag so they can be re-added when reactivated
            canvas._drawingListenersAdded = false;
        });
    }

    setTextLayerScribbleMode(isActive) {
        // Find all text layers within this PDF block and set scribbling mode
        const container = document.getElementById(`pdfx-block-${this.blockId}`);
        if (!container) return;

        const textLayers = container.querySelectorAll('.textLayer, .text-layer, [id^="textLayer-"]');
        textLayers.forEach(layer => {
            if (isActive) {
                layer.classList.add('scribbling');
            } else {
                layer.classList.remove('scribbling');
            }
        });
    }

    setupDrawingCanvases() {
        // Find all page containers
        const pages = document.querySelectorAll(`#viewerContainer-${this.blockId} .page`);

        pages.forEach((page, index) => {
            // Check if canvas already exists
            let canvas = page.querySelector('.drawing-canvas');

            if (!canvas) {
                // Create canvas for drawing
                canvas = document.createElement('canvas');
                canvas.className = 'drawing-canvas';
                canvas.style.position = 'absolute';
                canvas.style.top = '0';
                canvas.style.left = '0';
                canvas.style.zIndex = '25';
                canvas.style.pointerEvents = 'auto';
                canvas.style.cursor = 'crosshair';

                // Set canvas size to match page (will be updated on zoom)
                const pageRect = page.getBoundingClientRect();
                canvas.width = pageRect.width;
                canvas.height = pageRect.height;
                canvas.style.width = `${pageRect.width}px`;
                canvas.style.height = `${pageRect.height}px`;

                // Make page relative positioned if not already
                if (getComputedStyle(page).position === 'static') {
                    page.style.position = 'relative';
                }

                page.appendChild(canvas);
                this.allCanvases.push(canvas);

                console.log(`[ScribbleTool] Created drawing canvas for page ${index + 1} with size ${canvas.width}x${canvas.height}`);
            } else {
                // Ensure existing canvas is in our tracking list
                if (!this.allCanvases.includes(canvas)) {
                    this.allCanvases.push(canvas);
                }

                // Update canvas size to current page size
                const pageRect = page.getBoundingClientRect();
                canvas.width = pageRect.width;
                canvas.height = pageRect.height;
                canvas.style.width = `${pageRect.width}px`;
                canvas.style.height = `${pageRect.height}px`;

                // Reset canvas state for reuse
                canvas.style.pointerEvents = 'auto';
                canvas.style.cursor = 'crosshair';
                canvas._drawingListenersAdded = false; // Allow listeners to be re-added
            }

            // Add drawing listeners
            this.addDrawingListeners(canvas);
        });

        console.log(`[ScribbleTool] Setup drawing canvases for ${pages.length} pages`);
    }

    addDrawingListeners(canvas) {
        // Remove existing listeners if they exist to prevent duplicates
        if (canvas._drawingListenersAdded) {
            return; // Listeners already added
        }

        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;

        const ctx = canvas.getContext('2d');

        // Set up drawing context
        const updateDrawingContext = () => {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = this.inkColor || '#FF0000';
            ctx.lineWidth = this.inkThickness || 2;
            ctx.globalAlpha = this.inkOpacity || 1;
        };

        updateDrawingContext();

        // Store reference to this canvas for updates
        canvas._updateContext = updateDrawingContext;

        const startDrawing = (e) => {
            isDrawing = true;
            updateDrawingContext(); // Update context at start of each stroke

            const rect = canvas.getBoundingClientRect();
            lastX = e.clientX - rect.left;
            lastY = e.clientY - rect.top;

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
        };

        const draw = (e) => {
            if (!isDrawing) return;

            const rect = canvas.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;

            ctx.lineTo(currentX, currentY);
            ctx.stroke();

            lastX = currentX;
            lastY = currentY;
        };

        const stopDrawing = () => {
            if (!isDrawing) return;
            isDrawing = false;
            ctx.beginPath();

            console.log(`[ScribbleTool] TOOL_ACTION: Drawing stroke completed on canvas: ${canvas.id}`);

            // Save annotation when drawing stroke is completed
            this.saveDrawingStroke(canvas);
        };

        // Mouse events
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Touch events for mobile
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            canvas.dispatchEvent(mouseEvent);
        });

        // Mark that listeners have been added to prevent duplicates
        canvas._drawingListenersAdded = true;
    }

    updateInkSettings() {
        // Get current ink settings from the parameter toolbar
        const colorInput = document.getElementById(`editorInkColor-${this.blockId}`);
        const thicknessInput = document.getElementById(`editorInkThickness-${this.blockId}`);
        const opacityInput = document.getElementById(`editorInkOpacity-${this.blockId}`);

        this.inkColor = colorInput ? colorInput.value : '#FF0000';
        this.inkThickness = thicknessInput ? parseInt(thicknessInput.value) : 2;
        this.inkOpacity = opacityInput ? parseFloat(opacityInput.value) : 1;

        // Update all active drawing canvases with new settings
        this.updateAllCanvasContexts();
    }

    updateAllCanvasContexts() {
        // Update all active drawing canvases with current ink settings
        const canvases = document.querySelectorAll(`#pdfx-block-${this.blockId} .drawing-canvas.active`);
        canvases.forEach(canvas => {
            if (canvas._updateContext) {
                // Use the stored update function for this canvas
                canvas._updateContext();
            }
        });
        console.log(`[ScribbleTool] Updated ${canvases.length} canvas contexts with new ink settings`);
    }

    /**
     * Save drawing stroke as annotation
     */
    saveDrawingStroke(canvas) {
        if (!this.annotationInterface) {
            console.warn(`[ScribbleTool] No annotation interface - drawing will not be saved!`);
            return;
        }

        // Get page number for this canvas
        const pageNum = this.getPageNumberFromCanvas(canvas);

        // Get canvas image data as base64
        const imageData = canvas.toDataURL('image/png');

        // Also store the current scale for reference
        const canvasMetadata = {
            width: canvas.width,
            height: canvas.height,
            scale: this.currentScale,
            timestamp: Date.now()
        };

        // Create annotation object
        const annotation = {
            id: `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'drawing_strokes',
            pageNum: pageNum,
            data: {
                imageData: imageData,
                metadata: canvasMetadata,
                color: this.inkColor,
                thickness: this.inkThickness,
                opacity: this.inkOpacity
            },
            config: {
                inkSettings: {
                    color: this.inkColor,
                    thickness: this.inkThickness,
                    opacity: this.inkOpacity
                }
            },
            timestamp: Date.now()
        };

        console.log(`[ScribbleTool] Saving drawing stroke for page ${pageNum}`);
        this.annotationInterface.saveAnnotation(annotation);
    }

    /**
     * Get page number from canvas element
     */
    getPageNumberFromCanvas(canvas) {
        const canvasId = canvas.id;
        const match = canvasId.match(/drawing-canvas-\w+-(\d+)/);
        return match ? parseInt(match[1]) + 1 : 1; // Canvas index is 0-based, page is 1-based
    }

    initScribbleControls() {
        const colorPicker = document.getElementById(`editorInkColor-${this.blockId}`);
        const thicknessSlider = document.getElementById(`editorInkThickness-${this.blockId}`);
        const opacitySlider = document.getElementById(`editorInkOpacity-${this.blockId}`);

        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.inkColor = e.target.value;
                this.updateInkSettings();
            });
            this.inkColor = colorPicker.value;
        }

        if (thicknessSlider) {
            thicknessSlider.addEventListener('input', (e) => {
                this.inkThickness = parseInt(e.target.value);
                this.updateInkSettings();
            });
            this.inkThickness = parseInt(thicknessSlider.value);
        }

        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                this.inkOpacity = parseFloat(e.target.value);
                this.updateInkSettings();
            });
            this.inkOpacity = parseFloat(opacitySlider.value);
        }
    }

    setupZoomHandler() {
        if (this.viewer.eventBus) {
            this.zoomHandler = (evt) => {
                const newScale = evt.scale;
                if (newScale !== this.currentScale) {
                    console.log(`[ScribbleTool] Scale changed from ${this.currentScale} to ${newScale}`);
                    const scaleRatio = newScale / this.currentScale;
                    this.currentScale = newScale;
                    this.rescaleAllCanvases(scaleRatio);
                }
            };
            this.viewer.eventBus.on('scalechanging', this.zoomHandler);
        }
    }

    rescaleAllCanvases(scaleRatio) {
        this.allCanvases.forEach(canvas => {
            // Get the page to determine new canvas size
            const page = canvas.closest('.page');
            if (page) {
                const pageRect = page.getBoundingClientRect();

                // Store current image data
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                // Update canvas size to match new page size
                canvas.width = pageRect.width;
                canvas.height = pageRect.height;
                canvas.style.width = `${pageRect.width}px`;
                canvas.style.height = `${pageRect.height}px`;

                // Clear and redraw with scaling
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Create a temporary canvas to scale the image
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = imageData.width;
                tempCanvas.height = imageData.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.putImageData(imageData, 0, 0);

                // Draw the scaled image onto the main canvas
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(tempCanvas,
                    0, 0, tempCanvas.width, tempCanvas.height,
                    0, 0, canvas.width, canvas.height
                );

                console.log(`[ScribbleTool] Rescaled canvas for page to ${canvas.width}x${canvas.height}`);
            }
        });
    }

    cleanup() {
        // Remove zoom handler
        if (this.viewer.eventBus && this.zoomHandler) {
            this.viewer.eventBus.off('scalechanging', this.zoomHandler);
            this.zoomHandler = null;
        }

        // Remove all drawing canvases
        this.allCanvases.forEach(canvas => {
            if (canvas.parentNode) {
                canvas.remove();
            }
        });
        this.allCanvases = [];

        // Reset drawing state
        this.isDrawing = false;
        this.currentStroke = [];

        console.log(`[ScribbleTool] Cleanup completed`);
    }
};