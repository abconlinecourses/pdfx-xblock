/**
 * PDFX XBlock Initialization
 * Handles the initialization of PDF XBlock instances with proper dependency management
 */

(function() {
    'use strict';

    console.log('[PdfxInit] 🚀 PDF XBlock initialization script loaded');

    /**
     * Wait for all required dependencies to be available
     */
    function waitForDependencies() {
        return new Promise((resolve) => {
            let checkCount = 0;
            const maxChecks = 100; // 10 seconds max

            function checkDependencies() {
                checkCount++;

                if (typeof window.pdfjsLib !== 'undefined' && typeof window.fabric !== 'undefined') {
                    console.log('[PdfxInit] ✅ All dependencies ready');
                    resolve();
                } else if (checkCount >= maxChecks) {
                    console.error('[PdfxInit] ❌ Timeout waiting for dependencies');
                    console.log('pdfjsLib:', typeof window.pdfjsLib);
                    console.log('fabric:', typeof window.fabric);
                    resolve(); // Continue anyway
                } else {
                    console.log(`[PdfxInit] ⏳ Waiting for dependencies... (${checkCount}/${maxChecks})`);
                    setTimeout(checkDependencies, 100);
                }
            }

            // Start checking immediately
            checkDependencies();

            // Also listen for the PDF.js ready event
            document.addEventListener('pdfjsReady', function() {
                if (typeof window.fabric !== 'undefined') {
                    console.log('[PdfxInit] ✅ Dependencies ready via event');
                    resolve();
                }
            }, { once: true });
        });
    }

    /**
     * Initialize a single PdfxXBlock instance
     */
    function initializePdfxXBlock(blockElement) {
        try {
            const blockId = blockElement.dataset.blockId;
            console.log(`[PdfxInit] 🔧 Starting PdfxXBlock initialization for block ${blockId}...`);

            // Check dependencies one more time
            if (typeof window.pdfjsLib === 'undefined') {
                console.error('[PdfxInit] ❌ PDF.js not available at initialization');
                return;
            }

            if (typeof window.fabric === 'undefined') {
                console.error('[PdfxInit] ❌ Fabric.js not available at initialization');
                return;
            }

            // Get configuration from data attributes
            const config = {
                blockId: blockElement.dataset.blockId || '',
                pdfUrl: blockElement.dataset.pdfUrl || '',
                allowDownload: blockElement.dataset.allowDownload === 'true',
                allowAnnotation: blockElement.dataset.allowAnnotation === 'true',
                currentPage: parseInt(blockElement.dataset.currentPage) || 1,
                userId: blockElement.dataset.userId || 'anonymous',
                courseId: blockElement.dataset.courseId || '',
                handlerUrl: blockElement.dataset.handlerUrl || ''
            };

            // Parse JSON data attributes
            try {
                config.savedAnnotations = JSON.parse(blockElement.dataset.savedAnnotations || '{}');
                config.drawingStrokes = JSON.parse(blockElement.dataset.drawingStrokes || '{}');
                config.highlights = JSON.parse(blockElement.dataset.highlights || '{}');
            } catch (e) {
                console.warn('[PdfxInit] Error parsing JSON data attributes:', e);
                config.savedAnnotations = {};
                config.drawingStrokes = {};
                config.highlights = {};
            }

            console.log('[PdfxInit] 📋 Initialization arguments:', config);
            console.log('[PdfxInit] 🔍 PDF URL being passed:', config.pdfUrl);

            // Check if PDF URL is valid
            if (!config.pdfUrl || config.pdfUrl === 'undefined' || config.pdfUrl.trim() === '') {
                console.log('[PdfxInit] ℹ️ No PDF URL configured - this is expected when no PDF has been uploaded');
                console.debug('[PdfxInit] 🔍 PDF URL value:', config.pdfUrl);
                console.debug('[PdfxInit] 🔍 Block element dataset:', blockElement.dataset);

                // Use demo PDF for testing when no URL is configured
                const demoUrl = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';
                console.log('[PdfxInit] 🔧 Using demo PDF for testing:', demoUrl);
                config.pdfUrl = demoUrl;
            }

            console.log('[PdfxInit] 🔍 PDF URL length:', config.pdfUrl.length);
            console.log('[PdfxInit] 🔍 PDF URL starts with:', config.pdfUrl.substring(0, 50));

            // CRITICAL FIX: Prevent direct navigation to PDF URL
            if (window.location.href.includes('asset-v1') && window.location.href.includes('.pdf')) {
                console.warn('[PdfxInit] 🚨 DETECTED: Browser navigated directly to PDF URL!');
                console.warn('[PdfxInit] 🚨 This should not happen - PDF should load in viewer');
                console.warn('[PdfxInit] 🚨 Current URL:', window.location.href);

                // Try to go back to the course page
                if (window.history.length > 1) {
                    console.log('[PdfxInit] 🔄 Attempting to go back to course page...');
                    window.history.back();
                } else {
                    console.log('[PdfxInit] 🔄 Redirecting to course home...');
                    // Extract course ID from the asset URL if possible
                    const courseMatch = window.location.href.match(/asset-v1:([^+]+\+[^+]+\+[^+]+)/);
                    if (courseMatch) {
                        const courseId = courseMatch[1].replace(/\+/g, '+');
                        window.location.href = `/courses/course-v1:${courseId}/course/`;
                    } else {
                        window.location.href = '/dashboard';
                    }
                }
                return; // Stop initialization
            }

            // Create runtime object
            const runtime = {
                handlerUrl: function(element, handler) {
                    console.log('[PdfxInit] 🔗 Handler URL requested:', handler);
                    return config.handlerUrl;
                }
            };

            // Find the container element
            const containerElement = blockElement.querySelector('.pdfx-block') || blockElement;

            // Initialize using the global PdfxXBlock function
            if (typeof window.PdfxXBlock === 'function') {
                console.log('[PdfxInit] 🎯 Calling PdfxXBlock constructor...');
                const instance = window.PdfxXBlock(runtime, containerElement, config);
                console.log('[PdfxInit] ✅ Initialized successfully with ES6 modules');

                // Store instance globally for debugging
                window.PdfxInstances = window.PdfxInstances || {};
                window.PdfxInstances[blockId] = instance;
                console.log(`[PdfxInit] 💾 Instance stored globally as PdfxInstances["${blockId}"]`);
            } else {
                console.error('[PdfxInit] ❌ PdfxXBlock constructor not available');
                console.log('[PdfxInit] 🔍 Available functions:', Object.keys(window).filter(k => k.includes('Pdf')));
            }
        } catch (error) {
            console.error('[PdfxInit] ❌ Initialization error:', error);
            console.error('[PdfxInit] 📊 Stack trace:', error.stack);
        }
    }

    /**
     * Initialize all PdfxXBlock instances on the page
     */
    function initializeAllBlocks() {
        console.log('[PdfxInit] 🔍 Looking for PdfxXBlock instances...');

        // Find all block containers
        const blockElements = document.querySelectorAll('[data-block-type="pdfx"]');

        if (blockElements.length === 0) {
            console.warn('[PdfxInit] ⚠️ No PdfxXBlock instances found on page');
            return;
        }

        console.log(`[PdfxInit] 📦 Found ${blockElements.length} PdfxXBlock instance(s)`);

        // Initialize each block
        blockElements.forEach((blockElement, index) => {
            console.log(`[PdfxInit] 🎯 Initializing block ${index + 1}/${blockElements.length}`);
            initializePdfxXBlock(blockElement);
        });
    }

    /**
     * Start the initialization process
     */
    function startInitialization() {
        console.log('[PdfxInit] 📄 Document ready state:', document.readyState);

        if (document.readyState === 'loading') {
            console.log('[PdfxInit] ⏳ Waiting for DOMContentLoaded...');
            document.addEventListener('DOMContentLoaded', function() {
                console.log('[PdfxInit] ✅ DOMContentLoaded fired');
                waitForDependencies().then(initializeAllBlocks);
            });
        } else {
            console.log('[PdfxInit] ✅ DOM already ready, proceeding...');
            waitForDependencies().then(initializeAllBlocks);
        }
    }

    /**
     * Container visibility fix
     */
    function ensureContainerVisibility() {
        setTimeout(function() {
            console.debug('[PdfxInit] 👀 Ensuring PDF containers are visible...');

            // Find all possible PDF containers
            const containers = document.querySelectorAll('[id*="pdf-main-"]');
            const loadingIndicators = document.querySelectorAll('[id*="pdf-loading-"]');

            containers.forEach(function(container) {
                if (container && container.style.display === 'none') {
                    container.style.display = 'block';
                    console.debug('[PdfxInit] ✅ Showed container:', container.id);
                }
            });

            loadingIndicators.forEach(function(loading) {
                if (loading && loading.style.display !== 'none') {
                    loading.style.display = 'none';
                    console.debug('[PdfxInit] ✅ Hidden loading:', loading.id);
                }
            });

            // Hide any remaining loading overlays
            const allLoadingElements = document.querySelectorAll('[class*="loading"], [id*="loading"], .loading-indicator');
            allLoadingElements.forEach(function(overlay) {
                overlay.style.display = 'none';
                overlay.style.visibility = 'hidden';
                overlay.style.opacity = '0';
                console.debug('[PdfxInit] ✅ Hidden loading element:', overlay.className || overlay.id);
            });

            console.log('[PdfxInit] 🎉 Container visibility check completed');
        }, 1000); // Wait 1 second for everything to load
    }

    // Start the initialization process
    startInitialization();

    // Ensure container visibility
    ensureContainerVisibility();

    // Export for debugging
    window.PdfxInit = {
        initializeAllBlocks,
        initializePdfxXBlock,
        waitForDependencies
    };

})();