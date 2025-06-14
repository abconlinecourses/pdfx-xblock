/**
 * PDF.js XBlock Initializer
 * Integrates PDF.js viewer with Open edX XBlock architecture
 * Following Mozilla's viewer.mjs pattern exactly
 */

// Debug utility to inspect XBlock elements and configuration
window.debugPdfxXBlock = function(blockId) {
    console.log('=== PDFX XBLOCK DEBUG ===');

    if (blockId) {
        const element = document.getElementById(`pdfx-block-${blockId}`);
        if (element) {
            console.log('Block element found:', element);
            console.log('Block dataset:', element.dataset);
            console.log('PDF URL from dataset:', element.dataset.pdfUrl);
        } else {
            console.log('Block element not found with ID:', `pdfx-block-${blockId}`);
        }

        const viewer = window[`pdfxViewer_${blockId}`];
        if (viewer) {
            console.log('Viewer instance found:', viewer);
            console.log('Viewer config:', viewer.config);
        } else {
            console.log('Viewer instance not found');
        }
    } else {
        // Find all pdfx blocks
        const pdfxBlocks = document.querySelectorAll('[data-block-type="pdfx"]');
        console.log('Found PDFX blocks:', pdfxBlocks.length);

        pdfxBlocks.forEach((block, index) => {
            console.log(`Block ${index}:`, {
                id: block.id,
                blockId: block.dataset.blockId,
                pdfUrl: block.dataset.pdfUrl,
                dataset: block.dataset
            });
        });
    }

    console.log('Available PDF.js globals:', {
        pdfjsLib: typeof window.pdfjsLib,
        pdfjsViewer: typeof window.pdfjsViewer,
        loadPdfJsLibraries: typeof window.loadPdfJsLibraries
    });

    if (window.pdfjsLib) {
        console.log('pdfjsLib exports:', Object.keys(window.pdfjsLib));
    }

    if (window.pdfjsViewer) {
        console.log('pdfjsViewer exports:', Object.keys(window.pdfjsViewer));
        console.log('PDFViewer class:', typeof window.pdfjsViewer.PDFViewer);
        console.log('EventBus class:', typeof window.pdfjsViewer.EventBus);
        console.log('PDFLinkService class:', typeof window.pdfjsViewer.PDFLinkService);
        console.log('PDFRenderingQueue class:', typeof window.pdfjsViewer.PDFRenderingQueue);

        // Test individual class constructors
        if (window.pdfjsViewer.PDFViewer) {
            console.log('PDFViewer constructor test:', window.pdfjsViewer.PDFViewer.toString().substring(0, 200));
        }
        if (window.pdfjsViewer.EventBus) {
            console.log('EventBus constructor test:', window.pdfjsViewer.EventBus.toString().substring(0, 100));
        }
        if (window.pdfjsViewer.PDFLinkService) {
            console.log('PDFLinkService constructor test:', window.pdfjsViewer.PDFLinkService.toString().substring(0, 100));
        }
        if (window.pdfjsViewer.PDFRenderingQueue) {
            console.log('PDFRenderingQueue constructor test:', window.pdfjsViewer.PDFRenderingQueue.toString().substring(0, 100));
        }
    }

    console.log('=== END DEBUG ===');
};

class PdfxViewer {
    constructor(blockId, config) {
        this.blockId = blockId;
        this.config = config;

        // Initialize state following Mozilla pattern
        this.pdfDocument = null;
        this.pdfLoadingTask = null;
        this.pdfViewer = null;
        this.pdfLinkService = null;
        this.pdfRenderingQueue = null;
        this.eventBus = null;
        this.isInitialized = false;

        // Document state
        this.url = "";
        this.baseUrl = "";
        this.documentInfo = null;
        this.metadata = null;

        // Debug configuration
        console.log(`[PdfxViewer] Initializing with config:`, config);
        console.log(`[PdfxViewer] PDF URL:`, config.pdfUrl);

        this.init();
    }

    async init() {
        console.log(`[PdfxViewer] Initializing viewer for block ${this.blockId}`);

        try {
            // Validate PDF URL first
            if (!this.config.pdfUrl || this.config.pdfUrl.trim() === '') {
                console.warn('[PdfxViewer] No PDF URL provided. Using example PDF for testing.');
                // Use the example PDF from the web folder as fallback for testing
                this.config.pdfUrl = '/static/pdfx/example/compressed.tracemonkey-pldi-09.pdf';
            }

            console.log(`[PdfxViewer] Final PDF URL: ${this.config.pdfUrl}`);

            // Wait for PDF.js to be loaded
            await this.waitForPdfJs();

            // Initialize the viewer components (following Mozilla pattern)
            await this.initializeViewer();

            // Open the PDF document (following Mozilla pattern)
            await this.open({ url: this.config.pdfUrl });

            this.isInitialized = true;
            console.log(`[PdfxViewer] Successfully initialized`);
        } catch (error) {
            console.error(`[PdfxViewer] Initialization failed:`, error);
            this.showError(error.message);
        }
    }

