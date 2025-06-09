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

        // Flag to track user-initiated clears vs programmatic clears
        this._isUserClear = false;
    }

    /**
     * Initialize the scribble tool
     */
    async init() {
        try {
            // Check if FabricJS is available
            if (typeof fabric === 'undefined') {
                throw new Error('FabricJS library not loaded');
            }

            // Set up canvas container
            await this._setupCanvasContainer();

            // Initialize FabricJS canvas
            await this._initializeFabricCanvas();

            this.isEnabled = true;

        } catch (error) {
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
        console.log('[ScribbleTool] Creating new FabricJS canvas for block:', this.blockId);
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
    }

        /**
     * Handle canvas cleared event
     */
    _handleCanvasCleared() {
        // Don't delete annotations on programmatic canvas clears
        // Only delete on user-initiated clears
        if (this._isUserClear) {
            console.log('[ScribbleTool] User-initiated canvas clear - clearing annotations for page:', this.currentPage);

            // Clear annotations for current page
            const pageAnnotations = this.getAnnotationsForPage(this.currentPage);
            for (const annotation of pageAnnotations) {
                this.deleteAnnotation(annotation.id);
            }

            // Clear page strokes
            this.strokesByPage.delete(this.currentPage);

            this._isUserClear = false; // Reset flag
        } else {
            console.log('[ScribbleTool] Programmatic canvas clear - keeping annotations for page:', this.currentPage);
        }
    }

    /**
     * Enable the tool
     */
    enable() {
        this.isEnabled = true;
    }

    /**
     * Disable the tool
     */
    disable() {
        if (this.isActive) {
            this.deactivate();
        }
        this.isEnabled = false;
    }

    /**
     * Activate the tool
     */
    activate() {
        if (!this.isEnabled) {
            return false;
        }

        try {
            // Reset rendering tracking on activation to allow fresh render
            this._lastRenderedPage = null;
            this._lastRenderTime = null;

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

            // Re-render any existing annotations for the current page
            this._renderStrokesForPage(this.currentPage);

            this.isActive = true;

            return true;

        } catch (error) {
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

        } catch (error) {
            // Error deactivating tool - continue silently
        }
    }

    /**
     * Handle page change
     */
    handlePageChange(pageNum) {
        super.handlePageChange(pageNum);

        // Reset rendering tracking for new page
        this._lastRenderedPage = null;
        this._lastRenderTime = null;

        // Clear canvas
        if (this.fabricCanvas) {
            this.fabricCanvas.clear();
        }

        // Resize canvas for new page FIRST
        this._resizeCanvas().then(() => {
            // Then load strokes for new page
            this._renderStrokesForPage(pageNum);
        });
    }

    /**
     * Resize canvas to match PDF page
     */
    async _resizeCanvas() {
        if (!this.fabricCanvas || !this.pdfManager) {
            console.warn('[ScribbleTool] Cannot resize canvas - missing fabricCanvas or pdfManager');
            return;
        }

        try {
            // Get PDF container dimensions
            const pdfContainer = this.container.querySelector(`#pdf-container-${this.blockId}`);
            if (!pdfContainer) {
                console.warn('[ScribbleTool] Cannot resize canvas - PDF container not found');
                return;
            }

            const containerWidth = pdfContainer.offsetWidth || 800;
            const containerHeight = pdfContainer.offsetHeight || 600;

            console.log('[ScribbleTool] Resizing canvas to:', containerWidth, 'x', containerHeight);

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

            console.log('[ScribbleTool] Canvas resized successfully');

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
        console.log('[ScribbleTool] Rendering strokes for page:', pageNum, '- Block ID:', this.blockId);
        console.log('[ScribbleTool] Current page:', this.currentPage);
        console.log('[ScribbleTool] Total annotations in tool:', this.annotations.size);
        console.log('[ScribbleTool] Annotations by page map:', this.annotationsByPage);

        // Prevent double rendering by checking if we already rendered this page
        if (this._lastRenderedPage === pageNum && this._lastRenderTime && (Date.now() - this._lastRenderTime) < 1000) {
            console.log('[ScribbleTool] Skipping render - already rendered recently');
            return;
        }

        const annotations = this.getAnnotationsForPage(pageNum);
        console.log('[ScribbleTool] Found', annotations.length, 'annotations for page', pageNum);
        console.log('[ScribbleTool] Annotations for page', pageNum, ':', annotations);

        // Clear existing canvas objects for this page to prevent duplicates
        if (this.fabricCanvas) {
            this.fabricCanvas.clear();
        }

        for (const annotation of annotations) {
            this._renderStrokeFromAnnotation(annotation);
        }

        // Track rendering to prevent doubles
        this._lastRenderedPage = pageNum;
        this._lastRenderTime = Date.now();

        console.log('[ScribbleTool] Finished rendering page', pageNum, '- canvas now has', this.fabricCanvas ? this.fabricCanvas.getObjects().length : 0, 'objects');
    }

    /**
     * Render stroke from annotation data
     */
    _renderStrokeFromAnnotation(annotation) {
        try {
            const data = annotation.data;

            if (!this.fabricCanvas) {
                console.warn('[ScribbleTool] No fabric canvas available for rendering');
                return;
            }

            if (!data.pathData) {
                console.warn('[ScribbleTool] No path data in annotation:', annotation.id);
                return;
            }

            // Convert path data to Fabric.js format if needed
            let pathString = data.pathData;

            // If pathData is an array of commands, convert to SVG path string
            if (Array.isArray(data.pathData)) {
                pathString = data.pathData.map(cmd => {
                    if (Array.isArray(cmd)) {
                        return cmd.join(' ');
                    }
                    return cmd;
                }).join(' ');
            }

            // Create Fabric path object
            const path = new fabric.Path(pathString, {
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
            this.fabricCanvas.renderAll();

            // Store reference
            annotation.fabricPath = path;

        } catch (error) {
            console.error('[ScribbleTool] Error rendering stroke:', error, annotation);
        }
    }

    /**
     * Clear all strokes on current page
     */
    clearCurrentPage() {
        if (this.fabricCanvas) {
            this._isUserClear = true; // Mark as user-initiated clear
            this.fabricCanvas.clear();
        }

        // Remove annotations for current page (this will also happen in _handleCanvasCleared)
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

        // Check if data is empty
        if (!annotationsData || Object.keys(annotationsData).length === 0) {
            console.warn('[ScribbleTool] No annotation data provided or data is empty');
            return;
        }

        console.log('[ScribbleTool] BEFORE super.loadAnnotations - annotations.size:', this.annotations.size);

        try {
            console.log('[ScribbleTool] Calling super.loadAnnotations...');
            await super.loadAnnotations(annotationsData);
            console.log('[ScribbleTool] super.loadAnnotations completed');
        } catch (error) {
            console.error('[ScribbleTool] Error in super.loadAnnotations:', error);
        }

        console.log('[ScribbleTool] IMMEDIATELY after super.loadAnnotations - annotations.size:', this.annotations.size);
        console.log('[ScribbleTool] After loading, total annotations:', this.annotations.size);
        console.log('[ScribbleTool] Annotations by page:', this.annotationsByPage);
        console.log('[ScribbleTool] Current page:', this.currentPage);

        // Add a timeout to check if annotations are still there after a delay
        setTimeout(() => {
            console.log('[ScribbleTool] 100ms LATER - annotations.size:', this.annotations.size);
            console.log('[ScribbleTool] 100ms LATER - annotationsByPage:', this.annotationsByPage);
        }, 100);

        // Don't render immediately - let handlePageChange handle rendering when canvas is properly sized
        console.log('[ScribbleTool] Annotations loaded, will render when page changes or canvas is ready');
    }

    /**
     * Debug method to check annotation state
     */
    debugAnnotationState() {
        const blockElement = this.container.querySelector(`[data-block-id="${this.blockId}"]`) || this.container.closest(`[data-block-id="${this.blockId}"]`);
        let parsedData = {};

        if (blockElement) {
            try {
                parsedData = JSON.parse(blockElement.dataset.drawingStrokes || '{}');
            } catch (e) {
                // Error parsing data
            }
        }

        return {
            totalAnnotations: this.annotations.size,
            annotationsByPage: this.annotationsByPage,
            currentPage: this.currentPage,
            canvasObjects: this.fabricCanvas ? this.fabricCanvas.getObjects().length : 0,
            parsedData: parsedData
        };
    }

    /**
     * Clean up tool resources
     */
    async cleanup() {
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