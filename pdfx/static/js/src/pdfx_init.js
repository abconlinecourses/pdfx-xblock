/**
 * PDF.js Initialization
 *
 * This module initializes the PDF.js library with proper configuration.
 * It must be loaded before any other PDF.js-dependent modules.
 */
(function() {
    'use strict';

    // Check if PDF.js is loaded immediately
    if (typeof pdfjsLib !== 'undefined') {
        console.log('PDF XBlock: PDF.js library already loaded');
        setupPDFJSWorker();
    } else {
        // Wait a short time to ensure pdfjsLib has loaded (it might be loading asynchronously)
        console.log('PDF XBlock: Waiting for PDF.js to load...');
        setTimeout(function() {
            initPDFJS();
        }, 500);
    }

    function initPDFJS() {
        console.log('PDF XBlock: Initializing PDF.js library');

        if (typeof pdfjsLib === 'undefined') {
            console.error('PDF XBlock: PDF.js library not loaded! Attempting to reload...');

            // Try all possible locations for PDF.js
            tryLoadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.min.js', function() {
                console.log('PDF XBlock: Successfully loaded PDF.js from CDN');
                if (typeof pdfjsLib !== 'undefined') {
                    setupPDFJSWorker();
                }
            });
            return;
        }
        setupPDFJSWorker();
    }

    function tryLoadScript(url, callback) {
        var script = document.createElement('script');
        script.src = url;
        script.onload = callback;
        script.onerror = function() {
            console.error('PDF XBlock: Failed to load script from: ' + url);
        };
        document.head.appendChild(script);
    }

    function setupPDFJSWorker() {
        if (typeof pdfjsLib === 'undefined') {
            console.error('PDF XBlock: PDF.js still not available after loading attempt');
            return;
        }

        // First check if the worker is already set
        if (pdfjsLib.GlobalWorkerOptions.workerSrc) {
            console.log('PDF XBlock: PDF.js worker already configured: ' + pdfjsLib.GlobalWorkerOptions.workerSrc);
            return;
        }

        // Try multiple approaches to find the worker

        // 1. Find the script tag for the worker (if dynamically added by Python)
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var scriptContent = scripts[i].textContent || scripts[i].innerText;
            if (scriptContent && scriptContent.indexOf('pdfjsLib.GlobalWorkerOptions.workerSrc') !== -1) {
                console.log('PDF XBlock: Worker configuration found in script tag');
                // The worker should already be configured by this script
                return;
            }
        }

        // 2. Try to use a local worker URL (from the same path as pdf.min.js)
        try {
            var scripts = document.getElementsByTagName('script');
            var pdfJsScript = null;

            // Find the pdf.min.js script tag
            for (var i = 0; i < scripts.length; i++) {
                if (scripts[i].src && scripts[i].src.indexOf('pdf.min.js') !== -1) {
                    pdfJsScript = scripts[i];
                    break;
                }
            }

            if (pdfJsScript) {
                // If we found the script, try to figure out if it's local or CDN
                var scriptSrc = pdfJsScript.src;
                var workerSrc = scriptSrc.replace('pdf.min.js', 'pdf.worker.min.js');

                console.log('PDF XBlock: Setting worker from script path: ' + workerSrc);
                pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
                return;
            }
        } catch (e) {
            console.error('PDF XBlock: Error setting up worker src from script tag: ', e);
        }

        // 3. Default fallback to CDN
        console.log('PDF XBlock: Using fallback CDN worker');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
    }

    // Also expose this function globally to allow manual initialization
    window.initPdfJsWorker = initPDFJS;
})();

