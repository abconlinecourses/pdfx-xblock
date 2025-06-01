/**
 * ScribbleTool - Drawing and scribble functionality using FabricJS v6.6.6
 *
 * Provides free-form drawing capabilities on top of PDF pages
 */

import { BaseTool } from '../base/BaseTool.js';

export class ScribbleTool extends BaseTool {
    constructor(options = {}) {
        super({
            name: 'scribble',
            ...options
        });

        // FabricJS canvas
        this.fabricCanvas = null;
        this.canvasContainer = null;

        // Drawing state
        this.isDrawing = false;
        this.currentBrush = null;

        // Configuration
        this.config = {
            color: '#FF0000',
            size: 5,
            opacity: 1.0,
            brushType: 'pencil',
            ...this.config
        };

        // Page-specific strokes storage
        this.strokesByPage = new Map();

        // Canvas sizing
        this.canvasWidth = 0;
        this.canvasHeight = 0;
    }

    /**
     * Initialize the scribble tool
     */
    async init() {
        try {
            console.debug('[ScribbleTool] Initializing scribble tool');

            // Check if FabricJS is available
            if (typeof fabric === 'undefined') {
                throw new Error('FabricJS library not loaded');
            }

            // Set up canvas container
            await this._setupCanvasContainer();

            // Initialize FabricJS canvas
            await this._initializeFabricCanvas();

            this.isEnabled = true;

            console.debug('[ScribbleTool] Scribble tool initialized successfully');

        } catch (error) {
            console.error('[ScribbleTool] Initialization error:', error);
            throw error;
        }
    }

    /**
     * Set up canvas container
     */
    async _setupCanvasContainer() {
        // Find or create draw container
        let drawContainer = this.container.querySelector(`#draw-container-${this.blockId}`);
        if (!drawContainer) {
            drawContainer = document.createElement('div');
            drawContainer.id = `draw-container-${this.blockId}`;
            drawContainer.className = 'draw-container';
            drawContainer.style.position = 'absolute';
            drawContainer.style.top = '0';
            drawContainer.style.left = '0';
            drawContainer.style.pointerEvents = 'none';
            drawContainer.style.zIndex = '10';

            const pdfContainer = this.container.querySelector(`#pdf-container-${this.blockId}`);
            if (pdfContainer) {
                pdfContainer.appendChild(drawContainer);
            }
        }

        // Create canvas container within draw container
        this.canvasContainer = document.createElement('div');
        this.canvasContainer.className = 'canvas-container';
        this.canvasContainer.style.position = 'relative';
        this.canvasContainer.style.width = '100%';
        this.canvasContainer.style.height = '100%';

        // Clear existing content and add canvas container
        drawContainer.innerHTML = '';
        drawContainer.appendChild(this.canvasContainer);
    }

    /**
     * Initialize FabricJS canvas
     */
    async _initializeFabricCanvas() {
        // Create canvas element
        const canvasElement = document.createElement('canvas');
        canvasElement.id = `fabric-canvas-${this.blockId}`;
        this.canvasContainer.appendChild(canvasElement);

        // Initialize Fabric canvas
        this.fabricCanvas = new fabric.Canvas(canvasElement.id, {
            isDrawingMode: false,
            selection: false,
            preserveObjectStacking: true,
            renderOnAddRemove: true,
            skipTargetFind: false,
            interactive: true
        });

        // Set up drawing brush
        this._setupDrawingBrush();

        // Set up event listeners
        this._setupFabricEventListeners();

        // Size the canvas properly
        await this._resizeCanvas();
    }

    /**
     * Set up drawing brush
     */
    _setupDrawingBrush() {
        // Configure pencil brush
        this.fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(this.fabricCanvas);
        this.fabricCanvas.freeDrawingBrush.width = this.config.size;
        this.fabricCanvas.freeDrawingBrush.color = this.config.color;

        this.currentBrush = this.fabricCanvas.freeDrawingBrush;
    }

    /**
     * Set up Fabric event listeners
     */
    _setupFabricEventListeners() {
        // Path created event (when drawing is completed)
        this.fabricCanvas.on('path:created', (event) => {
            this._handlePathCreated(event);
        });

        // Drawing started
        this.fabricCanvas.on('mouse:down', () => {
            if (this.fabricCanvas.isDrawingMode) {
                this.isDrawing = true;
            }
        });

        // Drawing ended
        this.fabricCanvas.on('mouse:up', () => {
            if (this.isDrawing) {
                this.isDrawing = false;
            }
        });

        // Canvas cleared
        this.fabricCanvas.on('canvas:cleared', () => {
            this._handleCanvasCleared();
        });
    }

