/* PDF Viewer XBlock - Student View */
function PdfxXBlock(runtime, element, initArgs) {
    'use strict';

    // Variables from XBlock backend
    var pdfUrl = initArgs.pdfUrl;
    var allowDownload = initArgs.allowDownload;
    var allowAnnotation = initArgs.allowAnnotation;
    var savedAnnotations = initArgs.savedAnnotations || {};
    var currentPage = initArgs.currentPage || 1;
    var drawingStrokes = initArgs.drawingStrokes || {};
    var highlights = initArgs.highlights || {};
    var blockId = initArgs.blockId; // Get the unique block ID

    // Display settings
    var currentBrightness = 100;
    var isGrayscale = false; // Track grayscale state

    // IMPORTANT: Don't override jQuery's $ function. Use a different name instead.
    // Custom selector function for this instance
    function findElement(selector) {
        // Only process string selectors
        if (typeof selector !== 'string') {
            return null;
        }

        // If the selector starts with #, assume it's looking for an ID and needs the block ID appended
        if (selector.charAt(0) === '#' && selector.indexOf(blockId) === -1) {
            // Extract the ID without the # prefix
            var id = selector.substring(1);
            // Return the element with the instance-specific ID
            return document.getElementById(id + '-' + blockId);
        }
        // Otherwise, scope the selector to the current element
        return element.querySelector(selector);
    }

    // Function to query multiple elements within this block
    function findElements(selector) {
        if (typeof selector !== 'string') {
            return [];
        }
        return element.querySelectorAll(selector);
    }

    // Use jQuery with proper scoping for backward compatibility
    function jq(selector) {
        return jQuery(element).find(selector);
    }

    // PDF Variables
    var pdfDoc = null;
    var pdfCanvas = null;
    var pdfOriginalWidth = 0;
    var pdfOriginalHeight = 0;
    var currentZoom = 1.0;
    var currentZoomBeforeFullscreen = 1.0; // Store zoom level before entering fullscreen

    // Check if we're in Studio
    var isStudio = (window.location.href.indexOf('studio') !== -1) ||
                  (window.location.href.indexOf('/cms/') !== -1);

    // Show error message
    function showError(message) {
        var errorElement = findElement('.pdf-error');
        if (errorElement) {
            errorElement.style.display = 'block';
            var errorMessage = errorElement.querySelector('.error-message');
            if (errorMessage) {
                errorMessage.textContent = message;
            }
        }

        var loadingIndicator = findElement('.loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }

    // Get safe PDF URL
    function getSafePdfUrl() {
        if (!pdfUrl) {
            return '';
        }

        let url = pdfUrl;

        // Handle asset URLs (they might need special handling in Open edX)
        if (url.indexOf('asset-v1') !== -1) {
            // This is an Open edX asset URL

            // Check if it's already absolute
            if (!(url.indexOf('http://') === 0 || url.indexOf('https://') === 0)) {
                // If it's a relative URL starting with a slash, we need to get the base URL
                if (url.charAt(0) === '/') {
                    // Try to get the base URL from window.location
                    const baseUrl = window.location.protocol + '//' + window.location.host;
                    url = baseUrl + url;
                }
            }

            return url;
        } else if (url.charAt(0) === '/') {
            // Relative URL - convert to absolute
            const baseUrl = window.location.protocol + '//' + window.location.host;
            url = baseUrl + url;
            return url;
        } else if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
            // Already an absolute URL
            return url;
        } else {
            // Add https:// if missing
            return 'https://' + url;
        }
    }

    // Load the PDF
    function loadPDF() {
        try {
            // Make sure PDF.js is available
            if (typeof pdfjsLib === 'undefined') {
                showError('PDF.js library not loaded. Please refresh the page or contact support.');
                return;
            }

            const url = getSafePdfUrl();
            if (!url) {
                showError('No PDF URL provided');
                return;
            }

            // Check if PdfxStorage is available
            if (typeof window.PdfxStorage === 'undefined') {
                loadPdfFromUrl(url);
                return;
            }

            // Prepare metadata for IndexedDB storage
            const metadata = {
                courseId: '',
                blockId: blockId,
                filename: pdfUrl.split('/').pop() || '',
            };

            // Try to get courseId safely from different possible sources
            try {
                // First try from element's data attributes if it exists
                const pdfxBlock = element.querySelector('.pdfx_block');
                if (pdfxBlock && pdfxBlock.dataset && pdfxBlock.dataset.courseId) {
                    metadata.courseId = pdfxBlock.dataset.courseId;
                }
                // Next try from the element itself
                else if (element.dataset && element.dataset.courseId) {
                    metadata.courseId = element.dataset.courseId;
                }
                // Try from a directly accessible data element
                else {
                    const dataElement = document.getElementById('pdfx-data-' + blockId);
                    if (dataElement && dataElement.dataset && dataElement.dataset.courseId) {
                        metadata.courseId = dataElement.dataset.courseId;
                    }
                }
            } catch (e) {
                // Continue without courseId, it's not critical
            }

            // Set a timeout to fall back to direct loading if IndexedDB is too slow or hangs
            const timeoutId = setTimeout(() => {
                loadPdfFromUrl(url);
            }, 3000); // 3 second timeout

            // Check if PDF exists in IndexedDB
            window.PdfxStorage.hasPdf(url, metadata)
                .then(exists => {
                    clearTimeout(timeoutId); // Clear the timeout as we got a response

                    if (exists) {
                        return window.PdfxStorage.getPdf(url, metadata)
                            .catch(error => {
                                loadPdfFromUrl(url);
                                return null;
                            });
                    } else {
                        // Show loading indicator
                        jq('.loading-indicator').text('Loading PDF from server...');

                        // Fetch PDF from URL and store in IndexedDB
                        return window.PdfxStorage.fetchPdfAsArrayBuffer(url)
                            .then(pdfData => {
                                if (!pdfData) {
                                    throw new Error('No data received from fetchPdfAsArrayBuffer');
                                }

                                // Get last modified information if possible via HEAD request
                                return new Promise((resolve, reject) => {
                                    jQuery.ajax({
                                        type: "HEAD",
                                        url: url,
                                        timeout: 3000, // 3 second timeout
                                        success: function(data, textStatus, xhr) {
                                            const lastModified = xhr.getResponseHeader('Last-Modified') || '';
                                            metadata.lastModified = lastModified;

                                            // Store PDF in IndexedDB
                                            window.PdfxStorage.storePdf(url, pdfData, metadata)
                                                .then(() => resolve(pdfData))
                                                .catch(error => {
                                                    resolve(pdfData); // Continue even if storage fails
                                                });
                                        },
                                        error: function() {
                                            // Continue without last-modified date
                                            window.PdfxStorage.storePdf(url, pdfData, metadata)
                                                .then(() => resolve(pdfData))
                                                .catch(error => {
                                                    resolve(pdfData); // Continue even if storage fails
                                                });
                                        }
                                    });
                                });
                            })
                            .catch(error => {
                                // Fall back to direct loading
                                loadPdfFromUrl(url);
                                return null;
                            });
                    }
                })
                .then(pdfData => {
                    if (pdfData) {
                        try {
                            loadPdfFromData(pdfData);
                        } catch (error) {
                            // Fall back to direct loading
                            loadPdfFromUrl(url);
                        }
                    }
                })
                .catch(error => {
                    // Fall back to direct loading
                    loadPdfFromUrl(url);
                });
        } catch (error) {
            showError('Error initializing PDF: ' + error.message);

            // Fall back to direct loading
            const url = getSafePdfUrl();
            if (url) {
                loadPdfFromUrl(url);
            }
        }
    }

    // Load PDF directly from URL (fallback method)
    function loadPdfFromUrl(url) {
        // Test for potential CORS issues
        try {
            const pdfOrigin = new URL(url).origin;
            const pageOrigin = window.location.origin;
            const corsIssuesPossible = pdfOrigin !== pageOrigin;

            if (corsIssuesPossible) {
                // ⚠️ Warning: PDF is loaded from a different origin, CORS headers must be present on the server.
            }
        } catch (e) {
            // Ignore CORS check for now
        }

        // Store debug info but don't show the panel
        var debugElement = jq('.pdf-debug');
        if (debugElement.length) {
            jq('.pdf-url-debug').text(url);
        }

        // Create a loading task with more detailed options

        // Check if we're using PDF.js v5+ which uses the PDF namespace
        const pdfLib = window.pdfjsLib || window.pdf;

        if (!pdfLib) {
            showError('PDF.js library not available. Please refresh the page.');
            return;
        }

        // Determine which API to use based on available functions
        const getDocumentFn = pdfLib.getDocument || (pdfLib.PDFDocumentLoadingTask && pdfLib.PDFDocumentLoadingTask.prototype.getDocument);

        if (!getDocumentFn) {
            showError('PDF.js API not available. Please refresh the page.');
            return;
        }

        let loadingTask;

        try {
            // For PDF.js 5.x
            if (pdfLib.PDFDocumentLoadingTask) {
                loadingTask = new pdfLib.PDFDocumentLoadingTask();
                loadingTask.docId = url;
            }
            // For PDF.js 2.x and 3.x
            else if (pdfLib.getDocument) {
                loadingTask = pdfLib.getDocument({
                    url: url,
                    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.0.375/cmaps/',
                    cMapPacked: true,
                    disableRange: false,
                    disableStream: false,
                    disableAutoFetch: false
                });
            } else {
                showError('Unsupported PDF.js API version. Please contact your course administrator.');
                return;
            }
        } catch (err) {
            showError('Error initializing PDF loader: ' + err.message);
            return;
        }

        // Add progress handler if available
        if (loadingTask.onProgress) {
            loadingTask.onProgress = function(progress) {
                if (progress.total > 0) {
                    jq('.loading-indicator').text('Loading PDF... ' + Math.round(progress.loaded / Math.max(progress.total, 1) * 100) + '%');
                }
            };
        }

        // Send a HEAD request to check if the PDF exists and is accessible
        jQuery.ajax({
            type: "HEAD",
            url: url,
            success: function(data, textStatus, xhr) {
                // Continue loading with PDF.js
                continuePdfLoading(loadingTask);
            },
            error: function(xhr, textStatus, error) {
                // Try loading with PDF.js anyway
                continuePdfLoading(loadingTask);
            }
        });
    }

    // Load PDF from ArrayBuffer data
    function loadPdfFromData(pdfData) {
        // Check if we're using PDF.js v5+ which uses the PDF namespace
        const pdfLib = window.pdfjsLib || window.pdf;

        if (!pdfLib) {
            showError('PDF.js library not available. Please refresh the page.');
            return;
        }

        // Create loading task
        let loadingTask;

        try {
            // For PDF.js 5.x
            if (pdfLib.PDFDocumentLoadingTask) {
                loadingTask = new pdfLib.PDFDocumentLoadingTask();
                loadingTask.docId = 'data';

                // Directly load data for newer PDF.js versions
                loadingTask.data = pdfData;
            }
            // For PDF.js 2.x and 3.x
            else if (pdfLib.getDocument) {
                loadingTask = pdfLib.getDocument({
                    data: pdfData,
                    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.0.375/cmaps/',
                    cMapPacked: true
                });
            } else {
                showError('Unsupported PDF.js API version. Please contact your course administrator.');
                return;
            }
        } catch (err) {
            showError('Error initializing PDF loader: ' + err.message);
            return;
        }

        // Add progress handler if available
        if (loadingTask.onProgress) {
            loadingTask.onProgress = function(progress) {
            };
        }

        // Continue with standard loading process
        continuePdfLoading(loadingTask);
    }

    // Continue PDF loading after HEAD request check
    function continuePdfLoading(loadingTask) {
        // Use promise to load the PDF
        loadingTask.promise.then(function(pdf) {
            pdfDoc = pdf;

            // Update page counter
            jq('#page-count-' + blockId).text(pdf.numPages);

            // Set initial zoom to 'auto' so it will be calculated properly
            currentZoom = 'auto';

            // First render with default settings
            renderPage(currentPage);

            // Hide loading indicator
            jq('.loading-indicator').hide();
        }).catch(function(error) {
            showError('Failed to load PDF: ' + error.message);

            // Add more details for debugging
            if (error.name === 'MissingPDFException') {
                showError('PDF file not found. The URL may be incorrect or the file has been moved.');
            } else if (error.name === 'InvalidPDFException') {
                showError('The PDF file appears to be invalid or corrupted.');
            } else if (error.name === 'UnexpectedResponseException') {
                showError('Unexpected response from server: ' + error.status);
            } else if (error.name === 'UnknownErrorException') {
                showError('An unknown error occurred while loading the PDF: ' + error.message);
            }
        });
    }

    // Render a specific page
    function renderPage(pageNum) {
        if (!pdfDoc) {
            return;
        }

        if (pageNum < 1 || pageNum > pdfDoc.numPages) {
            return;
        }

        // Update current page
        currentPage = pageNum;
        jq('#page-num-' + blockId).text(pageNum);

        // First reset scroll position of pdf-viewer to ensure proper rendering position
        var pdfViewer = element.querySelector('.pdf-viewer');
        if (pdfViewer) {
            pdfViewer.scrollTop = 0;
        }

        // Dispatch page change event early, so drawing tools can prepare
        if (typeof CustomEvent === 'function') {
            const beforePageChangeEvent = new CustomEvent('pdfx:beforepagechange', {
                detail: {
                    blockId: blockId,
                    pageNum: pageNum,
                    previousPage: currentPage !== pageNum ? currentPage : null
                },
                bubbles: true,
                cancelable: false
            });
            document.dispatchEvent(beforePageChangeEvent);
            console.debug(`[PdfX Debug] Dispatched pdfx:beforepagechange event for block ${blockId}, page ${pageNum}`);
        }

        // Get the page
        pdfDoc.getPage(pageNum).then(function(page) {
            // Get viewport with initial scale
            var viewport = page.getViewport({ scale: 1.0 });

            // Get canvas and drawing container
            pdfCanvas = document.getElementById('pdf-canvas-' + blockId);
            var drawContainer = document.getElementById('draw-container-' + blockId);
            var pdfContainer = document.getElementById('pdf-container-' + blockId);
            var pdfViewer = element.querySelector('.pdf-viewer');

            if (!pdfCanvas || !pdfContainer || !pdfViewer) {
                return;
            }

            var context = pdfCanvas.getContext('2d');

            // Save original dimensions if this is the first time
            if (pageNum === 1 || !pdfOriginalWidth) {
                pdfOriginalWidth = viewport.width;
                pdfOriginalHeight = viewport.height;

                // Detect orientation
                if (pdfOriginalWidth > pdfOriginalHeight) {
                    jq('#page-orientation-' + blockId).text('Landscape');
                    jq('#pdf-container-' + blockId).addClass('landscape').removeClass('portrait');
                } else {
                    jq('#page-orientation-' + blockId).text('Portrait');
                    jq('#pdf-container-' + blockId).addClass('portrait').removeClass('landscape');
                }
            }

            // Calculate appropriate scale
            var viewerWidth = pdfViewer.clientWidth - 40; // Account for padding
            var viewerHeight = pdfViewer.clientHeight - 40;

            var containerWidth, containerHeight;

            // Apply zoom level
            if (currentZoom === 'auto' || !currentZoom) {
                // Calculate both fit-to-width and fit-to-page scales
                var fitWidthScale = viewerWidth / viewport.width;
                var fitHeightScale = viewerHeight / viewport.height;

                // Use fitWidthScale to make "fit to width" the default behavior
                currentZoom = fitWidthScale;

                // Update button states to reflect fit-to-width is active by default
                var fitToWidthBtn = document.getElementById('fit-to-width-' + blockId);
                var fitToPageBtn = document.getElementById('fit-to-page-' + blockId);
                if (fitToWidthBtn) fitToWidthBtn.classList.add('active');
                if (fitToPageBtn) fitToPageBtn.classList.remove('active');
            }

            // Create new viewport with the applied scale
            viewport = page.getViewport({ scale: currentZoom });

            // Set dimensions for container and canvas
            containerWidth = viewport.width;
            containerHeight = viewport.height;

            // Set canvas dimensions
            pdfCanvas.width = containerWidth;
            pdfCanvas.height = containerHeight;

            // Set container dimensions
            pdfContainer.style.width = containerWidth + 'px';
            pdfContainer.style.height = containerHeight + 'px';

            // Set drawing area dimensions
            if (drawContainer) {
                drawContainer.style.width = containerWidth + 'px';
                drawContainer.style.height = containerHeight + 'px';

                // Clear existing drawing canvas objects when changing pages
                // Access scribble instance if it exists and clear its canvas
                if (window[`scribbleInstance_${blockId}`]) {
                    const scribbleInstance = window[`scribbleInstance_${blockId}`];

                    // Update current page in the scribble instance
                    if (typeof scribbleInstance.setCurrentPage === 'function') {
                        console.debug(`[PdfX Debug] Updating scribble instance page to ${pageNum}`);
                        scribbleInstance.setCurrentPage(pageNum);
                    }
                }

                // Dispatch event that PDF is loaded and sized
                if (typeof CustomEvent === 'function') {
                    const pdfLoadedEvent = new CustomEvent('pdfViewer:loaded', {
                        detail: {
                            blockId: blockId,
                            width: containerWidth,
                            height: containerHeight,
                            page: pageNum
                        },
                        bubbles: true,
                        cancelable: true
                    });
                    document.dispatchEvent(pdfLoadedEvent);
                    console.debug(`[PdfX Debug] Dispatched pdfViewer:loaded event for block ${blockId} with dimensions ${containerWidth}x${containerHeight}`);
                }
            }

            // Apply current filter settings (brightness/grayscale)
            if (pdfContainer) {
                // Only apply filter to the canvas itself, not the entire container
                // This prevents the filter from affecting text rendering
                var filterValue = `brightness(${currentBrightness / 100})`;
                if (isGrayscale) {
                    filterValue += ' grayscale(100%)';
                }
                pdfCanvas.style.filter = filterValue;
                // Remove filter from the container if previously applied
                pdfContainer.style.filter = '';
            }

            // Hide the loading indicator
            jq('.loading-indicator').hide();

            // Render PDF page into canvas context
            var renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            var renderTask = page.render(renderContext);
            renderTask.promise.then(function() {
                // Ensure that the scroll position is at the top after rendering is complete
                if (pdfViewer) {
                    pdfViewer.scrollTop = 0;
                    // Also try to scroll any parent containers that might be scrollable
                    var viewerContainer = element.querySelector('.pdf-viewer-container');
                    var contentArea = element.querySelector('.content-area');
                    if (viewerContainer) viewerContainer.scrollTop = 0;
                    if (contentArea) contentArea.scrollTop = 0;
                }

                // Restore any annotations for this page
                restoreAnnotations(pageNum);
            }).catch(function(error) {
                showError('Failed to render page ' + pageNum + ': ' + error.message);
            });
        }).catch(function(error) {
            showError('Failed to get page ' + pageNum + ': ' + error.message);
        });
    }

    // Navigate to previous/next page
    function changePage(delta) {
        if (!pdfDoc) return;
        var newPage = currentPage + delta;
        if (newPage >= 1 && newPage <= pdfDoc.numPages) {
            renderPage(newPage);
        }
    }

    // Restore annotations for current page
    function restoreAnnotations(pageNum) {
        // Simple placeholder for now
    }

    // Save current state to server
    function saveToServer() {
        var data = {
            currentPage: currentPage,
            annotations: savedAnnotations,
            drawings: drawingStrokes,
            highlights: highlights,
            brightness: currentBrightness,
            isGrayscale: isGrayscale // Add grayscale state to saved data
        };

        jQuery.ajax({
            type: "POST",
            url: runtime.handlerUrl(element, 'save_annotations'),
            data: JSON.stringify(data),
            success: function(response) {
            },
            error: function(error) {
            }
        });
    }

    // Fit functions
    function fitToWidth() {
        try {
            if (!pdfDoc || !pdfOriginalWidth) {
                return;
            }

            // Get the container width
            var pdfViewer = element.querySelector('.pdf-viewer');
            if (!pdfViewer) {
                return;
            }

            // Update active button states
            var fitToWidthBtn = document.getElementById('fit-to-width-' + blockId);
            var fitToPageBtn = document.getElementById('fit-to-page-' + blockId);
            if (fitToWidthBtn) fitToWidthBtn.classList.add('active');
            if (fitToPageBtn) fitToPageBtn.classList.remove('active');

            // Get container width with margin
            var viewerWidth = pdfViewer.clientWidth - 40;

            // Calculate scale based on container width and page width
            currentZoom = viewerWidth / pdfOriginalWidth;

            // Update zoom display
            jq('#zoom-level-' + blockId).text(Math.round(currentZoom * 100) + '%');

            // Reset scroll position first
            pdfViewer.scrollTop = 0;
            var viewerContainer = element.querySelector('.pdf-viewer-container');
            var contentArea = element.querySelector('.content-area');
            if (viewerContainer) viewerContainer.scrollTop = 0;
            if (contentArea) contentArea.scrollTop = 0;

            // Re-render the page with new zoom
            renderPage(currentPage);

            // Apply scroll reset again after rendering with a longer timeout to ensure it takes effect
            setTimeout(function() {
                pdfViewer.scrollTop = 0;
                var viewerContainer = element.querySelector('.pdf-viewer-container');
                var contentArea = element.querySelector('.content-area');
                if (viewerContainer) viewerContainer.scrollTop = 0;
                if (contentArea) contentArea.scrollTop = 0;
            }, 200);
        } catch (error) {
            // If fit to width fails, at least make sure the PDF is rendered with default zoom
            if (!pdfDoc) {
                return;
            }
            renderPage(currentPage);
        }
    }

    function fitToPage() {
        try {
            if (!pdfDoc || !pdfOriginalWidth || !pdfOriginalHeight) {
                return;
            }

            // Get the container dimensions
            var pdfViewer = element.querySelector('.pdf-viewer');
            if (!pdfViewer) {
                return;
            }

            // Update active button states
            var fitToWidthBtn = document.getElementById('fit-to-width-' + blockId);
            var fitToPageBtn = document.getElementById('fit-to-page-' + blockId);
            if (fitToWidthBtn) fitToWidthBtn.classList.remove('active');
            if (fitToPageBtn) fitToPageBtn.classList.add('active');

            // Get container dimensions with margin
            var viewerWidth = pdfViewer.clientWidth - 40;
            var viewerHeight = pdfViewer.clientHeight - 40;

            // Calculate scale based on both width and height to fit the page
            var scaleX = viewerWidth / pdfOriginalWidth;
            var scaleY = viewerHeight / pdfOriginalHeight;

            // Use the smaller scale to ensure the entire page fits
            currentZoom = Math.min(scaleX, scaleY);

            // Update zoom display
            jq('#zoom-level-' + blockId).text(Math.round(currentZoom * 100) + '%');

            // Reset scroll position first
            pdfViewer.scrollTop = 0;
            var viewerContainer = element.querySelector('.pdf-viewer-container');
            var contentArea = element.querySelector('.content-area');
            if (viewerContainer) viewerContainer.scrollTop = 0;
            if (contentArea) contentArea.scrollTop = 0;

            // Re-render the page with new zoom
            renderPage(currentPage);

            // Apply scroll reset again after rendering with a longer timeout to ensure it takes effect
            setTimeout(function() {
                pdfViewer.scrollTop = 0;
                var viewerContainer = element.querySelector('.pdf-viewer-container');
                var contentArea = element.querySelector('.content-area');
                if (viewerContainer) viewerContainer.scrollTop = 0;
                if (contentArea) contentArea.scrollTop = 0;
            }, 200);
        } catch (error) {
            // If fit to page fails, at least make sure the PDF is rendered with default zoom
            if (!pdfDoc) {
                return;
            }
            renderPage(currentPage);
        }
    }

    function toggleFullscreen() {
        // Get the container element - the specific block container, not all blocks
        var container = document.querySelector('.pdfx_block#pdfx-block-' + blockId);
        if (!container) return;

        // Check if already in fullscreen
        var isFullscreen = container.classList.contains('fullscreen');

        if (isFullscreen) {
            // Exit fullscreen - this will trigger our fullscreenchange event handler
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }

            // The rest of the cleanup will be handled by our fullscreenchange event listener
        } else {
            // Before entering fullscreen, store current state
            currentZoomBeforeFullscreen = currentZoom;

            // Make sure only this block is visible in fullscreen mode
            document.querySelectorAll('.pdfx_block').forEach(function(block) {
                if (block.id !== 'pdfx-block-' + blockId) {
                    block.style.display = 'none';
                }
            });

            // Enter fullscreen
            container.classList.add('fullscreen');

            // Try to use browser fullscreen API
            try {
                if (container.requestFullscreen) {
                    container.requestFullscreen();
                } else if (container.mozRequestFullScreen) {
                    container.mozRequestFullScreen();
                } else if (container.webkitRequestFullscreen) {
                    container.webkitRequestFullscreen();
                } else if (container.msRequestFullscreen) {
                    container.msRequestFullscreen();
                }
            } catch (e) {
                // Ignore browser fullscreen API for now
            }

            // Update button appearance
            var fullscreenBtn = document.getElementById('fullscreen-btn-' + blockId);
            if (fullscreenBtn) {
                fullscreenBtn.classList.add('active');
            }

            // Apply fit to page when entering fullscreen
            // Wait a moment for the transition to complete before re-rendering
            setTimeout(function() {
                fitToPage();
            }, 300);
        }
    }

    // Toggle grayscale mode
    function toggleGrayscale() {
        isGrayscale = !isGrayscale;

        // Use block-specific selectors to ensure we only modify this instance
        var button = document.getElementById('grayscale-toggle-' + blockId);
        var pdfCanvas = document.getElementById('pdf-canvas-' + blockId);

        if (isGrayscale) {
            if (button) button.classList.add('active');
            if (pdfCanvas) pdfCanvas.style.filter = `brightness(${currentBrightness / 100}) grayscale(100%)`;
        } else {
            if (button) button.classList.remove('active');
            if (pdfCanvas) pdfCanvas.style.filter = `brightness(${currentBrightness / 100})`;
        }

        // Save state to server if needed (not in studio)
        if (!isStudio) {
            saveToServer();
        }

        return isGrayscale;
    }

    // Initialize event listeners
    function initEventListeners() {
        // Fullscreen change event listener to handle Escape key exits
        function handleFullscreenChange() {
            // Check if we're no longer in fullscreen mode
            if (!document.fullscreenElement &&
                !document.webkitFullscreenElement &&
                !document.mozFullScreenElement &&
                !document.msFullscreenElement) {

                var container = document.querySelector('.pdfx_block#pdfx-block-' + blockId);
                if (container && container.classList.contains('fullscreen')) {
                    // Remove the fullscreen class
                    container.classList.remove('fullscreen');

                    // Update button appearance
                    var fullscreenBtn = document.getElementById('fullscreen-btn-' + blockId);
                    if (fullscreenBtn) {
                        fullscreenBtn.classList.remove('active');
                    }

                    // Make sure other blocks are visible
                    document.querySelectorAll('.pdfx_block').forEach(function(block) {
                        block.style.display = '';
                    });

                    // Fix the height
                    container.style.height = '800px';

                    // Reset to original zoom (restore before fullscreen state)
                    if (typeof currentZoomBeforeFullscreen !== 'undefined') {
                        currentZoom = currentZoomBeforeFullscreen;

                        // Wait for the DOM to update after exiting fullscreen
                        setTimeout(function() {
                            renderPage(currentPage);
                        }, 300);
                    }
                }
            }
        }

        // Add various browser-specific fullscreen change event listeners
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        // Use jQuery to attach events for better browser compatibility
        var prevPageBtn = document.getElementById('prev-page-' + blockId);
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', function() {
                changePage(-1);
            });
        }

        var nextPageBtn = document.getElementById('next-page-' + blockId);
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', function() {
                changePage(1);
            });
        }

        var zoomInBtn = document.getElementById('zoom-in-' + blockId);
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', function() {
                currentZoom += 0.1;
                jq('#zoom-level-' + blockId).text(Math.round(currentZoom * 100) + '%');

                // Clear active state from fit buttons when manual zoom is used
                var fitToWidthBtn = document.getElementById('fit-to-width-' + blockId);
                var fitToPageBtn = document.getElementById('fit-to-page-' + blockId);
                if (fitToWidthBtn) fitToWidthBtn.classList.remove('active');
                if (fitToPageBtn) fitToPageBtn.classList.remove('active');

                // Reset scroll position first
                var pdfViewer = element.querySelector('.pdf-viewer');
                if (pdfViewer) {
                    pdfViewer.scrollTop = 0;
                    var viewerContainer = element.querySelector('.pdf-viewer-container');
                    var contentArea = element.querySelector('.content-area');
                    if (viewerContainer) viewerContainer.scrollTop = 0;
                    if (contentArea) contentArea.scrollTop = 0;
                }

                renderPage(currentPage);

                // Reset scroll position again after rendering
                setTimeout(function() {
                    if (pdfViewer) {
                        pdfViewer.scrollTop = 0;
                    }
                }, 200);
            });
        }

        var zoomOutBtn = document.getElementById('zoom-out-' + blockId);
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', function() {
                currentZoom = Math.max(0.1, currentZoom - 0.1);
                jq('#zoom-level-' + blockId).text(Math.round(currentZoom * 100) + '%');

                // Clear active state from fit buttons when manual zoom is used
                var fitToWidthBtn = document.getElementById('fit-to-width-' + blockId);
                var fitToPageBtn = document.getElementById('fit-to-page-' + blockId);
                if (fitToWidthBtn) fitToWidthBtn.classList.remove('active');
                if (fitToPageBtn) fitToPageBtn.classList.remove('active');

                // Reset scroll position first
                var pdfViewer = element.querySelector('.pdf-viewer');
                if (pdfViewer) {
                    pdfViewer.scrollTop = 0;
                    var viewerContainer = element.querySelector('.pdf-viewer-container');
                    var contentArea = element.querySelector('.content-area');
                    if (viewerContainer) viewerContainer.scrollTop = 0;
                    if (contentArea) contentArea.scrollTop = 0;
                }

                renderPage(currentPage);

                // Reset scroll position again after rendering
                setTimeout(function() {
                    if (pdfViewer) {
                        pdfViewer.scrollTop = 0;
                    }
                }, 200);
            });
        }

        var grayscaleBtn = document.getElementById('grayscale-toggle-' + blockId);
        if (grayscaleBtn) {
            grayscaleBtn.addEventListener('click', toggleGrayscale);
        }

        var fitToWidthBtn = document.getElementById('fit-to-width-' + blockId);
        if (fitToWidthBtn) {
            fitToWidthBtn.addEventListener('click', fitToWidth);
        }

        var fitToPageBtn = document.getElementById('fit-to-page-' + blockId);
        if (fitToPageBtn) {
            fitToPageBtn.addEventListener('click', fitToPage);
        }

        var fullscreenBtn = document.getElementById('fullscreen-btn-' + blockId);
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', toggleFullscreen);
        }

        // Download button
        var downloadBtn = document.getElementById('download-tool-' + blockId);
        if (downloadBtn) {
            if (allowDownload) {
                downloadBtn.style.display = 'inline-block';
                downloadBtn.addEventListener('click', function() {
                    var url = getSafePdfUrl();
                    if (!url) {
                        return;
                    }
                    window.open(url, '_blank');
                });
            } else {
                downloadBtn.style.display = 'none';
            }
        }

        // Debug buttons - using jQuery for these since they're not critical to functionality
        jq('#toggle-debug').on('click', function() {
            jq('.pdf-debug').hide();
        });

        jq('#force-reload-' + blockId).on('click', function() {
            // Clear cached document if any
            pdfDoc = null;
            // Show loading indicator
            jq('.loading-indicator').show();
            jq('.pdf-error').hide();
            // Reload the PDF
            loadPDF();
        });

        jq('#direct-download-' + blockId).on('click', function() {
            var url = getSafePdfUrl();
            if (!url) {
                return;
            }
            window.open(url, '_blank');
        });

        jq('#check-canvas-' + blockId).on('click', function() {
            var canvas = document.getElementById('pdf-canvas-' + blockId);

            if (!canvas) {
                return;
            }

            try {
                var ctx = canvas.getContext('2d');
                if (!ctx) {
                    return;
                }

                // Draw a test pattern
                ctx.fillStyle = 'red';
                ctx.fillRect(10, 10, 50, 50);
                ctx.fillStyle = 'green';
                ctx.fillRect(70, 10, 50, 50);
                ctx.fillStyle = 'blue';
                ctx.fillRect(130, 10, 50, 50);
                ctx.font = '20px Arial';
                ctx.fillStyle = 'black';
                ctx.fillText('Canvas Test', 50, 100);
            } catch (e) {
            }
        });

        // Force strokes visibility button
        jq('#force-strokes-visibility-' + blockId).on('click', function() {
            try {
                // Get scribble instance
                var scribbleInstance = window['scribbleInstance_' + blockId];

                if (!scribbleInstance) {
                    return;
                }

                // Check if it has the force visibility method
                if (typeof scribbleInstance.forceStrokesVisibility !== 'function') {
                    return;
                }

                // Call the method
                var result = scribbleInstance.forceStrokesVisibility('#FF0000', 3);
            } catch (e) {
            }
        });

        jq('#toggle-cors-proxy-' + blockId).on('click', function() {
            // Get original URL
            var url = getSafePdfUrl();
            if (!url) return;

            // Public CORS proxies - be careful with these in production!
            var corsProxies = [
                'https://corsproxy.io/?',
                'https://cors-anywhere.herokuapp.com/'
            ];

            // Choose a proxy
            var proxyUrl = corsProxies[0] + encodeURIComponent(url);

            // Show loading indicator
            jq('.loading-indicator').show().text('Loading via CORS proxy...');
            jq('.pdf-error').hide();

            // Try loading with proxy
            try {
                // Clear any existing document
                pdfDoc = null;

                // Create a loading task with proxy URL
                var loadingTask = pdfjsLib.getDocument({
                    url: proxyUrl,
                    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.10.377/cmaps/',
                    cMapPacked: true
                });

                // Use promise to load the PDF
                loadingTask.promise.then(function(pdf) {
                    pdfDoc = pdf;

                    // Update UI
                    jq('#page-count-' + blockId).text(pdf.numPages);
                    jq('.pdf-url-debug').text(proxyUrl + ' (proxied)');

                    // Render first page
                    renderPage(currentPage);

                    // Hide loading indicator
                    jq('.loading-indicator').hide();
                }).catch(function(error) {
                    showError('Failed to load PDF via proxy: ' + error.message);
                });
            } catch (error) {
                showError('Error initializing proxy PDF: ' + error.message);
            }
        });
    }

    // Initialize the XBlock
    function init() {
        try {
            // Expose loadPDF function globally for debugging/refresh
            window['loadPDF_' + blockId] = loadPDF;

            // Hide debug panel by default
            var debugPanel = jq('.pdf-debug');
            if (debugPanel.length) {
                debugPanel.hide();
            }

            // Get saved settings from initArgs if available
            if (initArgs.isGrayscale !== undefined) {
                isGrayscale = initArgs.isGrayscale;

                // Activate button if grayscale is enabled
                if (isGrayscale) {
                    var button = document.getElementById('grayscale-toggle-' + blockId);
                    if (button) button.classList.add('active');
                }
            }

            if (initArgs.brightness !== undefined) {
                currentBrightness = initArgs.brightness;
            }

            // Check if PDF.js is available
            if (typeof pdfjsLib === 'undefined') {
                // Load PDF.js dynamically if not available
                var pdfJsScript = document.createElement('script');
                pdfJsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.min.mjs';
                pdfJsScript.type = 'module';
                pdfJsScript.async = true;
                pdfJsScript.onload = function() {
                    // Now load the worker
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs';

                    // Continue initialization
                    initEventListeners();
                    loadPDF();
                };

                pdfJsScript.onerror = function() {
                    showError('Failed to load PDF.js library. Please refresh the page or try a different browser.');
                };

                document.head.appendChild(pdfJsScript);
            } else {
                // PDF.js is already loaded, continuing with initialization
                initEventListeners();
                loadPDF();
            }
        } catch (error) {
            if (error.stack) {
                // Log stack trace
            }
            showError('Error initializing PDF viewer: ' + error.message);
        }
    }

    // Start initialization when document is ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 1);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

    // Return an empty object (required by XBlock pattern)
    return {};
}