function PdfxXBlock(runtime, element, initArgs) {
    'use strict';

    // Ensure block-specific IDs for DOM elements
    const blockId = initArgs.blockId || 'default';

    // Add block ID to container elements for isolation
    $(element).find('.pdf-container').attr('id', `pdf-container-${blockId}`);
    $(element).find('.text-layer').attr('id', `text-layer-${blockId}`);
    $(element).find('.highlight-layer').attr('id', `highlight-layer-${blockId}`);

    // Initialize PDF viewer once loaded
    var pdfViewer = null;
    var pdfDoc = null;
    var pdfPages = [];
    var currentPage = initArgs.currentPage || 1;
    var viewMode = 'fit-width';
    var scale = 1.0;
    var pdfOriginalWidth = 0;
    var pdfOriginalHeight = 0;
    var brightness = initArgs.brightness || 100;
    var isGrayscale = initArgs.isGrayscale || false;

    // Initialize tools and components
    var highlighter = new PdfxHighlight(element, {
        blockId: blockId,
        debugCallback: debugLog,
        saveCallback: saveAnnotations,
        getHighlightColor: getHighlightColor
    });

    // Set up UI elements and event handlers
    function setupUI() {
        // Page navigation
        $(element).find('.prev-page').click(function() {
            if (currentPage > 1) {
                setPage(currentPage - 1);
            }
        });

        $(element).find('.next-page').click(function() {
            if (currentPage < pdfDoc.numPages) {
                setPage(currentPage + 1);
            }
        });

        // Page input
        $(element).find('.page-input').on('change', function() {
            var page = parseInt($(this).val());
            if (!isNaN(page) && page >= 1 && page <= pdfDoc.numPages) {
                setPage(page);
            } else {
                $(this).val(currentPage);
            }
        });

        // View mode (fit to page/width)
        $(element).find('.fit-page').click(function() {
            fitToPage();
        });

        $(element).find('.fit-width').click(function() {
            viewMode = 'fit-width';
            renderCurrentPage();
        });

        // Fullscreen button
        $(element).find('.fullscreen-btn').click(function() {
            toggleFullscreen();
        });

        // Zoom controls
        $(element).find('.zoom-in').click(function() {
            setZoom(scale * 1.2);
        });

        $(element).find('.zoom-out').click(function() {
            setZoom(scale * 0.8);
        });

        // Grayscale toggle
        $(element).find('.toggle-grayscale').click(function() {
            toggleGrayscale();
        });

        // Brightness controls
        $(element).find('.brightness-up').click(function() {
            brightness = Math.min(150, brightness + 10);
            applyFilters();
            saveViewSettings();
        });

        $(element).find('.brightness-down').click(function() {
            brightness = Math.max(50, brightness - 10);
            applyFilters();
            saveViewSettings();
        });

        // Set initial state for grayscale toggle
        if (isGrayscale) {
            $(element).find('.toggle-grayscale').addClass('active');
        }

        // Download button
        if (initArgs.allowDownload) {
            $(element).find('.download-pdf').show().click(function() {
                window.open(initArgs.pdfUrl, '_blank');
            });
        } else {
            $(element).find('.download-pdf').hide();
        }

        // Annotation tools
        if (initArgs.allowAnnotation) {
            $(element).find('.annotation-tools').show();

            // Text highlighting
            $(element).find('.highlight-text').click(function() {
                if ($(this).hasClass('active')) {
                    $(this).removeClass('active');
                    highlighter.disableTextHighlighting();
                } else {
                    $(this).addClass('active');
                    highlighter.enableTextHighlighting();
                }
            });

            // Clear highlights
            $(element).find('.clear-highlights').click(function() {
                highlighter.clearHighlights();
            });
        } else {
            $(element).find('.annotation-tools').hide();
        }
    }

    // Toggle fullscreen mode
    function toggleFullscreen() {
        const docElement = document.documentElement;

        if (!document.fullscreenElement &&
            !document.mozFullScreenElement &&
            !document.webkitFullscreenElement &&
            !document.msFullscreenElement) {
            // Enter fullscreen
            if (docElement.requestFullscreen) {
                docElement.requestFullscreen();
            } else if (docElement.mozRequestFullScreen) { // Firefox
                docElement.mozRequestFullScreen();
            } else if (docElement.webkitRequestFullscreen) { // Chrome, Safari, Opera
                docElement.webkitRequestFullscreen();
            } else if (docElement.msRequestFullscreen) { // IE/Edge
                docElement.msRequestFullscreen();
            }
            $(element).find('.fullscreen-btn').html('<i class="fas fa-compress"></i><span>Exit</span>');
            $(element).find('.fullscreen-btn').attr('title', 'Exit Fullscreen');
            debugLog('Entered fullscreen mode');
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { // Firefox
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { // Chrome, Safari, Opera
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { // IE/Edge
                document.msExitFullscreen();
            }
            $(element).find('.fullscreen-btn').html('<i class="fas fa-expand"></i><span>Fullscreen</span>');
            $(element).find('.fullscreen-btn').attr('title', 'Fullscreen');
            debugLog('Exited fullscreen mode');
        }
    }

    // Fit page to viewport
    function fitToPage() {
        const pdfViewer = $(element).find('.pdf-viewer');
        const viewerWidth = pdfViewer.width() - 40; // Account for padding
        const viewerHeight = pdfViewer.height() - 40;

        // Calculate scale to fit width and height
        const scaleX = viewerWidth / pdfOriginalWidth;
        const scaleY = viewerHeight / pdfOriginalHeight;

        // Use the smaller scale to ensure the entire page fits
        viewMode = 'fit-page';
        const fitScale = Math.min(scaleX, scaleY);

        // Apply the new zoom
        scale = fitScale;
        renderCurrentPage();
        debugLog(`Page fit applied. Scale: ${fitScale.toFixed(2)}`);
    }

    // Toggle grayscale mode
    function toggleGrayscale() {
        const pdfContainer = $(element).find(`#pdf-container-${blockId}`);
        const button = $(element).find('.toggle-grayscale');

        isGrayscale = !isGrayscale;

        if (isGrayscale) {
            button.addClass('active');
            pdfContainer.css('filter', `brightness(${brightness / 100}) grayscale(1)`);
        } else {
            button.removeClass('active');
            pdfContainer.css('filter', `brightness(${brightness / 100})`);
        }

        saveViewSettings();
        debugLog(`Grayscale mode: ${isGrayscale}`);
    }

    // Set zoom level
    function setZoom(newScale) {
        scale = newScale;
        viewMode = 'custom';
        renderCurrentPage();
    }

    // Apply brightness and grayscale filters
    function applyFilters() {
        var canvasContainer = $(element).find(`#pdf-container-${blockId}`);
        var canvas = canvasContainer.find('canvas');

        // Apply brightness
        var brightnessValue = brightness / 100;

        // Apply grayscale if enabled
        var filterValue = '';
        if (isGrayscale) {
            filterValue += 'grayscale(1) ';
            $(element).find('.toggle-grayscale').addClass('active');
        } else {
            $(element).find('.toggle-grayscale').removeClass('active');
        }

        // Apply brightness filter
        filterValue += `brightness(${brightnessValue})`;

        // Set the filter
        canvasContainer.css('filter', filterValue);
    }

    // Save view settings
    function saveViewSettings() {
        saveAnnotations({
            brightness: brightness,
            isGrayscale: isGrayscale
        });
    }

    // Get highlight color
    function getHighlightColor() {
        // Default highlight color
        return '#FFFF0080';
    }

    // Debug logging
    function debugLog(message) {
        console.log(`PDF XBlock (${blockId}): ${message}`);
    }

    // Save annotations
    function saveAnnotations(data) {
        var annotations = {
            currentPage: currentPage,
            brightness: brightness,
            isGrayscale: isGrayscale
        };

        if (data) {
            Object.assign(annotations, data);
        }

        // Send to server using XBlock runtime
        runtime.notify('save', {state: 'start'});
        var handlerUrl = runtime.handlerUrl(element, 'save_annotations');
        $.post(handlerUrl, JSON.stringify(annotations)).done(function(response) {
            runtime.notify('save', {state: 'end'});
        });
    }

    // Wait for PDF.js to be loaded
    function initializeWhenReady() {
        if (typeof pdfjsLib === 'undefined') {
            console.log('PDF XBlock: PDF.js library not loaded! Attempting to reload...');
            setTimeout(initializeWhenReady, 100);
            return;
        }

        // Initialize the PDF viewer
        loadPdfDocument(initArgs.pdfUrl);

        // Set up UI elements and event handlers
        setupUI();

        // Set initial view state
        if (isGrayscale) {
            $(element).find('.toggle-grayscale').addClass('active');
        }

        // Enable features based on permissions
        if (initArgs.allowAnnotation) {
            highlighter.enableTextHighlighting();
        }
    }

    // Load the PDF document
    function loadPdfDocument(url) {
        if (!url) {
            console.error('PDF XBlock: No PDF URL provided');
            return;
        }

        var loadingTask = pdfjsLib.getDocument(url);
        $(element).find('.loading-indicator').show();

        loadingTask.promise.then(function(pdf) {
            pdfDoc = pdf;

            // Update page count
            $(element).find('.total-pages').text(pdf.numPages);

            // Initialize with current page
            setPage(currentPage);

            $(element).find('.loading-indicator').hide();
        }).catch(function(error) {
            console.error('PDF XBlock: Error loading PDF:', error);
            $(element).find('.loading-indicator').hide();
            $(element).find('.pdf-fallback').show();
        });
    }

    // Set and render a specific page
    function setPage(pageNum) {
        if (pageNum < 1 || pageNum > pdfDoc.numPages) {
            return;
        }

        currentPage = pageNum;
        highlighter.setCurrentPage(pageNum);

        // Update UI
        $(element).find('.page-input').val(pageNum);
        $(element).find('.current-page').text(pageNum);

        // Render the page
        renderCurrentPage();

        // Save current page to server
        saveAnnotations({currentPage: pageNum});
    }

    // Render the current page with appropriate scaling
    function renderCurrentPage() {
        if (!pdfDoc) return;

        pdfDoc.getPage(currentPage).then(function(page) {
            var viewport = page.getViewport({scale: 1.0});
            var container = $(element).find(`#pdf-container-${blockId}`);
            var canvas = container.find('canvas')[0];
            var ctx = canvas.getContext('2d');

            // Store original dimensions for page fit calculations
            pdfOriginalWidth = viewport.width;
            pdfOriginalHeight = viewport.height;

            // Calculate scale based on view mode
            var containerWidth = container.width();
            var containerHeight = container.height();

            if (viewMode === 'fit-width') {
                scale = containerWidth / viewport.width;
            } else if (viewMode === 'fit-page') {
                var widthScale = containerWidth / viewport.width;
                var heightScale = containerHeight / viewport.height;
                scale = Math.min(widthScale, heightScale);
            }

            // Apply scale
            viewport = page.getViewport({scale: scale});

            // Set canvas dimensions
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // Render page
            var renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };

            page.render(renderContext).promise.then(function() {
                // Apply filters
                applyFilters();

                // Update text layer
                updateTextLayer(page, viewport);

                // Restore highlights
                highlighter.restoreHighlights();
            });
        });
    }

    // Update text layer for highlighting
    function updateTextLayer(page, viewport) {
        var textLayer = $(element).find(`#text-layer-${blockId}`);
        textLayer.empty();

        page.getTextContent().then(function(textContent) {
            // Position text layer
            textLayer.css({
                width: viewport.width + 'px',
                height: viewport.height + 'px'
            });

            // Create text spans
            textContent.items.forEach(function(item) {
                var tx = pdfjsLib.Util.transform(
                    viewport.transform,
                    [1, 0, 0, -1, item.transform[4], item.transform[5]]
                );

                var style = textContent.styles[item.fontName];

                // Create text span
                var span = document.createElement('span');
                span.textContent = item.str;
                span.style.fontFamily = style.fontFamily;
                span.style.fontSize = Math.floor(item.height) + 'px';
                span.style.position = 'absolute';
                span.style.left = Math.floor(tx[0]) + 'px';
                span.style.top = Math.floor(tx[1]) + 'px';
                span.style.transform = 'scaleY(-1)';

                textLayer.append(span);
            });
        });
    }

    // Start initialization
    initializeWhenReady();
}