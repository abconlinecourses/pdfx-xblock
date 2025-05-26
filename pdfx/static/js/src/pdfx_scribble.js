/* PDF Viewer XBlock - Scribble Functionality */

/**
 * PDF.js Scribble Tool
 *
 * This module provides drawing capabilities using fabric.js canvas.
 */
class PdfxScribble {
    constructor(block, options) {
        this.block = block;
        this.options = options || {};
        this.blockId = options.blockId;

        // User and course information for saving
        this.userId = options.userId || 'anonymous';
        this.courseId = options.courseId || '';

        // Drawing settings
        this.color = options.color || '#FF0000';
        this.width = options.width || 5;

        // Canvas references
        this.fabricCanvas = null;
        this.canvasContainer = null;

        // State tracking
        this.isEnabled = false;
        this.currentPage = 1;
        this.dirtyPages = {};  // Pages with unsaved changes
        this.allStrokes = {};  // All strokes by page
        this.saveTimeoutId = null;
        this.saveIntervalTime = options.saveIntervalTime || 10000;

        // Handler URL for saving annotations
        this.handlerUrl = options.handlerUrl || '';

        // Find handlerUrl if not provided
        if (!this.handlerUrl) {
            const dataElement = document.getElementById(`pdfx-data-${this.blockId}`);
            if (dataElement) {
                this.handlerUrl = dataElement.dataset.handlerUrl;
            }
        }
    }

    init(fabricCanvas) {
        // Store reference to fabric canvas
        this.fabricCanvas = fabricCanvas;

        // Check if we have a valid fabric canvas
        if (!this.fabricCanvas) {
            return Promise.reject(new Error('No fabric canvas provided'));
        }

        // Validate handler URL
        if (!this.handlerUrl) {
            const dataElement = document.getElementById(`pdfx-data-${this.blockId}`);
            if (dataElement) {
                this.handlerUrl = dataElement.dataset.handlerUrl;
            }
        }

        // Set up drawing brush
        if (!this.fabricCanvas.freeDrawingBrush) {
            this.fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(this.fabricCanvas);
        }

        // Set initial brush properties
        this.fabricCanvas.freeDrawingBrush.width = this.width;
        this.fabricCanvas.freeDrawingBrush.color = this.color;

        // Set up canvas for drawing
        this.fabricCanvas.isDrawingMode = false;
        this.fabricCanvas.selection = false;

        // Get canvas container
        this.canvasContainer = document.querySelector(`#draw-container-${this.blockId} .canvas-container`);

        // Set up event listeners for drawing
        this.fabricCanvas.on('path:created', (e) => this.handlePathCreated(e));

        // Critical fix: Wait for PDF to load by checking if pdf-container is ready
        const attemptResize = () => {
            const pdfContainer = document.getElementById(`pdf-container-${this.blockId}`);
            if (pdfContainer && pdfContainer.offsetWidth > 300 && pdfContainer.offsetHeight > 150) {
                console.debug(`[PdfX Debug] PDF container dimensions detected: ${pdfContainer.offsetWidth}x${pdfContainer.offsetHeight}`);
                // Now fix the canvas size
                this.fixCanvasSizeBeforeLoading();
                this.forceCanvasResize();
            } else {
                console.debug(`[PdfX Debug] PDF container not ready yet, will retry. Current size: ${pdfContainer ? pdfContainer.offsetWidth + 'x' + pdfContainer.offsetHeight : 'container not found'}`);
                setTimeout(attemptResize, 500); // Try again after 500ms
            }
        };

        // Start checking for PDF dimensions
        attemptResize();

        return this.loadExistingStrokes()
            .then((strokes) => {
                // Log the strokes we're loading
                const totalStrokes = Object.values(strokes || {}).reduce((count, pageStrokes) =>
                    count + (Array.isArray(pageStrokes) ? pageStrokes.length : 0), 0);
                console.debug(`[PdfX Debug] Loaded ${totalStrokes} strokes from server`);

                // Fix canvas size again before rendering strokes
                this.fixCanvasSizeBeforeLoading();
                this.forceCanvasResize();
                this.setAllStrokes(strokes || {});

                // Wait a moment then check if our canvas still has the right dimensions
                setTimeout(() => {
                    this.fixCanvasSizeBeforeLoading();
                    this.forceCanvasResize();
                    // Force re-render current page
                    this.renderPage(this.currentPage);
                }, 1000);

                // Start periodic saving
                this.startPeriodicSaving();

                return this;
            })
            .catch((error) => {
                console.error(`[PdfX Debug] Error loading strokes: ${error.message}`);
                // Start periodic saving anyway
                this.startPeriodicSaving();

                return this;
            });
    }