    /**
     * Handle path created event
     */
    _handlePathCreated(event) {
        const path = event.path;

        // Create annotation data
        const annotationData = {
            pathData: path.path,
            strokeWidth: path.strokeWidth,
            stroke: path.stroke,
            fill: path.fill || '',
            left: path.left,
            top: path.top,
            scaleX: path.scaleX,
            scaleY: path.scaleY,
            angle: path.angle
        };

        // Create annotation
        const annotation = this.createAnnotation(annotationData);

        // Store path reference in annotation
        annotation.fabricPath = path;

        // Add to page strokes
        this._addStrokeToPage(this.currentPage, annotation);

        console.debug('[ScribbleTool] Path created and saved as annotation:', annotation.id);
    }

    /**
     * Handle canvas cleared event
     */
    _handleCanvasCleared() {
        // Clear annotations for current page
        const pageAnnotations = this.getAnnotationsForPage(this.currentPage);
        for (const annotation of pageAnnotations) {
            this.deleteAnnotation(annotation.id);
        }

        // Clear page strokes
        this.strokesByPage.delete(this.currentPage);
    }

    /**
     * Enable the tool
     */
    enable() {
        this.isEnabled = true;
        console.debug('[ScribbleTool] Scribble tool enabled');
    }

    /**
     * Disable the tool
     */
    disable() {
        if (this.isActive) {
            this.deactivate();
        }
        this.isEnabled = false;
        console.debug('[ScribbleTool] Scribble tool disabled');
    }