// Function to navigate to a specific page
function navigateToPage(pageNum, blockId) {
    // Get PDF document
    var pdfDoc = window.pdfDocumentMap[blockId];

    // Validate page number
    if (!pdfDoc) {
        return Promise.reject(new Error('No PDF document loaded'));
    }

    if (pageNum < 1) {
        pageNum = 1;
    } else if (pageNum > pdfDoc.numPages) {
        pageNum = pdfDoc.numPages;
    }

    // Update instance current page if using modular approach
    var instance = window[`pdfxInstance_${blockId}`];
    if (instance && instance.core) {
        instance.core.currentPage = pageNum;
    }

    // Update global state
    window.currentPageMap[blockId] = pageNum;

    // Update UI
    $('#page-num-' + blockId).text(pageNum);

    // Get the page rendering canvas
    var canvas = document.getElementById('pdf-canvas-' + blockId);
    var ctx = canvas.getContext('2d');

    // Get page
    return pdfDoc.getPage(pageNum).then(function(page) {
        // Fire event before rendering
        const beforeRenderEvent = new CustomEvent('pdfx:beforerenderpage', {
            detail: {
                blockId: blockId,
                page: page,
                pageNum: pageNum
            }
        });
        document.dispatchEvent(beforeRenderEvent);

        // Calculate viewport
        var viewport = getViewportForPage(page, blockId);

        // Prepare canvas for rendering
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Update container dimensions
        var pdfContainer = document.getElementById('pdf-container-' + blockId);
        if (pdfContainer) {
            pdfContainer.style.width = viewport.width + 'px';
            pdfContainer.style.height = viewport.height + 'px';
        }

        // Update text layer dimensions
        var textLayer = document.getElementById('text-layer-' + blockId);
        if (textLayer) {
            textLayer.style.width = viewport.width + 'px';
            textLayer.style.height = viewport.height + 'px';

            // Clear any existing content
            textLayer.innerHTML = '';
        }

        // Update draw container dimensions
        var drawContainer = document.getElementById('draw-container-' + blockId);
        if (drawContainer) {
            drawContainer.style.width = viewport.width + 'px';
            drawContainer.style.height = viewport.height + 'px';
        }

        // Fix canvas container dimensions
        if (typeof fixCanvasContainerSize === 'function') {
            fixCanvasContainerSize(blockId);
        }

        // Render the page
        var renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };

        return page.render(renderContext).then(function() {
            // Apply filters
            applyFilters(blockId);

            // If we have a text layer, populate it
            if (textLayer) {
                return populateTextLayer(page, viewport, textLayer, blockId);
            }

            return Promise.resolve();
        }).then(function() {
            // Update the scribble instance's current page if it exists
            var scribbleInstance = window[`scribbleInstance_${blockId}`];
            if (scribbleInstance && typeof scribbleInstance.setCurrentPage === 'function') {
                scribbleInstance.setCurrentPage(pageNum);
            }

            // Update highlight instance if it exists
            var highlightInstance = window[`highlightInstance_${blockId}`];
            if (highlightInstance && typeof highlightInstance.setCurrentPage === 'function') {
                highlightInstance.setCurrentPage(pageNum);
            }

            // Update text, shape and note instances if they exist
            ['text', 'shape', 'note'].forEach(function(tool) {
                var instance = window[`${tool}Instance_${blockId}`];
                if (instance && typeof instance.setCurrentPage === 'function') {
                    instance.setCurrentPage(pageNum);
                }
            });

            // Fire event after rendering
            const afterRenderEvent = new CustomEvent('pdfx:afterrenderpage', {
                detail: {
                    blockId: blockId,
                    pageNum: pageNum
                }
            });
            document.dispatchEvent(afterRenderEvent);

            // Save the current page to the server
            saveCurrentPage(pageNum, blockId);

            return pageNum;
        });
    }).catch(function(error) {
        return Promise.reject(error);
    });
}

// Function to save the current page to the server
function saveCurrentPage(pageNum, blockId) {
    // Find handler URL in DOM data element
    const dataElement = document.getElementById(`pdfx-data-${blockId}`);
    if (!dataElement || !dataElement.dataset.handlerUrl) {
        return;
    }

    const handlerUrl = dataElement.dataset.handlerUrl;

    // Prepare data
    const saveData = {
        currentPage: pageNum
    };

    // Send to server
    $.ajax({
        url: handlerUrl,
        type: 'POST',
        data: JSON.stringify(saveData),
        contentType: 'application/json; charset=utf-8',
        dataType: 'json'
    }).then(function(result) {
    }).catch(function(error) {
    });
}