    // Method to properly size the canvas from the beginning
    fixCanvasSizeBeforeLoading() {
        if (!this.fabricCanvas) {
            return false;
        }

        try {
            const pdfContainer = document.getElementById(`pdf-container-${this.blockId}`);
            if (!pdfContainer) {
                console.warn(`[PdfX Debug] PDF container not found for block ${this.blockId}`);
                return false;
            }

            // Get the exact dimensions from the PDF container
            let width = pdfContainer.offsetWidth;
            let height = pdfContainer.offsetHeight;

            // Check if the PDF container has proper dimensions
            if (width <= 0 || height <= 0) {
                console.warn(`[PdfX Debug] PDF container has invalid dimensions ${width}x${height}, trying fallback`);

                // Fallback to viewport dimensions if available
                const viewport = document.querySelector('.pdfViewer .page');
                if (viewport) {
                    width = viewport.offsetWidth || 800; // Reasonable default if needed
                    height = viewport.offsetHeight || 1000; // Reasonable default if needed
                    console.debug(`[PdfX Debug] Using viewport dimensions: ${width}x${height}`);
                } else {
                    console.warn(`[PdfX Debug] Could not find viewport, using default dimensions`);
                    width = Math.max(width, 800); // Use at least 800px if width is invalid
                    height = Math.max(height, 1000); // Use at least 1000px if height is invalid
                }
            }

            console.debug(`[PdfX Debug] Resizing canvas to ${width}x${height}`);

            // Resize the fabric canvas
            this.fabricCanvas.setWidth(width);
            this.fabricCanvas.setHeight(height);

            // Fix the canvas container
            const canvasContainer = this.fabricCanvas.wrapperEl;
            if (canvasContainer) {
                canvasContainer.style.width = width + 'px';
                canvasContainer.style.height = height + 'px';

                // Make sure any inline styling on the container doesn't override our dimensions
                canvasContainer.style.minWidth = width + 'px';
                canvasContainer.style.minHeight = height + 'px';
            }

            // Also fix both lower and upper canvas elements
            ['lowerCanvasEl', 'upperCanvasEl'].forEach(canvasElement => {
                if (this.fabricCanvas[canvasElement]) {
                    const canvas = this.fabricCanvas[canvasElement];
                    canvas.width = width;
                    canvas.height = height;
                    canvas.style.width = width + 'px';
                    canvas.style.height = height + 'px';
                }
            });

            // Fix draw container size
            const drawContainer = document.getElementById(`draw-container-${this.blockId}`);
            if (drawContainer) {
                drawContainer.style.width = width + 'px';
                drawContainer.style.height = height + 'px';
            }

            console.debug(`[PdfX Debug] Canvas resized to ${width}x${height}`);
            return true;
        } catch (error) {
            console.error(`[PdfX Debug] Error resizing canvas: ${error.message}`);
            return false;
        }
    }