    /**
     * Activate the tool
     */
    activate() {
        if (!this.isEnabled) {
            console.warn('[ScribbleTool] Cannot activate disabled tool');
            return false;
        }

        try {
            // Enable drawing mode
            this.fabricCanvas.isDrawingMode = true;
            this.fabricCanvas.selection = false;

            // Update cursor
            this.fabricCanvas.defaultCursor = 'crosshair';
            this.fabricCanvas.freeDrawingCursor = 'crosshair';

            // Enable pointer events on draw container
            const drawContainer = this.container.querySelector(`#draw-container-${this.blockId}`);
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'auto';
                drawContainer.classList.add('active');
            }

            // Ensure canvas is properly sized
            this._resizeCanvas();

            this.isActive = true;

            console.debug('[ScribbleTool] Scribble tool activated');

            return true;

        } catch (error) {
            console.error('[ScribbleTool] Error activating tool:', error);
            return false;
        }
    }

    /**
     * Deactivate the tool
     */
    deactivate() {
        try {
            // Disable drawing mode
            if (this.fabricCanvas) {
                this.fabricCanvas.isDrawingMode = false;
                this.fabricCanvas.defaultCursor = 'default';
            }

            // Disable pointer events on draw container
            const drawContainer = this.container.querySelector(`#draw-container-${this.blockId}`);
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'none';
                drawContainer.classList.remove('active');
            }

            this.isActive = false;

            console.debug('[ScribbleTool] Scribble tool deactivated');

        } catch (error) {
            console.error('[ScribbleTool] Error deactivating tool:', error);
        }
    }

    /**
     * Handle page change
     */
    handlePageChange(pageNum) {
        super.handlePageChange(pageNum);

        // Clear canvas
        if (this.fabricCanvas) {
            this.fabricCanvas.clear();
        }

        // Load strokes for new page
        this._renderStrokesForPage(pageNum);

        // Resize canvas for new page
        this._resizeCanvas();
    }

    /**
     * Resize canvas to match PDF page
     */
    async _resizeCanvas() {
        if (!this.fabricCanvas || !this.pdfManager) {
            return;
        }

        try {
            // Get PDF container dimensions
            const pdfContainer = this.container.querySelector(`#pdf-container-${this.blockId}`);
            if (!pdfContainer) {
                console.warn('[ScribbleTool] PDF container not found');
                return;
            }

            const containerWidth = pdfContainer.offsetWidth || 800;
            const containerHeight = pdfContainer.offsetHeight || 600;

            // Update canvas dimensions
            this.canvasWidth = containerWidth;
            this.canvasHeight = containerHeight;

            // Resize Fabric canvas
            this.fabricCanvas.setDimensions({
                width: this.canvasWidth,
                height: this.canvasHeight
            });

            // Update draw container dimensions
            const drawContainer = this.container.querySelector(`#draw-container-${this.blockId}`);
            if (drawContainer) {
                drawContainer.style.width = this.canvasWidth + 'px';
                drawContainer.style.height = this.canvasHeight + 'px';
            }

            // Update canvas container dimensions
            if (this.canvasContainer) {
                this.canvasContainer.style.width = this.canvasWidth + 'px';
                this.canvasContainer.style.height = this.canvasHeight + 'px';
            }

            console.debug(`[ScribbleTool] Canvas resized to ${this.canvasWidth}x${this.canvasHeight}`);

        } catch (error) {
            console.error('[ScribbleTool] Error resizing canvas:', error);
        }
    }

    /**
     * Set tool configuration
     */
    setConfig(config) {
        super.setConfig(config);

        // Update brush properties
        if (this.fabricCanvas && this.fabricCanvas.freeDrawingBrush) {
            if (config.color) {
                this.fabricCanvas.freeDrawingBrush.color = config.color;
            }
            if (config.size) {
                this.fabricCanvas.freeDrawingBrush.width = config.size;
            }
        }
    }

    /**
     * Add stroke to page storage
     */
    _addStrokeToPage(pageNum, annotation) {
        if (!this.strokesByPage.has(pageNum)) {
            this.strokesByPage.set(pageNum, []);
        }

        this.strokesByPage.get(pageNum).push(annotation);
    }

    /**
     * Render strokes for a specific page
     */
    _renderStrokesForPage(pageNum) {
        const annotations = this.getAnnotationsForPage(pageNum);

        for (const annotation of annotations) {
            this._renderStrokeFromAnnotation(annotation);
        }

        console.debug(`[ScribbleTool] Rendered ${annotations.length} strokes for page ${pageNum}`);
    }

    /**
     * Render stroke from annotation data
     */
    _renderStrokeFromAnnotation(annotation) {
        try {
            const data = annotation.data;

            // Create Fabric path object
            const path = new fabric.Path(data.pathData, {
                left: data.left || 0,
                top: data.top || 0,
                strokeWidth: data.strokeWidth || this.config.size,
                stroke: data.stroke || this.config.color,
                fill: data.fill || '',
                scaleX: data.scaleX || 1,
                scaleY: data.scaleY || 1,
                angle: data.angle || 0,
                selectable: false,
                evented: false
            });

            // Add to canvas
            this.fabricCanvas.add(path);

            // Store reference
            annotation.fabricPath = path;

        } catch (error) {
            console.error('[ScribbleTool] Error rendering stroke:', error);
        }
    }

    /**
     * Clear all strokes on current page
     */
    clearCurrentPage() {
        if (this.fabricCanvas) {
            this.fabricCanvas.clear();
        }

        // Remove annotations for current page
        const pageAnnotations = this.getAnnotationsForPage(this.currentPage);
        for (const annotation of pageAnnotations) {
            this.deleteAnnotation(annotation.id);
        }

        this.strokesByPage.delete(this.currentPage);
    }

    /**
     * Undo last stroke
     */
    undoLastStroke() {
        const pageAnnotations = this.getAnnotationsForPage(this.currentPage);
        if (pageAnnotations.length === 0) {
            return false;
        }

        // Remove last annotation
        const lastAnnotation = pageAnnotations[pageAnnotations.length - 1];

        // Remove from canvas
        if (lastAnnotation.fabricPath) {
            this.fabricCanvas.remove(lastAnnotation.fabricPath);
        }

        // Delete annotation
        this.deleteAnnotation(lastAnnotation.id);

        return true;
    }

    /**
     * Load annotations for this tool
     */
    async loadAnnotations(annotationsData) {
        await super.loadAnnotations(annotationsData);

        // Re-render current page after loading
        this._renderStrokesForPage(this.currentPage);
    }

    /**
     * Clean up tool resources
     */
    async cleanup() {
        console.debug('[ScribbleTool] Cleaning up scribble tool');

        if (this.fabricCanvas) {
            this.fabricCanvas.dispose();
            this.fabricCanvas = null;
        }

        // Clear stroke storage
        this.strokesByPage.clear();

        // Remove canvas container
        if (this.canvasContainer && this.canvasContainer.parentNode) {
            this.canvasContainer.parentNode.removeChild(this.canvasContainer);
        }

        this.canvasContainer = null;
        this.currentBrush = null;
    }
}

export default ScribbleTool;