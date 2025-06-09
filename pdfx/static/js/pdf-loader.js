/**
 * PDF.js Loader - Loads PDF.js ES modules and makes them globally available
 * Updated to use PDF.js v5.0.375 from CDN
 */
(function() {
    'use strict';


    // Check if already loaded
    if (typeof window.pdfjsLib !== 'undefined') {
        document.dispatchEvent(new CustomEvent('pdfjsReady'));
        return;
    }

    // Use the latest PDF.js version 5.0.375 from CDN
    const PDFJS_VERSION = '5.0.375';
    const CDN_BASE_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/`;

    async function loadPDFJS() {
        try {

            // For PDF.js 5.x, we need to load the ES module version
            const pdfUrl = `${CDN_BASE_URL}pdf.min.mjs`;

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


            // Trigger ready event
            document.dispatchEvent(new CustomEvent('pdfjsReady'));

        } catch (error) {


            // Fallback to traditional script loading for PDF.js 5.x

            try {
                // Load PDF.js using traditional script tag
                const script = document.createElement('script');
                script.src = `${CDN_BASE_URL}pdf.min.js`;
                script.async = false;

                script.onload = function() {

                    // Check if pdfjsLib is available globally
                    if (typeof window.pdfjsLib !== 'undefined') {
                        // Set up worker for PDF.js 5.x
                        const workerUrl = `${CDN_BASE_URL}pdf.worker.min.js`;
                        if (window.pdfjsLib.GlobalWorkerOptions) {
                            window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                        }


                        document.dispatchEvent(new CustomEvent('pdfjsReady'));
                    } else {

                        attemptLegacyFallback();
                    }
                };

                script.onerror = function(error) {
                    attemptLegacyFallback();
                };

                document.head.appendChild(script);

            } catch (fallbackError) {
                attemptLegacyFallback();
            }
        }
    }

    function attemptLegacyFallback() {

        try {
            const legacyScript = document.createElement('script');
            legacyScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.js';
            legacyScript.async = false;

            legacyScript.onload = function() {
                if (typeof window.pdfjsLib !== 'undefined') {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.js';
                    document.dispatchEvent(new CustomEvent('pdfjsReady'));
                } else {

                    createPDFJSStub();
                }
            };

            legacyScript.onerror = function() {
                createPDFJSStub();
            };

            document.head.appendChild(legacyScript);

        } catch (legacyError) {
            console.error('[PDF Loader] Legacy fallback setup failed:', legacyError);
            createPDFJSStub();
        }
    }

    function createPDFJSStub() {

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

    // Start loading
    loadPDFJS();
})();