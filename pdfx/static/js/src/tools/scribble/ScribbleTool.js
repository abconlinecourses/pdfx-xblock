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
        this.inkColor = '#FF0000'; // Default red
        this.inkThickness = 2;
        this.inkOpacity = 1;

        // Canvas management
        this.canvases = new Map();

        // Initialize
        this.init();
    }

    init() {
        console.log(`[ScribbleTool] Initializing for block: ${this.blockId}`);
        this.setupToolButton();
        this.initScribbleControls();
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

        // Get current ink settings
        this.updateInkSettings();
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
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (!viewer) return;

        // Find all PDF pages
        const pages = viewer.querySelectorAll('.page');

        pages.forEach((page, index) => {
            let canvas = page.querySelector('.drawing-canvas');

            if (canvas) {
                // Canvas already exists, just activate it
                canvas.classList.add('active');
                canvas.style.pointerEvents = 'auto';

                // Re-add drawing event listeners in case they were lost during tool switching
                this.addDrawingListeners(canvas);

                console.log(`[ScribbleTool] Reactivated existing drawing canvas: ${canvas.id}`);
            } else {
                // Create new drawing canvas
                canvas = document.createElement('canvas');
                canvas.className = 'drawing-canvas active';
                canvas.id = `drawing-canvas-${this.blockId}-${index}`;

                // Set canvas size to match page
                const pageRect = page.getBoundingClientRect();
                canvas.width = pageRect.width;
                canvas.height = pageRect.height;

                // Position canvas over page
                canvas.style.position = 'absolute';
                canvas.style.top = '0';
                canvas.style.left = '0';
                canvas.style.zIndex = '25';
                canvas.style.pointerEvents = 'auto';

                // Add drawing event listeners
                this.addDrawingListeners(canvas);

                // Append to page
                page.style.position = 'relative';
                page.appendChild(canvas);

                console.log(`[ScribbleTool] Created new drawing canvas: ${canvas.id}`);
            }
        });
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
        // Get page number from canvas ID
        const pageNum = this.getPageNumberFromCanvas(canvas);

        // Get canvas data as base64 image
        const canvasData = canvas.toDataURL('image/png');

        // Create annotation object
        const annotation = {
            id: `scribble_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'drawing_strokes',
            pageNum: pageNum,
            data: {
                canvasId: canvas.id,
                imageData: canvasData,
                inkColor: this.inkColor,
                inkThickness: this.inkThickness,
                inkOpacity: this.inkOpacity,
                canvasWidth: canvas.width,
                canvasHeight: canvas.height
            },
            config: {
                color: this.inkColor,
                thickness: this.inkThickness,
                opacity: this.inkOpacity
            }
        };

        // Save annotation through interface
        if (this.annotationInterface) {
            console.log(`[ScribbleTool] ANNOTATION_SAVE: Saving drawing annotation:`, annotation.id);
            this.annotationInterface.saveAnnotation(annotation);
        } else {
            console.warn(`[ScribbleTool] ANNOTATION_MISSING: No annotation interface - drawing will not be saved!`);
        }
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

    cleanup() {
        // Remove canvases and clean up
        const canvases = document.querySelectorAll(`#pdfx-block-${this.blockId} .drawing-canvas`);
        canvases.forEach(canvas => {
            canvas.remove();
        });
        this.canvases.clear();
    }
};