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
        this.textLayer = null;

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
            console.error('[PDFManager] PDF.js library not loaded');
            this.emit('error', new Error('PDF.js library not loaded'));
            return;
        }

        // Set worker source to latest version 5.0.375
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs';
            console.debug('[PDFManager] Set PDF.js worker source to v5.0.375');
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
            console.warn('[PDFManager] Already loading a document');
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
            console.debug(`[PDFManager] Loading PDF from: ${url}`);

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

            console.debug(`[PDFManager] PDF loaded successfully. Pages: ${this.pdfDocument.numPages}`);

            // Set up canvas and rendering context
            this._setupCanvas();

            // Emit document loaded event
            this.emit('documentLoaded', {
                document: this.pdfDocument,
                numPages: this.pdfDocument.numPages,
                title: await this._getDocumentTitle(),
                metadata: await this._getDocumentMetadata()
            });

            console.debug('[PDFManager] documentLoaded event emitted, rendering current page...');
            // Render the current page
            await this.renderPage(this.currentPage);

            // BULLETPROOF FIX: Force hide loading indicators and show main content
            console.debug('[PDFManager] 🔥 BULLETPROOF FIX: Force hiding all loading indicators...');

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
                    console.debug(`[PDFManager] ✅ Hidden loading element: ${element.className || element.id}`);
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
                    console.debug(`[PDFManager] ✅ Shown main element: ${element.className || element.id}`);
                });
            });

            // BULLETPROOF FIX: Hide highlight containers and elements on load to prevent yellow overlay
            console.debug('[PDFManager] 🔥 BULLETPROOF FIX: Hiding highlight containers to prevent yellow overlay...');

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
                    console.debug(`[PDFManager] ✅ Hidden highlight element: ${element.className || element.id}`);
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
                    console.debug(`[PDFManager] ✅ Made highlight layer transparent: ${element.className || element.id}`);
                });
            });

            // DIRECT FIX: Show the main PDF container immediately
            console.debug('[PDFManager] Directly showing main PDF container...');
            const mainContainer = document.querySelector(`#pdf-main-${this.blockId}`);
            if (mainContainer) {
                mainContainer.style.display = 'block';
                console.debug('[PDFManager] Main PDF container shown directly');

                // Hide loading indicator
                const loadingIndicator = document.querySelector(`#pdf-loading-${this.blockId}`);
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                    console.debug('[PDFManager] Loading indicator hidden');
                }
            } else {
                console.warn('[PDFManager] Main PDF container not found for direct show');
            }

            console.debug('[PDFManager] loadDocument method completed successfully');
            return this.pdfDocument;

        } catch (error) {
            this.isLoading = false;
            // Don't treat RenderingCancelledException as an error - it's expected when cancelling tasks
            if (error.name === 'RenderingCancelledException') {
                console.debug('[PDFManager] PDF loading render task cancelled (expected behavior)');
                // Don't emit error event for cancelled renders
                throw error; // Re-throw to maintain the cancellation flow
            } else {
                console.error('[PDFManager] Error loading PDF:', error);
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

        // Set up text layer container
        let textLayerContainer = this.container.querySelector(`#text-layer-${this.blockId}`);
        if (!textLayerContainer) {
            textLayerContainer = document.createElement('div');
            textLayerContainer.id = `text-layer-${this.blockId}`;
            textLayerContainer.className = 'textLayer';

            const canvasContainer = this.container.querySelector(`#pdf-container-${this.blockId}`);
            if (canvasContainer) {
                canvasContainer.appendChild(textLayerContainer);
            }
        }

        this.textLayer = textLayerContainer;
    }

    /**
     * Render a specific page
     * @param {number} pageNum - Page number (1-based)
     */
    async renderPage(pageNum) {
        console.debug('🔥 [TEST] PDFManager.renderPage called - MY CODE IS LOADED!');

        if (!this.pdfDocument) {
            throw new Error('No PDF document loaded');
        }

        if (pageNum < 1 || pageNum > this.pdfDocument.numPages) {
            throw new Error(`Page number ${pageNum} out of range`);
        }

        try {
            console.debug(`[PDFManager] Rendering page ${pageNum}`);

            // Get the page
            const page = await this.pdfDocument.getPage(pageNum);

            // BULLETPROOF FIX: Ensure proper container sizing before calculating scale
            const container = this.container.querySelector(`#pdf-container-${this.blockId}`);
            const viewerArea = this.container.querySelector('.pdf-viewer-area');

            // Force container to have proper dimensions
            if (container && viewerArea) {
                const viewerWidth = viewerArea.offsetWidth || viewerArea.clientWidth || 800;
                const viewerHeight = viewerArea.offsetHeight || viewerArea.clientHeight || 600;

                console.debug(`[PDFManager] 🔧 Container sizing - Viewer: ${viewerWidth}x${viewerHeight}, Container: ${container.offsetWidth}x${container.offsetHeight}`);

                // Ensure container has proper width for fit-width calculation
                if (container.offsetWidth < 200) {
                    container.style.width = Math.max(viewerWidth - 40, 600) + 'px';
                    console.debug(`[PDFManager] 🔧 Fixed container width to: ${container.style.width}`);
                }
            }

                                    // Only calculate optimal scale if we're not in manual zoom mode
            if (!this.isManualZoom) {
                console.debug(`[PDFManager] Auto-fit mode, recalculating with fit-width`);
                this._calculateOptimalScale(page, 'fit-width');
                console.debug(`[PDFManager] 🔧 Calculated scale: ${this.scale} for fit-width mode`);
            } else {
                console.debug(`[PDFManager] Manual zoom mode, keeping existing scale: ${this.scale}`);
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

            console.debug(`[PDFManager] 🔧 Final viewport dimensions: ${viewport.width}x${viewport.height}`);

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
                    console.debug('[PDFManager] Cancelled previous render task');
                } catch (e) {
                    console.debug('[PDFManager] Previous render task already completed');
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

            // Render text layer
            await this._renderTextLayer(page, viewport);

            // Update current page
            this.currentPage = pageNum;

            console.debug(`[PDFManager] Page ${pageNum} rendered successfully`);

            // BULLETPROOF FIX: Always show the main container after successful page render
            setTimeout(() => {
                const mainContainer = document.querySelector(`#pdf-main-${this.blockId}`);
                const loadingIndicator = document.querySelector(`#pdf-loading-${this.blockId}`);

                if (mainContainer && mainContainer.style.display === 'none') {
                    mainContainer.style.display = 'block';
                    console.debug(`[PDFManager] ✅ Main PDF container shown for block ${this.blockId}`);
                }

                if (loadingIndicator && loadingIndicator.style.display !== 'none') {
                    loadingIndicator.style.display = 'none';
                    console.debug(`[PDFManager] ✅ Loading indicator hidden for block ${this.blockId}`);
                }
            }, 100);

            // Emit page rendered event
            this.emit('pageRendered', {
                pageNum: pageNum,
                viewport: viewport,
                canvas: this.canvas,
                textLayer: this.textLayer
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
                console.debug(`[PDFManager] Render task cancelled for page ${pageNum} (expected behavior)`);
                // Don't emit error event for cancelled renders
                throw error; // Re-throw to maintain the cancellation flow
            } else {
                console.error(`[PDFManager] Error rendering page ${pageNum}:`, error);
                this.emit('error', error);
                throw error;
            }
        }
    }

    /**
     * Render text layer for better text selection and accessibility
     */
    async _renderTextLayer(page, viewport) {
        if (!this.textLayer) return;

        try {
            // Clear existing text layer
            this.textLayer.innerHTML = '';

            // Set text layer dimensions
            this.textLayer.style.width = viewport.width + 'px';
            this.textLayer.style.height = viewport.height + 'px';
            this.textLayer.style.position = 'absolute';
            this.textLayer.style.top = '0';
            this.textLayer.style.left = '0';
            this.textLayer.style.pointerEvents = 'none';

            // Get text content
            const textContent = await page.getTextContent();

            // Render text layer using PDF.js utilities
            if (typeof pdfjsLib.renderTextLayer !== 'undefined') {
                const textLayerRender = pdfjsLib.renderTextLayer({
                    textContent: textContent,
                    container: this.textLayer,
                    viewport: viewport,
                    textDivs: []
                });

                await textLayerRender.promise;
            } else {
                // Fallback: manual text layer rendering
                this._renderTextLayerManual(textContent, viewport);
            }

        } catch (error) {
            console.error('[PDFManager] Error rendering text layer:', error);
        }
    }

    /**
     * Manual text layer rendering (fallback)
     */
    _renderTextLayerManual(textContent, viewport) {
        const textItems = textContent.items;

        for (const item of textItems) {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const style = textContent.styles[item.fontName];

            const div = document.createElement('div');
            div.textContent = item.str;
            div.style.position = 'absolute';
            div.style.left = tx[4] + 'px';
            div.style.top = (viewport.height - tx[5]) + 'px';
            div.style.fontSize = (tx[0] * style.ascent) + 'px';
            div.style.fontFamily = style.fontFamily;
            div.style.color = 'transparent';

            this.textLayer.appendChild(div);
        }
    }

    /**
     * Calculate optimal scale based on container size
     */
    _calculateOptimalScale(page, mode = 'fit') {
        const container = this.container.querySelector(`#pdf-container-${this.blockId}`);
        if (!container) {
            console.warn('[PDFManager] Container not found, using default scale 1.0');
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
            console.debug(`[PDFManager] 🔧 Fullscreen mode detected - using dimensions: ${containerWidth}x${containerHeight}`);
        }

        console.debug(`[PDFManager] 🔧 calculateOptimalScale - Container: ${containerWidth}x${containerHeight}, Mode: ${mode}`);

        const viewport = page.getViewport({ scale: 1.0 });
        const pageWidth = viewport.width;
        const pageHeight = viewport.height;

        console.debug(`[PDFManager] 🔧 calculateOptimalScale - Page dimensions at scale 1.0: ${pageWidth}x${pageHeight}`);

        if (mode === 'fit-width') {
            // Calculate scale to fit width with some padding
            const widthScale = (containerWidth - 40) / pageWidth;
            this.scale = Math.min(widthScale, 3.0); // Cap at 3x zoom for fit-width
            this.scale = Math.max(this.scale, 0.5); // Minimum 0.5x zoom

            console.debug(`[PDFManager] 🔧 calculateOptimalScale - Fit-width scale: ${this.scale} (widthScale: ${widthScale})`);

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

            console.debug(`[PDFManager] 🔧 calculateOptimalScale - Fit scale: ${this.scale} (widthScale: ${widthScale}, heightScale: ${heightScale}, scaledHeight: ${scaledHeight})`);

            // Remove fit-width class from container
            container.classList.remove('fit-width');
        }

        console.debug(`[PDFManager] 🔧 calculateOptimalScale - Final scale: ${this.scale}`);
    }

    /**
     * Navigate to a specific page
     */
    async navigateToPage(pageNum) {
        console.debug(`[PDFManager] 🔍 DEBUG: navigateToPage called with pageNum: ${pageNum}`);
        console.debug(`[PDFManager] 🔍 DEBUG: Current page: ${this.currentPage}, Document loaded: ${!!this.pdfDocument}`);

        if (!this.pdfDocument) {
            console.error(`[PDFManager] 🔍 DEBUG: No PDF document loaded, cannot navigate`);
            throw new Error('No PDF document loaded');
        }

        if (pageNum === this.currentPage) {
            console.debug(`[PDFManager] 🔍 DEBUG: Already on page ${pageNum}, no navigation needed`);
            return;
        }

        console.debug(`[PDFManager] 🔍 DEBUG: Calling renderPage with pageNum: ${pageNum}`);
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
        console.debug(`[PDFManager] setZoom called with scale: ${scale}`);

        if (!this.pdfDocument) {
            console.warn('[PDFManager] No document loaded for zoom');
            return;
        }

        const page = await this.pdfDocument.getPage(this.currentPage);
        const oldScale = this.scale;

        if (typeof scale === 'string') {
            if (scale === 'fit') {
                console.debug(`[PDFManager] Zoom fit: calling _calculateOptimalScale with "fit"`);
                this.isManualZoom = false; // Reset to auto-fit mode
                this._calculateOptimalScale(page, 'fit');
            } else if (scale === 'fit-width') {
                console.debug(`[PDFManager] Zoom fit-width: calling _calculateOptimalScale with "fit-width"`);
                this.isManualZoom = false; // Reset to auto-fit mode
                this._calculateOptimalScale(page, 'fit-width');
            } else if (scale === 'in') {
                // Zoom in by 25%
                this.scale = Math.min(5.0, this.scale * 1.25);
                this.isManualZoom = true; // Mark as manual zoom
                console.debug(`[PDFManager] Zoom in: ${oldScale.toFixed(2)} → ${this.scale.toFixed(2)} (increased by 25%)`);
                // Remove fit-width class when using manual zoom
                const container = this.container.querySelector(`#pdf-container-${this.blockId}`);
                if (container) {
                    container.classList.remove('fit-width');
                }
            } else if (scale === 'out') {
                // Zoom out by 20%
                this.scale = Math.max(0.1, this.scale * 0.8);
                this.isManualZoom = true; // Mark as manual zoom
                console.debug(`[PDFManager] Zoom out: ${oldScale.toFixed(2)} → ${this.scale.toFixed(2)} (decreased by 20%)`);
                // Remove fit-width class when using manual zoom
                const container = this.container.querySelector(`#pdf-container-${this.blockId}`);
                if (container) {
                    container.classList.remove('fit-width');
                }
            }
        } else {
            this.scale = Math.max(0.1, Math.min(5.0, scale));
            this.isManualZoom = true; // Mark as manual zoom
            console.debug(`[PDFManager] Zoom numeric: Set scale to ${this.scale}`);
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
        console.debug('[PDFManager] Destroying PDF manager');

        // Cancel any ongoing render task
        if (this.currentRenderTask) {
            try {
                await this.currentRenderTask.cancel();
                console.debug('[PDFManager] Cancelled ongoing render task during destroy');
            } catch (e) {
                console.debug('[PDFManager] Render task already completed during destroy');
            }
            this.currentRenderTask = null;
        }

        await this._cleanupDocument();

        // Clear canvas
        if (this.context) {
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Clear text layer
        if (this.textLayer) {
            this.textLayer.innerHTML = '';
        }

        // Remove all event listeners
        this.removeAllListeners();

        // Clear references
        this.canvas = null;
        this.context = null;
        this.textLayer = null;
        this.container = null;
    }
}

export default PDFManager;