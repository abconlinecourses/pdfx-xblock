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
            console.error('Invalid selector type:', typeof selector);
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

    // Debug helper
    function debug(message) {
        if (window.console && console.log) {
            console.log('PDF XBlock (' + blockId + '): ' + message);

            // Add to debug logs container if available and not disabled
            var logsContainer = findElement('.debug-logs-container');
            if (logsContainer) {
                var timestamp = new Date().toLocaleTimeString();
                logsContainer.innerHTML += '<div>[' + timestamp + '] ' + message + '</div>';
                // Auto-scroll to bottom
                logsContainer.scrollTop = logsContainer.scrollHeight;
            }
        }
    }

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

        debug('Error: ' + message);
    }

    // Get safe PDF URL
    function getSafePdfUrl() {
        if (!pdfUrl) {
            debug('No PDF URL provided');
            return '';
        }

        // Debug the input URL
        debug('Original PDF URL: ' + pdfUrl);

        let url = pdfUrl;

        // Handle asset URLs (they might need special handling in Open edX)
        if (url.indexOf('asset-v1') !== -1) {
            // This is an Open edX asset URL
            debug('Detected Open edX asset URL');

            // Check if it's already absolute
            if (!(url.indexOf('http://') === 0 || url.indexOf('https://') === 0)) {
                // If it's a relative URL starting with a slash, we need to get the base URL
                if (url.charAt(0) === '/') {
                    // Try to get the base URL from window.location
                    const baseUrl = window.location.protocol + '//' + window.location.host;
                    url = baseUrl + url;
                    debug('Converted to absolute URL: ' + url);
                }
            }

            return url;
        } else if (url.charAt(0) === '/') {
            // Relative URL - convert to absolute
            const baseUrl = window.location.protocol + '//' + window.location.host;
            url = baseUrl + url;
            debug('Converted relative URL to absolute: ' + url);
            return url;
        } else if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
            // Already an absolute URL
            debug('URL is already absolute');
            return url;
        } else {
            // Add https:// if missing
            debug('Adding https:// to URL');
            return 'https://' + url;
        }
    }

    // Load the PDF
    function loadPDF() {
        try {
            debug('Starting PDF loading process');

            // Make sure PDF.js is available
            if (typeof pdfjsLib === 'undefined') {
                showError('PDF.js library not loaded. Please refresh the page or contact support.');
                debug('PDF.js library not available');
                return;
            }

            debug('PDF.js library is loaded. Version: ' + (pdfjsLib.version || 'unknown'));

            // Configure worker if needed
            if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                debug('Setting PDF.js worker source');
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
            }
            debug('PDF.js worker source: ' + pdfjsLib.GlobalWorkerOptions.workerSrc);

            const url = getSafePdfUrl();
            if (!url) {
                showError('No PDF URL provided');
                return;
            }

            debug('PDF URL: ' + url);

            // Check if PdfxStorage is available
            if (typeof window.PdfxStorage === 'undefined') {
                debug('PdfxStorage not available, falling back to direct loading');
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
                debug('Error getting courseId: ' + e.message + ', continuing without it');
                // Continue without courseId, it's not critical
            }

            debug('Checking if PDF exists in IndexedDB storage with metadata: ' + JSON.stringify(metadata));

            // Set a timeout to fall back to direct loading if IndexedDB is too slow or hangs
            const timeoutId = setTimeout(() => {
                debug('IndexedDB operation timed out, falling back to direct loading');
                loadPdfFromUrl(url);
            }, 3000); // 3 second timeout

            // Check if PDF exists in IndexedDB
            window.PdfxStorage.hasPdf(url, metadata)
                .then(exists => {
                    clearTimeout(timeoutId); // Clear the timeout as we got a response

                    if (exists) {
                        debug('PDF found in IndexedDB storage, loading from there');
                        return window.PdfxStorage.getPdf(url, metadata)
                            .catch(error => {
                                debug('Error retrieving PDF from IndexedDB: ' + error.message);
                                debug('Falling back to direct loading');
                                loadPdfFromUrl(url);
                                return null;
                            });
                    } else {
                        debug('PDF not found in IndexedDB storage, fetching from URL');
                        // Show loading indicator
                        jq('.loading-indicator').text('Loading PDF from server...');

                        // Fetch PDF from URL and store in IndexedDB
                        return window.PdfxStorage.fetchPdfAsArrayBuffer(url)
                            .then(pdfData => {
                                if (!pdfData) {
                                    throw new Error('No data received from fetchPdfAsArrayBuffer');
                                }

                                debug('PDF fetched from server, storing in IndexedDB');
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
                                                    debug('Error storing PDF in IndexedDB: ' + error.message);
                                                    resolve(pdfData); // Continue even if storage fails
                                                });
                                        },
                                        error: function() {
                                            // Continue without last-modified date
                                            window.PdfxStorage.storePdf(url, pdfData, metadata)
                                                .then(() => resolve(pdfData))
                                                .catch(error => {
                                                    debug('Error storing PDF in IndexedDB: ' + error.message);
                                                    resolve(pdfData); // Continue even if storage fails
                                                });
                                        }
                                    });
                                });
                            })
                            .catch(error => {
                                debug('Error fetching PDF: ' + error.message);
                                // Fall back to direct loading
                                loadPdfFromUrl(url);
                                return null;
                            });
                    }
                })
                .then(pdfData => {
                    if (pdfData) {
                        try {
                            debug('PDF data obtained, loading with PDF.js');
                            loadPdfFromData(pdfData);
                        } catch (error) {
                            debug('Error loading PDF from data: ' + error.message);
                            // Fall back to direct loading
                            loadPdfFromUrl(url);
                        }
                    }
                })
                .catch(error => {
                    clearTimeout(timeoutId); // Clear the timeout in case of an error
                    debug('Error in IndexedDB storage flow: ' + error.message);
                    // Fall back to direct loading
                    loadPdfFromUrl(url);
                });
        } catch (error) {
            debug('Error during PDF initialization: ' + error.message);
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
        debug('Loading PDF directly from URL: ' + url);

        // Test for potential CORS issues
        debug('Checking if URL might have CORS issues...');
        try {
            const pdfOrigin = new URL(url).origin;
            const pageOrigin = window.location.origin;
            const corsIssuesPossible = pdfOrigin !== pageOrigin;
            debug('PDF origin: ' + pdfOrigin + ', Page origin: ' + pageOrigin);
            debug('Cross-origin request: ' + (corsIssuesPossible ? 'Yes (CORS needed)' : 'No (same origin)'));

            if (corsIssuesPossible) {
                debug('⚠️ Warning: PDF is loaded from a different origin, CORS headers must be present on the server.');
            }
        } catch (e) {
            debug('Error checking CORS: ' + e.message);
        }

        // Store debug info but don't show the panel
        var debugElement = jq('.pdf-debug');
        if (debugElement.length) {
            jq('.pdf-url-debug').text(url);
        }

        // Create a loading task with more detailed options
        debug('Creating PDF.js loading task');

        // Check if we're using PDF.js v5+ which uses the PDF namespace
        const pdfLib = window.pdfjsLib || window.pdf;

        if (!pdfLib) {
            debug('Error: PDF.js library not available');
            showError('PDF.js library not available. Please refresh the page.');
            return;
        }

        // Determine which API to use based on available functions
        const getDocumentFn = pdfLib.getDocument || (pdfLib.PDFDocumentLoadingTask && pdfLib.PDFDocumentLoadingTask.prototype.getDocument);

        if (!getDocumentFn) {
            debug('Error: PDF.js getDocument function not available');
            showError('PDF.js API not available. Please refresh the page.');
            return;
        }

        let loadingTask;

        try {
            // For PDF.js 5.x
            if (pdfLib.PDFDocumentLoadingTask) {
                loadingTask = new pdfLib.PDFDocumentLoadingTask();
                loadingTask.docId = url;
                debug('Using PDF.js 5.x API');
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
                debug('Using PDF.js 2.x/3.x API');
            } else {
                debug('Error: Could not determine PDF.js API version');
                showError('Unsupported PDF.js API version. Please contact your course administrator.');
                return;
            }
        } catch (err) {
            debug('Error creating PDF loading task: ' + err.message);
            showError('Error initializing PDF loader: ' + err.message);
            return;
        }

        // Add progress handler if available
        if (loadingTask.onProgress) {
            loadingTask.onProgress = function(progress) {
                debug('PDF loading progress: ' +
                      Math.round(progress.loaded / Math.max(progress.total, 1) * 100) + '%' +
                      ' (' + progress.loaded + ' of ' + (progress.total || 'unknown') + ' bytes)');

                if (progress.total > 0) {
                    const percent = Math.round(progress.loaded / progress.total * 100);
                    jq('.loading-indicator').text('Loading PDF... ' + percent + '%');
                }
            };
        }

        // Send a HEAD request to check if the PDF exists and is accessible
        debug('Sending HEAD request to verify PDF accessibility');
        jQuery.ajax({
            type: "HEAD",
            url: url,
            success: function(data, textStatus, xhr) {
                debug('HEAD request successful: ' + xhr.status);
                debug('Content-Type: ' + xhr.getResponseHeader('Content-Type'));
                debug('Content-Length: ' + xhr.getResponseHeader('Content-Length'));
                // Continue loading with PDF.js
                continuePdfLoading(loadingTask);
            },
            error: function(xhr, textStatus, error) {
                debug('HEAD request failed: ' + xhr.status + ' - ' + error);
                // Try loading with PDF.js anyway
                debug('Continuing PDF loading despite HEAD request failure');
                continuePdfLoading(loadingTask);
            }
        });
    }

    // Load PDF from ArrayBuffer data
    function loadPdfFromData(pdfData) {
        debug('Loading PDF from ArrayBuffer data');

        // Check if we're using PDF.js v5+ which uses the PDF namespace
        const pdfLib = window.pdfjsLib || window.pdf;

        if (!pdfLib) {
            debug('Error: PDF.js library not available');
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
                debug('Using PDF.js 5.x API for data loading');
            }
            // For PDF.js 2.x and 3.x
            else if (pdfLib.getDocument) {
                loadingTask = pdfLib.getDocument({
                    data: pdfData,
                    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.0.375/cmaps/',
                    cMapPacked: true
                });
                debug('Using PDF.js 2.x/3.x API for data loading');
            } else {
                debug('Error: Could not determine PDF.js API version');
                showError('Unsupported PDF.js API version. Please contact your course administrator.');
                return;
            }
        } catch (err) {
            debug('Error creating PDF loading task for data: ' + err.message);
            showError('Error initializing PDF loader: ' + err.message);
            return;
        }

        // Add progress handler if available
        if (loadingTask.onProgress) {
            loadingTask.onProgress = function(progress) {
                debug('PDF loading progress: ' +
                     Math.round(progress.loaded / Math.max(progress.total, 1) * 100) + '%');
            };
        }

        // Continue with standard loading process
        continuePdfLoading(loadingTask);
    }

    // Continue PDF loading after HEAD request check
    function continuePdfLoading(loadingTask) {
        debug('Continuing with PDF.js loading process');

        // Use promise to load the PDF
        loadingTask.promise.then(function(pdf) {
            debug('PDF document loaded successfully - Object type: ' + (typeof pdf));
            debug('PDF ID: ' + pdf.fingerprint);
            debug('Number of pages: ' + pdf.numPages);

            // Verify the PDF object has the expected properties
            if (!pdf.numPages || typeof pdf.getPage !== 'function') {
                debug('WARNING: PDF object does not appear to be valid');
                showError('The loaded PDF object appears to be invalid');
                return;
            }

            pdfDoc = pdf;

            // Update page counter
            jq('#page-count-' + blockId).text(pdf.numPages);

            // Set initial zoom to 'auto' so it will be calculated properly
            currentZoom = 'auto';

            // First render with default settings
            debug('Proceeding to render page ' + currentPage);
            renderPage(currentPage);

            // Hide loading indicator
            jq('.loading-indicator').hide();
        }).catch(function(error) {
            debug('Error loading PDF: ' + error.message);
            showError('Failed to load PDF: ' + error.message);

            // Add more details for debugging
            if (error.name === 'MissingPDFException') {
                debug('PDF file not found at URL: ' + getSafePdfUrl());
                showError('PDF file not found. The URL may be incorrect or the file has been moved.');
            } else if (error.name === 'InvalidPDFException') {
                debug('Invalid or corrupted PDF file');
                showError('The PDF file appears to be invalid or corrupted.');
            } else if (error.name === 'UnexpectedResponseException') {
                debug('Unexpected server response: ' + error.status);
                showError('Unexpected response from server: ' + error.status);
            } else if (error.name === 'UnknownErrorException') {
                debug('Unknown error occurred during PDF loading');
                showError('An unknown error occurred while loading the PDF: ' + error.message);
            }
        });
    }

    // Render a specific page
    function renderPage(pageNum) {
        if (!pdfDoc) {
            debug('No PDF document loaded');
            return;
        }

        if (pageNum < 1 || pageNum > pdfDoc.numPages) {
            debug('Page number out of range: ' + pageNum);
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

        // Get the page
        pdfDoc.getPage(pageNum).then(function(page) {
            debug('Rendering page ' + pageNum);

            // Get viewport with initial scale
            var viewport = page.getViewport({ scale: 1.0 });

            // Get canvas and drawing container
            pdfCanvas = document.getElementById('pdf-canvas-' + blockId);
            var drawContainer = document.getElementById('draw-container-' + blockId);
            var pdfContainer = document.getElementById('pdf-container-' + blockId);
            var pdfViewer = element.querySelector('.pdf-viewer');

            if (!pdfCanvas || !pdfContainer || !pdfViewer) {
                debug('Required elements not found');
                return;
            }

            var context = pdfCanvas.getContext('2d');

            // Save original dimensions if this is the first time
            if (pageNum === 1 || !pdfOriginalWidth) {
                pdfOriginalWidth = viewport.width;
                pdfOriginalHeight = viewport.height;
                debug('Original PDF dimensions: ' + pdfOriginalWidth + 'x' + pdfOriginalHeight);

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

                debug('Auto-scaled to fit width: ' + currentZoom.toFixed(2));
                jq('#zoom-level-' + blockId).text(Math.round(currentZoom * 100) + '%');

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
                debug('Page ' + pageNum + ' rendered successfully');

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
                debug('Error rendering page ' + pageNum + ': ' + error);
                showError('Failed to render page ' + pageNum + ': ' + error.message);
            });
        }).catch(function(error) {
            debug('Error getting page ' + pageNum + ': ' + error);
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
        debug('Would restore annotations for page ' + pageNum);
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
                debug("Saved to server successfully");
            },
            error: function(error) {
                debug("Error saving to server: " + error);
            }
        });
    }

    // Fit functions
    function fitToWidth() {
        try {
            debug('Fit to width requested');

            if (!pdfDoc || !pdfOriginalWidth) {
                debug('Cannot fit to width: PDF document or width not available');
                return;
            }

            // Get the container width
            var pdfViewer = element.querySelector('.pdf-viewer');
            if (!pdfViewer) {
                debug('Cannot fit to width: PDF viewer element not found');
                return;
            }

            // Update active button states
            var fitToWidthBtn = document.getElementById('fit-to-width-' + blockId);
            var fitToPageBtn = document.getElementById('fit-to-page-' + blockId);
            if (fitToWidthBtn) fitToWidthBtn.classList.add('active');
            if (fitToPageBtn) fitToPageBtn.classList.remove('active');

            // Get container width with margin
            var viewerWidth = pdfViewer.clientWidth - 40;

            debug('Viewer width for fit-to-width: ' + viewerWidth);
            debug('PDF width for fit-to-width: ' + pdfOriginalWidth);

            // Calculate scale based on container width and page width
            currentZoom = viewerWidth / pdfOriginalWidth;
            debug('Fit to width scale: ' + currentZoom.toFixed(2));

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
                debug('Scroll position reset after fit to width');
                // Also try to scroll any parent containers that might be scrollable
                var viewerContainer = element.querySelector('.pdf-viewer-container');
                var contentArea = element.querySelector('.content-area');
                if (viewerContainer) viewerContainer.scrollTop = 0;
                if (contentArea) contentArea.scrollTop = 0;
            }, 200);
        } catch (error) {
            debug('Error in fitToWidth: ' + error.message);
            // If fit to width fails, at least make sure the PDF is rendered with default zoom
            if (!pdfDoc) {
                debug('No PDF document available for rendering after fitToWidth error');
                return;
            }
            renderPage(currentPage);
        }
    }

    function fitToPage() {
        try {
            debug('Fit to page requested');

            if (!pdfDoc || !pdfOriginalWidth || !pdfOriginalHeight) {
                debug('Cannot fit to page: PDF document or dimensions not available');
                return;
            }

            // Get the container dimensions
            var pdfViewer = element.querySelector('.pdf-viewer');
            if (!pdfViewer) {
                debug('Cannot fit to page: PDF viewer element not found');
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

            debug('Viewer dimensions for fit-to-page: ' + viewerWidth + 'x' + viewerHeight);
            debug('PDF dimensions for fit-to-page: ' + pdfOriginalWidth + 'x' + pdfOriginalHeight);

            // Calculate scale based on both width and height to fit the page
            var scaleX = viewerWidth / pdfOriginalWidth;
            var scaleY = viewerHeight / pdfOriginalHeight;

            // Use the smaller scale to ensure the entire page fits
            currentZoom = Math.min(scaleX, scaleY);
            debug('Fit to page scale: ' + currentZoom.toFixed(2));

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
                debug('Scroll position reset after fit to page');
                // Also try to scroll any parent containers that might be scrollable
                var viewerContainer = element.querySelector('.pdf-viewer-container');
                var contentArea = element.querySelector('.content-area');
                if (viewerContainer) viewerContainer.scrollTop = 0;
                if (contentArea) contentArea.scrollTop = 0;
            }, 200);
        } catch (error) {
            debug('Error in fitToPage: ' + error.message);
            // If fit to page fails, at least make sure the PDF is rendered with default zoom
            if (!pdfDoc) {
                debug('No PDF document available for rendering after fitToPage error');
                return;
            }
            renderPage(currentPage);
        }
    }

    function toggleFullscreen() {
        debug('Toggle fullscreen requested');

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
                debug('Browser fullscreen API not supported, using CSS fullscreen: ' + e.message);
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
        debug('Toggling grayscale mode: ' + isGrayscale);

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
        debug('Initializing event listeners with block ID: ' + blockId);

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
                debug('Zoom in clicked, current zoom: ' + currentZoom);
                currentZoom += 0.1;
                debug('New zoom level: ' + currentZoom);
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
                        debug('Scroll position reset after zoom in');
                        var viewerContainer = element.querySelector('.pdf-viewer-container');
                        var contentArea = element.querySelector('.content-area');
                        if (viewerContainer) viewerContainer.scrollTop = 0;
                        if (contentArea) contentArea.scrollTop = 0;
                    }
                }, 200);
            });
        }

        var zoomOutBtn = document.getElementById('zoom-out-' + blockId);
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', function() {
                debug('Zoom out clicked, current zoom: ' + currentZoom);
                currentZoom = Math.max(0.1, currentZoom - 0.1);
                debug('New zoom level: ' + currentZoom);
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
                        debug('Scroll position reset after zoom out');
                        var viewerContainer = element.querySelector('.pdf-viewer-container');
                        var contentArea = element.querySelector('.content-area');
                        if (viewerContainer) viewerContainer.scrollTop = 0;
                        if (contentArea) contentArea.scrollTop = 0;
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
                        debug('No URL available for download');
                        return;
                    }
                    debug('Downloading PDF: ' + url);
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
            debug('Force reloading PDF...');
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
                debug('No URL available for direct download');
                return;
            }
            debug('Opening PDF in new tab: ' + url);
            window.open(url, '_blank');
        });

        jq('#check-canvas-' + blockId).on('click', function() {
            debug('Checking canvas element...');
            var canvas = document.getElementById('pdf-canvas-' + blockId);

            if (!canvas) {
                debug('ERROR: Canvas element not found');
                return;
            }

            debug('Canvas found: ' + canvas.id);
            debug('Canvas dimensions: ' + canvas.width + 'x' + canvas.height);
            debug('Style dimensions: ' + canvas.style.width + 'x' + canvas.style.height);
            debug('Offset dimensions: ' + canvas.offsetWidth + 'x' + canvas.offsetHeight);
            debug('Canvas is visible: ' + (canvas.offsetParent !== null));

            try {
                var ctx = canvas.getContext('2d');
                if (!ctx) {
                    debug('ERROR: Could not get 2D context from canvas');
                    return;
                }

                debug('Canvas context obtained');

                // Draw a test pattern
                debug('Drawing test pattern on canvas...');
                ctx.fillStyle = 'red';
                ctx.fillRect(10, 10, 50, 50);
                ctx.fillStyle = 'green';
                ctx.fillRect(70, 10, 50, 50);
                ctx.fillStyle = 'blue';
                ctx.fillRect(130, 10, 50, 50);
                ctx.font = '20px Arial';
                ctx.fillStyle = 'black';
                ctx.fillText('Canvas Test', 50, 100);

                debug('Test pattern drawn successfully');
            } catch (e) {
                debug('Error testing canvas: ' + e.message);
            }
        });

        jq('#toggle-cors-proxy-' + blockId).on('click', function() {
            debug('Trying with CORS proxy...');

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
            debug('Using proxy URL: ' + proxyUrl);

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
                    debug('PDF loaded via proxy with ' + pdf.numPages + ' pages');

                    // Update UI
                    jq('#page-count-' + blockId).text(pdf.numPages);
                    jq('.pdf-url-debug').text(proxyUrl + ' (proxied)');

                    // Render first page
                    renderPage(currentPage);

                    // Hide loading indicator
                    jq('.loading-indicator').hide();
                }).catch(function(error) {
                    debug('Error loading PDF via proxy: ' + error.message);
                    showError('Failed to load PDF via proxy: ' + error.message);
                });
            } catch (error) {
                debug('Error initializing proxy PDF: ' + error.message);
                showError('Error initializing proxy PDF: ' + error.message);
            }
        });
    }

    // Initialize the XBlock
    function init() {
        debug('Initializing PDF XBlock with ID: ' + blockId);

        // Log important environment details
        debug('User agent: ' + navigator.userAgent);
        debug('Window dimensions: ' + window.innerWidth + 'x' + window.innerHeight);

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
                debug('Restored grayscale state: ' + isGrayscale);

                // Activate button if grayscale is enabled
                if (isGrayscale) {
                    var button = document.getElementById('grayscale-toggle-' + blockId);
                    if (button) button.classList.add('active');
                }
            }

            if (initArgs.brightness !== undefined) {
                currentBrightness = initArgs.brightness;
                debug('Restored brightness: ' + currentBrightness);
            }

            // Check if PDF.js is available
            if (typeof pdfjsLib === 'undefined') {
                debug('PDF.js is not loaded, attempting to load it dynamically');

                // Load PDF.js dynamically if not available
                var pdfJsScript = document.createElement('script');
                pdfJsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.min.mjs';
                pdfJsScript.type = 'module';
                pdfJsScript.async = true;
                pdfJsScript.onload = function() {
                    debug('PDF.js loaded dynamically');

                    // Now load the worker
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs';

                    // Continue initialization
                    debug('Continuing initialization after PDF.js loaded');
                    initEventListeners();
                    loadPDF();
                };

                pdfJsScript.onerror = function() {
                    debug('Failed to load PDF.js dynamically');
                    showError('Failed to load PDF.js library. Please refresh the page or try a different browser.');
                };

                document.head.appendChild(pdfJsScript);
            } else {
                // PDF.js is already loaded, continuing with initialization
                debug('PDF.js is already loaded, continuing with initialization');
                initEventListeners();
                loadPDF();
            }
        } catch (error) {
            debug('Error during initialization: ' + error.message);
            if (error.stack) {
                debug('Stack trace: ' + error.stack);
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