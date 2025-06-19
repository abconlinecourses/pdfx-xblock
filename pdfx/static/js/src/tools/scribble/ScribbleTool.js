/**
 * ScribbleTool - Drawing and scribble functionality for PDF.js integration
 * Uses SVG-based drawing instead of multiple divs for better performance
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
        this.currentSvgElement = null;
        this.currentPathElement = null;
        this.allDrawingContainers = [];
        this.drawingData = new Map(); // Store drawing data by page

        // Zoom handling
        this.currentScale = 1;
        this.zoomHandler = null;

        this.init();
    }

    init() {
        console.log(`[ScribbleTool] Initializing for block: ${this.blockId}`);
        console.log(`[ScribbleTool] Annotation interface available:`, !!this.annotationInterface);

        if (this.annotationInterface) {
            console.log(`[ScribbleTool] Annotation interface type:`, typeof this.annotationInterface);
            console.log(`[ScribbleTool] Annotation interface methods:`, Object.getOwnPropertyNames(Object.getPrototypeOf(this.annotationInterface)));
        } else {
            console.warn(`[ScribbleTool] No annotation interface provided - strokes will not be saved to server!`);
        }

        this.setupToolButton();
        this.initScribbleControls();
        this.setupZoomHandler();
        this.setupPagesLoadedHandler();
        this.setupGlobalClickHandler();

        // Initialize popup state
        this.activeStrokePopup = null;
        this.activeStrokeConfirmationModal = null;

        // Initialize drag state (similar to StampTool)
        this.dragState = {
            isDragging: false,
            startX: 0,
            startY: 0,
            startLeft: 0,
            startTop: 0,
            hasMoved: false,
            currentStroke: null
        };

        // Global drag handlers
        this.globalMouseMoveHandler = null;
        this.globalMouseUpHandler = null;

        // Setup global drag handlers
        this.setupGlobalDragHandlers();

        // Initialize current scale from viewer
        this.updateCurrentScale();
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

        // Add class to indicate scribble tool is active
        const pdfxBlock = document.querySelector(`#pdfx-block-${this.blockId}`);
        if (pdfxBlock) {
            pdfxBlock.classList.add('scribble-tool-active');
        }

        // Ensure drawing containers exist when tool is activated
        // This handles cases where tool is activated after pages have been loaded
        setTimeout(() => {
            this.ensureDrawingContainersAfterPageReload();
        }, 10);
    }

    deactivate() {
        console.log(`[ScribbleTool] Deactivating drawing mode for block: ${this.blockId}`);
        this.disableDrawingMode();

        // Remove class to indicate scribble tool is no longer active
        const pdfxBlock = document.querySelector(`#pdfx-block-${this.blockId}`);
        if (pdfxBlock) {
            pdfxBlock.classList.remove('scribble-tool-active');
        }
    }

    enableDrawingMode() {
        // Set scribbling flag for text layers
        this.setTextLayerScribbleMode(true);

        // Add drawing mode class to viewer
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.classList.add('drawing-mode');
        }

        // Setup drawing containers for each page
        this.setupDrawingContainers();

        // Activate all drawing containers
        const containers = document.querySelectorAll(`#pdfx-block-${this.blockId} .drawing-container`);
        containers.forEach(container => {
            container.classList.add('active');
            container.style.pointerEvents = 'auto';
            container.style.cursor = 'crosshair';
        });

        // Get current ink settings
        this.updateInkSettings();

        console.log(`[ScribbleTool] Activated ${containers.length} drawing containers`);
    }

    disableDrawingMode() {
        // Remove scribbling flag from text layers
        this.setTextLayerScribbleMode(false);

        // Remove drawing mode class from viewer
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.classList.remove('drawing-mode');
        }

        // Deactivate drawing containers
        const containers = document.querySelectorAll(`#pdfx-block-${this.blockId} .drawing-container`);
        containers.forEach(container => {
            container.classList.remove('active');
            container.style.pointerEvents = 'none';
            // Reset the listeners flag so they can be re-added when reactivated
            container._drawingListenersAdded = false;
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

    setupDrawingContainers() {
        // Find all page containers
        const pages = document.querySelectorAll(`#viewerContainer-${this.blockId} .page`);

        pages.forEach((page, index) => {
            const pageNumber = index + 1;

            // Check if drawing container already exists
            let container = page.querySelector('.drawing-container');

            if (!container) {
                // Create container for drawing
                container = document.createElement('div');
                container.className = 'drawing-container';
                container.setAttribute('data-page-number', pageNumber);
                container.style.position = 'absolute';
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.zIndex = '25';
                container.style.pointerEvents = 'auto';
                container.style.cursor = 'crosshair';

                // Make page relative positioned if not already
                if (getComputedStyle(page).position === 'static') {
                    page.style.position = 'relative';
                }

                page.appendChild(container);
                this.allDrawingContainers.push(container);

                console.log(`[ScribbleTool] Created drawing container for page ${pageNumber}`);

                // Restore drawings for new container
                this.restorePageDrawings(container, pageNumber);
            } else {
                // Ensure existing container is in our tracking list
                if (!this.allDrawingContainers.includes(container)) {
                    this.allDrawingContainers.push(container);
                }

                // Reset container state for reuse
                container.style.pointerEvents = 'auto';
                container.style.cursor = 'crosshair';
                container._drawingListenersAdded = false; // Allow listeners to be re-added

                // Check if container has existing SVG content
                const existingSvgs = container.querySelectorAll('.stroke-svg');
                const expectedSvgs = this.drawingData.get(pageNumber)?.length || 0;

                // Only restore if content is missing
                if (existingSvgs.length < expectedSvgs) {
                    console.log(`[ScribbleTool] Container for page ${pageNumber} missing ${expectedSvgs - existingSvgs.length} strokes, restoring...`);
                    this.restorePageDrawings(container, pageNumber);
                } else if (existingSvgs.length > 0) {
                    console.log(`[ScribbleTool] Container for page ${pageNumber} already has ${existingSvgs.length} strokes, preserving existing content`);
                }
            }

            // Add drawing listeners
            this.addDrawingListeners(container, pageNumber);
        });

        console.log(`[ScribbleTool] Setup drawing containers for ${pages.length} pages`);
    }

    addDrawingListeners(container, pageNumber) {
        // Remove existing listeners if they exist to prevent duplicates
        if (container._drawingListenersAdded) {
            return; // Listeners already added
        }

        let isDrawing = false;

        const startDrawing = (e) => {
            isDrawing = true;

            const rect = container.getBoundingClientRect();
            const startX = e.clientX - rect.left;
            const startY = e.clientY - rect.top;

            // Initialize current stroke data
            this.currentStroke = [{
                x: startX,
                y: startY,
                color: this.inkColor,
                thickness: this.inkThickness,
                opacity: this.inkOpacity
            }];

            // Create temporary full-page SVG for drawing (will be optimized on completion)
            this.currentSvgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            this.currentSvgElement.setAttribute('class', 'stroke-svg drawing-temp');
            // The CSS for .stroke-svg.drawing-temp will handle the styling

            // Create path element for the stroke
            this.currentPathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this.currentPathElement.setAttribute('fill', 'none');
            this.currentPathElement.setAttribute('stroke', this.inkColor);
            this.currentPathElement.setAttribute('stroke-width', this.inkThickness);
            this.currentPathElement.setAttribute('stroke-opacity', this.inkOpacity);
            this.currentPathElement.setAttribute('stroke-linecap', 'round');
            this.currentPathElement.setAttribute('stroke-linejoin', 'round');

            this.currentSvgElement.appendChild(this.currentPathElement);
            container.appendChild(this.currentSvgElement);

            // Start path with move command
            this.updateSvgPath();
        };

        const draw = (e) => {
            if (!isDrawing || !this.currentPathElement) return;

            const rect = container.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;

            // Add point to current stroke
            this.currentStroke.push({
                x: currentX,
                y: currentY,
                color: this.inkColor,
                thickness: this.inkThickness,
                opacity: this.inkOpacity
            });

            this.updateSvgPath();
        };

        const stopDrawing = () => {
            if (!isDrawing || !this.currentSvgElement) return;
            isDrawing = false;

            // Finalize the stroke
            const strokeId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Store stroke data
            if (!this.drawingData.has(pageNumber)) {
                this.drawingData.set(pageNumber, []);
            }

            // Create annotation ID for this stroke
            const annotationId = `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const strokeData = {
                id: strokeId,
                annotationId: annotationId, // Store the annotation ID for deletion
                points: [...this.currentStroke],
                pathData: this.currentPathElement.getAttribute('d'),
                originalScale: this.currentScale, // Store the scale when stroke was created
                timestamp: Date.now()
            };

            this.drawingData.get(pageNumber).push(strokeData);

            console.log(`[ScribbleTool] Completed stroke with ${this.currentStroke.length} points on page: ${pageNumber}`);

            // Remove the temporary full-page SVG
            this.currentSvgElement.remove();

            // Create optimized SVG with proper dimensions
            const optimizedSvg = this.createOptimizedSvgElement(container, strokeData);

            // Save annotation when drawing stroke is completed
            this.saveDrawingStroke(pageNumber, strokeId, this.currentStroke, annotationId);

            // Reset current stroke
            this.currentStroke = [];
            this.currentSvgElement = null;
            this.currentPathElement = null;
        };

        // Mouse events
        container.addEventListener('mousedown', startDrawing);
        container.addEventListener('mousemove', draw);
        container.addEventListener('mouseup', stopDrawing);
        container.addEventListener('mouseout', stopDrawing);

        // Touch events for mobile
        container.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            container.dispatchEvent(mouseEvent);
        });

        container.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            container.dispatchEvent(mouseEvent);
        });

        container.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            container.dispatchEvent(mouseEvent);
        });

        // Mark that listeners have been added to prevent duplicates
        container._drawingListenersAdded = true;
    }

    updateSvgPath() {
        if (!this.currentPathElement || this.currentStroke.length === 0) return;

        let pathData = '';

        if (this.currentStroke.length === 1) {
            // Single point - create a small circle using path
            const point = this.currentStroke[0];
            const radius = this.inkThickness / 2;
            pathData = `M ${point.x - radius} ${point.y} A ${radius} ${radius} 0 1 1 ${point.x + radius} ${point.y} A ${radius} ${radius} 0 1 1 ${point.x - radius} ${point.y}`;
        } else {
            // Multiple points - create smooth path
            pathData = `M ${this.currentStroke[0].x} ${this.currentStroke[0].y}`;

            for (let i = 1; i < this.currentStroke.length; i++) {
                pathData += ` L ${this.currentStroke[i].x} ${this.currentStroke[i].y}`;
            }
        }

        this.currentPathElement.setAttribute('d', pathData);
    }

    /**
     * Calculate bounding box for stroke points
     */
    calculateStrokeBoundingBox(points) {
        if (!points || points.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const point of points) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }

        // Add minimal padding based on stroke thickness
        const padding = Math.max(this.inkThickness * 2, 3);

        return {
            x: minX - padding,
            y: minY - padding,
            width: (maxX - minX) + (2 * padding),
            height: (maxY - minY) + (2 * padding)
        };
    }

    /**
     * Create optimized SVG with proper dimensions and percentage-based positioning
     */
    createOptimizedSvgElement(container, strokeData, isRecreation = false) {
        const bbox = this.calculateStrokeBoundingBox(strokeData.points);
        if (!bbox) return null;

        // Get page dimensions for percentage calculations
        const page = container.closest('.page');
        if (!page) return null;

        let leftPercent, topPercent, widthPercent, heightPercent;

        // If this is a recreation (during zoom) and we have stored original percentages, use those
        if (isRecreation && strokeData.originalPercentages) {
            leftPercent = strokeData.originalPercentages.leftPercent;
            topPercent = strokeData.originalPercentages.topPercent;
            widthPercent = strokeData.originalPercentages.widthPercent;
            heightPercent = strokeData.originalPercentages.heightPercent;
            console.log(`[ScribbleTool] Using stored original percentages for stroke ${strokeData.id}:`, strokeData.originalPercentages);
        } else {
            // Calculate percentages relative to original scale
            const pageRect = page.getBoundingClientRect();

            // If this is not the original scale, we need to adjust the calculations
            const scaleAdjustment = (strokeData.originalScale || 1) / this.currentScale;

            leftPercent = (bbox.x / pageRect.width) * 100 * scaleAdjustment;
            topPercent = (bbox.y / pageRect.height) * 100 * scaleAdjustment;
            widthPercent = (bbox.width / pageRect.width) * 100 * scaleAdjustment;
            heightPercent = (bbox.height / pageRect.height) * 100 * scaleAdjustment;

            // Store original percentages in strokeData for future recreations
            if (!strokeData.originalPercentages) {
                strokeData.originalPercentages = {
                    leftPercent,
                    topPercent,
                    widthPercent,
                    heightPercent
                };
                console.log(`[ScribbleTool] Stored original percentages for stroke ${strokeData.id}:`, strokeData.originalPercentages);
            }
        }

        // Create SVG element with percentage-based dimensions
        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgElement.setAttribute('class', 'stroke-svg');
        svgElement.setAttribute('data-stroke-id', strokeData.id);
        svgElement.style.setProperty('position', 'absolute', 'important');
        svgElement.style.setProperty('left', `${leftPercent}%`, 'important');
        svgElement.style.setProperty('top', `${topPercent}%`, 'important');
        svgElement.style.setProperty('width', `${widthPercent}%`, 'important');
        svgElement.style.setProperty('height', `${heightPercent}%`, 'important');
        svgElement.style.setProperty('pointer-events', 'auto', 'important');
        svgElement.style.setProperty('z-index', '10', 'important');  // Lower z-index to not interfere with toolbars
        svgElement.style.setProperty('cursor', 'pointer', 'important');
        svgElement.style.setProperty('overflow', 'visible', 'important');

        // Set viewBox to match the bounding box dimensions in actual pixels
        svgElement.setAttribute('viewBox', `0 0 ${bbox.width} ${bbox.height}`);

        // Create path element
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.setAttribute('fill', 'none');
        pathElement.setAttribute('stroke', strokeData.points[0].color);

        // Apply scale factor for stroke thickness if original scale is different from current scale
        const originalScale = strokeData.originalScale || 1;
        const scaleFactor = this.currentScale / originalScale;
        const scaledThickness = strokeData.points[0].thickness * scaleFactor;

        pathElement.setAttribute('stroke-width', scaledThickness);
        pathElement.setAttribute('stroke-opacity', strokeData.points[0].opacity);
        pathElement.setAttribute('stroke-linecap', 'round');
        pathElement.setAttribute('stroke-linejoin', 'round');

        // Create path data adjusted for SVG coordinates (relative to bbox)
        let pathData = '';
        if (strokeData.points.length === 1) {
            const point = strokeData.points[0];
            const radius = point.thickness / 2;
            const adjustedX = point.x - bbox.x;
            const adjustedY = point.y - bbox.y;
            pathData = `M ${adjustedX - radius} ${adjustedY} A ${radius} ${radius} 0 1 1 ${adjustedX + radius} ${adjustedY} A ${radius} ${radius} 0 1 1 ${adjustedX - radius} ${adjustedY}`;
        } else {
            const firstPoint = strokeData.points[0];
            pathData = `M ${firstPoint.x - bbox.x} ${firstPoint.y - bbox.y}`;
            for (let i = 1; i < strokeData.points.length; i++) {
                const point = strokeData.points[i];
                pathData += ` L ${point.x - bbox.x} ${point.y - bbox.y}`;
            }
        }

        pathElement.setAttribute('d', pathData);
        svgElement.appendChild(pathElement);

        // Store percentage data for zoom handling (similar to HighlightTool)
        const percentageData = {
            leftPercent,
            topPercent,
            widthPercent,
            heightPercent,
            originalScale: strokeData.originalScale || 1,
            strokeThickness: strokeData.points[0].thickness
        };
        svgElement.setAttribute('data-percentage-position', JSON.stringify(percentageData));

        // Store stroke data attributes for zoom repositioning
        svgElement.setAttribute('data-original-left', bbox.x.toString());
        svgElement.setAttribute('data-original-top', bbox.y.toString());
        svgElement.setAttribute('data-original-scale', (strokeData.originalScale || 1).toString());

        // Add click handler for delete functionality
        this.addStrokeClickHandler(svgElement, strokeData);

        container.appendChild(svgElement);

        console.log(`[ScribbleTool] Successfully created optimized SVG for stroke: ${strokeData.id} with scale factor: ${scaleFactor}`);
        return svgElement;
    }

    /**
     * Add click and drag handlers for stroke interaction
     */
    addStrokeClickHandler(svgElement, strokeData) {
        let clickStartTime = 0;

        // Mouse down handler for drag and click detection
        svgElement.addEventListener('mousedown', (e) => {
            clickStartTime = Date.now();
            this.dragState.hasMoved = false;

            console.log(`[ScribbleTool] Mouse down on stroke:`, strokeData.id);

            // Start drag
            this.startStrokeDrag(e, svgElement, strokeData);
        });

        // Click handler for delete popup (only if not dragged)
        svgElement.addEventListener('click', (e) => {
            const clickDuration = Date.now() - clickStartTime;
            console.log(`[ScribbleTool] Click event - duration: ${clickDuration}ms, hasMoved: ${this.dragState.hasMoved}`);

            // Show popup for quick clicks without significant movement
            if (!this.dragState.hasMoved && clickDuration < 300) {
                console.log(`[ScribbleTool] Showing delete popup for stroke:`, strokeData.id);
                e.stopPropagation();
                e.preventDefault();
                this.showStrokeDeletePopup(svgElement, strokeData);
            } else {
                console.log(`[ScribbleTool] Not showing popup - moved: ${this.dragState.hasMoved}, duration: ${clickDuration}ms`);
            }
        });

        // Set cursor to indicate interactive element
        svgElement.style.cursor = 'move';

        // Make sure path is interactive
        const pathElement = svgElement.querySelector('path');
        if (pathElement) {
            pathElement.style.pointerEvents = 'auto';
        }
    }

    /**
     * Show delete popup for stroke (similar to StampTool)
     */
    showStrokeDeletePopup(svgElement, strokeData) {
        console.log(`[ScribbleTool] Showing delete popup for stroke:`, strokeData.id);

        // Hide any existing popup
        this.hideStrokeDeletePopup();

        // Create popup menu
        const popup = document.createElement('div');
        popup.className = `stroke-popup-menu stroke-popup-${this.blockId}`;

        // Professional popup styling
        popup.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            padding: 4px;
            z-index: 10000;
            display: block;
            visibility: visible;
            opacity: 1;
            min-width: 36px;
            min-height: 36px;
        `;

        popup.innerHTML = `
            <button class="stroke-popup-delete" title="Delete Drawing" style="
                background: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                line-height: 1;
                width: 28px;
                height: 28px;
                transition: background-color 0.2s;
            " onmouseover="this.style.backgroundColor='#c82333'" onmouseout="this.style.backgroundColor='#dc3545'">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                    <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                </svg>
            </button>
        `;

        // Position popup near the stroke
        const svgRect = svgElement.getBoundingClientRect();

        // Position popup to the top-right of the stroke
        const leftPos = svgRect.right + 8;
        const topPos = svgRect.top - 8;

        // Ensure popup stays within viewport
        const popupWidth = 44;
        const popupHeight = 44;

        let finalLeft = leftPos;
        let finalTop = topPos;

        // Adjust if popup would go off right edge
        if (leftPos + popupWidth > window.innerWidth) {
            finalLeft = svgRect.left - popupWidth - 8;
        }

        // Adjust if popup would go off top edge
        if (topPos < 0) {
            finalTop = svgRect.bottom + 8;
        }

        // Adjust if popup would go off bottom edge
        if (finalTop + popupHeight > window.innerHeight) {
            finalTop = svgRect.top - popupHeight - 8;
        }

        popup.style.left = `${finalLeft}px`;
        popup.style.top = `${finalTop}px`;

        // Add popup to document body
        document.body.appendChild(popup);

        // Add delete functionality
        const deleteBtn = popup.querySelector('.stroke-popup-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showStrokeConfirmationModal(popup, strokeData);
            });
        }

        // Store reference
        this.activeStrokePopup = popup;

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (this.activeStrokePopup === popup) {
                this.hideStrokeDeletePopup();
            }
        }, 5000);
    }

    /**
     * Show confirmation modal for stroke deletion
     */
    showStrokeConfirmationModal(parentPopup, strokeData) {
        console.log(`[ScribbleTool] Showing confirmation modal for stroke:`, strokeData.id);

        // Hide any existing confirmation modal
        this.hideStrokeConfirmationModal();

        // Create confirmation modal
        const modal = document.createElement('div');
        modal.className = `stroke-confirmation-modal stroke-confirmation-${this.blockId}`;

        // Position the modal horizontally near the delete button
        const parentRect = parentPopup.getBoundingClientRect();

        // Modal styling
        modal.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #ccc;
            border-radius: 6px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            padding: 12px;
            z-index: 10001;
            display: block;
            visibility: visible;
            opacity: 1;
            min-width: 140px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            animation: confirmModalSlideIn 0.2s ease-out;
        `;

        modal.innerHTML = `
            <div style="
                margin-bottom: 10px;
                color: #333;
                font-weight: 500;
                line-height: 1.3;
            ">Delete this drawing?</div>
            <div style="
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            ">
                <button class="stroke-confirm-cancel" style="
                    background: #f8f9fa;
                    color: #6c757d;
                    border: 1px solid #dee2e6;
                    border-radius: 4px;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.15s;
                " onmouseover="
                    this.style.backgroundColor='#e9ecef';
                    this.style.borderColor='#adb5bd';
                " onmouseout="
                    this.style.backgroundColor='#f8f9fa';
                    this.style.borderColor='#dee2e6';
                ">Cancel</button>
                <button class="stroke-confirm-delete" style="
                    background: #dc3545;
                    color: white;
                    border: 1px solid #dc3545;
                    border-radius: 4px;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.15s;
                " onmouseover="
                    this.style.backgroundColor='#c82333';
                    this.style.borderColor='#bd2130';
                " onmouseout="
                    this.style.backgroundColor='#dc3545';
                    this.style.borderColor='#dc3545';
                ">Delete</button>
            </div>
        `;

        // Position modal to the right of the popup, or left if no space
        let modalLeft = parentRect.right + 8;
        const modalTop = parentRect.top;
        const modalWidth = 140;

        // If modal would go off right edge, position it to the left
        if (modalLeft + modalWidth > window.innerWidth) {
            modalLeft = parentRect.left - modalWidth - 8;
        }

        // If still off screen, position it below
        if (modalLeft < 0) {
            modalLeft = parentRect.left;
            modal.style.top = `${parentRect.bottom + 8}px`;
        } else {
            modal.style.top = `${modalTop}px`;
        }

        modal.style.left = `${modalLeft}px`;

        // Add modal to document body
        document.body.appendChild(modal);

        // Add event handlers
        const cancelBtn = modal.querySelector('.stroke-confirm-cancel');
        const deleteBtn = modal.querySelector('.stroke-confirm-delete');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideStrokeConfirmationModal();
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideStrokeConfirmationModal();
                this.hideStrokeDeletePopup();
                this.deleteStroke(strokeData);
            });
        }

        // Store reference
        this.activeStrokeConfirmationModal = modal;

        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (this.activeStrokeConfirmationModal === modal) {
                this.hideStrokeConfirmationModal();
            }
        }, 10000);
    }

    /**
     * Hide stroke delete popup
     */
    hideStrokeDeletePopup() {
        if (this.activeStrokePopup) {
            this.activeStrokePopup.remove();
            this.activeStrokePopup = null;
        }
        // Also hide any confirmation modal
        this.hideStrokeConfirmationModal();
    }

    /**
     * Hide stroke confirmation modal
     */
    hideStrokeConfirmationModal() {
        if (this.activeStrokeConfirmationModal) {
            this.activeStrokeConfirmationModal.remove();
            this.activeStrokeConfirmationModal = null;
        }
    }

    /**
     * Delete a stroke
     */
    deleteStroke(strokeData) {
        console.log(`[ScribbleTool] Deleting stroke:`, strokeData.id);
        console.log(`[ScribbleTool] Stroke data for deletion:`, strokeData);
        console.log(`[ScribbleTool] Annotation interface available:`, !!this.annotationInterface);

        // Find the page containing this stroke - try multiple methods
        let pageNumber = null;

        // Method 1: Search in drawingData
        this.drawingData.forEach((strokes, pageNum) => {
            const strokeIndex = strokes.findIndex(s => s.id === strokeData.id);
            if (strokeIndex !== -1) {
                // Remove from drawing data
                strokes.splice(strokeIndex, 1);
                pageNumber = pageNum;
                console.log(`[ScribbleTool] Removed stroke from page ${pageNum} drawing data`);
            }
        });

        // Method 2: If not found in drawingData, get from DOM
        if (pageNumber === null) {
            const svgElement = document.querySelector(`[data-stroke-id="${strokeData.id}"]`);
            if (svgElement) {
                const drawingContainer = svgElement.closest('.drawing-container');
                if (drawingContainer) {
                    const pageNumberAttr = drawingContainer.getAttribute('data-page-number');
                    if (pageNumberAttr) {
                        pageNumber = parseInt(pageNumberAttr);
                        console.log(`[ScribbleTool] Found page number from DOM: ${pageNumber}`);
                    }
                }

                // Alternative: get from parent page container
                if (pageNumber === null) {
                    const pageContainer = svgElement.closest('.page');
                    if (pageContainer) {
                        const pageNumberAttr = pageContainer.getAttribute('data-page-number');
                        if (pageNumberAttr) {
                            pageNumber = parseInt(pageNumberAttr);
                            console.log(`[ScribbleTool] Found page number from page container: ${pageNumber}`);
                        }
                    }
                }
            }
        }

        console.log(`[ScribbleTool] Found page number for deletion:`, pageNumber);

        // Get SVG element reference BEFORE removing it (for page number fallback)
        const svgElement = document.querySelector(`[data-stroke-id="${strokeData.id}"]`);

        // Final fallback: try to get page number from SVG element before removal
        if (pageNumber === null && svgElement) {
            const drawingContainer = svgElement.closest('.drawing-container');
            if (drawingContainer) {
                const pageNumberAttr = drawingContainer.getAttribute('data-page-number');
                if (pageNumberAttr) {
                    pageNumber = parseInt(pageNumberAttr);
                    console.log(`[ScribbleTool] Final fallback - found page number from DOM: ${pageNumber}`);
                }
            }

            if (pageNumber === null) {
                const pageContainer = svgElement.closest('.page');
                if (pageContainer) {
                    const pageNumberAttr = pageContainer.getAttribute('data-page-number');
                    if (pageNumberAttr) {
                        pageNumber = parseInt(pageNumberAttr);
                        console.log(`[ScribbleTool] Final fallback - found page number from page container: ${pageNumber}`);
                    }
                }
            }
        }

        // Remove SVG element from DOM
        if (svgElement) {
            svgElement.remove();
            console.log(`[ScribbleTool] Removed stroke SVG from DOM`);
        }

        // Save deletion through annotation interface
        if (this.annotationInterface && pageNumber !== null) {
            console.log(`[ScribbleTool] About to call saveStrokeDeletion for page:`, pageNumber);
            this.saveStrokeDeletion(strokeData, pageNumber);
        } else {
            console.warn(`[ScribbleTool] Cannot save deletion - annotationInterface:`, !!this.annotationInterface, `pageNumber:`, pageNumber);
        }

        console.log(`[ScribbleTool] Successfully deleted stroke:`, strokeData.id);
    }

    /**
     * Save stroke deletion to server
     */
    saveStrokeDeletion(strokeData, pageNumber) {
        console.log(`[ScribbleTool] saveStrokeDeletion called with:`, { strokeData, pageNumber });

        if (!this.annotationInterface) {
            console.warn(`[ScribbleTool] No annotation interface available - deletion will not be saved!`);
            return;
        }

        // Use the annotation ID (not stroke ID) for deletion
        const annotationId = strokeData.annotationId || strokeData.id;
        console.log(`[ScribbleTool] Using annotation ID for deletion:`, annotationId);

        // Create deletion annotation that will overwrite the existing one
        const deletionAnnotation = {
            id: annotationId, // Use same ID to overwrite/delete existing annotation
            type: 'drawing_strokes',
            pageNum: pageNumber,
            data: {
                _deleted: true,
                _action: 'delete',
                strokeId: strokeData.id,
                timestamp: Date.now()
            },
            config: {
                type: 'stroke_deletion',
                action: 'delete'
            },
            timestamp: Date.now()
        };

        console.log(`[ScribbleTool] Created deletion annotation:`, deletionAnnotation);
        console.log(`[ScribbleTool] About to call annotationInterface.saveAnnotation`);

        // Save deletion through the annotation interface
        this.annotationInterface.saveAnnotation(deletionAnnotation)
            .then(() => {
                console.log(`[ScribbleTool] Successfully sent deletion request for annotation:`, annotationId);
            })
            .catch((error) => {
                console.error(`[ScribbleTool] Failed to send deletion request for annotation:`, annotationId, error);
            });

        console.log(`[ScribbleTool] Queued deletion request for annotation:`, annotationId, `on page ${pageNumber}`);
    }

    recreateSvgStroke(container, strokeData) {
        console.log(`[ScribbleTool] Recreating SVG stroke:`, strokeData.id);

        // Use optimized SVG creation with recreation flag to preserve original percentages
        const svgElement = this.createOptimizedSvgElement(container, strokeData, true);

        if (svgElement) {
            // Mark as saved stroke to distinguish from fresh strokes
            svgElement.classList.add('saved-stroke');
            console.log(`[ScribbleTool] Successfully recreated SVG for saved stroke: ${strokeData.id}`);
        } else {
            console.error(`[ScribbleTool] Failed to recreate SVG for stroke: ${strokeData.id}`);
        }

        return svgElement;
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
                    this.currentScale = newScale;

                    // Use setTimeout to ensure PDF.js has finished rendering at new scale
                    setTimeout(() => {
                        // Update current scale again to be sure
                        this.updateCurrentScale();
                        this.preserveDrawingsAfterZoom();
                        this.updateStrokePositionsAfterZoom();
                    }, 100);
                }
            };
            this.viewer.eventBus.on('scalechanging', this.zoomHandler);
        }
    }

    /**
     * Preserve and restore drawings after zoom events
     * This handles cases where PDF.js recreates page containers during zoom
     */
    preserveDrawingsAfterZoom() {
        console.log(`[ScribbleTool] Preserving drawings after zoom change`);

        // Check if the scribble tool is currently active
        const isToolActive = this.viewer.currentTool === 'scribble';

        // Find all pages and ensure drawing containers exist with preserved content
        const pages = document.querySelectorAll(`#viewerContainer-${this.blockId} .page`);

        pages.forEach((page, index) => {
            const pageNumber = index + 1;

            // Check if drawing container exists
            let container = page.querySelector('.drawing-container');

            if (!container) {
                // Container was lost during zoom - recreate it
                container = document.createElement('div');
                container.className = 'drawing-container';
                container.setAttribute('data-page-number', pageNumber);
                container.style.position = 'absolute';
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.zIndex = '25';
                container.style.pointerEvents = isToolActive ? 'auto' : 'none';
                container.style.cursor = isToolActive ? 'crosshair' : 'default';

                // Make page relative positioned if not already
                if (getComputedStyle(page).position === 'static') {
                    page.style.position = 'relative';
                }

                page.appendChild(container);

                // Update tracking array
                if (!this.allDrawingContainers.includes(container)) {
                    this.allDrawingContainers.push(container);
                }

                console.log(`[ScribbleTool] Recreated drawing container for page ${pageNumber} after zoom`);
            } else {
                // Container exists - ensure it's properly configured
                container.style.pointerEvents = isToolActive ? 'auto' : 'none';
                container.style.cursor = isToolActive ? 'crosshair' : 'default';

                // Ensure it's in tracking array
                if (!this.allDrawingContainers.includes(container)) {
                    this.allDrawingContainers.push(container);
                }
            }

            // Check if container has lost its SVG content (common during zoom)
            const existingSvgs = container.querySelectorAll('.stroke-svg');
            const expectedSvgs = this.drawingData.get(pageNumber)?.length || 0;

            if (existingSvgs.length < expectedSvgs) {
                console.log(`[ScribbleTool] Page ${pageNumber} lost ${expectedSvgs - existingSvgs.length} SVG strokes during zoom, restoring missing strokes...`);

                // Don't clear container - just restore missing strokes
                this.restorePageDrawings(container, pageNumber);
            } else if (existingSvgs.length > 0) {
                console.log(`[ScribbleTool] Page ${pageNumber} has ${existingSvgs.length} existing SVG strokes, updating stroke thickness only`);

                // Update stroke thickness for existing SVGs instead of recreating them
                this.updateExistingStrokeThickness(existingSvgs);
            }

            // Ensure event listeners are properly set up if tool is active
            if (isToolActive) {
                // Reset listeners flag to allow re-adding
                container._drawingListenersAdded = false;
                this.addDrawingListeners(container, pageNumber);
            }
        });

        console.log(`[ScribbleTool] Completed drawing preservation after zoom for ${pages.length} pages`);
    }

    setupPagesLoadedHandler() {
        if (this.viewer.eventBus) {
            this.pagesLoadedHandler = () => {
                console.log(`[ScribbleTool] Pages loaded event - ensuring drawing containers exist`);

                // Use setTimeout to ensure PDF.js has fully completed page setup
                setTimeout(() => {
                    this.ensureDrawingContainersAfterPageReload();
                }, 50);
            };
            this.viewer.eventBus.on('pagesloaded', this.pagesLoadedHandler);
        }
    }

    /**
     * Ensure drawing containers exist after page reload events
     * This is crucial for handling zoom operations that recreate pages
     */
    ensureDrawingContainersAfterPageReload() {
        console.log(`[ScribbleTool] Ensuring drawing containers after page reload`);

        // Check if the scribble tool is currently active
        const isToolActive = this.viewer.currentTool === 'scribble';

        // Find all pages and ensure drawing containers exist
        const pages = document.querySelectorAll(`#viewerContainer-${this.blockId} .page`);

        if (pages.length === 0) {
            console.warn(`[ScribbleTool] No pages found after page reload`);
            return;
        }

        pages.forEach((page, index) => {
            const pageNumber = index + 1;

            // Check if drawing container exists
            let container = page.querySelector('.drawing-container');

            if (!container) {
                // Container missing - create it
                container = document.createElement('div');
                container.className = 'drawing-container';
                container.setAttribute('data-page-number', pageNumber);
                container.style.position = 'absolute';
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.zIndex = '25';
                container.style.pointerEvents = isToolActive ? 'auto' : 'none';
                container.style.cursor = isToolActive ? 'crosshair' : 'default';

                // Make page relative positioned if not already
                if (getComputedStyle(page).position === 'static') {
                    page.style.position = 'relative';
                }

                page.appendChild(container);

                // Update tracking array
                if (!this.allDrawingContainers.includes(container)) {
                    this.allDrawingContainers.push(container);
                }

                console.log(`[ScribbleTool] Created missing drawing container for page ${pageNumber} after page reload`);

                // Restore drawings for this page
                this.restorePageDrawings(container, pageNumber);

                // Add event listeners if tool is active
                if (isToolActive) {
                    this.addDrawingListeners(container, pageNumber);
                }
            } else {
                // Container exists - ensure it has the right content and configuration
                container.style.pointerEvents = isToolActive ? 'auto' : 'none';
                container.style.cursor = isToolActive ? 'crosshair' : 'default';

                // Ensure it's in tracking array
                if (!this.allDrawingContainers.includes(container)) {
                    this.allDrawingContainers.push(container);
                }

                                // Check if container lost its SVG content during page reload
                const existingSvgs = container.querySelectorAll('.stroke-svg');
                const expectedSvgs = this.drawingData.get(pageNumber)?.length || 0;

                if (existingSvgs.length < expectedSvgs) {
                    console.log(`[ScribbleTool] Page ${pageNumber} lost ${expectedSvgs - existingSvgs.length} SVG strokes during page reload, restoring...`);
                    this.restorePageDrawings(container, pageNumber);
                }

                // Ensure event listeners are set up if tool is active
                if (isToolActive && !container._drawingListenersAdded) {
                    this.addDrawingListeners(container, pageNumber);
                }
            }
        });

        console.log(`[ScribbleTool] Completed drawing container check after page reload for ${pages.length} pages`);
    }

    /**
     * Debug method to inspect the current state of stored drawing data
     */
    debugDrawingData() {
        console.log(`[ScribbleTool] DEBUG: Drawing data inspection:`);
        console.log(`[ScribbleTool] DEBUG: drawingData Map size: ${this.drawingData.size}`);
        console.log(`[ScribbleTool] DEBUG: drawingData Map keys:`, Array.from(this.drawingData.keys()));

        this.drawingData.forEach((strokes, pageNumber) => {
            console.log(`[ScribbleTool] DEBUG: Page ${pageNumber} has ${strokes.length} strokes:`);
            strokes.forEach((stroke, index) => {
                console.log(`[ScribbleTool] DEBUG:   Stroke ${index}: id=${stroke.id}, points=${stroke.points.length}, pathData=${stroke.pathData ? 'present' : 'missing'}`);
            });
        });

        // Also check DOM state
        const containers = document.querySelectorAll(`#viewerContainer-${this.blockId} .drawing-container`);
        console.log(`[ScribbleTool] DEBUG: Found ${containers.length} drawing containers in DOM`);
        containers.forEach((container, index) => {
            const pageNum = container.getAttribute('data-page-number');
            const svgs = container.querySelectorAll('.stroke-svg');
            console.log(`[ScribbleTool] DEBUG: Container ${index} (page ${pageNum}) has ${svgs.length} SVG elements`);
        });
    }

    /**
     * Global debug function accessible from console
     */
    static debugGlobal(blockId) {
        const viewer = window[`pdfxViewer_${blockId}`];
        if (viewer && viewer.scribbleTool) {
            console.log(`[ScribbleTool] DEBUG: Global debug for block ${blockId}`);
            viewer.scribbleTool.debugDrawingData();
            return viewer.scribbleTool;
        } else {
            console.error(`[ScribbleTool] DEBUG: No viewer or scribble tool found for block: ${blockId}`);
            return null;
        }
    }

    cleanup() {
        // Remove zoom handler
        if (this.viewer.eventBus && this.zoomHandler) {
            this.viewer.eventBus.off('scalechanging', this.zoomHandler);
            this.zoomHandler = null;
        }

        // Remove pages loaded handler
        if (this.viewer.eventBus && this.pagesLoadedHandler) {
            this.viewer.eventBus.off('pagesloaded', this.pagesLoadedHandler);
            this.pagesLoadedHandler = null;
        }

        // Hide any active popups
        this.hideStrokeDeletePopup();

        // Remove global drag handlers
        if (this.globalMouseMoveHandler) {
            document.removeEventListener('mousemove', this.globalMouseMoveHandler);
            this.globalMouseMoveHandler = null;
        }

        if (this.globalMouseUpHandler) {
            document.removeEventListener('mouseup', this.globalMouseUpHandler);
            this.globalMouseUpHandler = null;
        }

        // Remove all drawing containers
        this.allDrawingContainers.forEach(container => {
            if (container.parentNode) {
                container.remove();
            }
        });
        this.allDrawingContainers = [];

        // Clear drawing data
        this.drawingData.clear();

        // Reset drawing state
        this.isDrawing = false;
        this.currentStroke = [];
        this.currentSvgElement = null;
        this.currentPathElement = null;

        console.log(`[ScribbleTool] Cleanup completed`);
    }

    /**
     * Update stroke thickness for existing SVG elements during zoom
     */
    updateExistingStrokeThickness(svgElements) {
        svgElements.forEach(svgElement => {
            const storedData = svgElement.getAttribute('data-percentage-position');
            if (storedData) {
                try {
                    const percentageData = JSON.parse(storedData);

                    // Update stroke thickness based on scale change
                    if (percentageData.originalScale && percentageData.strokeThickness) {
                        const scaleFactor = this.currentScale / percentageData.originalScale;
                        const pathElement = svgElement.querySelector('path');
                        if (pathElement) {
                            const scaledThickness = percentageData.strokeThickness * scaleFactor;
                            pathElement.setAttribute('stroke-width', scaledThickness);
                            console.log(`[ScribbleTool] Updated existing stroke ${svgElement.getAttribute('data-stroke-id')} thickness: ${percentageData.strokeThickness} -> ${scaledThickness} (scale: ${scaleFactor})`);
                        }
                    }
                } catch (e) {
                    console.warn(`[ScribbleTool] Failed to parse stroke position data for thickness update:`, e);
                }
            }
        });
    }

    /**
     * Update stroke SVG positions and thickness after zoom changes
     */
    updateStrokePositionsAfterZoom() {
        const strokeSvgs = document.querySelectorAll(`#pdfx-block-${this.blockId} .stroke-svg:not(.drawing-temp)`);
        console.log(`[ScribbleTool] Updating stroke positions for ${strokeSvgs.length} strokes after zoom`);

        strokeSvgs.forEach(svgElement => {
            const storedData = svgElement.getAttribute('data-percentage-position');
            if (storedData) {
                try {
                    const percentageData = JSON.parse(storedData);

                    // Update stroke thickness based on scale change
                    if (percentageData.originalScale && percentageData.strokeThickness) {
                        const scaleFactor = this.currentScale / percentageData.originalScale;
                        const pathElement = svgElement.querySelector('path');
                        if (pathElement) {
                            const scaledThickness = percentageData.strokeThickness * scaleFactor;
                            pathElement.setAttribute('stroke-width', scaledThickness);
                            console.log(`[ScribbleTool] Updated stroke ${svgElement.getAttribute('data-stroke-id')} thickness: ${percentageData.strokeThickness} -> ${scaledThickness} (scale: ${scaleFactor})`);
                        }
                    }

                    // Percentage positions remain the same but verify they're still correct
                    console.log(`[ScribbleTool] Stroke ${svgElement.getAttribute('data-stroke-id')} maintains percentage position after zoom`);
                } catch (e) {
                    console.warn(`[ScribbleTool] Failed to parse stroke position data for zoom update:`, e);
                }
            } else {
                console.warn(`[ScribbleTool] No percentage data found for stroke ${svgElement.getAttribute('data-stroke-id')}`);
            }
        });
    }

    /**
     * Clear all strokes (called by ClearTool)
     */
    clearAllStrokes() {
        console.log(`[ScribbleTool] Clearing all strokes`);

        // Hide any active popups
        this.hideStrokeDeletePopup();

        // Remove all stroke SVGs from DOM
        const allStrokes = document.querySelectorAll(`#pdfx-block-${this.blockId} .stroke-svg`);
        allStrokes.forEach(stroke => {
            if (stroke.parentNode) {
                stroke.remove();
            }
        });

        // Clear all drawing data
        this.drawingData.clear();

        console.log(`[ScribbleTool] All strokes cleared`);
    }

    /**
     * Clear strokes for specific page (called by ClearTool)
     */
    clearPageStrokes(pageNum) {
        console.log(`[ScribbleTool] Clearing strokes for page ${pageNum}`);

        // Hide any active popups
        this.hideStrokeDeletePopup();

        // Remove strokes from specific page
        const pageContainer = document.querySelector(`#pdfx-block-${this.blockId} .page[data-page-number="${pageNum}"]`);
        if (pageContainer) {
            const pageStrokes = pageContainer.querySelectorAll('.stroke-svg');
            pageStrokes.forEach(stroke => {
                if (stroke.parentNode) {
                    stroke.remove();
                }
            });
        }

        // Clear data for this page
        this.drawingData.delete(pageNum);

        console.log(`[ScribbleTool] Cleared strokes from page ${pageNum}`);
    }

    /**
     * Update current scale from the PDF viewer
     */
    updateCurrentScale() {
        try {
            // Try to get scale from PDF.js viewer
            const pdfViewer = this.viewer.pdfViewer;
            if (pdfViewer && pdfViewer.currentScale) {
                this.currentScale = pdfViewer.currentScale;
                console.log(`[ScribbleTool] Updated current scale to: ${this.currentScale}`);
            } else {
                // Fallback: try to get from viewer container transform
                const viewerContainer = document.getElementById(`viewerContainer-${this.blockId}`);
                if (viewerContainer) {
                    const firstPage = viewerContainer.querySelector('.page');
                    if (firstPage) {
                        const transform = window.getComputedStyle(firstPage).transform;
                        if (transform && transform !== 'none') {
                            const matrix = transform.match(/matrix\(([^)]+)\)/);
                            if (matrix) {
                                const values = matrix[1].split(',');
                                this.currentScale = parseFloat(values[0].trim());
                                console.log(`[ScribbleTool] Detected scale from transform: ${this.currentScale}`);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`[ScribbleTool] Could not determine current scale:`, error);
            this.currentScale = 1; // fallback
        }
    }

    /**
     * Setup global click handler to close popups
     */
    setupGlobalClickHandler() {
        document.addEventListener('click', (e) => {
            if (this.activeStrokePopup &&
                !e.target.closest('.stroke-popup-menu') &&
                !e.target.closest('.stroke-svg')) {
                this.hideStrokeDeletePopup();
            }
        });
    }

    /**
     * Setup global drag handlers (similar to StampTool)
     */
    setupGlobalDragHandlers() {
        this.globalMouseMoveHandler = (e) => {
            if (this.dragState.isDragging && this.dragState.currentStroke) {
                // Mark that mouse has moved for click detection
                if (!this.dragState.hasMoved) {
                    const deltaX = Math.abs(e.clientX - this.dragState.startX);
                    const deltaY = Math.abs(e.clientY - this.dragState.startY);
                    if (deltaX > 3 || deltaY > 3) { // 3px threshold
                        this.dragState.hasMoved = true;
                        this.hideStrokeDeletePopup(); // Hide popup if drag starts
                    }
                }

                if (this.dragState.hasMoved) {
                    this.handleStrokeDrag(e);
                }
            }
        };

        this.globalMouseUpHandler = () => {
            if (this.dragState.isDragging && this.dragState.currentStroke) {
                this.endStrokeDrag();
            }
        };

        document.addEventListener('mousemove', this.globalMouseMoveHandler);
        document.addEventListener('mouseup', this.globalMouseUpHandler);
    }

        /**
     * Start stroke drag operation
     */
    startStrokeDrag(e, svgElement, strokeData) {
        this.dragState.isDragging = true;
        this.dragState.startX = e.clientX;
        this.dragState.startY = e.clientY;

        // Get current position from SVG element styles (percentage-based)
        const currentLeft = parseFloat(svgElement.style.left.replace('%', '')) || 0;
        const currentTop = parseFloat(svgElement.style.top.replace('%', '')) || 0;

        // Convert percentage to pixels for drag calculations
        const page = svgElement.closest('.page');
        if (page) {
            const pageRect = page.getBoundingClientRect();
            const leftPx = (currentLeft / 100) * pageRect.width;
            const topPx = (currentTop / 100) * pageRect.height;

            this.dragState.startLeft = leftPx;
            this.dragState.startTop = topPx;

            console.log(`[ScribbleTool] Started dragging stroke:`, strokeData.id,
                       `from percentage (${currentLeft}%, ${currentTop}%) = pixels (${leftPx}, ${topPx})`);
        } else {
            // Fallback to pixel values if no page found
            this.dragState.startLeft = currentLeft;
            this.dragState.startTop = currentTop;
            console.log(`[ScribbleTool] Started dragging stroke (fallback):`, strokeData.id, `from position (${currentLeft}, ${currentTop})`);
        }

        this.dragState.currentStroke = {
            element: svgElement,
            data: strokeData,
            page: page
        };

        e.preventDefault();
    }

    /**
     * Handle stroke drag movement
     */
    handleStrokeDrag(e) {
        const deltaX = e.clientX - this.dragState.startX;
        const deltaY = e.clientY - this.dragState.startY;

        const newLeftPx = this.dragState.startLeft + deltaX;
        const newTopPx = this.dragState.startTop + deltaY;

        // Convert back to percentages for consistency
        const page = this.dragState.currentStroke.page;
        if (page) {
            const pageRect = page.getBoundingClientRect();
            const newLeftPercent = (newLeftPx / pageRect.width) * 100;
            const newTopPercent = (newTopPx / pageRect.height) * 100;

            // Update SVG position using percentages
            this.dragState.currentStroke.element.style.left = `${newLeftPercent}%`;
            this.dragState.currentStroke.element.style.top = `${newTopPercent}%`;
        } else {
            // Fallback to pixel values
            this.dragState.currentStroke.element.style.left = `${newLeftPx}px`;
            this.dragState.currentStroke.element.style.top = `${newTopPx}px`;
        }
    }

    /**
     * End stroke drag operation and save new position
     */
    endStrokeDrag() {
        if (!this.dragState.isDragging || !this.dragState.currentStroke) return;

        const svgElement = this.dragState.currentStroke.element;
        const strokeData = this.dragState.currentStroke.data;

        // Get final position (remove units)
        const finalLeft = parseFloat(svgElement.style.left.replace('%', '').replace('px', '')) || 0;
        const finalTop = parseFloat(svgElement.style.top.replace('%', '').replace('px', '')) || 0;

        console.log(`[ScribbleTool] Ended drag for stroke:`, strokeData.id, `at position (${finalLeft}, ${finalTop})`);

        // Simply save the stroke move (don't update points for now)
        this.saveStrokeMove(strokeData, finalLeft, finalTop);

        // Reset drag state
        this.dragState.isDragging = false;
        this.dragState.currentStroke = null;
        this.dragState.hasMoved = false;

        console.log(`[ScribbleTool] Stroke drag completed for:`, strokeData.id);
    }

        /**
     * Update stroke position in data and save to server
     */
    updateStrokePosition(strokeData, newLeft, newTop, svgElement) {
        console.log(`[ScribbleTool] Updating stroke position for:`, strokeData.id, `to (${newLeft}, ${newTop})`);

        // Get current position (could be percentage or pixels)
        const currentLeft = parseFloat(svgElement.style.left.replace('%', '').replace('px', '')) || 0;
        const currentTop = parseFloat(svgElement.style.top.replace('%', '').replace('px', '')) || 0;

        console.log(`[ScribbleTool] Current SVG position: (${currentLeft}, ${currentTop})`);

        // For now, skip the complex delta calculation and just update the position data
        // The stroke is already visually in the right place after dragging

        // Note: We're not updating the individual stroke points for now since the SVG
        // position handles the visual positioning. The main goal is to save the move.

        // Update percentage position for zoom compatibility
        const page = svgElement.closest('.page');
        if (page) {
            const pageRect = page.getBoundingClientRect();
            const svgRect = svgElement.getBoundingClientRect();

            const leftPercent = ((newLeft / pageRect.width) * 100);
            const topPercent = ((newTop / pageRect.height) * 100);
            const widthPercent = ((svgRect.width / pageRect.width) * 100);
            const heightPercent = ((svgRect.height / pageRect.height) * 100);

            const percentageData = {
                leftPercent,
                topPercent,
                widthPercent,
                heightPercent
            };

            svgElement.setAttribute('data-percentage-position', JSON.stringify(percentageData));
            console.log(`[ScribbleTool] Updated percentage position:`, percentageData);
        }

        // Update stroke in internal data storage
        this.updateStrokeInDrawingData(strokeData);

        // Save to server
        this.saveStrokeMove(strokeData, newLeft, newTop);
    }

    /**
     * Update stroke in internal drawingData
     */
    updateStrokeInDrawingData(strokeData) {
        this.drawingData.forEach((strokes, pageNum) => {
            const strokeIndex = strokes.findIndex(s => s.id === strokeData.id);
            if (strokeIndex !== -1) {
                strokes[strokeIndex] = strokeData;
                console.log(`[ScribbleTool] Updated stroke in drawingData for page ${pageNum}`);
            }
        });
    }

    /**
     * Save stroke move to server
     */
    saveStrokeMove(strokeData, newLeft, newTop) {
        if (!this.annotationInterface) {
            console.warn(`[ScribbleTool] No annotation interface - stroke move will not be saved!`);
            return;
        }

        // Find page number - try multiple methods like in deleteStroke
        let pageNumber = null;

        // Method 1: Search in drawingData
        this.drawingData.forEach((strokes, pageNum) => {
            if (strokes.find(s => s.id === strokeData.id)) {
                pageNumber = pageNum;
            }
        });

        // Method 2: Get from DOM if not found in drawingData
        if (pageNumber === null) {
            const svgElement = document.querySelector(`[data-stroke-id="${strokeData.id}"]`);
            if (svgElement) {
                const drawingContainer = svgElement.closest('.drawing-container');
                if (drawingContainer) {
                    const pageNumberAttr = drawingContainer.getAttribute('data-page-number');
                    if (pageNumberAttr) {
                        pageNumber = parseInt(pageNumberAttr);
                        console.log(`[ScribbleTool] Found page number from DOM for move: ${pageNumber}`);
                    }
                }

                // Alternative: get from parent page container
                if (pageNumber === null) {
                    const pageContainer = svgElement.closest('.page');
                    if (pageContainer) {
                        const pageNumberAttr = pageContainer.getAttribute('data-page-number');
                        if (pageNumberAttr) {
                            pageNumber = parseInt(pageNumberAttr);
                            console.log(`[ScribbleTool] Found page number from page container for move: ${pageNumber}`);
                        }
                    }
                }
            }
        }

        if (pageNumber === null) {
            console.warn(`[ScribbleTool] Could not find page number for moved stroke - stroke ID:`, strokeData.id);
            return;
        }

        // Use existing annotation ID or stroke ID
        const annotationId = strokeData.annotationId || strokeData.id;

        // Create updated annotation
        const annotation = {
            id: annotationId,
            type: 'drawing_strokes',
            pageNum: pageNumber,
            data: {
                strokeData: strokeData,
                color: strokeData.points[0]?.color || '#FF0000',
                thickness: strokeData.points[0]?.thickness || 2,
                opacity: strokeData.points[0]?.opacity || 1,
                _action: 'move',
                newPosition: { left: newLeft, top: newTop }
            },
            config: {
                type: 'stroke_move',
                action: 'move'
            },
            timestamp: Date.now()
        };

        console.log(`[ScribbleTool] Saving stroke move to server:`, annotationId);
        this.annotationInterface.saveAnnotation(annotation)
            .then(() => {
                console.log(`[ScribbleTool] Successfully saved stroke move for:`, annotationId);
            })
            .catch((error) => {
                console.error(`[ScribbleTool] Failed to save stroke move for:`, annotationId, error);
            });
    }

    updateInkSettings() {
        // Get current ink settings from the parameter toolbar
        const colorInput = document.getElementById(`editorInkColor-${this.blockId}`);
        const thicknessInput = document.getElementById(`editorInkThickness-${this.blockId}`);
        const opacityInput = document.getElementById(`editorInkOpacity-${this.blockId}`);

        this.inkColor = colorInput ? colorInput.value : '#FF0000';
        this.inkThickness = thicknessInput ? parseInt(thicknessInput.value) : 2;
        this.inkOpacity = opacityInput ? parseFloat(opacityInput.value) : 1;

        console.log(`[ScribbleTool] Updated ink settings: color=${this.inkColor}, thickness=${this.inkThickness}, opacity=${this.inkOpacity}`);
    }

    restorePageDrawings(container, pageNumber) {
        // Restore drawings from stored data
        const pageDrawings = this.drawingData.get(pageNumber);

        if (!pageDrawings) {
            console.log(`[ScribbleTool] No drawings found for page ${pageNumber}`);
            return;
        }

        console.log(`[ScribbleTool] Restoring ${pageDrawings.length} strokes for page ${pageNumber}`);

        pageDrawings.forEach((strokeData) => {
            // Check if this stroke already exists in the container
            const existingStroke = container.querySelector(`[data-stroke-id="${strokeData.id}"]`);
            if (existingStroke) {
                return; // Skip if already exists
            }

            // Ensure annotation ID is available for deletion tracking
            if (!strokeData.annotationId) {
                console.warn(`[ScribbleTool] Stroke ${strokeData.id} missing annotation ID - deletion may not work`);
            }

            this.recreateSvgStroke(container, strokeData);
        });

        console.log(`[ScribbleTool] Restored ${pageDrawings.length} strokes for page ${pageNumber}`);
    }

    /**
     * Save drawing stroke as annotation
     */
    saveDrawingStroke(pageNumber, strokeId, strokePoints, annotationId) {
        if (!this.annotationInterface) {
            console.warn(`[ScribbleTool] No annotation interface - drawing will not be saved!`);
            return;
        }

        // Get the stroke data from drawingData to include original percentages
        const pageDrawings = this.drawingData.get(pageNumber);
        const fullStrokeData = pageDrawings?.find(s => s.id === strokeId);

        // Convert stroke data to annotation format
        const strokeData = {
            id: strokeId,
            points: strokePoints,
            pathData: this.currentPathElement ? this.currentPathElement.getAttribute('d') : null,
            pageNumber: pageNumber,
            timestamp: Date.now(),
            originalScale: this.currentScale,
            // Include original percentages if available
            originalPercentages: fullStrokeData?.originalPercentages || null
        };

        // Create annotation object using the provided annotation ID
        const annotation = {
            id: annotationId,
            type: 'drawing_strokes',
            pageNum: pageNumber,
            data: {
                strokeData: strokeData,
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

        console.log(`[ScribbleTool] Saving drawing stroke for page ${pageNumber} with annotation ID: ${annotationId}`);
        this.annotationInterface.saveAnnotation(annotation);
    }

    /**
     * Load saved annotations into internal drawingData structure
     * This is called by PdfxViewer when rendering saved scribble annotations
     */
    loadSavedAnnotations(drawingStrokes) {
        console.log(`[ScribbleTool] Loading saved annotations into drawingData for ${Object.keys(drawingStrokes).length} pages`);

        Object.entries(drawingStrokes).forEach(([pageNum, pageStrokes]) => {
            const page = parseInt(pageNum);
            if (!Array.isArray(pageStrokes)) return;

            // Initialize page data if not exists
            if (!this.drawingData.has(page)) {
                this.drawingData.set(page, []);
            }

            // Process each stroke and add to internal data structure
            pageStrokes.forEach(stroke => {
                if (stroke.data && stroke.data.strokeData) {
                    // Extract stroke data and ensure annotation ID is preserved
                    const strokeData = {
                        ...stroke.data.strokeData,
                        annotationId: stroke.id, // Use the annotation ID from server
                        originalScale: stroke.data.strokeData.originalScale || 1,
                        timestamp: stroke.timestamp || Date.now(),
                        // Preserve original percentages if they exist from server
                        originalPercentages: stroke.data.strokeData.originalPercentages || null
                    };

                    // Check if stroke already exists in drawingData to prevent duplicates
                    const existingStroke = this.drawingData.get(page).find(s => s.id === strokeData.id || s.annotationId === stroke.id);
                    if (!existingStroke) {
                        this.drawingData.get(page).push(strokeData);
                        console.log(`[ScribbleTool] Added saved stroke to drawingData: ${strokeData.id} (annotation: ${stroke.id}) on page ${page}`);
                    } else {
                        console.log(`[ScribbleTool] Stroke already exists in drawingData, skipping: ${strokeData.id}`);
                    }
                }
            });

            console.log(`[ScribbleTool] Page ${page} now has ${this.drawingData.get(page).length} strokes in drawingData`);
        });

        console.log(`[ScribbleTool] Total pages with stroke data: ${this.drawingData.size}`);
        console.log(`[ScribbleTool] drawingData keys:`, Array.from(this.drawingData.keys()));
    }
};

// Make global debug function available
window.debugScribbleTool = function(blockId) {
    return window.ScribbleTool.debugGlobal(blockId);
};

// Additional global function to quickly check drawing data
window.checkScribbleData = function(blockId) {
    const viewer = window[`pdfxViewer_${blockId}`];
    if (viewer && viewer.scribbleTool) {
        const tool = viewer.scribbleTool;
        console.log(`[DEBUG] ScribbleTool for block ${blockId}:`);
        console.log(`[DEBUG] drawingData Map size: ${tool.drawingData.size}`);
        console.log(`[DEBUG] drawingData Map:`, tool.drawingData);
        console.log(`[DEBUG] Current scale: ${tool.currentScale}`);
        console.log(`[DEBUG] All drawing containers:`, tool.allDrawingContainers.length);
        return tool.drawingData;
    } else {
        console.error(`[DEBUG] No ScribbleTool found for block ${blockId}`);
        return null;
    }
};