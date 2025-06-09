/**
 * PDFX XBlock Initialization
 * Handles the initialization of PDF XBlock instances with proper dependency management
 */

(function() {
    'use strict';

    /**
     * Wait for all required dependencies to be available
     */
    function waitForDependencies() {
        return new Promise((resolve) => {
            let checkCount = 0;
            const maxChecks = 100; // 10 seconds max

            function checkDependencies() {
                checkCount++;

                if (typeof window.pdfjsLib !== 'undefined' && typeof window.fabric !== 'undefined' && typeof window.PdfxXBlock === 'function') {

                    resolve();
                } else if (checkCount >= maxChecks) {
                    console.error('[PdfxInit] ❌ Timeout waiting for dependencies');

                    resolve(); // Continue anyway
                } else {
                   setTimeout(checkDependencies, 100);
                }
            }

            // Start checking immediately
            checkDependencies();

            // Also listen for the PDF.js ready event
            document.addEventListener('pdfjsReady', function() {
                if (typeof window.fabric !== 'undefined') {
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

            // Debug: Log the element being processed
            console.log('[PdfxInit] Processing block:', blockId, blockElement.className);

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
                allowDownload: blockElement.dataset.allowDownload === 'true' || blockElement.dataset.allowDownload === 'True',
                allowAnnotation: blockElement.dataset.allowAnnotation === 'true' || blockElement.dataset.allowAnnotation === 'True',
                currentPage: parseInt(blockElement.dataset.currentPage) || 1,
                userId: blockElement.dataset.userId || 'anonymous',
                courseId: blockElement.dataset.courseId || '',
                handlerUrl: blockElement.dataset.handlerUrl || ''
            };

            // Parse JSON data attributes for all annotation types
            // HTML unescape function for handling escaped data attributes
            function htmlUnescape(str) {
                const textarea = document.createElement('textarea');
                textarea.innerHTML = str;
                return textarea.value;
            }

            try {
                // Debug: Check if we have annotation data
                console.log('[PdfxInit] Drawing strokes data length:', blockElement.dataset.drawingStrokes ? blockElement.dataset.drawingStrokes.length : 0);

                config.savedAnnotations = JSON.parse(htmlUnescape(blockElement.dataset.savedAnnotations || '{}'));
                config.drawingStrokes = JSON.parse(htmlUnescape(blockElement.dataset.drawingStrokes || '{}'));
                config.highlights = JSON.parse(htmlUnescape(blockElement.dataset.highlights || '{}'));
                config.markerStrokes = JSON.parse(htmlUnescape(blockElement.dataset.markerStrokes || '{}'));
                config.textAnnotations = JSON.parse(htmlUnescape(blockElement.dataset.textAnnotations || '{}'));
                config.shapeAnnotations = JSON.parse(htmlUnescape(blockElement.dataset.shapeAnnotations || '{}'));
                config.noteAnnotations = JSON.parse(htmlUnescape(blockElement.dataset.noteAnnotations || '{}'));

                // Debug: Log if we have annotation data
                const hasDrawingStrokes = Object.keys(config.drawingStrokes).length > 0;
                if (hasDrawingStrokes) {
                    console.log('[PdfxInit] ✅ Found drawing strokes for', Object.keys(config.drawingStrokes).length, 'pages');
                } else {
                    console.log('[PdfxInit] ⚠️ No drawing strokes found');
                }

            } catch (e) {
                console.warn('[PdfxInit] Error parsing JSON data attributes:', e);
                config.savedAnnotations = {};
                config.drawingStrokes = {};
                config.highlights = {};
                config.markerStrokes = {};
                config.textAnnotations = {};
                config.shapeAnnotations = {};
                config.noteAnnotations = {};
            }


            // Check if PDF URL is valid
            if (!config.pdfUrl || config.pdfUrl === 'undefined' || config.pdfUrl.trim() === '') {


                // Use demo PDF for testing when no URL is configured
                const demoUrl = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

                config.pdfUrl = demoUrl;
            }



            // CRITICAL FIX: Prevent direct navigation to PDF URL
            if (window.location.href.includes('asset-v1') && window.location.href.includes('.pdf')) {
                console.warn('[PdfxInit] 🚨 DETECTED: Browser navigated directly to PDF URL!');
                console.warn('[PdfxInit] 🚨 This should not happen - PDF should load in viewer');
                console.warn('[PdfxInit] 🚨 Current URL:', window.location.href);

                // Try to go back to the course page
                if (window.history.length > 1) {

                    window.history.back();
                } else {

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

                    return config.handlerUrl;
                }
            };

            // Find the container element
            const containerElement = blockElement.querySelector('.pdfx-block') || blockElement;

            // Initialize using the global PdfxXBlock function
            if (typeof window.PdfxXBlock === 'function') {
                console.log('[PdfxInit] Creating PdfxXBlock with config:', {
                    allowAnnotation: config.allowAnnotation,
                    drawingStrokesKeys: Object.keys(config.drawingStrokes),
                    blockId: config.blockId
                });

                const instance = window.PdfxXBlock(runtime, containerElement, config);

                // Initialize the instance
                console.log('[PdfxInit] Calling init() on PdfxXBlock instance...');
                instance.init().then(() => {
                    console.log('[PdfxInit] PdfxXBlock initialization completed for block:', blockId);
                }).catch(error => {
                    console.error('[PdfxInit] PdfxXBlock initialization failed for block:', blockId, error);
                });

                // Store instance globally for debugging
                window.PdfxInstances = window.PdfxInstances || {};
                window.PdfxInstances[blockId] = instance;

                // Add global debug function
                window.debugScribbleAnnotations = function(blockIdToDebug) {
                    const targetBlockId = blockIdToDebug || blockId;
                    const targetInstance = window.PdfxInstances[targetBlockId];
                    if (targetInstance && targetInstance.toolManager) {
                        const scribbleTool = targetInstance.toolManager.getTool('scribble');
                        if (scribbleTool && typeof scribbleTool.debugAnnotationState === 'function') {
                            return scribbleTool.debugAnnotationState();
                        } else {
                            return null;
                        }
                    } else {
                        return null;
                    }
                };

                // Add global function to check annotation data
                window.checkAnnotationData = function(blockIdToDebug) {
                    const targetBlockId = blockIdToDebug || blockId;
                    const blockElement = document.querySelector(`[data-block-id="${targetBlockId}"]`);
                    if (blockElement) {
                        try {
                            const drawingStrokes = JSON.parse(blockElement.dataset.drawingStrokes || '{}');
                            return {
                                blockId: targetBlockId,
                                drawingStrokes: drawingStrokes,
                                hasData: Object.keys(drawingStrokes).length > 0
                            };
                        } catch (e) {
                            return { error: 'Failed to parse annotation data', blockId: targetBlockId };
                        }
                    } else {
                        return { error: 'Block element not found', blockId: targetBlockId };
                    }
                };

            } else {
                console.error('[PdfxInit] ❌ PdfxXBlock constructor not available');
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
        // Find all block containers - look for the actual .pdfx-block elements, not just data-block-type
        const blockElements = document.querySelectorAll('.pdfx-block[data-block-type="pdfx"]');

        if (blockElements.length === 0) {
            console.warn('[PdfxInit] ⚠️ No PdfxXBlock instances found on page');
            // Fallback: try the old selector
            const fallbackElements = document.querySelectorAll('[data-block-type="pdfx"]');
            console.log('[PdfxInit] Found fallback elements:', fallbackElements.length);
            fallbackElements.forEach((element, index) => {
                console.log(`[PdfxInit] Fallback element ${index}:`, element.className, element.id);
            });
            return;
        }

        console.log('[PdfxInit] Found', blockElements.length, 'PdfxXBlock instances');

        // Initialize each block with a small delay to prevent race conditions
        blockElements.forEach((blockElement, index) => {
            console.log(`[PdfxInit] Initializing block ${index + 1}/${blockElements.length}`);
            setTimeout(() => {
                initializePdfxXBlock(blockElement);
            }, index * 100); // 100ms delay between each block
        });
    }

    /**
     * Start the initialization process
     */
    function startInitialization() {


        if (document.readyState === 'loading') {

            document.addEventListener('DOMContentLoaded', function() {

                waitForDependencies().then(initializeAllBlocks);
            });
        } else {

            waitForDependencies().then(initializeAllBlocks);
        }
    }

    /**
     * Container visibility fix
     */
    function ensureContainerVisibility() {
        setTimeout(function() {

            // Find all possible PDF containers
            const containers = document.querySelectorAll('[id*="pdf-main-"]');
            const loadingIndicators = document.querySelectorAll('[id*="pdf-loading-"]');

            containers.forEach(function(container) {
                if (container && container.style.display === 'none') {
                    container.style.display = 'block';
                }
            });

            loadingIndicators.forEach(function(loading) {
                if (loading && loading.style.display !== 'none') {
                    loading.style.display = 'none';
                }
            });

            // Hide any remaining loading overlays
            const allLoadingElements = document.querySelectorAll('[class*="loading"], [id*="loading"], .loading-indicator');
            allLoadingElements.forEach(function(overlay) {
                overlay.style.display = 'none';
                overlay.style.visibility = 'hidden';
                overlay.style.opacity = '0';
            });

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