    async waitForPdfJs() {
        // Use the dedicated PDF.js loader if available
        if (typeof window.loadPdfJsLibraries === 'function') {
            console.log(`[PdfxViewer] Using dedicated PDF.js loader`);
            try {
                await window.loadPdfJsLibraries();
                console.log(`[PdfxViewer] PDF.js libraries loaded via dedicated loader`);
                return;
            } catch (error) {
                console.error(`[PdfxViewer] Dedicated loader failed:`, error);
                // Fall back to polling method
            }
        }

        // Fallback polling method
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 300; // 30 seconds max for ES modules

            const checkPdfJs = () => {
                // Check for PDF.js global objects
                const hasPdfjsLib = typeof window.pdfjsLib !== 'undefined';
                const hasPdfjsViewer = typeof window.pdfjsViewer !== 'undefined';

                if (hasPdfjsLib && hasPdfjsViewer) {
                    console.log(`[PdfxViewer] PDF.js libraries loaded after ${attempts} attempts`);
                    console.log(`[PdfxViewer] pdfjsLib version:`, window.pdfjsLib.version);
                    resolve();
                } else if (attempts < maxAttempts) {
                    attempts++;
                    if (attempts % 50 === 0) {
                        console.log(`[PdfxViewer] Still waiting for PDF.js libraries... (attempt ${attempts}/${maxAttempts})`);
                        console.log(`[PdfxViewer] pdfjsLib available: ${hasPdfjsLib}, pdfjsViewer available: ${hasPdfjsViewer}`);
                    }
                    setTimeout(checkPdfJs, 100);
                } else {
                    console.error('[PdfxViewer] PDF.js libraries failed to load after 30 seconds');
                    console.error('[PdfxViewer] Available globals:', Object.keys(window).filter(key => key.includes('pdf')));
                    reject(new Error('PDF.js libraries failed to load after 30 seconds'));
                }
            };
            checkPdfJs();
        });
    }

    // Following Mozilla's exact initialization pattern
    async initializeViewer() {
        console.log('[PdfxViewer] Initializing viewer components...');

        const container = document.getElementById(`viewerContainer-${this.blockId}`);
        const viewer = document.getElementById(`viewer-${this.blockId}`);

        if (!container || !viewer) {
            throw new Error('PDF viewer container elements not found');
        }

        // Create event bus (following Mozilla pattern)
        this.eventBus = new pdfjsViewer.EventBus();

        // Create PDF link service (following Mozilla pattern)
        this.pdfLinkService = new pdfjsViewer.PDFLinkService({
            eventBus: this.eventBus,
        });

        // Create rendering queue (following Mozilla pattern) - make it optional
        if (pdfjsViewer.PDFRenderingQueue && typeof pdfjsViewer.PDFRenderingQueue === 'function') {
            try {
                this.pdfRenderingQueue = new pdfjsViewer.PDFRenderingQueue();
                console.log('[PdfxViewer] PDFRenderingQueue created successfully');
            } catch (error) {
                console.warn('[PdfxViewer] Failed to create PDFRenderingQueue, continuing without it:', error);
                this.pdfRenderingQueue = null;
            }
        } else {
            console.warn('[PdfxViewer] PDFRenderingQueue not available, creating viewer without it');
            this.pdfRenderingQueue = null;
        }

        // Create PDF viewer configuration
        const viewerConfig = {
            container: container,
            viewer: viewer,
            eventBus: this.eventBus,
            linkService: this.pdfLinkService,
            // Basic options following Mozilla defaults
            textLayerMode: pdfjsViewer.TextLayerMode?.ENABLE || 1,
            annotationMode: window.pdfjsLib.AnnotationMode?.ENABLE_FORMS || 2,
            // Rendering options
            useOnlyCssZoom: false,
            maxCanvasPixels: 16777216,
            enableWebGL: true
        };

        // Add rendering queue if available
        if (this.pdfRenderingQueue) {
            viewerConfig.renderingQueue = this.pdfRenderingQueue;
        }

        // Create PDF viewer with Mozilla's configuration pattern
        this.pdfViewer = new pdfjsViewer.PDFViewer(viewerConfig);

        // Link services together (following Mozilla pattern)
        if (this.pdfRenderingQueue) {
            this.pdfRenderingQueue.setViewer(this.pdfViewer);
        }
        this.pdfLinkService.setViewer(this.pdfViewer);

        // Setup event listeners for UI controls
        this.setupEventListeners();

        console.log('[PdfxViewer] Viewer components initialized');
    }

    // Following Mozilla's open() method pattern exactly
    async open(args) {
        console.log('[PdfxViewer] Opening PDF document:', args.url);

        // Close any existing document first
        if (this.pdfLoadingTask) {
            await this.close();
        }

        // Set URL and title (following Mozilla pattern)
        if (args.url) {
            this.setTitleUsingUrl(args.originalUrl || args.url, args.url);
        }

        // Show loading bar
        const loadingBar = document.getElementById(`loadingBar-${this.blockId}`);
        if (loadingBar) {
            loadingBar.classList.remove('hidden');
        }

        // Create loading task (following Mozilla pattern)
        const loadingTask = pdfjsLib.getDocument({
            url: args.url,
            withCredentials: true,
            enableScripting: false
        });

        this.pdfLoadingTask = loadingTask;

        // Setup progress callback (following Mozilla pattern)
        loadingTask.onProgress = ({ loaded, total }) => {
            if (total > 0) {
                const percent = Math.round((loaded / total) * 100);
                this.updateLoadingProgress(percent);
                console.log(`[PdfxViewer] Loading progress: ${percent}% (${loaded}/${total})`);
            }
        };

        // Load document and handle success/error (following Mozilla pattern)
        return loadingTask.promise.then(
            pdfDocument => {
                this.load(pdfDocument);
                return pdfDocument;
            },
            reason => {
                if (loadingTask !== this.pdfLoadingTask) {
                    return undefined;
                }
                console.error('[PdfxViewer] Failed to load PDF:', reason);
                this.showError(`Failed to load PDF: ${reason.message}`);
                throw reason;
            }
        );
    }

    // Following Mozilla's load() method pattern exactly
    load(pdfDocument) {
        console.log('[PdfxViewer] Loading PDF document into viewer');

        this.pdfDocument = pdfDocument;

        // Hide loading bar
        const loadingBar = document.getElementById(`loadingBar-${this.blockId}`);
        if (loadingBar) {
            loadingBar.classList.add('hidden');
        }

        // Remove loading class from outer container
        const outerContainer = document.getElementById(`outerContainer-${this.blockId}`);
        if (outerContainer) {
            outerContainer.classList.remove('loadingInProgress');
        }

        // Set document in services (following Mozilla pattern)
        this.pdfLinkService.setDocument(pdfDocument);
        this.pdfViewer.setDocument(pdfDocument);

        // Get the firstPagePromise and pagesPromise from the viewer (following Mozilla pattern)
        const { firstPagePromise, onePageRendered, pagesPromise } = this.pdfViewer;

        // Update page count
        const numPagesElement = document.getElementById(`numPages-${this.blockId}`);
        if (numPagesElement) {
            numPagesElement.textContent = ` of ${pdfDocument.numPages}`;
        }

        // Wait for first page to load before setting page number (following Mozilla pattern)
        if (firstPagePromise) {
            firstPagePromise.then(() => {
                console.log('[PdfxViewer] First page loaded, setting initial page');

                // Set initial page (now it's safe to do this)
                const initialPage = this.config.currentPage || 1;
                this.pdfViewer.currentPageNumber = initialPage;

                // Set default zoom to fit width
                this.pdfViewer.currentScaleValue = 'page-width';

                // Update page number input
                const pageNumberInput = document.getElementById(`pageNumber-${this.blockId}`);
                if (pageNumberInput) {
                    pageNumberInput.value = initialPage;
                    pageNumberInput.max = pdfDocument.numPages;
                }

                // Load saved annotations after first page is ready
                this.loadSavedAnnotations();

                console.log(`[PdfxViewer] PDF document loaded: ${pdfDocument.numPages} pages, current page: ${initialPage}`);
            }).catch(error => {
                console.error('[PdfxViewer] Error loading first page:', error);
                this.showError(`Error loading first page: ${error.message}`);
            });
        } else {
            // Fallback: set initial page immediately if firstPagePromise is not available
            console.warn('[PdfxViewer] firstPagePromise not available, setting page immediately');
            const initialPage = this.config.currentPage || 1;

            // Use setTimeout to defer execution slightly
            setTimeout(() => {
                try {
                    this.pdfViewer.currentPageNumber = initialPage;

                    // Set default zoom to fit width
                    this.pdfViewer.currentScaleValue = 'page-width';

                    const pageNumberInput = document.getElementById(`pageNumber-${this.blockId}`);
                    if (pageNumberInput) {
                        pageNumberInput.value = initialPage;
                        pageNumberInput.max = pdfDocument.numPages;
                    }
                    this.loadSavedAnnotations();
                    console.log(`[PdfxViewer] PDF document loaded (fallback): ${pdfDocument.numPages} pages, current page: ${initialPage}`);
                } catch (error) {
                    console.error('[PdfxViewer] Error in fallback page setting:', error);
                }
            }, 100);
        }
    }

    // Close document (following Mozilla pattern)
    async close() {
        if (!this.pdfLoadingTask) {
            return;
        }

        console.log('[PdfxViewer] Closing PDF document');

        const promises = [];
        promises.push(this.pdfLoadingTask.destroy());
        this.pdfLoadingTask = null;

        if (this.pdfDocument) {
            this.pdfDocument = null;
            this.pdfViewer.setDocument(null);
            this.pdfLinkService.setDocument(null);
        }

        // Reset state
        this.url = "";
        this.baseUrl = "";
        this.documentInfo = null;
        this.metadata = null;

        await Promise.all(promises);
    }

    setTitleUsingUrl(url = "", downloadUrl = null) {
        this.url = url;
        this.baseUrl = url; // Simplified for XBlock use
        console.log('[PdfxViewer] Set URL:', url);
    }

    setupEventListeners() {
        console.log(`[PdfxViewer] Setting up event listeners`);

        // Navigation
        this.setupNavigationListeners();

        // Zoom
        this.setupZoomListeners();

        // Download
        this.setupDownloadListener();

        // Toolbar toggle
        this.setupToolbarToggle();

        // Error handling
        this.setupErrorListeners();

        // PDF.js events
        if (this.eventBus) {
            this.eventBus.on('pagesinit', () => {
                console.log('[PdfxViewer] Pages initialized event received');
                // Don't initialize annotation tools here - wait for first page to load
                // This event fires too early, before pages are fully ready
            });

            this.eventBus.on('pagechanging', (evt) => {
                const pageNumber = evt.pageNumber;
                const pageNumberInput = document.getElementById(`pageNumber-${this.blockId}`);
                if (pageNumberInput) {
                    pageNumberInput.value = pageNumber;
                }
                this.saveCurrentPage(pageNumber);
            });

            this.eventBus.on('scalechanging', (evt) => {
                const scale = evt.scale;
                this.updateZoomDisplay(scale);
            });

            // Listen for when pages are actually rendered and ready
            this.eventBus.on('pagesloaded', () => {
                console.log('[PdfxViewer] All pages loaded and ready');
                this.initAnnotationTools();
            });
        }
    }

    initAnnotationTools() {
        console.log(`[PdfxViewer] initAnnotationTools called - allowAnnotation: ${this.config.allowAnnotation}`);

        if (!this.config.allowAnnotation) {
            console.log(`[PdfxViewer] Annotations disabled`);
            return;
        }

        console.log(`[PdfxViewer] Initializing annotation tools`);

        // Check if secondary toolbar exists first
        const secondaryToolbar = document.getElementById(`secondaryToolbar-${this.blockId}`);
        console.log(`[PdfxViewer] Secondary toolbar found: ${!!secondaryToolbar}`);
        if (secondaryToolbar) {
            console.log(`[PdfxViewer] Secondary toolbar classes:`, secondaryToolbar.className);
        }

        // Initialize annotation tools based on your existing annotation types
        this.initHighlightTool();
        this.initScribbleTool();
        this.initTextTool();
        this.initShapeTool();
        this.initNoteTool();
        this.initClearTool();

        // Add global click listener to close parameter toolbars
        this.initGlobalClickHandler();
    }

    initHighlightTool() {
        const highlightBtn = document.getElementById(`highlightTool-${this.blockId}`);
        const highlightToolbar = document.getElementById(`editorHighlightParamsToolbar-${this.blockId}`);

        console.log(`[PdfxViewer] initHighlightTool - button found: ${!!highlightBtn}, toolbar found: ${!!highlightToolbar}`);
        if (highlightBtn) console.log(`[PdfxViewer] Highlight button ID: ${highlightBtn.id}`);
        if (highlightToolbar) console.log(`[PdfxViewer] Highlight toolbar ID: ${highlightToolbar.id}`);

        if (highlightBtn) {
            highlightBtn.addEventListener('click', (e) => {
                                console.log(`[PdfxViewer-${this.blockId}] Highlight button clicked!`);

                // Check if secondary toolbar is visible
                const secondaryToolbar = document.getElementById(`secondaryToolbar-${this.blockId}`);
                const isSecondaryHidden = secondaryToolbar ? secondaryToolbar.classList.contains('hidden') : 'not found';
                console.log(`[PdfxViewer-${this.blockId}] Secondary toolbar hidden state: ${isSecondaryHidden}`);

                e.stopPropagation();
                this.setActiveTool('highlight');
                this.toggleParameterToolbar(highlightBtn, highlightToolbar);
            });

            // Initialize color picker
            this.initHighlightColorPicker();
            this.initHighlightControls();
        }
    }

    initScribbleTool() {
        const scribbleBtn = document.getElementById(`scribbleTool-${this.blockId}`);
        const scribbleToolbar = document.getElementById(`editorInkParamsToolbar-${this.blockId}`);

        console.log(`[PdfxViewer] initScribbleTool - button found: ${!!scribbleBtn}, toolbar found: ${!!scribbleToolbar}`);
        if (scribbleBtn) console.log(`[PdfxViewer] Scribble button ID: ${scribbleBtn.id}`);
        if (scribbleToolbar) console.log(`[PdfxViewer] Scribble toolbar ID: ${scribbleToolbar.id}`);

        if (scribbleBtn) {
            scribbleBtn.addEventListener('click', (e) => {
                console.log(`[PdfxViewer-${this.blockId}] Scribble button clicked!`);
                e.stopPropagation();
                this.setActiveTool('scribble');
                this.toggleParameterToolbar(scribbleBtn, scribbleToolbar);
            });

            // Initialize scribble controls
            this.initScribbleControls();
        }
    }

    initTextTool() {
        const textBtn = document.getElementById(`textTool-${this.blockId}`);
        const textToolbar = document.getElementById(`editorFreeTextParamsToolbar-${this.blockId}`);

        if (textBtn) {
            textBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setActiveTool('text');
                this.toggleParameterToolbar(textBtn, textToolbar);
            });

            // Initialize text controls
            this.initTextControls();
        }
    }

    initShapeTool() {
        const shapeBtn = document.getElementById(`shapeTool-${this.blockId}`);
        const shapeToolbar = document.getElementById(`editorStampParamsToolbar-${this.blockId}`);

        if (shapeBtn) {
            shapeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setActiveTool('shape');
                this.toggleParameterToolbar(shapeBtn, shapeToolbar);
            });
        }
    }

    initNoteTool() {
        const noteBtn = document.getElementById(`noteTool-${this.blockId}`);
        if (noteBtn) {
            noteBtn.addEventListener('click', () => {
                this.setActiveTool('note');
            });
        }
    }

    initClearTool() {
        const clearBtn = document.getElementById(`clearAnnotations-${this.blockId}`);
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearAllAnnotations();
            });
        }
    }

    setActiveTool(toolName) {
        // Deactivate previous tool first
        this.deactivateCurrentTool();

        this.currentTool = toolName;
        console.log(`[PdfxViewer] Active tool: ${toolName}`);

        // Update UI to show active tool
        this.updateActiveToolUI(toolName);

        // Activate the specific tool functionality
        this.activateToolFunctionality(toolName);
    }

    deactivateCurrentTool() {
        if (!this.currentTool) return;

        console.log(`[PdfxViewer] Deactivating current tool: ${this.currentTool}`);

        // Remove highlighting class from text layer if it was the highlight tool
        if (this.currentTool === 'highlight') {
            this.disableTextHighlighting();
        } else if (this.currentTool === 'scribble') {
            this.disableDrawingMode();
        }

        // Clear any tool-specific states
        const textLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer`);
        textLayers.forEach(textLayer => {
            textLayer.classList.remove('highlighting', 'scribbling');
            textLayer.style.pointerEvents = 'none';
            textLayer.style.userSelect = 'none';
        });
    }

    activateToolFunctionality(toolName) {
        console.log(`[PdfxViewer] Activating functionality for tool: ${toolName}`);

        switch(toolName) {
            case 'highlight':
                this.enableTextHighlighting();
                break;
            case 'scribble':
                // Enable drawing mode
                this.enableDrawingMode();
                break;
            case 'text':
                // Enable text annotation mode
                this.enableTextAnnotationMode();
                break;
            case 'shape':
                // Enable shape drawing mode
                this.enableShapeMode();
                break;
            case 'note':
                // Enable note creation mode
                this.enableNoteMode();
                break;
            default:
                console.log(`[PdfxViewer] No specific functionality for tool: ${toolName}`);
        }
    }

    enableTextHighlighting() {
        console.log(`[PdfxViewer] Enabling text highlighting for block: ${this.blockId}`);

        // Find all text layers for this block (PDF.js creates .textLayer elements)
        const textLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer`);

        if (textLayers.length === 0) {
            console.warn(`[PdfxViewer] No text layers found for block: ${this.blockId}`);
            // Fallback: look for alternative selectors
            const fallbackLayers = document.querySelectorAll(`[id^="textLayer-${this.blockId}"], [class*="textLayer"], [class*="text-layer"]`);
            console.log(`[PdfxViewer] Found ${fallbackLayers.length} fallback text layers`);
            if (fallbackLayers.length === 0) {
                return;
            }
            // Convert NodeList to Array and use it
            const textLayersArray = Array.from(fallbackLayers);
            textLayersArray.forEach(layer => {
                console.log(`[PdfxViewer] Adding fallback text layer: ${layer.className}`);
                this.enableTextLayerHighlighting(layer);
            });
            return;
        }

                textLayers.forEach(textLayer => {
            this.enableTextLayerHighlighting(textLayer);
        });

        console.log(`[PdfxViewer] Text highlighting enabled on ${textLayers.length} text layers`);
    }

    enableTextLayerHighlighting(textLayer) {
        console.log(`[PdfxViewer] Adding highlighting class to: ${textLayer.id || textLayer.className}`);

        // Add the highlighting class as per PDF.js example
        textLayer.classList.add('highlighting');

        // Enable text selection
        textLayer.style.pointerEvents = 'auto';
        textLayer.style.userSelect = 'text';
        textLayer.style.webkitUserSelect = 'text';
        textLayer.style.MozUserSelect = 'text';
        textLayer.style.msUserSelect = 'text';

        // Add event listeners for text selection
        this.addTextSelectionListeners(textLayer);
    }

    disableTextHighlighting() {
        console.log(`[PdfxViewer] Disabling text highlighting for block: ${this.blockId}`);

        // Find all text layers for this block (PDF.js creates .textLayer elements)
        const textLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer`);

        textLayers.forEach(textLayer => {
            // Remove the highlighting class
            textLayer.classList.remove('highlighting');

            // Disable text selection
            textLayer.style.pointerEvents = 'none';
            textLayer.style.userSelect = 'none';
            textLayer.style.webkitUserSelect = 'none';
            textLayer.style.MozUserSelect = 'none';
            textLayer.style.msUserSelect = 'none';

            // Remove event listeners
            this.removeTextSelectionListeners(textLayer);
        });
    }

        addTextSelectionListeners(textLayer) {
        // Remove existing listeners first
        this.removeTextSelectionListeners(textLayer);

        const onMouseDown = (e) => this.handleMouseDown(e, textLayer);
        const onMouseUp = (e) => this.handleTextSelection(e, textLayer);
        const onSelectionChange = () => this.handleSelectionChange(textLayer);

        textLayer.addEventListener('mousedown', onMouseDown);
        textLayer.addEventListener('mouseup', onMouseUp);
        document.addEventListener('selectionchange', onSelectionChange);

        // Store listeners for cleanup
        textLayer._pdfxListeners = {
            mousedown: onMouseDown,
            mouseup: onMouseUp,
            selectionchange: onSelectionChange
        };
    }

    removeTextSelectionListeners(textLayer) {
        if (textLayer._pdfxListeners) {
            textLayer.removeEventListener('mousedown', textLayer._pdfxListeners.mousedown);
            textLayer.removeEventListener('mouseup', textLayer._pdfxListeners.mouseup);
            document.removeEventListener('selectionchange', textLayer._pdfxListeners.selectionchange);
            delete textLayer._pdfxListeners;
        }
    }

        handleSelectionChange(textLayer) {
        const selection = window.getSelection();

        if (selection.rangeCount === 0) {
            // No selection, remove selecting class
            textLayer.classList.remove('selecting');
            return;
        }

        // Check if selection intersects with this text layer
        let hasSelection = false;
        for (let i = 0; i < selection.rangeCount; i++) {
            const range = selection.getRangeAt(i);
            if (this.rangeIntersectsTextLayer(range, textLayer)) {
                hasSelection = true;
                break;
            }
        }

        if (hasSelection) {
            textLayer.classList.add('selecting');
        } else {
            textLayer.classList.remove('selecting');
        }
    }

    rangeIntersectsTextLayer(range, textLayer) {
        try {
            // Check if range intersects with text layer
            return textLayer.contains(range.commonAncestorContainer) ||
                   textLayer.contains(range.startContainer) ||
                   textLayer.contains(range.endContainer) ||
                   range.intersectsNode(textLayer);
        } catch (e) {
            return false;
        }
    }

    handleTextSelection(event, textLayer) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);

            // Check if selection is within the text layer
            if (this.rangeIntersectsTextLayer(range, textLayer)) {
                console.log(`[PdfxViewer] Text selected in text layer: ${textLayer.className}`);
                this.createHighlight(range, textLayer);

                // Remove selecting class after highlight is created
                setTimeout(() => {
                    textLayer.classList.remove('selecting');
                }, 100);
            }
        }
    }

    handleMouseDown(event, textLayer) {
        console.log(`[PdfxViewer] Mouse down on text layer: ${textLayer.className}`);

        // Add selecting class as per PDF.js example
        textLayer.classList.add('selecting');

        // Clear any existing selection when starting new selection
        window.getSelection().removeAllRanges();
    }

        createHighlight(range, textLayer) {
        // Get the selected text
        const selectedText = range.toString().trim();
        if (!selectedText) return;

        console.log(`[PdfxViewer] Creating highlight for text: "${selectedText}"`);

        // Get or create highlight container for this text layer
        let highlightContainer = textLayer.querySelector('.highlight-container');
        if (!highlightContainer) {
            highlightContainer = document.createElement('div');
            highlightContainer.className = 'highlight-container';
            highlightContainer.style.position = 'absolute';
            highlightContainer.style.top = '0';
            highlightContainer.style.left = '0';
            highlightContainer.style.width = '100%';
            highlightContainer.style.height = '100%';
            highlightContainer.style.pointerEvents = 'none';
            highlightContainer.style.zIndex = '1';
            textLayer.appendChild(highlightContainer);
        }

        // Calculate position from range
        const rects = range.getClientRects();
        if (rects.length > 0) {
            const textLayerRect = textLayer.getBoundingClientRect();

            // Create a highlight group for this selection
            const highlightGroup = document.createElement('div');
            highlightGroup.className = 'highlight-group';
            highlightGroup.setAttribute('data-text', selectedText);

            for (let i = 0; i < rects.length; i++) {
                const rect = rects[i];
                const highlightRect = document.createElement('div');
                highlightRect.className = 'highlight-element';
                highlightRect.style.position = 'absolute';
                highlightRect.style.left = `${rect.left - textLayerRect.left}px`;
                highlightRect.style.top = `${rect.top - textLayerRect.top}px`;
                highlightRect.style.width = `${rect.width}px`;
                highlightRect.style.height = `${rect.height}px`;
                // Debug: Log the color being used
                const finalColor = this.highlightColor || '#FFFF00';
                console.log(`[PdfxViewer] Creating highlight with color: ${finalColor}, opacity: 0.4`);

                highlightRect.style.backgroundColor = finalColor;
                highlightRect.style.opacity = '0.4';
                highlightRect.style.pointerEvents = 'none';
                highlightRect.style.borderRadius = '2px';

                // Debug: Log the final computed styles
                console.log(`[PdfxViewer] Highlight element styles:`, {
                    backgroundColor: highlightRect.style.backgroundColor,
                    opacity: highlightRect.style.opacity,
                    position: highlightRect.style.position,
                    left: highlightRect.style.left,
                    top: highlightRect.style.top,
                    width: highlightRect.style.width,
                    height: highlightRect.style.height
                });

                highlightGroup.appendChild(highlightRect);
            }

            highlightContainer.appendChild(highlightGroup);
            console.log(`[PdfxViewer] Created highlight with ${rects.length} rectangles`);
        }

        // Clear selection after highlight is created
        window.getSelection().removeAllRanges();
    }

    enableDrawingMode() {
        console.log(`[PdfxViewer] Enabling drawing mode for block: ${this.blockId}`);

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
                console.log(`[PdfxViewer] Reactivated existing drawing canvas: ${canvas.id}`);
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

                console.log(`[PdfxViewer] Created new drawing canvas: ${canvas.id}`);
            }
        });
    }

        addDrawingListeners(canvas) {
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
        console.log(`[PdfxViewer] Updated ${canvases.length} canvas contexts with new ink settings`);
    }

    disableDrawingMode() {
        console.log(`[PdfxViewer] Disabling drawing mode for block: ${this.blockId}`);

        // Remove scribbling flag from text layers
        this.setTextLayerScribbleMode(false);

        // Remove drawing mode class from viewer
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.classList.remove('drawing-mode');
        }

        // Remove drawing canvases
        const canvases = document.querySelectorAll(`#pdfx-block-${this.blockId} .drawing-canvas`);
        canvases.forEach(canvas => {
            canvas.classList.remove('active');
            canvas.style.pointerEvents = 'none';
        });
    }

    enableTextAnnotationMode() {
        console.log(`[PdfxViewer] Enabling text annotation mode for block: ${this.blockId}`);
        // TODO: Implement text annotation functionality
    }

    enableShapeMode() {
        console.log(`[PdfxViewer] Enabling shape mode for block: ${this.blockId}`);
        // TODO: Implement shape functionality
    }

    enableNoteMode() {
        console.log(`[PdfxViewer] Enabling note mode for block: ${this.blockId}`);
        // TODO: Implement note functionality
    }

    updateActiveToolUI(toolName) {
        // Remove active class from all tool buttons
        const toolButtons = document.querySelectorAll(`#secondaryToolbar-${this.blockId} .secondaryToolbarButton`);
        toolButtons.forEach(btn => btn.classList.remove('toggled'));

        // Add active class to current tool
        const activeBtn = document.getElementById(`${toolName}Tool-${this.blockId}`);
        if (activeBtn) {
            activeBtn.classList.add('toggled');
        }
    }

    toggleParameterToolbar(button, toolbar) {
        console.log(`[PdfxViewer-${this.blockId}] toggleParameterToolbar called with:`, {
            button: button,
            toolbar: toolbar,
            buttonId: button?.id,
            toolbarId: toolbar?.id
        });

        if (!toolbar) {
            console.log(`[PdfxViewer-${this.blockId}] No toolbar provided, returning`);
            return;
        }

        const isHidden = toolbar.classList.contains('hidden');
        const isCurrentlyActive = button.getAttribute('aria-expanded') === 'true';

        // If clicking the same button that's already active, just close it
        if (isCurrentlyActive && !isHidden) {
            console.log(`[PdfxViewer-${this.blockId}] Toggling off active toolbar ${toolbar.id}`);
            this.hideParameterToolbar(toolbar, button);
            return;
        }

        // Close all other parameter toolbars first
        this.closeAllParameterToolbars();

        // Show the clicked toolbar
        if (isHidden) {
            console.log(`[PdfxViewer-${this.blockId}] Showing toolbar ${toolbar.id}`);
            this.showParameterToolbar(toolbar, button);
        }
    }

    showParameterToolbar(toolbar, button) {
        // Clear any existing auto-hide timer for this toolbar
        if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
            clearTimeout(this.parameterToolbarTimers[toolbar.id]);
            delete this.parameterToolbarTimers[toolbar.id];
        }

        // Position and show the toolbar
        this.positionParameterToolbar(button, toolbar);
        toolbar.classList.remove('hidden');
        button.setAttribute('aria-expanded', 'true');

        // Change text layer cursor to default when toolbar is active
        this.setTextLayerCursorForToolbar(true);

        // Set up mouse leave behavior instead of auto-hide timer
        this.setupToolbarMouseLeave(toolbar, button);

        console.log(`[PdfxViewer-${this.blockId}] Showed toolbar ${toolbar.id} with mouse leave behavior`);
    }

            setupToolbarMouseLeave(toolbar, button) {
        // Set up mouse leave behavior that works reliably with child elements
        let isInteracting = false; // Flag to prevent hiding during interactions

                const checkMousePosition = (event) => {
            // Don't check position if user is actively interacting
            if (isInteracting) return;

            // Get toolbar bounds
            const rect = toolbar.getBoundingClientRect();
            const mouseX = event.clientX;
            const mouseY = event.clientY;

            // Check if mouse is outside toolbar bounds
            let isOutside = (
                mouseX < rect.left ||
                mouseX > rect.right ||
                mouseY < rect.top ||
                mouseY > rect.bottom
            );

            // If highlight or scribble tool is active, also check if mouse is over text layer area
            if (isOutside && (this.currentTool === 'highlight' || this.currentTool === 'scribble')) {
                const viewerContainer = document.getElementById(`viewerContainer-${this.blockId}`);
                if (viewerContainer) {
                    const viewerRect = viewerContainer.getBoundingClientRect();
                    const isOverTextArea = (
                        mouseX >= viewerRect.left &&
                        mouseX <= viewerRect.right &&
                        mouseY >= viewerRect.top &&
                        mouseY <= viewerRect.bottom
                    );

                    // If mouse is over text area, don't consider it "outside"
                    if (isOverTextArea) {
                        isOutside = false;
                    }
                }
            }

            if (isOutside) {
                // Mouse is outside toolbar and text area, start hide timer
                if (!this.parameterToolbarTimers) {
                    this.parameterToolbarTimers = {};
                }

                // Clear existing timer first
                if (this.parameterToolbarTimers[toolbar.id]) {
                    clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                }

                this.parameterToolbarTimers[toolbar.id] = setTimeout(() => {
                    console.log(`[PdfxViewer-${this.blockId}] Mouse left toolbar ${toolbar.id}, hiding`);
                    this.hideParameterToolbar(toolbar, button);
                    delete this.parameterToolbarTimers[toolbar.id];
                }, 300); // Increased delay to 300ms for better UX
            } else {
                // Mouse is inside valid area, cancel hide timer
                if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                    clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                    delete this.parameterToolbarTimers[toolbar.id];
                }
            }
        };

        const onMouseMove = (event) => {
            checkMousePosition(event);
        };

        const onMouseLeave = (event) => {
            // Double-check on mouseleave as well
            checkMousePosition(event);
        };

        // Prevent hiding during active interactions
        const onMouseDown = (event) => {
            isInteracting = true;
            // Clear any pending hide timer
            if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                delete this.parameterToolbarTimers[toolbar.id];
            }
        };

        const onMouseUp = (event) => {
            // Extended delay before re-enabling position checking for complex interactions
            setTimeout(() => {
                isInteracting = false;
            }, 200);
        };

        const onClick = (event) => {
            // Prevent hiding on click
            event.stopPropagation();
            // Clear any pending hide timer
            if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                delete this.parameterToolbarTimers[toolbar.id];
            }
        };

        const onMouseEnter = (event) => {
            // Always clear hide timer when mouse enters toolbar
            if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                delete this.parameterToolbarTimers[toolbar.id];
            }
        };

        const onInput = (event) => {
            // Prevent hiding during input interactions (sliders, etc.)
            isInteracting = true;
            if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                delete this.parameterToolbarTimers[toolbar.id];
            }
            // Reset after longer delay for input elements
            setTimeout(() => {
                isInteracting = false;
            }, 300);
        };

        const onChange = (event) => {
            // Prevent hiding during change events (select, etc.)
            isInteracting = true;
            if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                delete this.parameterToolbarTimers[toolbar.id];
            }
            // Reset after delay
            setTimeout(() => {
                isInteracting = false;
            }, 200);
        };

        // Add event listeners
        document.addEventListener('mousemove', onMouseMove);
        toolbar.addEventListener('mouseleave', onMouseLeave);
        toolbar.addEventListener('mouseenter', onMouseEnter);
        toolbar.addEventListener('mousedown', onMouseDown);
        toolbar.addEventListener('mouseup', onMouseUp);
        toolbar.addEventListener('click', onClick);
        toolbar.addEventListener('input', onInput);
        toolbar.addEventListener('change', onChange);

        // Store listeners for cleanup
        if (!this.toolbarListeners) {
            this.toolbarListeners = {};
        }
        this.toolbarListeners[toolbar.id] = {
            mousemove: onMouseMove,
            mouseleave: onMouseLeave,
            mouseenter: onMouseEnter,
            mousedown: onMouseDown,
            mouseup: onMouseUp,
            click: onClick,
            input: onInput,
            change: onChange
        };

        console.log(`[PdfxViewer-${this.blockId}] Set mouse leave behavior for toolbar ${toolbar.id}`);
    }

    hideParameterToolbar(toolbar, button) {
        // Clear any existing timer
        if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
            clearTimeout(this.parameterToolbarTimers[toolbar.id]);
            delete this.parameterToolbarTimers[toolbar.id];
        }

        // Clean up event listeners
        if (this.toolbarListeners && this.toolbarListeners[toolbar.id]) {
            const listeners = this.toolbarListeners[toolbar.id];
            document.removeEventListener('mousemove', listeners.mousemove);
            toolbar.removeEventListener('mouseleave', listeners.mouseleave);
            toolbar.removeEventListener('mouseenter', listeners.mouseenter);
            toolbar.removeEventListener('mousedown', listeners.mousedown);
            toolbar.removeEventListener('mouseup', listeners.mouseup);
            toolbar.removeEventListener('click', listeners.click);
            toolbar.removeEventListener('input', listeners.input);
            toolbar.removeEventListener('change', listeners.change);
            delete this.toolbarListeners[toolbar.id];
        }

        toolbar.classList.add('hidden');
        button.setAttribute('aria-expanded', 'false');

        // Restore text layer cursor to text when toolbar is hidden
        this.setTextLayerCursorForToolbar(false);

        console.log(`[PdfxViewer-${this.blockId}] Hidden toolbar ${toolbar.id}`);
    }

    positionParameterToolbar(button, toolbar) {
        if (!button || !toolbar) return;

        // Get button position relative to viewport
        const buttonRect = button.getBoundingClientRect();

        // Position toolbar to the right of the secondary toolbar with some offset
        const leftPosition = buttonRect.right; // 20px gap from secondary toolbar
        const topPosition = buttonRect.top + (buttonRect.height / 2); // Center vertically with button

        console.log(`[PdfxViewer] Positioning toolbar at: left=${leftPosition}px, top=${topPosition}px`);

        toolbar.style.left = `${leftPosition}px`;
        toolbar.style.top = `${topPosition}px`;

        // Ensure toolbar doesn't go off screen
        const toolbarRect = toolbar.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Adjust if toolbar goes off right edge
        if (leftPosition + toolbarRect.width > viewportWidth) {
            const adjustedLeft = viewportWidth - toolbarRect.width - 20;
            toolbar.style.left = `${adjustedLeft}px`;
            console.log(`[PdfxViewer] Adjusted left position to: ${adjustedLeft}px (prevented overflow)`);
        }

        // Adjust if toolbar goes off bottom edge
        if (topPosition + (toolbarRect.height / 2) > viewportHeight) {
            const adjustedTop = viewportHeight - toolbarRect.height - 20;
            toolbar.style.top = `${adjustedTop}px`;
            console.log(`[PdfxViewer] Adjusted top position to: ${adjustedTop}px (prevented overflow)`);
        }
    }

        closeAllParameterToolbars() {
        // Use block-specific selector to target only this instance's parameter toolbars
        const toolbars = document.querySelectorAll(`#secondaryToolbar-${this.blockId} .editorParamsToolbar-${this.blockId}`);
        const buttons = document.querySelectorAll(`#secondaryToolbar-${this.blockId} .secondaryToolbarButton[aria-expanded]`);

        console.log(`[PdfxViewer-${this.blockId}] Closing ${toolbars.length} parameter toolbars for block ${this.blockId}`);

        // Clear any active auto-hide timers
        if (this.parameterToolbarTimers) {
            Object.keys(this.parameterToolbarTimers).forEach(toolbarId => {
                clearTimeout(this.parameterToolbarTimers[toolbarId]);
                delete this.parameterToolbarTimers[toolbarId];
            });
        }

        toolbars.forEach(toolbar => toolbar.classList.add('hidden'));
        buttons.forEach(button => button.setAttribute('aria-expanded', 'false'));

        // Restore text layer cursor when all toolbars are closed
        this.setTextLayerCursorForToolbar(false);
    }

    initHighlightColorPicker() {
        // Use block-specific selector for color buttons
        const colorButtons = document.querySelectorAll(`#highlightColorPickerButtons-${this.blockId} .colorPickerButton`);

        colorButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove selected state from all buttons in this specific block
                colorButtons.forEach(btn => btn.setAttribute('aria-selected', 'false'));
                // Set selected state on clicked button
                button.setAttribute('aria-selected', 'true');

                // Store selected color
                this.highlightColor = button.dataset.color;
                console.log(`[PdfxViewer-${this.blockId}] Highlight color changed to: ${this.highlightColor}`);
            });
        });

        // Set default color (green button which is already marked as selected in HTML)
        const defaultSelected = document.querySelector(`#highlightColorPickerButtons-${this.blockId} .colorPickerButton[aria-selected="true"]`);
        if (defaultSelected) {
            this.highlightColor = defaultSelected.dataset.color;
            console.log(`[PdfxViewer-${this.blockId}] Default highlight color set from selected button: ${this.highlightColor}`);
        } else if (colorButtons.length > 0) {
            // Fallback to first button if none selected
            colorButtons[0].setAttribute('aria-selected', 'true');
            this.highlightColor = colorButtons[0].dataset.color;
            console.log(`[PdfxViewer-${this.blockId}] Default highlight color set from first button: ${this.highlightColor}`);
        } else {
            console.warn(`[PdfxViewer-${this.blockId}] No color buttons found, using fallback color`);
            this.highlightColor = '#FFFF00';
        }
    }

    initHighlightControls() {
        const thicknessSlider = document.getElementById(`editorFreeHighlightThickness-${this.blockId}`);
        const showAllToggle = document.getElementById(`editorHighlightShowAll-${this.blockId}`);

        if (thicknessSlider) {
            thicknessSlider.addEventListener('input', (e) => {
                this.highlightThickness = e.target.value;
                console.log(`[PdfxViewer] Highlight thickness: ${this.highlightThickness}`);
            });
            this.highlightThickness = thicknessSlider.value;
        }

        if (showAllToggle) {
            showAllToggle.addEventListener('click', () => {
                const pressed = showAllToggle.getAttribute('aria-pressed') === 'true';
                showAllToggle.setAttribute('aria-pressed', !pressed);
                this.highlightShowAll = !pressed;
                console.log(`[PdfxViewer] Show all highlights: ${this.highlightShowAll}`);
            });
        }
    }

    initScribbleControls() {
        const colorPicker = document.getElementById(`editorInkColor-${this.blockId}`);
        const thicknessSlider = document.getElementById(`editorInkThickness-${this.blockId}`);
        const opacitySlider = document.getElementById(`editorInkOpacity-${this.blockId}`);

        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.inkColor = e.target.value;
                this.updateInkSettings();
                console.log(`[PdfxViewer] Ink color updated: ${this.inkColor}`);
            });
            this.inkColor = colorPicker.value;
        }

        if (thicknessSlider) {
            thicknessSlider.addEventListener('input', (e) => {
                this.inkThickness = parseInt(e.target.value);
                this.updateInkSettings();
                console.log(`[PdfxViewer] Ink thickness updated: ${this.inkThickness}`);
            });
            this.inkThickness = parseInt(thicknessSlider.value);
        }

        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                this.inkOpacity = parseFloat(e.target.value);
                this.updateInkSettings();
                console.log(`[PdfxViewer] Ink opacity updated: ${this.inkOpacity}`);
            });
            this.inkOpacity = parseFloat(opacitySlider.value);
        }
    }

    initTextControls() {
        const colorPicker = document.getElementById(`editorFreeTextColor-${this.blockId}`);
        const fontSizeSlider = document.getElementById(`editorFreeTextFontSize-${this.blockId}`);

        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.textColor = e.target.value;
                console.log(`[PdfxViewer] Text color: ${this.textColor}`);
            });
            this.textColor = colorPicker.value;
        }

        if (fontSizeSlider) {
            fontSizeSlider.addEventListener('input', (e) => {
                this.textFontSize = e.target.value;
                console.log(`[PdfxViewer] Text font size: ${this.textFontSize}`);
            });
            this.textFontSize = fontSizeSlider.value;
        }
    }

    setTextLayerCursorForToolbar(isToolbarActive) {
        // Find all text layers with highlighting or scribbling class
        const highlightingLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer.highlighting`);
        const scribblingLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer.scribbling`);

        // Combine both sets
        const allLayers = [...highlightingLayers, ...scribblingLayers];

        allLayers.forEach(textLayer => {
            if (isToolbarActive) {
                // Add toolbar-active class to change cursor to default
                textLayer.classList.add('toolbar-active');
            } else {
                // Remove toolbar-active class to restore text cursor
                textLayer.classList.remove('toolbar-active');
            }
        });

        console.log(`[PdfxViewer-${this.blockId}] Set text layer cursor - toolbar active: ${isToolbarActive}, highlighting layers: ${highlightingLayers.length}, scribbling layers: ${scribblingLayers.length}, total: ${allLayers.length}`);
    }

    initGlobalClickHandler() {
        // Close parameter toolbars when clicking outside
        document.addEventListener('click', (e) => {
            const secondaryToolbar = document.getElementById(`secondaryToolbar-${this.blockId}`);

            // Check if click is outside secondary toolbar and any parameter toolbars
            const isOutsideSecondaryToolbar = secondaryToolbar && !secondaryToolbar.contains(e.target);
            const isOutsideParameterToolbars = !e.target.closest(`[class*="editorParamsToolbar-${this.blockId}"]`);

            if (isOutsideSecondaryToolbar && isOutsideParameterToolbars) {
                console.log(`[PdfxViewer-${this.blockId}] Clicked outside toolbars, closing all parameter toolbars`);
                this.closeAllParameterToolbars();
            }
        });
    }

    setupNavigationListeners() {
        const prevBtn = document.getElementById(`previous-${this.blockId}`);
        const nextBtn = document.getElementById(`next-${this.blockId}`);
        const pageInput = document.getElementById(`pageNumber-${this.blockId}`);

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.previousPage());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextPage());
        }

        if (pageInput) {
            pageInput.addEventListener('change', (e) => {
                const pageNumber = parseInt(e.target.value);
                this.goToPage(pageNumber);
            });

            pageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const pageNumber = parseInt(e.target.value);
                    this.goToPage(pageNumber);
                }
            });
        }
    }

    setupZoomListeners() {
        const zoomInBtn = document.getElementById(`zoomIn-${this.blockId}`);
        const zoomOutBtn = document.getElementById(`zoomOut-${this.blockId}`);
        const scaleSelect = document.getElementById(`scaleSelect-${this.blockId}`);

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => this.zoomIn());
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
        }

        if (scaleSelect) {
            scaleSelect.addEventListener('change', (e) => {
                this.setZoom(e.target.value);
            });
        }
    }

    setupDownloadListener() {
        if (this.config.allowDownload) {
            const downloadBtn = document.getElementById(`download-${this.blockId}`);
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => this.downloadPdf());
            }
        }
    }

    setupToolbarToggle() {
        const toggleBtn = document.getElementById(`secondaryToolbarToggle-${this.blockId}`);
        const secondaryToolbar = document.getElementById(`secondaryToolbar-${this.blockId}`);

        console.log(`[PdfxViewer] setupToolbarToggle - toggleBtn found: ${!!toggleBtn}, secondaryToolbar found: ${!!secondaryToolbar}`);
        if (toggleBtn) console.log(`[PdfxViewer] Toggle button ID: ${toggleBtn.id}`);
        if (secondaryToolbar) console.log(`[PdfxViewer] Secondary toolbar ID: ${secondaryToolbar.id}, initial classes: ${secondaryToolbar.className}`);

        if (toggleBtn && secondaryToolbar) {
            toggleBtn.addEventListener('click', () => {
                console.log(`[PdfxViewer] Secondary toolbar toggle clicked!`);
                const wasHidden = secondaryToolbar.classList.contains('hidden');
                console.log(`[PdfxViewer] Secondary toolbar was hidden: ${wasHidden}`);

                secondaryToolbar.classList.toggle('hidden');
                toggleBtn.classList.toggle('toggled');

                const isNowHidden = secondaryToolbar.classList.contains('hidden');
                console.log(`[PdfxViewer] Secondary toolbar is now hidden: ${isNowHidden}`);
            });
        }
    }

    setupErrorListeners() {
        const errorClose = document.getElementById(`errorClose-${this.blockId}`);
        if (errorClose) {
            errorClose.addEventListener('click', () => {
                this.hideError();
            });
        }
    }

    loadSavedAnnotations() {
        console.log(`[PdfxViewer] Loading saved annotations - SKIPPED FOR FRONTEND TESTING`);
        // TODO: Implement annotation loading
        // Skip for now to avoid JSON parsing errors
    }

    async saveAnnotations(annotationData) {
        console.log('[PdfxViewer] saveAnnotations called - SKIPPED FOR FRONTEND TESTING', annotationData);
        // Skip for now to avoid 403 errors during frontend testing
        return;

        try {
            const response = await fetch(this.config.handlerUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data: annotationData })
            });

            const result = await response.json();
            if (result.result === 'success') {
                console.log('[PdfxViewer] Annotations saved successfully');
            } else {
                console.error('[PdfxViewer] Failed to save annotations:', result.message);
            }
        } catch (error) {
            console.error('[PdfxViewer] Error saving annotations:', error);
        }
    }

    clearAllAnnotations() {
        if (confirm('Are you sure you want to clear all annotations?')) {
            console.log(`[PdfxViewer] Clearing all annotations`);
            this.saveAnnotations({ _deletionOnly: true, _clearAll: true });
        }
    }

    // Navigation methods
    previousPage() {
        if (this.pdfViewer && this.pdfViewer.currentPageNumber > 1) {
            this.pdfViewer.currentPageNumber--;
        }
    }

    nextPage() {
        if (this.pdfViewer && this.pdfViewer.currentPageNumber < this.pdfDocument.numPages) {
            this.pdfViewer.currentPageNumber++;
        }
    }

    goToPage(pageNumber) {
        if (this.pdfViewer && pageNumber >= 1 && pageNumber <= this.pdfDocument.numPages) {
            this.pdfViewer.currentPageNumber = pageNumber;
        }
    }

    // Zoom methods
    zoomIn() {
        if (this.pdfViewer) {
            const newScale = Math.min(this.pdfViewer.currentScale * 1.1, 10);
            this.pdfViewer.currentScale = newScale;
        }
    }

    zoomOut() {
        if (this.pdfViewer) {
            const newScale = Math.max(this.pdfViewer.currentScale / 1.1, 0.1);
            this.pdfViewer.currentScale = newScale;
        }
    }

    setZoom(value) {
        if (!this.pdfViewer) return;

        switch (value) {
            case 'auto':
                this.pdfViewer.currentScaleValue = 'auto';
                break;
            case 'page-actual':
                this.pdfViewer.currentScaleValue = 'page-actual';
                break;
            case 'page-fit':
                this.pdfViewer.currentScaleValue = 'page-fit';
                break;
            case 'page-width':
                this.pdfViewer.currentScaleValue = 'page-width';
                break;
            default:
                this.pdfViewer.currentScale = parseFloat(value);
                break;
        }
    }

    updateZoomDisplay(scale) {
        const scaleSelect = document.getElementById(`scaleSelect-${this.blockId}`);
        if (scaleSelect) {
            const scaleValue = (scale * 100).toFixed(0);
            const customOption = document.getElementById(`customScaleOption-${this.blockId}`);

            // Check if it matches a predefined scale
            let found = false;
            for (let option of scaleSelect.options) {
                if (option.value === scale.toString()) {
                    scaleSelect.value = option.value;
                    found = true;
                    break;
                }
            }

            // If not found, use custom option
            if (!found && customOption) {
                customOption.textContent = `${scaleValue}%`;
                customOption.value = 'custom';
                customOption.removeAttribute('hidden');
                scaleSelect.value = 'custom';
            }
        }
    }

    downloadPdf() {
        if (this.config.allowDownload && this.config.pdfUrl) {
            console.log(`[PdfxViewer] Downloading PDF`);
            const link = document.createElement('a');
            link.href = this.config.pdfUrl;
            link.download = 'document.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    // Utility methods
    updateLoadingProgress(percent) {
        const progressBar = document.querySelector(`#loadingBar-${this.blockId} .progress`);
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
    }

    showError(message) {
        console.error(`[PdfxViewer] Error: ${message}`);

        const errorWrapper = document.getElementById(`errorWrapper-${this.blockId}`);
        const errorMessage = document.getElementById(`errorMessage-${this.blockId}`);

        if (errorWrapper && errorMessage) {
            errorMessage.textContent = message;
            errorWrapper.removeAttribute('hidden');
        }

        // Hide loading elements
        const loadingBar = document.getElementById(`loadingBar-${this.blockId}`);
        if (loadingBar) {
            loadingBar.classList.add('hidden');
        }

        const outerContainer = document.getElementById(`outerContainer-${this.blockId}`);
        if (outerContainer) {
            outerContainer.classList.remove('loadingInProgress');
        }
    }

    hideError() {
        const errorWrapper = document.getElementById(`errorWrapper-${this.blockId}`);
        if (errorWrapper) {
            errorWrapper.setAttribute('hidden', 'true');
        }
    }

    saveCurrentPage(pageNumber) {
        // Save current page to XBlock
        this.saveAnnotations({ currentPage: pageNumber });
    }
}

// Global initialization function for XBlock
window.PdfxXBlockInit = function(runtime, element) {
    console.log('[PdfxXBlockInit] Initializing PDF.js XBlock viewer');
    console.log('[PdfxXBlockInit] Element:', element);
    console.log('[PdfxXBlockInit] Element dataset:', element.dataset);

    // Find the main pdfx-block element if element is the wrapper
    let pdfxElement = element;
    if (!element.dataset.blockId) {
        pdfxElement = element.querySelector('[data-block-id]');
        if (!pdfxElement) {
            console.error('[PdfxXBlockInit] No element with data-block-id found');
            return null;
        }
    }

    const blockId = pdfxElement.dataset.blockId;
    if (!blockId) {
        console.error('[PdfxXBlockInit] No block ID found in element dataset');
        return null;
    }

    // Extract configuration from data attributes
    console.log('[PdfxXBlockInit] Raw allowAnnotation value:', pdfxElement.dataset.allowAnnotation);
    console.log('[PdfxXBlockInit] Raw allowDownload value:', pdfxElement.dataset.allowDownload);

    const config = {
        blockId: blockId,
        pdfUrl: pdfxElement.dataset.pdfUrl || '',
        allowDownload: pdfxElement.dataset.allowDownload === 'true',
        // TEMPORARY FIX: Force annotations to be enabled for frontend testing
        allowAnnotation: true, // pdfxElement.dataset.allowAnnotation === 'true',
        currentPage: parseInt(pdfxElement.dataset.currentPage) || 1,
        userId: pdfxElement.dataset.userId || 'anonymous',
        courseId: pdfxElement.dataset.courseId || '',
        handlerUrl: pdfxElement.dataset.handlerUrl || '',
        savedAnnotations: safeJsonParse(pdfxElement.dataset.savedAnnotations, {}),
        drawingStrokes: safeJsonParse(pdfxElement.dataset.drawingStrokes, {}),
        highlights: safeJsonParse(pdfxElement.dataset.highlights, {}),
        markerStrokes: safeJsonParse(pdfxElement.dataset.markerStrokes, {}),
        textAnnotations: safeJsonParse(pdfxElement.dataset.textAnnotations, {}),
        shapeAnnotations: safeJsonParse(pdfxElement.dataset.shapeAnnotations, {}),
        noteAnnotations: safeJsonParse(pdfxElement.dataset.noteAnnotations, {})
    };

    console.log(`[PdfxXBlockInit] Configuration:`, config);

    // Validate critical configuration
    if (!config.pdfUrl) {
        console.error('[PdfxXBlockInit] No PDF URL found in configuration');
        console.error('[PdfxXBlockInit] Element data attributes:', pdfxElement.dataset);
        console.error('[PdfxXBlockInit] Please check that pdf_url is properly set in the XBlock template');
    }

    // Create viewer instance
    const viewer = new PdfxViewer(blockId, config);

    // Store reference for debugging
    window[`pdfxViewer_${blockId}`] = viewer;

    return viewer;
};

// Helper function to safely parse JSON from data attributes
function safeJsonParse(jsonString, defaultValue = null) {
    if (!jsonString || jsonString.trim() === '') {
        return defaultValue;
    }
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.warn('[PdfxXBlockInit] Failed to parse JSON:', jsonString.substring(0, 100), error);
        return defaultValue;
    }
}