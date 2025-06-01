/**
 * PDF.js Loader - Loads PDF.js ES modules and makes them globally available
 * Updated to use PDF.js v5.0.375 from CDN
 */
(function() {
    'use strict';

    console.log('[PDF Loader] Starting PDF.js v5.0.375 initialization...');

    // Check if already loaded
    if (typeof window.pdfjsLib !== 'undefined') {
        console.log('[PDF Loader] PDF.js already loaded');
        document.dispatchEvent(new CustomEvent('pdfjsReady'));
        return;
    }

    // Use the latest PDF.js version 5.0.375 from CDN
    const PDFJS_VERSION = '5.0.375';
    const CDN_BASE_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/`;

    async function loadPDFJS() {
        try {
            console.log(`[PDF Loader] Loading PDF.js v${PDFJS_VERSION} from CDN...`);

            // For PDF.js 5.x, we need to load the ES module version
            const pdfUrl = `${CDN_BASE_URL}pdf.min.mjs`;
            console.log('[PDF Loader] Loading PDF.js from:', pdfUrl);

            // Import PDF.js ES module
            const pdfjsModule = await import(pdfUrl);

            // Make it globally available - PDF.js 5.x exports differently
            window.pdfjsLib = pdfjsModule.default || pdfjsModule;

            // Set up worker - PDF.js 5.x uses a different worker file
            const workerUrl = `${CDN_BASE_URL}pdf.worker.min.mjs`;

            // PDF.js 5.x has updated worker configuration
            if (window.pdfjsLib.GlobalWorkerOptions) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
            }

            console.log('[PDF Loader] PDF.js v5.0.375 loaded successfully');
            console.log('[PDF Loader] Worker URL set to:', workerUrl);
            console.log('[PDF Loader] PDF.js version:', window.pdfjsLib.version || 'unknown');

            // Trigger ready event
            document.dispatchEvent(new CustomEvent('pdfjsReady'));

        } catch (error) {
            console.error('[PDF Loader] Error loading PDF.js ES module:', error);

            // Fallback to traditional script loading for PDF.js 5.x
            console.log('[PDF Loader] Attempting traditional script loading fallback...');

            try {
                // Load PDF.js using traditional script tag
                const script = document.createElement('script');
                script.src = `${CDN_BASE_URL}pdf.min.js`;
                script.async = false;

                script.onload = function() {
                    console.log('[PDF Loader] PDF.js script loaded, checking availability...');

                    // Check if pdfjsLib is available globally
                    if (typeof window.pdfjsLib !== 'undefined') {
                        // Set up worker for PDF.js 5.x
                        const workerUrl = `${CDN_BASE_URL}pdf.worker.min.js`;
                        if (window.pdfjsLib.GlobalWorkerOptions) {
                            window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                        }

                        console.log('[PDF Loader] PDF.js v5.0.375 loaded from traditional script');
                        console.log('[PDF Loader] Worker URL set to:', workerUrl);
                        console.log('[PDF Loader] PDF.js version:', window.pdfjsLib.version || 'unknown');

                        document.dispatchEvent(new CustomEvent('pdfjsReady'));
                    } else {
                        console.error('[PDF Loader] Traditional script loading failed - pdfjsLib not available');
                        attemptLegacyFallback();
                    }
                };

                script.onerror = function(error) {
                    console.error('[PDF Loader] Traditional script loading failed:', error);
                    attemptLegacyFallback();
                };

                document.head.appendChild(script);

            } catch (fallbackError) {
                console.error('[PDF Loader] Traditional script loading setup failed:', fallbackError);
                attemptLegacyFallback();
            }
        }
    }

    function attemptLegacyFallback() {
        console.log('[PDF Loader] Attempting fallback to PDF.js 4.x...');

        try {
            const legacyScript = document.createElement('script');
            legacyScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.js';
            legacyScript.async = false;

            legacyScript.onload = function() {
                if (typeof window.pdfjsLib !== 'undefined') {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.js';
                    console.log('[PDF Loader] PDF.js 4.x fallback loaded successfully');
                    document.dispatchEvent(new CustomEvent('pdfjsReady'));
                } else {
                    console.error('[PDF Loader] Legacy fallback failed - pdfjsLib not available');
                    createPDFJSStub();
                }
            };

            legacyScript.onerror = function() {
                console.error('[PDF Loader] Legacy fallback also failed');
                createPDFJSStub();
            };

            document.head.appendChild(legacyScript);

        } catch (legacyError) {
            console.error('[PDF Loader] Legacy fallback setup failed:', legacyError);
            createPDFJSStub();
        }
    }

    function createPDFJSStub() {
        console.log('[PDF Loader] Creating PDF.js stub for basic functionality');

        // Create a minimal stub that will at least prevent errors
        window.pdfjsLib = {
            getDocument: function() {
                return Promise.reject(new Error('PDF.js not available - all loading methods failed'));
            },
            GlobalWorkerOptions: {
                workerSrc: ''
            },
            VerbosityLevel: {
                WARNINGS: 1,
                ERRORS: 0
            },
            version: 'stub',
            build: 'stub'
        };

        document.dispatchEvent(new CustomEvent('pdfjsReady'));
    }

    // Add some debugging
    console.log('[PDF Loader] Environment check:');
    console.log('- User Agent:', navigator.userAgent);
    console.log('- Module Support:', 'import' in document.createElement('script'));
    console.log('- Current Location:', window.location.href);

    // Start loading
    loadPDFJS();
})();