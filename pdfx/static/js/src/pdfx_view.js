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

    // PDF Variables
    var pdfDoc = null;
    var pdfCanvas = null;
    var pdfOriginalWidth = 0;
    var pdfOriginalHeight = 0;
    var currentZoom = 1.0;

    // Check if we're in Studio
    var isStudio = (window.location.href.indexOf('studio') !== -1) ||
                   (window.location.href.indexOf('/cms/') !== -1);

    // Debug helper
    function debug(message) {
        if (window.console && console.log) {
            console.log('PDF XBlock: ' + message);

            // Also add to debug logs container if available
            var $logsContainer = $('.debug-logs-container', element);
            if ($logsContainer.length) {
                var timestamp = new Date().toLocaleTimeString();
                $logsContainer.append('<div>[' + timestamp + '] ' + message + '</div>');
                // Auto-scroll to bottom
                $logsContainer.scrollTop($logsContainer[0].scrollHeight);
            }
        }
    }

    // Show error message
    function showError(message) {
        $('.pdf-error', element).show().find('.error-message').text(message);
        $('.loading-indicator', element).hide();
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
            if (!(url.startsWith('http://') || url.startsWith('https://'))) {
                // If it's a relative URL starting with a slash, we need to get the base URL
                if (url.startsWith('/')) {
                    // Try to get the base URL from window.location
                    const baseUrl = window.location.protocol + '//' + window.location.host;
                    url = baseUrl + url;
                    debug('Converted to absolute URL: ' + url);
                }
            }

            return url;
        } else if (url.startsWith('/')) {
            // Relative URL - convert to absolute
            const baseUrl = window.location.protocol + '//' + window.location.host;
            url = baseUrl + url;
            debug('Converted relative URL to absolute: ' + url);
            return url;
        } else if (url.startsWith('http://') || url.startsWith('https://')) {
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

            debug('Attempting to load PDF from URL: ' + url);

            // Test for potential CORS issues
            debug('Checking if URL might have CORS issues...');
            const pdfOrigin = new URL(url).origin;
            const pageOrigin = window.location.origin;
            const corsIssuesPossible = pdfOrigin !== pageOrigin;
            debug('PDF origin: ' + pdfOrigin + ', Page origin: ' + pageOrigin);
            debug('Cross-origin request: ' + (corsIssuesPossible ? 'Yes (CORS needed)' : 'No (same origin)'));

            if (corsIssuesPossible) {
                debug('⚠️ Warning: PDF is loaded from a different origin, CORS headers must be present on the server.');
            }

            // Show some debug info in the UI
            $('.pdf-debug', element).show();
            $('.pdf-url-debug', element).text(url);

            // Create a loading task with more detailed options
            debug('Creating PDF.js loading task');
            const loadingTask = pdfjsLib.getDocument({
                url: url,
                cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.10.377/cmaps/',
                cMapPacked: true,
                disableRange: false,
                disableStream: false,
                disableAutoFetch: false
            });

            // Add progress handler
            loadingTask.onProgress = function(progress) {
                debug('PDF loading progress: ' +
                      Math.round(progress.loaded / Math.max(progress.total, 1) * 100) + '%' +
                      ' (' + progress.loaded + ' of ' + (progress.total || 'unknown') + ' bytes)');

                if (progress.total > 0) {
                    const percent = Math.round(progress.loaded / progress.total * 100);
                    $('.loading-indicator', element).text(`Loading PDF... ${percent}%`);
                }
            };

            // Send a HEAD request to check if the PDF exists and is accessible
            debug('Sending HEAD request to verify PDF accessibility');
            $.ajax({
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
        } catch (error) {
            debug('Error during PDF initialization: ' + error.message);
            showError('Error initializing PDF: ' + error.message);
        }
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
            $('#page-count', element).text(pdf.numPages);

            // Render the first page
            debug('Proceeding to render page ' + currentPage);
            renderPage(currentPage);

            // Hide loading indicator
            $('.loading-indicator', element).hide();
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
            debug('Cannot render page: PDF document not loaded');
            return;
        }

        // Ensure page number is valid
        pageNum = Math.max(1, Math.min(pageNum, pdfDoc.numPages));
        currentPage = pageNum;

        debug('Rendering page ' + pageNum + ' of ' + pdfDoc.numPages);

        // Update UI
        $('#page-num', element).text(pageNum);

        try {
            // Get the page
            debug('Getting page ' + pageNum + ' from PDF document');
            pdfDoc.getPage(pageNum).then(function(page) {
                debug('Retrieved page ' + pageNum + ' successfully');

                // Create viewport at current zoom level
                var viewport = page.getViewport({ scale: currentZoom });
                debug('Created viewport with dimensions: ' + viewport.width + 'x' + viewport.height + ' (zoom: ' + currentZoom + ')');

                // Get canvas and context
                pdfCanvas = $('#pdf-canvas', element)[0];
                if (!pdfCanvas) {
                    debug('ERROR: Canvas element not found in the DOM');
                    showError('Canvas element not found. Please refresh the page.');
                    return;
                }

                debug('Canvas element found: ' + pdfCanvas.id);
                var ctx = pdfCanvas.getContext('2d');
                if (!ctx) {
                    debug('ERROR: Could not get 2D context from canvas');
                    showError('Canvas context could not be initialized');
                    return;
                }

                // Set canvas dimensions
                debug('Setting canvas dimensions to ' + viewport.width + 'x' + viewport.height);
                pdfCanvas.width = viewport.width;
                pdfCanvas.height = viewport.height;

                // Store original dimensions
                pdfOriginalWidth = viewport.width / currentZoom;
                pdfOriginalHeight = viewport.height / currentZoom;

                // Add canvas state info to debug
                debug('Canvas dimensions after setting: ' + pdfCanvas.width + 'x' + pdfCanvas.height);
                debug('Canvas visible in DOM: ' + (pdfCanvas.offsetParent !== null));

                // Log container dimensions
                var container = $('#pdf-container', element);
                debug('PDF container dimensions: ' + container.width() + 'x' + container.height());

                // Render PDF page to canvas
                debug('Starting to render PDF page to canvas...');
                var renderContext = {
                    canvasContext: ctx,
                    viewport: viewport
                };

                var renderTask = page.render(renderContext);

                renderTask.promise.then(
                    function() {
                        debug('Page ' + pageNum + ' rendered successfully to canvas');

                        // Check if canvas has content by examining a sample of pixels
                        try {
                            var imageData = ctx.getImageData(0, 0, Math.min(100, pdfCanvas.width), Math.min(100, pdfCanvas.height));
                            var hasContent = false;

                            // Check if any pixel is non-white (not 255,255,255)
                            for (var i = 0; i < imageData.data.length; i += 4) {
                                if (imageData.data[i] < 255 || imageData.data[i+1] < 255 || imageData.data[i+2] < 255) {
                                    hasContent = true;
                                    break;
                                }
                            }

                            debug('Canvas has content: ' + hasContent);

                            if (!hasContent) {
                                debug('WARNING: Canvas appears to be empty after rendering');
                            }
                        } catch (e) {
                            debug('Error checking canvas content: ' + e.message);
                        }

                        // If we have annotations, we would restore them here
                        if (allowAnnotation) {
                            restoreAnnotations(pageNum);
                        }

                        // Save current page to server (if not in studio)
                        if (!isStudio) {
                            saveToServer();
                        }
                    },
                    function(error) {
                        debug('Error during page rendering: ' + error);
                        showError('Failed to render PDF page: ' + error);
                    }
                );
            }).catch(function(error) {
                debug('Error getting page ' + pageNum + ': ' + error);
                showError('Error getting page ' + pageNum + ': ' + error);
            });
        } catch (error) {
            debug('Exception in renderPage: ' + error.message);
            showError('Error rendering page: ' + error.message);
        }
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
            highlights: highlights
        };

        $.ajax({
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

    // Initialize event handlers
    function initEventListeners() {
        $('#prev-page', element).click(function() {
            changePage(-1);
        });

        $('#next-page', element).click(function() {
            changePage(1);
        });

        $('#zoom-in', element).click(function() {
            currentZoom += 0.1;
            renderPage(currentPage);
        });

        $('#zoom-out', element).click(function() {
            currentZoom = Math.max(0.1, currentZoom - 0.1);
            renderPage(currentPage);
        });

        // Debug buttons
        $('#toggle-debug', element).click(function() {
            $('.pdf-debug', element).hide();
        });

        $('#force-reload', element).click(function() {
            debug('Force reloading PDF...');
            // Clear cached document if any
            pdfDoc = null;
            // Show loading indicator
            $('.loading-indicator', element).show();
            $('.pdf-error', element).hide();
            // Reload the PDF
            loadPDF();
        });

        $('#direct-download', element).click(function() {
            var url = getSafePdfUrl();
            if (!url) {
                debug('No URL available for direct download');
                return;
            }
            debug('Opening PDF in new tab: ' + url);
            window.open(url, '_blank');
        });

        $('#check-canvas', element).click(function() {
            debug('Checking canvas element...');
            var canvas = $('#pdf-canvas', element)[0];

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

        $('#toggle-cors-proxy', element).click(function() {
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
            $('.loading-indicator', element).show().text('Loading via CORS proxy...');
            $('.pdf-error', element).hide();

            // Try loading with proxy
            try {
                // Clear any existing document
                pdfDoc = null;

                // Create a loading task with proxy URL
                const loadingTask = pdfjsLib.getDocument({
                    url: proxyUrl,
                    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.10.377/cmaps/',
                    cMapPacked: true
                });

                // Use promise to load the PDF
                loadingTask.promise.then(function(pdf) {
                    pdfDoc = pdf;
                    debug('PDF loaded via proxy with ' + pdf.numPages + ' pages');

                    // Update UI
                    $('#page-count', element).text(pdf.numPages);
                    $('.pdf-url-debug', element).text(proxyUrl + ' (proxied)');

                    // Render first page
                    renderPage(currentPage);

                    // Hide loading indicator
                    $('.loading-indicator', element).hide();
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
    $(function() {
        debug('Initializing PDF XBlock');

        // Check if PDF.js is available
        if (typeof pdfjsLib === 'undefined') {
            debug('PDF.js is not loaded, attempting to load it dynamically');

            // Load PDF.js dynamically if not available
            var pdfJsScript = document.createElement('script');
            pdfJsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.min.js';
            pdfJsScript.async = true;
            pdfJsScript.onload = function() {
                debug('PDF.js loaded dynamically');

                // Now load the worker
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

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
            // Always show debug info in LMS for now to help diagnose issues
            if (!isStudio) {
                $('.pdf-debug', element).show();
            }

            debug('PDF.js is already loaded, continuing with initialization');
            initEventListeners();
            loadPDF();
        }
    });

    // Directly test if we can access the PDF by sending a request
    function testPdfAccess() {
        var url = getSafePdfUrl();
        if (!url) {
            debug('No PDF URL to test');
            return;
        }

        debug('Testing direct access to PDF: ' + url);

        // Create an iframe to test loading
        var testFrame = document.createElement('iframe');
        testFrame.style.display = 'none';
        testFrame.src = url;

        testFrame.onload = function() {
            debug('PDF iframe loaded successfully - PDF seems accessible');
            document.body.removeChild(testFrame);
        };

        testFrame.onerror = function() {
            debug('PDF iframe failed to load - PDF may not be accessible');
            document.body.removeChild(testFrame);
        };

        document.body.appendChild(testFrame);

        // Also try with XMLHttpRequest
        var xhr = new XMLHttpRequest();
        xhr.open('HEAD', url, true);

        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                debug('XHR head request successful - PDF is accessible');
                debug('Content-Type: ' + xhr.getResponseHeader('Content-Type'));
            } else {
                debug('XHR head request failed with status: ' + xhr.status);
            }
        };

        xhr.onerror = function() {
            debug('XHR head request failed - PDF may not be accessible due to CORS or network issues');
        };

        xhr.send();
    }

    // Call the test function after a short delay
    setTimeout(testPdfAccess, 1000);

    // Return an empty object (required by XBlock pattern)
    return {};
}