    // Handle new path created on canvas
    handlePathCreated(event) {
        if (!event || !event.path) {
            return;
        }

        const path = event.path;

        // Add metadata to the path including the page
        path.set({
            strokeId: `scribble-${this.blockId}-${this.userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            page: this.currentPage,
            userId: this.userId,
            blockId: this.blockId,
            courseId: this.courseId,
            timestamp: new Date().toISOString(),
            pathType: 'marker'
        });

        // Mark this page as having unsaved changes
        this.dirtyPages[this.currentPage] = true;

        // Add to our stroke collection
        if (!this.allStrokes[this.currentPage]) {
            this.allStrokes[this.currentPage] = [];
        }

        // Add the path data in a serialized format
        this.allStrokes[this.currentPage].push(path.toJSON(['strokeId', 'page', 'userId', 'blockId', 'courseId', 'timestamp', 'pathType']));

        // Trigger an immediate save to server
        this.saveStrokesToServer();
    }

    // Enable the scribble tool
    enable() {
        if (this.isEnabled) {
            return;
        }

        // Set canvas to drawing mode
        if (this.fabricCanvas) {
            this.fabricCanvas.isDrawingMode = true;

            // Configure brush
            if (this.fabricCanvas.freeDrawingBrush) {
                this.fabricCanvas.freeDrawingBrush.width = this.width;
                this.fabricCanvas.freeDrawingBrush.color = this.color;
                this.fabricCanvas.freeDrawingBrush.scribbleMode = true;
                this.fabricCanvas.freeDrawingBrush.markerMode = true;
            }

            // Make canvas interactive
            if (this.fabricCanvas.upperCanvasEl) {
                this.fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                this.fabricCanvas.upperCanvasEl.style.cursor = 'crosshair';
            }
        }

        // Enable container
        const drawContainer = document.getElementById(`draw-container-${this.blockId}`);
        if (drawContainer) {
            drawContainer.style.pointerEvents = 'auto';
            drawContainer.classList.add('draw-mode');
            drawContainer.style.cursor = 'crosshair';
            drawContainer.setAttribute('data-current-tool', 'marker');
        }

        this.isEnabled = true;
    }

    // Disable the scribble tool
    disable() {
        if (!this.isEnabled) {
                    return;
                }

        // Turn off drawing mode
        if (this.fabricCanvas) {
            this.fabricCanvas.isDrawingMode = false;

            // Reset brush properties
            if (this.fabricCanvas.freeDrawingBrush) {
                this.fabricCanvas.freeDrawingBrush.scribbleMode = false;
                this.fabricCanvas.freeDrawingBrush.markerMode = false;
            }

            // Disable interaction with canvas
            if (this.fabricCanvas.upperCanvasEl) {
                this.fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
            }
        }

        // Disable container
        const drawContainer = document.getElementById(`draw-container-${this.blockId}`);
        if (drawContainer) {
            drawContainer.style.pointerEvents = 'none';
            drawContainer.classList.remove('draw-mode');
            drawContainer.removeAttribute('data-current-tool');
        }

        this.isEnabled = false;
    }

    // Set the stroke color
    setColor(color) {
        this.color = color;

        if (this.fabricCanvas && this.fabricCanvas.freeDrawingBrush) {
            this.fabricCanvas.freeDrawingBrush.color = color;
        }
    }

    // Set the stroke width
    setWidth(width) {
        this.width = width;

        if (this.fabricCanvas && this.fabricCanvas.freeDrawingBrush) {
            this.fabricCanvas.freeDrawingBrush.width = width;
        }
    }

    // Set the current page
    setCurrentPage(pageNum) {
        console.debug(`[PdfX Debug] Setting current page to ${pageNum}, previous page was ${this.currentPage}`);

        if (this.currentPage === pageNum) {
            console.debug(`[PdfX Debug] Already on page ${pageNum}, no page change needed`);
            return;
        }

        // Save any unsaved changes on the current page before changing
        if (this.dirtyPages[this.currentPage]) {
            console.debug(`[PdfX Debug] Saving unsaved changes before changing page from ${this.currentPage} to ${pageNum}`);
            this.saveStrokesToServer();
        }

        // Store previous page for reference
        const previousPage = this.currentPage;

        // Update current page
        this.currentPage = pageNum;
        console.debug(`[PdfX Debug] Page updated to ${pageNum}, applying canvas fixes`);

        // Apply aggressive canvas dimension fix - call both local and global methods
        this.fixCanvasSizeBeforeLoading();
        if (typeof window.emergencyFixCanvasContainer === 'function') {
            window.emergencyFixCanvasContainer(this.blockId);
        }
        this.forceCanvasResize();

        // IMPORTANT: Clear all objects on the canvas before rendering new page
        // This is critical to prevent strokes from showing on wrong pages
        if (this.fabricCanvas) {
            console.debug(`[PdfX Debug] Clearing canvas before loading strokes for page ${pageNum}`);
            this.fabricCanvas.clear();
        }

        // Clear canvas and load strokes for this page
        console.debug(`[PdfX Debug] Rendering strokes for new page ${pageNum}`);
        this.renderPage(pageNum);

        // Double-check if strokes are visible after rendering
        setTimeout(() => {
            const objects = this.fabricCanvas ? this.fabricCanvas.getObjects() : [];
            const pageStrokes = this.allStrokes[pageNum] || [];

            console.debug(`[PdfX Debug] After page change: Canvas has ${objects.length} objects, expected ${pageStrokes.length} strokes`);

            // If we have strokes in data but none on canvas, force visibility
            if (pageStrokes.length > 0 && objects.length === 0) {
                console.warn(`[PdfX Debug] Page ${pageNum} has ${pageStrokes.length} strokes in data but none on canvas, re-rendering`);
                // Try one more time with different timing
                this.fixCanvasSizeBeforeLoading();
                this.renderPage(pageNum);

                // Force visibility after a delay
                setTimeout(() => {
                    this.forceStrokesVisibility();
                }, 300);
            }
        }, 200);

        // Fire a custom event for page change
        if (typeof CustomEvent === 'function') {
            const event = new CustomEvent('pdfx:pagechanged', {
                detail: {
                    blockId: this.blockId,
                    pageNum: pageNum,
                    previousPage: previousPage,
                    instance: this
                }
            });
            document.dispatchEvent(event);
        }
    }

    // Render strokes for a specific page
    renderPage(pageNum) {
        if (!this.fabricCanvas) {
            return;
        }

        // Force canvas resize before rendering
        this.fixCanvasSizeBeforeLoading();
        this.forceCanvasResize();

        // Clear canvas
        this.fabricCanvas.clear();

        // Load strokes for this page only
        const pageStrokes = this.allStrokes[pageNum] || [];

        if (pageStrokes.length === 0) {
            console.debug(`[PdfX Debug] No strokes to render for page ${pageNum}`);
            return;
        }

        console.debug(`[PdfX Debug] Rendering ${pageStrokes.length} strokes for page ${pageNum}`);

        // Track how many strokes were actually added
        let addedStrokeCount = 0;

        // Add each stroke to the canvas only if it belongs to the current page
        pageStrokes.forEach((strokeData, index) => {
            try {
                // Verify this stroke belongs to the current page
                if (strokeData.page !== undefined) {
                    const strokePage = parseInt(strokeData.page, 10);
                    const currentPage = parseInt(pageNum, 10);

                    if (strokePage !== currentPage) {
                        console.debug(`[PdfX Debug] Skipping stroke for page ${strokePage} when on page ${currentPage}`);
                        return;
                    }
                } else {
                    // Missing page data - assign current page
                    strokeData.page = parseInt(pageNum, 10);
                }

                // Ensure stroke has color properties
                if (!strokeData.stroke) {
                    strokeData.stroke = strokeData.fill || '#FF0000';
                }

                // Ensure stroke has fill if needed
                if (!strokeData.fill) {
                    strokeData.fill = null; // Set to null or transparent if no fill color
                }

                // Force non-transparent stroke
                if (strokeData.stroke === 'transparent' || strokeData.stroke === 'rgba(0,0,0,0)') {
                    strokeData.stroke = '#FF0000'; // Default to red if transparent
                }

                // Ensure stroke width is visible
                if (!strokeData.strokeWidth || strokeData.strokeWidth < 1) {
                    strokeData.strokeWidth = 3;
                }

                // Fix path data format - critical for compatibility with Fabric.js
                const fixedStrokeData = this._fixPathData(strokeData);

                // Add page metadata to ensure it's tied to this page
                fixedStrokeData.page = parseInt(pageNum, 10);

                // Use safer path creation approach
                try {
                    // Try to create a fabric path object
                    const path = new fabric.Path(fixedStrokeData.path, {
                        page: parseInt(pageNum, 10),  // Explicitly set page as integer
                        blockId: this.blockId,
                        userId: this.userId,
                        courseId: this.courseId,
                        selectable: false,
                        stroke: fixedStrokeData.stroke,
                        strokeWidth: fixedStrokeData.strokeWidth,
                        fill: fixedStrokeData.fill,
                        opacity: 1.0
                    });

                    this.fabricCanvas.add(path);
                    addedStrokeCount++;
                } catch (pathError) {
                    console.warn(`[PdfX Debug] Error creating path: ${pathError.message}, trying fallback method`);
                    // Fallback: Try using fromObject if direct creation fails
                    fabric.Path.fromObject(fixedStrokeData, path => {
                        if (path) {
                            // Ensure path has correct styling
                            path.set({
                                page: parseInt(pageNum, 10),  // Explicitly set page as integer
                                blockId: this.blockId,
                                userId: this.userId,
                                courseId: this.courseId,
                                selectable: false,
                                stroke: fixedStrokeData.stroke,
                                strokeWidth: fixedStrokeData.strokeWidth,
                                fill: fixedStrokeData.fill,
                                opacity: 1.0
                            });

                            this.fabricCanvas.add(path);
                            this.fabricCanvas.renderAll();
                            addedStrokeCount++;
                        }
                    });
                }
            } catch (error) {
                console.error(`[PdfX Debug] Error rendering stroke: ${error.message}`);
            }
        });

        console.debug(`[PdfX Debug] Successfully added ${addedStrokeCount} of ${pageStrokes.length} strokes`);

        // If no strokes were added but we have data, try a last resort method
        if (addedStrokeCount === 0 && pageStrokes.length > 0) {
            console.warn(`[PdfX Debug] Failed to add any strokes, trying basic stroke method`);
            this._createBasicStrokesFromData(pageStrokes, pageNum);
        }

        // Force redraw
        this.fabricCanvas.renderAll();
    }

    // Load existing strokes from server
    loadExistingStrokes() {
        if (!this.handlerUrl) {
            console.debug(`[PdfX Debug] No handler URL available for loading strokes, blockId: ${this.blockId}`);
            return Promise.resolve({});
        }

        const getHandlerUrl = this.handlerUrl.replace('save_annotations', 'get_user_highlights');
        console.debug(`[PdfX Debug] Loading strokes from server for blockId: ${this.blockId}, URL: ${getHandlerUrl}`);

        return new Promise((resolve, reject) => {
            $.ajax({
                url: getHandlerUrl,
                type: 'POST',
                data: JSON.stringify({
                    blockId: this.blockId,
                    userId: this.userId,
                    courseId: this.courseId
                }),
                contentType: 'application/json; charset=utf-8',
                dataType: 'json',
                success: (result) => {
                    console.debug(`[PdfX Debug] Server response received for strokes, status: ${result.result}`);

                    if (result.result !== 'success') {
                        console.warn(`[PdfX Debug] Server returned error for strokes: ${JSON.stringify(result)}`);
                        resolve({});
                    } else {
                        // Check if response has expected data
                        if (!result.markerStrokes) {
                            console.warn(`[PdfX Debug] No markerStrokes found in server response, looking for alternatives`);
                            // Try to use any response data if available
                            const fallbackData = result.data || result.strokes || result.annotations || {};
                            const processed = this.processServerStrokes(fallbackData);
                            console.debug(`[PdfX Debug] Used fallback data, found ${Object.keys(processed).length} pages with strokes`);
                            resolve(processed);
                            return;
                        }

                        // Get marker strokes from response
                        const markerStrokes = result.markerStrokes || {};
                        console.debug(`[PdfX Debug] Server returned markerStrokes, raw data: ${JSON.stringify(Object.keys(markerStrokes))}`);

                        // Process and organize the strokes
                        const organizedStrokes = this.processServerStrokes(markerStrokes);
                        console.debug(`[PdfX Debug] Processed server strokes, found ${Object.keys(organizedStrokes).length} pages with strokes`);
                        resolve(organizedStrokes);
                    }
                },
                error: (xhr, status, error) => {
                    console.error(`[PdfX Debug] Error loading strokes: ${error}, status: ${status}`);
                    resolve({});
                }
            });
        });
    }

    // Helper method to process server strokes data
    processServerStrokes(markerStrokes) {
        console.debug(`[PdfX Debug] Processing server strokes data, keys: ${Object.keys(markerStrokes).join(', ')}`);
        const organizedStrokes = {};
        let totalStrokeCount = 0;

        // Iterate through all pages in the marker strokes
        Object.keys(markerStrokes).forEach(pageKey => {
            // Skip metadata fields
            if (pageKey === '_last_saved' || pageKey === 'strokeCount' || pageKey === '_lastSynced') {
                return;
            }

            // Convert page key to number
            const pageNum = parseInt(pageKey, 10);

            // Make sure it's a valid page number
            if (!isNaN(pageNum)) {
                const pageStrokes = markerStrokes[pageKey];
                console.debug(`[PdfX Debug] Processing page ${pageNum}, found ${Array.isArray(pageStrokes) ? pageStrokes.length : 'non-array'} strokes`);

                // Initialize the array for this page if needed
                if (!organizedStrokes[pageNum]) {
                    organizedStrokes[pageNum] = [];
                }

                // Add strokes for this page, ensuring each has the correct page metadata
                if (Array.isArray(pageStrokes)) {
                    pageStrokes.forEach(stroke => {
                        // Make sure each stroke has the correct page number - explicitly convert to number
                        stroke.page = parseInt(pageNum, 10);

                        // Ensure other metadata is present
                        if (!stroke.blockId) stroke.blockId = this.blockId;
                        if (!stroke.userId) stroke.userId = this.userId;
                        if (!stroke.courseId) stroke.courseId = this.courseId;

                        // Ensure stroke color is present and visible
                        if (!stroke.stroke && !stroke.fill) {
                            stroke.stroke = '#FF0000'; // Default red if no color
                        }

                        // Ensure stroke width is present and visible
                        if (!stroke.strokeWidth || stroke.strokeWidth < 1) {
                            stroke.strokeWidth = 3;
                        }

                        // Check if stroke has a path property
                        if (!stroke.path && !stroke.d) {
                            console.warn(`[PdfX Debug] Stroke missing path data, page: ${pageNum}`);
                            // Skip strokes with no path data
                        } else {
                            // If d property exists but not path, convert it
                            if (!stroke.path && stroke.d) {
                                stroke.path = stroke.d;
                            }

                            // Verify stroke page is set correctly
                            if (stroke.page !== parseInt(pageNum, 10)) {
                                console.warn(`[PdfX Debug] Page mismatch for stroke: expected ${pageNum}, got ${stroke.page}, fixing`);
                                stroke.page = parseInt(pageNum, 10);
                            }

                            // Add the stroke to the collection
                            organizedStrokes[pageNum].push(stroke);
                            totalStrokeCount++;
                        }
                    });

                    console.debug(`[PdfX Debug] Added ${organizedStrokes[pageNum].length} strokes for page ${pageNum}`);
                } else if (typeof pageStrokes === 'object') {
                    // Handle case where page strokes might be an object instead of array
                    console.debug(`[PdfX Debug] Page strokes is an object, not array, for page ${pageNum}`);
                    const strokesArray = [];

                    // Try to convert object to array if possible
                    Object.keys(pageStrokes).forEach(key => {
                        if (typeof pageStrokes[key] === 'object') {
                            const stroke = pageStrokes[key];

                            // Ensure page number is set correctly
                            stroke.page = parseInt(pageNum, 10);

                            // Ensure other metadata
                            if (!stroke.blockId) stroke.blockId = this.blockId;
                            if (!stroke.userId) stroke.userId = this.userId;
                            if (!stroke.courseId) stroke.courseId = this.courseId;

                            // Ensure stroke has color
                            if (!stroke.stroke && !stroke.fill) {
                                stroke.stroke = '#FF0000'; // Default red
                            }

                            // Ensure stroke width
                            if (!stroke.strokeWidth || stroke.strokeWidth < 1) {
                                stroke.strokeWidth = 3;
                            }

                            strokesArray.push(stroke);
                            totalStrokeCount++;
                        }
                    });

                    if (strokesArray.length > 0) {
                        organizedStrokes[pageNum] = strokesArray;
                        console.debug(`[PdfX Debug] Converted object to array with ${strokesArray.length} strokes for page ${pageNum}`);
                    }
                }
            }
        });

        console.debug(`[PdfX Debug] Finished processing server strokes, total: ${totalStrokeCount} strokes across ${Object.keys(organizedStrokes).length} pages`);

        // Verify all strokes have the correct page number
        Object.keys(organizedStrokes).forEach(pageNum => {
            if (Array.isArray(organizedStrokes[pageNum])) {
                organizedStrokes[pageNum].forEach(stroke => {
                    // Explicitly ensure stroke.page is an integer matching the page key
                    if (stroke.page !== parseInt(pageNum, 10)) {
                        console.warn(`[PdfX Debug] Fixing stroke with incorrect page: ${stroke.page} → ${pageNum}`);
                        stroke.page = parseInt(pageNum, 10);
                    }
                });
            }
        });

        return organizedStrokes;
    }

    // Force all strokes to be visible
    forceStrokesVisibility(color = '#FF0000', width = 3) {
        if (!this.fabricCanvas) {
            return false;
        }

        // Get all objects on the canvas
        const objects = this.fabricCanvas.getObjects();

        // Update each object's properties
        objects.forEach((obj, index) => {
            if (obj.type === 'path') {
                // Force stroke color and width
                obj.set({
                    stroke: color,
                    strokeWidth: width,
                    opacity: 1.0,
                    selectable: false
                });
            }
        });

        // Redraw canvas
        this.fabricCanvas.renderAll();

        return true;
    }

    // Set all strokes from loaded data
    setAllStrokes(strokes) {
        // Validate input
        if (!strokes || typeof strokes !== 'object') {
            this.allStrokes = {};
            return;
        }

        // Set the strokes
        this.allStrokes = strokes || {};

        // Render current page
        this.renderPage(this.currentPage);

        // If we have strokes but they're not visible, try forcing visibility
        let totalStrokeCount = 0;
        Object.keys(strokes).forEach(pageNum => {
            if (Array.isArray(strokes[pageNum])) {
                totalStrokeCount += strokes[pageNum].length;
            }
        });

        if (totalStrokeCount > 0) {
            // Wait a short time for rendering to complete
            setTimeout(() => {
                const objects = this.fabricCanvas ? this.fabricCanvas.getObjects() : [];
                if (objects.length === 0) {
                    this.forceStrokesVisibility();
                }
            }, 500);
        }
    }

    // Save strokes to server
    saveStrokesToServer() {
        if (!this.handlerUrl) {
            return Promise.resolve(false);
        }

        // Check if we have any dirty pages
        const dirtyPageNumbers = Object.keys(this.dirtyPages);

        if (dirtyPageNumbers.length === 0) {
            return Promise.resolve(false);
        }

        // Prepare data to save - organize strokes by page
        const saveData = {
            markerStrokes: this.allStrokes,
            currentPage: this.currentPage
        };

        // Validate strokes before saving
        // Ensure each stroke is on the correct page
        Object.keys(this.allStrokes).forEach(pageNum => {
            if (Array.isArray(this.allStrokes[pageNum])) {
                this.allStrokes[pageNum].forEach(stroke => {
                    // Make sure the stroke has the correct page number
                    stroke.page = parseInt(pageNum, 10);

                    // Ensure other metadata is present
                    if (!stroke.blockId) stroke.blockId = this.blockId;
                    if (!stroke.userId) stroke.userId = this.userId;
                    if (!stroke.courseId) stroke.courseId = this.courseId;
                });
            }
        });

        // Add timestamp for the server
        saveData.markerStrokes._last_saved = new Date().toISOString();

        // Add stroke count information
        let totalStrokes = 0;
        Object.keys(this.allStrokes).forEach(page => {
            if (Array.isArray(this.allStrokes[page])) {
                totalStrokes += this.allStrokes[page].length;
            }
        });

        saveData.markerStrokes.strokeCount = totalStrokes;

        return new Promise((resolve, reject) => {
            $.ajax({
                url: this.handlerUrl,
                type: 'POST',
                data: JSON.stringify(saveData),
                contentType: 'application/json; charset=utf-8',
                dataType: 'json',
                success: (result) => {
                    if (result.result === 'success') {
                        // Clear dirty flags
                        this.dirtyPages = {};

                        resolve(true);
                    } else {
                        resolve(false);
                    }
                },
                error: (xhr, status, error) => {
                    resolve(false);
                }
            });
        });
    }

    // Start periodic saving
    startPeriodicSaving() {
        if (this.saveTimeoutId) {
            clearInterval(this.saveTimeoutId);
        }

        this.saveTimeoutId = setInterval(() => {
            this.saveStrokesToServer().catch(() => {});
        }, this.saveIntervalTime);
    }

    // Stop periodic saving
    stopPeriodicSaving() {
        if (this.saveTimeoutId) {
            clearInterval(this.saveTimeoutId);
            this.saveTimeoutId = null;
        }
    }

    // Destroy the scribble instance
    destroy() {
        this.stopPeriodicSaving();

        // Save any unsaved changes
        this.saveStrokesToServer().catch(() => {});

        // Remove event listeners
        if (this.fabricCanvas) {
            this.fabricCanvas.off('path:created');
        }
    }

    /**
     * Force resize all canvas elements to match PDF container
     * This is a more aggressive approach to fixing the canvas size issue
     */
    forceCanvasResize() {
        if (!this.fabricCanvas || !this.blockId) {
            return false;
        }

        // Get the PDF container for dimensions
        var pdfContainer = document.getElementById(`pdf-container-${this.blockId}`);
        if (!pdfContainer) {
            return false;
        }

        // Get exact dimensions
        var width = pdfContainer.offsetWidth;
        var height = pdfContainer.offsetHeight;

        try {
            // First resize the fabric canvas
            this.fabricCanvas.setWidth(width);
            this.fabricCanvas.setHeight(height);

            // Fix canvas container (wrapper)
            var canvasContainer = this.fabricCanvas.wrapperEl;
            if (canvasContainer) {
                // Set all available dimension properties
                canvasContainer.style.width = width + 'px';
                canvasContainer.style.height = height + 'px';
                canvasContainer.style.minWidth = width + 'px';
                canvasContainer.style.minHeight = height + 'px';
                canvasContainer.style.maxWidth = width + 'px';
                canvasContainer.style.maxHeight = height + 'px';
                canvasContainer.setAttribute('width', width);
                canvasContainer.setAttribute('height', height);
            }

            // Fix both canvas elements with all possible properties
            ['lowerCanvasEl', 'upperCanvasEl'].forEach(canvasType => {
                if (this.fabricCanvas[canvasType]) {
                    var canvasEl = this.fabricCanvas[canvasType];

                    // Set HTML attributes
                    canvasEl.width = width;
                    canvasEl.height = height;
                    canvasEl.setAttribute('width', width);
                    canvasEl.setAttribute('height', height);

                    // Set CSS properties
                    canvasEl.style.width = width + 'px';
                    canvasEl.style.height = height + 'px';
                    canvasEl.style.minWidth = width + 'px';
                    canvasEl.style.minHeight = height + 'px';
                    canvasEl.style.maxWidth = width + 'px';
                    canvasEl.style.maxHeight = height + 'px';
                }
            });

            // Force a canvas redraw
            this.fabricCanvas.requestRenderAll();
            return true;
        } catch (error) {
            return false;
        }
    }

    // Add this utility function to fix path data
    _fixPathData(strokeData) {
        // Handle potential path data issues
        if (strokeData.path) {
            // If path is a string, try to parse it
            if (typeof strokeData.path === 'string') {
                try {
                    strokeData.path = JSON.parse(strokeData.path);
                } catch (e) {
                    // If parsing fails, try to create a simple path
                    delete strokeData.path;

                    // Create a basic line if we have points
                    if (strokeData.points && Array.isArray(strokeData.points)) {
                        const points = strokeData.points;
                        if (points.length > 1) {
                            let pathData = `M ${points[0].x} ${points[0].y}`;
                            for (let i = 1; i < points.length; i++) {
                                pathData += ` L ${points[i].x} ${points[i].y}`;
                            }
                            strokeData.path = pathData;
                        }
                    } else {
                        // If no points, create a dummy path as placeholder
                        strokeData.path = 'M 10 10 L 50 50';
                    }
                }
            }
        } else if (strokeData.d) {
            // If there's a 'd' property but not a 'path' property, use it
            strokeData.path = strokeData.d;
        } else {
            // If no path data, create a dummy path as placeholder
            strokeData.path = 'M 10 10 L 50 50';
        }
        return strokeData;
    }

    // Add a last resort method to create basic line strokes from data
    _createBasicStrokesFromData(strokes, pageNum) {
        if (!this.fabricCanvas || !strokes || !strokes.length) return;

        console.debug(`[PdfX Debug] Using fallback method to create ${strokes.length} basic strokes for page ${pageNum}`);

        // Ensure pageNum is an integer
        const currentPage = parseInt(pageNum, 10);

        // Filter strokes to only include those for the current page
        const pageStrokes = strokes.filter(stroke => {
            if (stroke.page !== undefined) {
                return parseInt(stroke.page, 10) === currentPage;
            }
            // If no page info, include the stroke but set its page
            stroke.page = currentPage;
            return true;
        });

        console.debug(`[PdfX Debug] Creating ${pageStrokes.length} basic strokes for page ${currentPage} after filtering`);

        let createdCount = 0;
        pageStrokes.forEach((strokeData, index) => {
            try {
                // Try to get some path points if available
                let x1 = 10, y1 = 10, x2 = 100, y2 = 100;

                if (strokeData.points && Array.isArray(strokeData.points) && strokeData.points.length >= 2) {
                    // Use actual points if available
                    x1 = strokeData.points[0].x || 10;
                    y1 = strokeData.points[0].y || 10;
                    x2 = strokeData.points[strokeData.points.length-1].x || 100;
                    y2 = strokeData.points[strokeData.points.length-1].y || 100;
                }

                // Create a very basic line using stroke data color and width
                const line = new fabric.Line([x1, y1, x2, y2], {
                    stroke: strokeData.stroke || '#FF0000',
                    strokeWidth: strokeData.strokeWidth || 3,
                    page: currentPage,  // Explicitly set page number
                    blockId: this.blockId,
                    userId: this.userId,
                    courseId: this.courseId,
                    opacity: 1.0,
                    selectable: false
                });

                this.fabricCanvas.add(line);
                createdCount++;
            } catch (e) {
                console.warn(`[PdfX Debug] Failed to create fallback stroke: ${e.message}`);
            }
        });

        console.debug(`[PdfX Debug] Successfully created ${createdCount} basic strokes for page ${currentPage}`);
        this.fabricCanvas.renderAll();
    }

    // Clear all strokes on the current page
    clearCurrentPage() {
        const currentPage = this.currentPage;
        console.log(`[PDFX Scribble] Clearing all strokes on current page ${currentPage}`);
        return this.clearPage(currentPage);
    }

    // Clear all strokes on a specific page
    clearPage(pageNum) {
        const targetPage = parseInt(pageNum, 10);
        console.log(`[PDFX Scribble] Clearing all strokes on page ${targetPage}`);

        try {
            // 1. Clear from fabric canvas
            if (this.fabricCanvas) {
                const objects = [...this.fabricCanvas.getObjects()];
                let removedCount = 0;

                objects.forEach(obj => {
                    // Remove objects that belong to this page or have no page info
                    if (!obj.page || parseInt(obj.page) === targetPage) {
                        this.fabricCanvas.remove(obj);
                        removedCount++;
                    }
                });

                this.fabricCanvas.renderAll();
                console.log(`[PDFX Scribble] Removed ${removedCount} objects from fabric canvas`);
            }

            // 2. Clear from allStrokes data structure
            if (this.allStrokes && this.allStrokes[targetPage]) {
                const strokeCount = Array.isArray(this.allStrokes[targetPage]) ? this.allStrokes[targetPage].length : 0;
                delete this.allStrokes[targetPage];
                console.log(`[PDFX Scribble] Cleared ${strokeCount} strokes from allStrokes data for page ${targetPage}`);
            }

            // 3. Mark page as dirty for saving
            this.dirtyPages[targetPage] = true;

            // 4. Save changes to server immediately
            this.saveStrokesToServer().then(() => {
                console.log(`[PDFX Scribble] Successfully saved cleared strokes to server for page ${targetPage}`);
            }).catch(error => {
                console.error(`[PDFX Scribble] Error saving cleared strokes to server: ${error.message}`);
            });

            return true;
        } catch (error) {
            console.error(`[PDFX Scribble] Error clearing page ${targetPage}: ${error.message}`);
            return false;
        }
    }

    // Clear all strokes on all pages
    clearAll() {
        console.log(`[PDFX Scribble] Clearing all strokes on all pages`);

        try {
            // 1. Clear fabric canvas completely
            if (this.fabricCanvas) {
                this.fabricCanvas.clear();
                this.fabricCanvas.renderAll();
                console.log(`[PDFX Scribble] Cleared fabric canvas completely`);
            }

            // 2. Clear all strokes data
            this.allStrokes = {};
            console.log(`[PDFX Scribble] Cleared all strokes data`);

            // 3. Mark all pages as dirty
            this.dirtyPages = { all: true };

            // 4. Save changes to server immediately
            this.saveStrokesToServer().then(() => {
                console.log(`[PDFX Scribble] Successfully saved cleared strokes to server for all pages`);
            }).catch(error => {
                console.error(`[PDFX Scribble] Error saving cleared strokes to server: ${error.message}`);
            });

            return true;
        } catch (error) {
            console.error(`[PDFX Scribble] Error clearing all strokes: ${error.message}`);
            return false;
        }
    }
}

// Export for global access
window.PdfxScribble = PdfxScribble;