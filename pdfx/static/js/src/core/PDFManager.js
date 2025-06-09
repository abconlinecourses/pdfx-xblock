/**
 * PDFManager - Handles PDF document loading, rendering, and page navigation
 *
 * Uses PDF.js v5.0.375 for modern PDF handling
 */

import { EventEmitter } from '../utils/EventEmitter.js';

export class PDFManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.blockId = options.blockId;
        this.container = options.container;
        this.pdfUrl = options.pdfUrl;
        this.currentPage = options.currentPage || 1;

        // PDF.js related
        this.pdfDocument = null;
        this.loadingTask = null;

        // Rendering state
        this.scale = 1.0;
        this.rotation = 0;
        this.renderContext = null;

        // Canvas elements
        this.canvas = null;
        this.context = null;
        this.textLayerBuilder = null;

        // State
        this.isLoading = false;
        this.isDocumentLoaded = false;
        this.currentRenderTask = null; // Track current render task to prevent conflicts
        this.isManualZoom = false; // Track if user is using manual zoom vs auto-fit

        // Initialize PDF.js
        this._initializePDFJS();
    }

    /**
     * Initialize PDF.js library
     */
    _initializePDFJS() {
        // Check if PDF.js is available
        if (typeof pdfjsLib === 'undefined') {
            this.emit('error', new Error('PDF.js library not loaded'));
            return;
        }

        // Set worker source to latest version 5.0.375
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs';
        }

        // Configure PDF.js
        pdfjsLib.GlobalWorkerOptions.verbosity = pdfjsLib.VerbosityLevel.WARNINGS;
    }

    /**
     * Load a PDF document
     * @param {string} url - PDF URL
     */
    async loadDocument(url) {
        if (this.isLoading) {
            return;
        }

        if (!url) {
            const error = new Error('No PDF URL provided');
            this.emit('error', error);
            throw error;
        }

        this.isLoading = true;
        this.pdfUrl = url;

        try {
            // Clean up previous document
            if (this.pdfDocument) {
                await this._cleanupDocument();
            }

            // Configure loading parameters for PDF.js 5.0.375
            const loadingParams = {
                url: this._getSafePdfUrl(url),
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/',
                cMapPacked: true,
                enableXfa: true,
                disableAutoFetch: false,
                disableStream: false,
                disableRange: false
            };

            // Start loading
            this.loadingTask = pdfjsLib.getDocument(loadingParams);

            // Handle loading progress
            this.loadingTask.onProgress = (progress) => {
                this.emit('loadProgress', {
                    loaded: progress.loaded,
                    total: progress.total,
                    percent: progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0
                });
            };

            // Wait for document to load
            this.pdfDocument = await this.loadingTask.promise;

            this.isLoading = false;
            this.isDocumentLoaded = true;

            // Set up canvas and rendering context
            this._setupCanvas();

            // Emit document loaded event
            this.emit('documentLoaded', {
                document: this.pdfDocument,
                numPages: this.pdfDocument.numPages,
                title: await this._getDocumentTitle(),
                metadata: await this._getDocumentMetadata()
            });

            // Render the current page
            await this.renderPage(this.currentPage);

            // Hide all possible loading indicators
            const loadingSelectors = [
                '.loading-indicator',
                '.loading-spinner',
                '.loading-text',
                '#loading-indicator',
                '#loading-spinner',
                '#loading-text',
                `#pdf-loading-${this.blockId}`,
                `#loading-${this.blockId}`,
                '[class*="loading"]'
            ];

            loadingSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    element.style.display = 'none';
                    element.style.visibility = 'hidden';
                    element.style.opacity = '0';
                });
            });

            // Force show main PDF content containers
            const mainSelectors = [
                `#pdf-main-${this.blockId}`,
                `#pdf-container-${this.blockId}`,
                '.pdf-main-container',
                '.pdf-container'
            ];

            mainSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    element.style.display = 'block';
                    element.style.visibility = 'visible';
                    element.style.opacity = '1';
                });
            });

            // Hide highlight containers and elements on load to prevent yellow overlay
            const highlightSelectors = [
                `#highlight-container-${this.blockId}`,
                '.highlight-container',
                '.highlight',
                '.highlight-element',
                '[class^="highlight-"]',
                '[id^="highlight-container-"]'
            ];

            highlightSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    element.style.display = 'none';
                    element.style.visibility = 'hidden';
                    element.style.opacity = '0';
                    element.style.backgroundColor = 'transparent';
                    // Remove any existing yellow background
                    element.classList.remove('active');
                });
            });

            // Also hide any highlight layers
            const highlightLayerSelectors = [
                `#highlight-layer-${this.blockId}`,
                '.highlight-layer',
                '[id^="highlight-layer-"]'
            ];

            highlightLayerSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    element.style.backgroundColor = 'transparent';
                    element.style.background = 'none';
                });
            });

            // Show the main PDF container immediately
            const mainContainer = this.container.querySelector(`#pdf-main-${this.blockId}`);
            if (mainContainer) {
                mainContainer.style.display = 'block';

                // Hide loading indicator
                const loadingIndicator = this.container.querySelector(`#pdf-loading-${this.blockId}`);
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
            }

            return this.pdfDocument;

        } catch (error) {
            this.isLoading = false;
            // Don't treat RenderingCancelledException as an error - it's expected when cancelling tasks
            if (error.name === 'RenderingCancelledException') {
                // Don't emit error event for cancelled renders
                throw error; // Re-throw to maintain the cancellation flow
            } else {
                this.emit('error', error);
                throw error;
            }
        }
    }

    /**
     * Get safe PDF URL (handle relative paths, etc.)
     */
    _getSafePdfUrl(url) {
        if (!url) return '';

        // Handle asset URLs (Open edX specific)
        if (url.indexOf('asset-v1') !== -1) {
            if (!(url.indexOf('http://') === 0 || url.indexOf('https://') === 0)) {
                if (url.charAt(0) === '/') {
                    const baseUrl = window.location.protocol + '//' + window.location.host;
                    return baseUrl + url;
                }
            }
            return url;
        }

        // Handle relative URLs
        if (url.charAt(0) === '/') {
            const baseUrl = window.location.protocol + '//' + window.location.host;
            return baseUrl + url;
        }

        // Handle URLs without protocol
        if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
            return 'https://' + url;
        }

        return url;
    }

    /**
     * Set up canvas elements for rendering
     */
    _setupCanvas() {
        // Find or create canvas
        this.canvas = this.container.querySelector(`#pdf-canvas-${this.blockId}`);
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = `pdf-canvas-${this.blockId}`;

            const canvasContainer = this.container.querySelector(`#pdf-container-${this.blockId}`);
            if (canvasContainer) {
                canvasContainer.appendChild(this.canvas);
            }
        }

        this.context = this.canvas.getContext('2d');

        // Add proper CSS for text layer
        this._addTextLayerCSS();
    }

    /**
     * Render a specific page
     * @param {number} pageNum - Page number (1-based)
     */
    async renderPage(pageNum) {
        if (!this.pdfDocument) {
            throw new Error('No PDF document loaded');
        }

        if (pageNum < 1 || pageNum > this.pdfDocument.numPages) {
            throw new Error(`Page number ${pageNum} out of range`);
        }

        try {
            // Get the page
            const page = await this.pdfDocument.getPage(pageNum);

            // Ensure proper container sizing before calculating scale
            const container = this.container.querySelector(`#pdf-container-${this.blockId}`);
            const viewerArea = this.container.querySelector('.pdf-viewer-area');

            // Force container to have proper dimensions
            if (container && viewerArea) {
                const viewerWidth = viewerArea.offsetWidth || viewerArea.clientWidth || 800;
                const viewerHeight = viewerArea.offsetHeight || viewerArea.clientHeight || 600;

                // Ensure container has proper width for fit-width calculation
                if (container.offsetWidth < 200) {
                    container.style.width = Math.max(viewerWidth - 40, 600) + 'px';
                }
            }

            // Only calculate optimal scale if we're not in manual zoom mode
            if (!this.isManualZoom) {
                this._calculateOptimalScale(page, 'fit-width');
            }

            // Emit scale change event so UI can update zoom info
            this.emit('scaleChanged', {
                scale: this.scale,
                mode: 'fit-width',
                percentage: Math.round(this.scale * 100)
            });

            // Get viewport
            const viewport = page.getViewport({
                scale: this.scale,
                rotation: this.rotation
            });

            // Set canvas dimensions
            this.canvas.width = viewport.width;
            this.canvas.height = viewport.height;
            this.canvas.style.width = viewport.width + 'px';
            this.canvas.style.height = viewport.height + 'px';

            // Clear canvas
            this.context.clearRect(0, 0, viewport.width, viewport.height);

            // Cancel any previous rendering task to prevent conflicts
            if (this.currentRenderTask) {
                try {
                    await this.currentRenderTask.cancel();
                } catch (e) {
                    // Previous render task already completed
                }
            }

            // Render the page
            const renderContext = {
                canvasContext: this.context,
                viewport: viewport,
                enableWebGL: false,
                renderInteractiveForms: true
            };

            this.currentRenderTask = page.render(renderContext);
            await this.currentRenderTask.promise;
            this.currentRenderTask = null; // Clear the reference

            // Set up and render text layer using proper PDF.js approach
            await this._setupAndRenderTextLayer(page, viewport);

            // Update current page
            this.currentPage = pageNum;

            // Always show the main container after successful page render
            setTimeout(() => {
                const mainContainer = this.container.querySelector(`#pdf-main-${this.blockId}`);
                const loadingIndicator = this.container.querySelector(`#pdf-loading-${this.blockId}`);

                if (mainContainer && mainContainer.style.display === 'none') {
                    mainContainer.style.display = 'block';
                }

                if (loadingIndicator && loadingIndicator.style.display !== 'none') {
                    loadingIndicator.style.display = 'none';
                }
            }, 100);

            // Emit page rendered event
            this.emit('pageRendered', {
                pageNum: pageNum,
                viewport: viewport,
                canvas: this.canvas,
                textLayer: this.textLayerBuilder?.div
            });

            // Emit page changed event
            this.emit('pageChanged', {
                pageNum: pageNum,
                totalPages: this.pdfDocument.numPages,
                viewport: viewport
            });

        } catch (error) {
            // Don't treat RenderingCancelledException as an error - it's expected when cancelling tasks
            if (error.name === 'RenderingCancelledException') {
                // Don't emit error event for cancelled renders
                throw error; // Re-throw to maintain the cancellation flow
            } else {
                this.emit('error', error);
                throw error;
            }
        }
    }

    /**
     * Set up and render text layer using proper PDF.js TextLayer
     */
    async _setupAndRenderTextLayer(page, viewport) {
        try {
            console.log(`[TextLayer-${this.blockId}] Starting text layer setup`);

            // Clean up previous text layer
            if (this.textLayerBuilder) {
                this.textLayerBuilder.cancel();
                if (this.textLayerBuilder.div && this.textLayerBuilder.div.parentNode) {
                    this.textLayerBuilder.div.parentNode.removeChild(this.textLayerBuilder.div);
                }
                this.textLayerBuilder = null;
            }

            // Use existing text layer div from HTML template instead of creating new one
            const existingTextLayer = this.container.querySelector(`#text-layer-${this.blockId}`);
            if (existingTextLayer) {
                console.log(`[TextLayer-${this.blockId}] Using existing text layer div from HTML template`);

                // Create text layer builder using the existing div
                this.textLayerBuilder = this._createTextLayerBuilderWithDiv(page, existingTextLayer);
            } else {
                console.log(`[TextLayer-${this.blockId}] No existing text layer found, creating new one`);

                // Fallback: create new text layer builder
                this.textLayerBuilder = this._createTextLayerBuilder(page);

                // Insert text layer div after canvas
                const canvasContainer = this.container.querySelector(`#pdf-container-${this.blockId}`);
                if (canvasContainer && this.textLayerBuilder.div) {
                    this.textLayerBuilder.div.id = `text-layer-${this.blockId}`;
                    canvasContainer.appendChild(this.textLayerBuilder.div);
                }
            }

            console.log(`[TextLayer-${this.blockId}] Text layer div ready for rendering`);

            // Render the text layer
            console.log(`[TextLayer-${this.blockId}] Starting text layer render with viewport:`, {
                width: viewport.width,
                height: viewport.height,
                scale: viewport.scale
            });

            await this.textLayerBuilder.render({
                        viewport: viewport,
                textContentParams: {
                    includeMarkedContent: true,
                    disableNormalization: true
                }
            });

            console.log(`[TextLayer-${this.blockId}] Text layer render completed. Elements in div:`, this.textLayerBuilder.div.children.length);

            // Fix incorrect scaling transforms applied by PDF.js 5.x (same fix as in index.html)
            const renderedTextSpans = this.textLayerBuilder.div.querySelectorAll('span');
            console.log(`[TextLayer-${this.blockId}] Fixing transform scaling for ${renderedTextSpans.length} text spans`);

            renderedTextSpans.forEach(span => {
                const style = span.style;
                if (style.transform) {
                    // Only fix the problematic very small scale values, preserve everything else
                    let transform = style.transform;

                    // Fix scale values that are unreasonably small (like 0.0909091)
                    transform = transform.replace(/scale\(([\d\.]+)\)/g, (match, value) => {
                        const scaleValue = parseFloat(value);
                        if (scaleValue < 0.5) {
                            return `scale(1)`; // Replace tiny scales with 1
                        }
                        return match; // Keep reasonable scales
                    });

                    style.transform = transform;
                }
            });

            console.log(`[TextLayer-${this.blockId}] Transform scaling fixes applied`);

        } catch (error) {
            console.error(`[TextLayer-${this.blockId}] Error setting up text layer:`, error);
        }
    }

        /**
     * Create text layer builder following PDF.js pattern
     */
    _createTextLayerBuilder(page) {
        return new TextLayerBuilder({
            pdfPage: page,
            highlighter: null, // We'll add highlighting support later
            accessibilityManager: null,
            enablePermissions: false,
            onAppend: (textLayerDiv) => {
                // Text layer has been appended to DOM
                textLayerDiv.style.position = 'absolute';
                textLayerDiv.style.top = '0';
                textLayerDiv.style.left = '0';
                textLayerDiv.style.zIndex = '3';
                textLayerDiv.style.pointerEvents = 'none';
            }
        });
    }

    /**
     * Create text layer builder using existing div from HTML template
     */
    _createTextLayerBuilderWithDiv(page, existingDiv) {
        return new TextLayerBuilder({
            pdfPage: page,
            highlighter: null,
            accessibilityManager: null,
            enablePermissions: false,
            existingDiv: existingDiv, // Pass the existing div
            onAppend: (textLayerDiv) => {
                // Text layer div already exists in DOM, just style it
                textLayerDiv.style.position = 'absolute';
                textLayerDiv.style.top = '0';
                textLayerDiv.style.left = '0';
                textLayerDiv.style.zIndex = '3';
                textLayerDiv.style.pointerEvents = 'none';
            }
        });
    }

    /**
     * Add CSS for text layer following PDF.js pattern
     */
    _addTextLayerCSS() {
        const styleId = `text-layer-styles-${this.blockId}`;

        // Remove existing style if present
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }

        // Create new style element with PDF.js text layer CSS
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* PDF.js Text Layer Styles for ${this.blockId} */
            #text-layer-${this.blockId} {
                position: absolute !important;
                text-align: initial;
                inset: 0;
                overflow: clip;
                opacity: 1;
                line-height: 1;
                text-size-adjust: none;
                forced-color-adjust: none;
                transform-origin: 0 0;
                caret-color: CanvasText;
                z-index: 3;
            }

            #text-layer-${this.blockId}.highlighting {
                touch-action: none;
            }

            #text-layer-${this.blockId} :is(span, br) {
                color: transparent;
                position: absolute;
                white-space: pre;
                cursor: text;
                transform-origin: 0% 0%;
            }

            #text-layer-${this.blockId} > :not(.markedContent),
            #text-layer-${this.blockId} .markedContent span:not(.markedContent) {
                z-index: 1;
            }

            #text-layer-${this.blockId} span.markedContent {
                top: 0;
                height: 0;
            }

            #text-layer-${this.blockId} span[role="img"] {
                user-select: none;
                cursor: default;
            }

            #text-layer-${this.blockId} ::selection {
                background: rgba(0 0 255 / 0.25);
            }

            #text-layer-${this.blockId} br::selection {
                background: transparent;
            }

            #text-layer-${this.blockId} .endOfContent {
                display: block;
                position: absolute;
                inset: 100% 0 0;
                z-index: 0;
                cursor: default;
                user-select: none;
            }

            #text-layer-${this.blockId}.selecting .endOfContent {
                top: 0;
            }

            /* Highlight tool support */
            #text-layer-${this.blockId}.highlight-tool-active {
                pointer-events: auto !important;
                z-index: 100 !important;
            }

            #text-layer-${this.blockId}.highlight-tool-active :is(span, br) {
                cursor: text !important;
                user-select: text !important;
            }

            #text-layer-${this.blockId}.highlight-tool-active :is(span, br):hover {
                background-color: rgba(255, 255, 0, 0.25) !important;
                border-radius: 2px !important;
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Enable text selection for highlighting
     */
    enableTextSelection() {
        if (this.textLayerBuilder && this.textLayerBuilder.div) {
            this.textLayerBuilder.div.classList.add('highlight-tool-active');
            this.textLayerBuilder.div.style.pointerEvents = 'auto';
        }
    }

    /**
     * Disable text selection
     */
    disableTextSelection() {
        if (this.textLayerBuilder && this.textLayerBuilder.div) {
            this.textLayerBuilder.div.classList.remove('highlight-tool-active');
            this.textLayerBuilder.div.style.pointerEvents = 'none';
        }
    }

    /**
     * Calculate optimal scale based on container size
     */
    _calculateOptimalScale(page, mode = 'fit') {
        const container = this.container.querySelector(`#pdf-container-${this.blockId}`);
        if (!container) {
            this.scale = 1.0;
            return;
        }

        // Check if we're in fullscreen mode
        const pdfBlock = this.container.closest('.pdfx_block');
        const isFullscreen = pdfBlock && (pdfBlock.classList.contains('fullscreen') || document.fullscreenElement);

        // Get container dimensions with fallback
        let containerWidth = container.offsetWidth || container.clientWidth;
        let containerHeight = container.offsetHeight || container.clientHeight;

        // If container dimensions are still not available, get from parent
        if (!containerWidth || !containerHeight) {
            const viewerArea = this.container.querySelector('.pdf-viewer-area');
            if (viewerArea) {
                containerWidth = viewerArea.offsetWidth || viewerArea.clientWidth || 800;
                containerHeight = viewerArea.offsetHeight || viewerArea.clientHeight || 600;
            } else {
                containerWidth = 800;
                containerHeight = 600;
            }
        }

        // In fullscreen mode, use more of the available space
        if (isFullscreen) {
            containerWidth = Math.max(containerWidth, window.innerWidth - 40);
            containerHeight = Math.max(containerHeight, window.innerHeight - 120);
        }

        const viewport = page.getViewport({ scale: 1.0 });
        const pageWidth = viewport.width;
        const pageHeight = viewport.height;

        if (mode === 'fit-width') {
            // Calculate scale to fit width with some padding
            const widthScale = (containerWidth - 40) / pageWidth;
            this.scale = Math.min(widthScale, 3.0); // Cap at 3x zoom for fit-width
            this.scale = Math.max(this.scale, 0.5); // Minimum 0.5x zoom

            // Add fit-width class to container
            container.classList.add('fit-width');
        } else if (mode === 'fit') {
            // For 'fit' mode, prioritize fitting width but ensure it doesn't exceed reasonable height
            const widthScale = (containerWidth - 40) / pageWidth;
            const heightScale = (containerHeight - 40) / pageHeight;

            // Use width scale as primary, but limit if it would make the page too tall
            this.scale = widthScale;

            // Only constrain by height if the page would be significantly taller than container
            const scaledHeight = pageHeight * this.scale;
            if (scaledHeight > containerHeight * 1.5) {
                // If scaled height is more than 1.5x container height, use height scale instead
                this.scale = heightScale;
            }

            // Apply reasonable limits
            this.scale = Math.min(this.scale, 2.0); // Cap at 2x zoom
            this.scale = Math.max(this.scale, 0.3); // Minimum 0.3x zoom

            // Remove fit-width class from container
            container.classList.remove('fit-width');
        }
    }

    /**
     * Navigate to a specific page
     */
    async navigateToPage(pageNum) {
        if (!this.pdfDocument) {
            throw new Error('No PDF document loaded');
        }

        if (pageNum === this.currentPage) {
            return;
        }

        await this.renderPage(pageNum);
    }

    /**
     * Navigate to next page
     */
    async nextPage() {
        if (this.currentPage < this.getTotalPages()) {
            await this.navigateToPage(this.currentPage + 1);
        }
    }

    /**
     * Navigate to previous page
     */
    async previousPage() {
        if (this.currentPage > 1) {
            await this.navigateToPage(this.currentPage - 1);
        }
    }

    /**
     * Set zoom level
     */
    async setZoom(scale) {
        if (!this.pdfDocument) {
            return;
        }

        const page = await this.pdfDocument.getPage(this.currentPage);
        const oldScale = this.scale;

        if (typeof scale === 'string') {
            if (scale === 'fit') {
                this.isManualZoom = false; // Reset to auto-fit mode
                this._calculateOptimalScale(page, 'fit');
            } else if (scale === 'fit-width') {
                this.isManualZoom = false; // Reset to auto-fit mode
                this._calculateOptimalScale(page, 'fit-width');
            } else if (scale === 'in') {
                // Zoom in by 25%
                this.scale = Math.min(5.0, this.scale * 1.25);
                this.isManualZoom = true; // Mark as manual zoom
                // Remove fit-width class when using manual zoom
                const container = this.container.querySelector(`#pdf-container-${this.blockId}`);
                if (container) {
                    container.classList.remove('fit-width');
                }
            } else if (scale === 'out') {
                // Zoom out by 20%
                this.scale = Math.max(0.1, this.scale * 0.8);
                this.isManualZoom = true; // Mark as manual zoom
                // Remove fit-width class when using manual zoom
                const container = this.container.querySelector(`#pdf-container-${this.blockId}`);
                if (container) {
                    container.classList.remove('fit-width');
                }
            }
        } else {
            this.scale = Math.max(0.1, Math.min(5.0, scale));
            this.isManualZoom = true; // Mark as manual zoom
            // Remove fit-width class when using manual zoom
            const container = this.container.querySelector(`#pdf-container-${this.blockId}`);
            if (container) {
                container.classList.remove('fit-width');
            }
        }

        await this.renderPage(this.currentPage);

        // Emit scale change event so UI can update
        this.emit('scaleChanged', {
            scale: this.scale,
            mode: typeof scale === 'string' ? scale : 'manual',
            percentage: Math.round(this.scale * 100)
        });
    }

    /**
     * Get current page number
     */
    getCurrentPage() {
        return this.currentPage;
    }

    /**
     * Get total number of pages
     */
    getTotalPages() {
        return this.pdfDocument ? this.pdfDocument.numPages : 0;
    }

    /**
     * Check if document is loaded
     */
    isDocumentLoaded() {
        return this.isDocumentLoaded;
    }

    /**
     * Get document title
     */
    async _getDocumentTitle() {
        if (!this.pdfDocument) return '';

        try {
            const metadata = await this.pdfDocument.getMetadata();
            return metadata.info.Title || '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Get document metadata
     */
    async _getDocumentMetadata() {
        if (!this.pdfDocument) return {};

        try {
            const metadata = await this.pdfDocument.getMetadata();
            return metadata.info || {};
        } catch (error) {
            return {};
        }
    }

    /**
     * Clean up document resources
     */
    async _cleanupDocument() {
        if (this.loadingTask) {
            await this.loadingTask.destroy();
            this.loadingTask = null;
        }

        if (this.pdfDocument) {
            await this.pdfDocument.destroy();
            this.pdfDocument = null;
        }

        this.isDocumentLoaded = false;
    }

    /**
     * Destroy the PDF manager
     */
    async destroy() {
        // Cancel any ongoing render task
        if (this.currentRenderTask) {
            try {
                await this.currentRenderTask.cancel();
            } catch (e) {
                // Render task already completed during destroy
            }
            this.currentRenderTask = null;
        }

        // Clean up text layer
        if (this.textLayerBuilder) {
            this.textLayerBuilder.cancel();
            if (this.textLayerBuilder.div && this.textLayerBuilder.div.parentNode) {
                this.textLayerBuilder.div.parentNode.removeChild(this.textLayerBuilder.div);
            }
            this.textLayerBuilder = null;
        }

        await this._cleanupDocument();

        // Clean up dynamic CSS
        const styleId = `text-layer-styles-${this.blockId}`;
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }

        // Clear canvas
        if (this.context) {
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Remove all event listeners
        this.removeAllListeners();

        // Clear references
        this.canvas = null;
        this.context = null;
        this.container = null;
    }
}

/**
 * TextLayerBuilder class implementation following PDF.js pattern
 */
class TextLayerBuilder {
    constructor(options) {
        this.pdfPage = options.pdfPage;
        this.highlighter = options.highlighter || null;
        this.accessibilityManager = options.accessibilityManager || null;
        this.enablePermissions = options.enablePermissions === true;
        this.onAppend = options.onAppend || null;

        // Use existing div if provided, otherwise create new one
        if (options.existingDiv) {
            this.div = options.existingDiv;
            this.div.innerHTML = ''; // Clear any existing content
            console.log(`[TextLayerBuilder] Using existing div:`, this.div.id);
        } else {
            this.div = document.createElement('div');
            this.div.tabIndex = 0;
            this.div.className = 'textLayer';
            console.log(`[TextLayerBuilder] Created new div`);
        }

        // Ensure proper class
        if (!this.div.classList.contains('textLayer')) {
            this.div.classList.add('textLayer');
        }

        this.renderingDone = false;
        this.textLayer = null;

        console.log(`[TextLayerBuilder] Constructor called, PDF.js TextLayer available:`, typeof pdfjsLib.TextLayer !== 'undefined');
    }

    async render({ viewport, textContentParams = null }) {
        console.log(`[TextLayerBuilder] Render called with params:`, { viewport: !!viewport, textContentParams });

        if (this.renderingDone && this.textLayer) {
            console.log(`[TextLayerBuilder] Updating existing text layer`);
            this.textLayer.update({
                viewport,
                onBefore: this.hide.bind(this)
            });
            this.show();
            return;
        }

        this.cancel();

        // Check if PDF.js TextLayer is available
        console.log(`[TextLayerBuilder] PDF.js TextLayer available:`, typeof pdfjsLib.TextLayer !== 'undefined');
        console.log(`[TextLayerBuilder] PDF.js object:`, typeof pdfjsLib, Object.keys(pdfjsLib || {}));

        // Use PDF.js TextLayer if available
        if (typeof pdfjsLib.TextLayer !== 'undefined') {
            console.log(`[TextLayerBuilder] Creating PDF.js TextLayer`);

            // Get text content first to check if there's any text
            try {
                const textContent = await this.pdfPage.getTextContent(textContentParams || {
                    includeMarkedContent: true,
                    disableNormalization: true
                });

                if (textContent.items.length === 0) {
                    console.warn(`[TextLayerBuilder] No text items found in PDF page`);
                    return;
                }
            } catch (textError) {
                console.error(`[TextLayerBuilder] Error getting text content:`, textError);
                return;
            }

            this.textLayer = new pdfjsLib.TextLayer({
                textContentSource: this.pdfPage.streamTextContent(
                    textContentParams || {
                        includeMarkedContent: true,
                        disableNormalization: true
                    }
                ),
                container: this.div,
                viewport
            });

            console.log(`[TextLayerBuilder] PDF.js TextLayer created, starting render`);
            await this.textLayer.render();
                        console.log(`[TextLayerBuilder] PDF.js TextLayer render completed`);

            this.renderingDone = true;

            const endOfContent = document.createElement('div');
            endOfContent.className = 'endOfContent';
            this.div.append(endOfContent);

            this._bindMouse(endOfContent);
            this.onAppend?.(this.div);

            console.log(`[TextLayerBuilder] Final text layer div children:`, this.div.children.length);

            // Debug: Check text element positioning and styles
            const textSpans = this.div.querySelectorAll('span');
            console.log(`[TextLayerBuilder] Text spans found:`, textSpans.length);

            if (textSpans.length > 0) {
                const firstFew = Array.from(textSpans).slice(0, 3);
                console.log(`[TextLayerBuilder] First 3 text spans details:`);
                firstFew.forEach((span, index) => {
                    const rect = span.getBoundingClientRect();
                    const computedStyle = getComputedStyle(span);
                });

                // Check text layer container positioning
                const containerRect = this.div.getBoundingClientRect();
                const containerStyle = getComputedStyle(this.div);
                console.log(`[TextLayerBuilder] Text layer container position:`, {
                    boundingRect: {
                        top: containerRect.top,
                        left: containerRect.left,
                        width: containerRect.width,
                        height: containerRect.height,
                        right: containerRect.right,
                        bottom: containerRect.bottom
                    },
                    inlineStyle: {
                        position: this.div.style.position,
                        top: this.div.style.top,
                        left: this.div.style.left,
                        width: this.div.style.width,
                        height: this.div.style.height,
                        zIndex: this.div.style.zIndex
                    },
                    computedStyle: {
                        position: containerStyle.position,
                        top: containerStyle.top,
                        left: containerStyle.left,
                        width: containerStyle.width,
                        height: containerStyle.height,
                        zIndex: containerStyle.zIndex,
                        visibility: containerStyle.visibility,
                        display: containerStyle.display
                    }
                });

                // Check parent container for reference
                const parentContainer = this.div.parentElement;
                if (parentContainer) {
                    const parentRect = parentContainer.getBoundingClientRect();
                }

                                // Debug: Check if any spans have valid positioning
                let visibleSpans = 0;
                let positionedSpans = 0;
                textSpans.forEach(span => {
                    const rect = span.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        positionedSpans++;
                        if (rect.top >= 0 && rect.left >= 0 && rect.top < window.innerHeight && rect.left < window.innerWidth) {
                            visibleSpans++;
                        }
                    }
                });
                console.log(`[TextLayerBuilder] Spans analysis: total=${textSpans.length}, positioned=${positionedSpans}, visible=${visibleSpans}`);

                // Force visibility and check actual positions
                console.log(`[TextLayerBuilder] Making ALL text visible for debugging (red on yellow)`);

                // First, ensure the text layer container is properly positioned and sized
                this.div.style.position = 'absolute';
                this.div.style.top = '0px';
                this.div.style.left = '0px';
                this.div.style.width = viewport.width + 'px';
                this.div.style.height = viewport.height + 'px';
                this.div.style.zIndex = '999';
                this.div.style.pointerEvents = 'none';
                this.div.style.border = '2px solid blue'; // Debug border
                this.div.style.overflow = 'visible';

                console.log(`[TextLayerBuilder] Set container dimensions to: ${viewport.width}x${viewport.height}`);

                textSpans.forEach((span, index) => {
                    // Make text visible
                    span.style.color = 'red !important';
                    span.style.backgroundColor = 'yellow !important';
                    span.style.opacity = '1 !important';
                    span.style.zIndex = '1000';
                    span.style.visibility = 'visible !important';
                    span.style.display = 'block !important';


                });

              ;

                setTimeout(() => {
                    textSpans.forEach(span => {
                        span.style.color = 'transparent';
                        span.style.backgroundColor = 'transparent';
                        span.style.opacity = '1';
                        span.style.zIndex = '';
                    });
                    this.div.style.border = '';
                    console.log(`[TextLayerBuilder] Text visibility reset to transparent`);
                }, 8000);
            }
        } else {
            console.error(`[TextLayerBuilder] PDF.js TextLayer not available - falling back to basic text content`);
            // Fallback: create basic text spans
            await this._createBasicTextLayer(viewport, textContentParams);
        }
    }

    async _createBasicTextLayer(viewport, textContentParams) {
        try {
            console.log(`[TextLayerBuilder] Creating basic text layer fallback`);
            const textContent = await this.pdfPage.getTextContent(textContentParams || {});

            console.log(`[TextLayerBuilder] Basic fallback - text items:`, textContent.items.length);

            for (let i = 0; i < Math.min(textContent.items.length, 10); i++) {
                const item = textContent.items[i];
                if (item.str && item.str.trim()) {
                    const span = document.createElement('span');
                    span.textContent = item.str;
                    span.style.position = 'absolute';
                    span.style.color = 'transparent';
                    span.style.left = '10px';
                    span.style.top = (20 + i * 15) + 'px';
                    this.div.appendChild(span);
                }
            }

            console.log(`[TextLayerBuilder] Basic fallback completed with ${this.div.children.length} elements`);
        } catch (error) {
            console.error(`[TextLayerBuilder] Error in basic text layer fallback:`, error);
        }
    }

    hide() {
        if (!this.div.hidden && this.renderingDone) {
            this.div.hidden = true;
        }
    }

    show() {
        if (this.div.hidden && this.renderingDone) {
            this.div.hidden = false;
        }
    }

    cancel() {
        this.textLayer?.cancel();
        this.textLayer = null;
    }

    _bindMouse(end) {
        const { div } = this;

        div.addEventListener('mousedown', () => {
            div.classList.add('selecting');
        });

        div.addEventListener('copy', event => {
            if (!this.enablePermissions) {
                const selection = document.getSelection();
                event.clipboardData.setData(
                    'text/plain',
                    selection.toString()
                );
            }
            event.stopPropagation();
            event.preventDefault();
        });
    }
}

export default PDFManager;