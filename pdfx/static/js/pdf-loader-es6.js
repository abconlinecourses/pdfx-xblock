/**
 * PDF.js ES6 Module Loader for XBlock
 * Based on Mozilla's PDF.js viewer approach with local files
 */

(function() {
    'use strict';

    // Configuration for local PDF.js paths (matching Mozilla's structure)
    const PDFJS_CONFIG = {
        // Use local files from the static directory (following Mozilla structure)
        localPath: '/static/pdfx',
        cssPath: '/static/pdfx/css/viewer.css',
        fallbackCssPath: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.3.31/web/pdf_viewer.min.css'
    };

    let loadingStarted = false;
    let loadingPromise = null;
    let loadAttempts = 0;
    const maxAttempts = 3;

    function loadPdfJsLibraries() {
        if (loadingPromise) {
            return loadingPromise;
        }

        if (loadingStarted) {
            return new Promise((resolve, reject) => {
                const checkLoaded = () => {
                    if (window.pdfjsLib && window.pdfjsViewer && Object.keys(window.pdfjsViewer).length > 5) {
                        resolve();
                    } else {
                        setTimeout(checkLoaded, 100);
                    }
                };
                checkLoaded();
            });
        }

        loadingStarted = true;

        loadingPromise = loadPdfJsWithRetry().catch(error => {
            console.error('[PDF.js Loader] All loading attempts failed:', error);
            throw error;
        });

        return loadingPromise;
    }

    async function loadPdfJsWithRetry() {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                console.log(`[PDF.js Loader] Loading attempt ${attempt + 1}/${maxAttempts}`);
                await loadPdfJsAttempt(attempt);
                console.log('[PDF.js Loader] PDF.js libraries loaded successfully');
                return;
            } catch (error) {
                console.error(`[PDF.js Loader] Attempt ${attempt + 1} failed:`, error);
                if (attempt === maxAttempts - 1) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async function loadPdfJsAttempt(attempt) {
        // Load CSS first
        await loadCss();

        // Choose CDN based on attempt for fallback
        const cdnOptions = [
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.3.31',
            'https://unpkg.com/pdfjs-dist@5.3.31',
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31'
        ];

        const selectedCdn = cdnOptions[attempt % cdnOptions.length];
        console.log(`[PDF.js Loader] Using CDN: ${selectedCdn}`);

        try {
            // Import PDF.js core library
            const pdfjsLib = await import(`${selectedCdn}/build/pdf.min.mjs`);
            console.log('[PDF.js Loader] PDF.js core library imported');

            // Import the PDF.js viewer components
            const pdfjsViewer = await import(`${selectedCdn}/web/pdf_viewer.mjs`);
            console.log('[PDF.js Loader] PDF.js viewer components imported');
            console.log('[PDF.js Loader] Available viewer exports:', Object.keys(pdfjsViewer));

            // Debug: Check specific classes
            console.log('[PDF.js Loader] PDFViewer type:', typeof pdfjsViewer.PDFViewer);
            console.log('[PDF.js Loader] EventBus type:', typeof pdfjsViewer.EventBus);
            console.log('[PDF.js Loader] PDFLinkService type:', typeof pdfjsViewer.PDFLinkService);
            console.log('[PDF.js Loader] PDFRenderingQueue type:', typeof pdfjsViewer.PDFRenderingQueue);

            // Configure worker with local or CDN WASM support (following Mozilla pattern)
            const workerSrc = `${selectedCdn}/build/pdf.worker.min.mjs`;
            pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

            // Enable WASM (following Mozilla's approach)
            const wasmSupported = 'WebAssembly' in window;
            if (wasmSupported) {
                console.log('[PDF.js Loader] WebAssembly supported, enabling WASM');
                // The worker will automatically use WASM if available
            } else {
                console.log('[PDF.js Loader] WebAssembly not supported, using legacy');
            }

            console.log('[PDF.js Loader] Worker configured:', workerSrc);

            // Set up window.pdfjsLib (following Mozilla pattern)
            window.pdfjsLib = {
                // Core PDF.js API
                getDocument: pdfjsLib.getDocument,
                version: pdfjsLib.version,
                build: pdfjsLib.build,
                GlobalWorkerOptions: pdfjsLib.GlobalWorkerOptions,

                // Error types
                InvalidPDFException: pdfjsLib.InvalidPDFException,
                MissingPDFException: pdfjsLib.MissingPDFException,
                PasswordException: pdfjsLib.PasswordException,
                ResponseException: pdfjsLib.ResponseException,
                UnexpectedResponseException: pdfjsLib.UnexpectedResponseException,

                // Enums and constants
                AnnotationMode: pdfjsLib.AnnotationMode,
                CMapCompressionType: pdfjsLib.CMapCompressionType,
                PermissionFlag: pdfjsLib.PermissionFlag,
                TextRenderingMode: pdfjsLib.TextRenderingMode,
                VerbosityLevel: pdfjsLib.VerbosityLevel,

                // Export all available exports
                ...pdfjsLib
            };

            // Set up window.pdfjsViewer with all viewer components (following Mozilla pattern)
            window.pdfjsViewer = {
                // Main viewer classes
                PDFViewer: pdfjsViewer.PDFViewer,
                PDFLinkService: pdfjsViewer.PDFLinkService,
                PDFPageView: pdfjsViewer.PDFPageView,
                PDFSinglePageViewer: pdfjsViewer.PDFSinglePageViewer,

                // Event system
                EventBus: pdfjsViewer.EventBus,

                // Support classes
                PDFRenderingQueue: pdfjsViewer.PDFRenderingQueue,
                PDFHistory: pdfjsViewer.PDFHistory,
                DownloadManager: pdfjsViewer.DownloadManager,
                PDFThumbnailViewer: pdfjsViewer.PDFThumbnailViewer,
                PDFOutlineViewer: pdfjsViewer.PDFOutlineViewer,
                PDFAttachmentViewer: pdfjsViewer.PDFAttachmentViewer,
                PDFLayerViewer: pdfjsViewer.PDFLayerViewer,
                PDFSidebar: pdfjsViewer.PDFSidebar,
                PDFFindController: pdfjsViewer.PDFFindController,
                PDFScriptingManager: pdfjsViewer.PDFScriptingManager,

                // Annotation classes
                AnnotationLayerBuilder: pdfjsViewer.AnnotationLayerBuilder,
                DefaultAnnotationLayerFactory: pdfjsViewer.DefaultAnnotationLayerFactory,

                // Text layer classes
                TextLayerBuilder: pdfjsViewer.TextLayerBuilder,
                DefaultTextLayerFactory: pdfjsViewer.DefaultTextLayerFactory,

                // XFA layer classes
                XfaLayerBuilder: pdfjsViewer.XfaLayerBuilder,
                DefaultXfaLayerFactory: pdfjsViewer.DefaultXfaLayerFactory,

                // Utility classes
                NullL10n: pdfjsViewer.NullL10n,
                ProgressBar: pdfjsViewer.ProgressBar,

                // Enums and constants
                TextLayerMode: pdfjsViewer.TextLayerMode,
                AnnotationMode: pdfjsViewer.AnnotationMode,
                ScrollMode: pdfjsViewer.ScrollMode,
                SpreadMode: pdfjsViewer.SpreadMode,
                SidebarView: pdfjsViewer.SidebarView,
                CursorTool: pdfjsViewer.CursorTool,
                PresentationModeState: pdfjsViewer.PresentationModeState,
                RendererType: pdfjsViewer.RendererType,

                // Export all available exports for future compatibility
                ...pdfjsViewer
            };

            console.log('[PDF.js Loader] Global objects configured successfully');
            console.log('[PDF.js Loader] pdfjsLib version:', window.pdfjsLib.version);
            console.log('[PDF.js Loader] Available pdfjsViewer classes:', Object.keys(window.pdfjsViewer));

            // Verify critical classes are available
            const requiredClasses = ['PDFViewer', 'EventBus', 'PDFLinkService'];
            const optionalClasses = ['PDFRenderingQueue']; // PDFRenderingQueue is optional
            const missingClasses = requiredClasses.filter(cls => !window.pdfjsViewer[cls]);

            if (missingClasses.length > 0) {
                console.error('[PDF.js Loader] Missing required classes:', missingClasses);
                throw new Error(`Missing required PDF.js classes: ${missingClasses.join(', ')}`);
            }

            // Check optional classes
            const missingOptional = optionalClasses.filter(cls => !window.pdfjsViewer[cls]);
            if (missingOptional.length > 0) {
                console.warn('[PDF.js Loader] Missing optional classes (viewer will work without them):', missingOptional);
            }

            console.log('[PDF.js Loader] All required classes verified');

        } catch (error) {
            console.error('[PDF.js Loader] Failed to load PDF.js modules:', error);
            throw error;
        }
    }

    async function loadCss() {
        // Check if CSS is already loaded
        const existingLink = document.querySelector('link[href*="pdf_viewer"], link[href*="viewer.css"]');
        if (existingLink) {
            console.log('[PDF.js Loader] PDF.js CSS already loaded');
            return;
        }

        console.log('[PDF.js Loader] Loading PDF.js CSS');

        // Try local CSS first, then fallback to CDN
        const cssUrls = [PDFJS_CONFIG.cssPath, PDFJS_CONFIG.fallbackCssPath];

        for (const cssUrl of cssUrls) {
            try {
                await loadCssFile(cssUrl);
                console.log(`[PDF.js Loader] CSS loaded from: ${cssUrl}`);
                return;
            } catch (error) {
                console.warn(`[PDF.js Loader] Failed to load CSS from ${cssUrl}:`, error);
            }
        }

        console.warn('[PDF.js Loader] All CSS loading attempts failed, PDF viewer may not display correctly');
    }

    function loadCssFile(href) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = href;

            link.onload = () => {
                console.log(`[PDF.js Loader] CSS loaded: ${href}`);
                resolve();
            };

            link.onerror = () => {
                reject(new Error(`Failed to load CSS: ${href}`));
            };

            document.head.appendChild(link);

            // Timeout fallback
            setTimeout(() => {
                if (link.sheet) {
                    resolve();
                } else {
                    reject(new Error(`CSS load timeout: ${href}`));
                }
            }, 5000);
        });
    }

    // Export the loader function globally
    window.loadPdfJsLibraries = loadPdfJsLibraries;

    // Auto-load when this script loads
    console.log('[PDF.js Loader] PDF.js ES6 loader initialized');

})();