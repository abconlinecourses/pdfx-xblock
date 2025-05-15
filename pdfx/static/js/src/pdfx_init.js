/**
 * PDF.js Initialization
 *
 * This module initializes the PDF.js library with proper configuration.
 * It must be loaded before any other PDF.js-dependent modules.
 */
(function() {
    'use strict';

    console.log('PDF XBlock initialization script loaded at: ' + new Date().toISOString());

    // Add a global event listener to check when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        console.log('PDF XBlock DOM content loaded at: ' + new Date().toISOString());
        // Find all marker tool buttons and attach console log on click
        var markerButtons = document.querySelectorAll('[id^="marker-tool-"]');
        console.log('Found ' + markerButtons.length + ' marker tool buttons');

        markerButtons.forEach(function(button) {
            console.log('Setting up click listener for: ' + button.id);
            button.addEventListener('click', function() {
                console.log('Marker tool button clicked: ' + this.id + ' at ' + new Date().toISOString());
            });
        });
    });

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

console.log('[PDFX INIT][DEBUG] Loading PDF XBlock initialization script at: ' + new Date().toISOString());

// PDF XBlock initialization
function PdfxInit(runtime, element, options) {
    'use strict';

    console.log('[PDFX INIT][DEBUG] Initializing PDF XBlock with runtime, element and options');

    // Check if element is valid
    if (!element) {
        console.error('[PDFX INIT][DEBUG] Invalid element provided to PdfxInit');
        return;
    }

    // Extract block ID from element ID
    var blockId = element.id.replace('pdfx-block-', '');
    console.log('[PDFX INIT][DEBUG] Initializing block with ID: ' + blockId);

    // Debug runtime
    if (runtime) {
        console.log('[PDFX INIT][DEBUG] Runtime provided:', {
            handlerUrl: typeof runtime.handlerUrl === 'function' ? 'function available' : 'not available'
        });
    } else {
        console.error('[PDFX INIT][DEBUG] No runtime provided to PdfxInit');
    }

    // Debug options
    if (options) {
        console.log('[PDFX INIT][DEBUG] Options provided:', Object.keys(options));
    } else {
        console.warn('[PDFX INIT][DEBUG] No options provided to PdfxInit');
    }

    // Create data element if it doesn't exist
    var dataElement = document.getElementById(`pdfx-data-${blockId}`);
    if (!dataElement) {
        console.log('[PDFX INIT][DEBUG] Creating data element for block ' + blockId);
        dataElement = document.createElement('div');
        dataElement.id = `pdfx-data-${blockId}`;
        dataElement.style.display = 'none';
        element.appendChild(dataElement);
    } else {
        console.log('[PDFX INIT][DEBUG] Data element already exists for block ' + blockId);
    }

    // Ensure handler URL is set in the data element
    if (runtime && typeof runtime.handlerUrl === 'function') {
        var saveAnnotationsUrl = runtime.handlerUrl(element, 'save_annotations');
        console.log('[PDFX INIT][DEBUG] Setting handler URL: ' + saveAnnotationsUrl);
        dataElement.dataset.handlerUrl = saveAnnotationsUrl;
    } else {
        console.error('[PDFX INIT][DEBUG] Unable to set handler URL - runtime.handlerUrl not available');
    }

    // Initialize PDF viewer once loaded
    var pdfViewer = null;
    var pdfDoc = null;
    var pdfPages = [];
    var currentPage = options.currentPage || 1;
    var viewMode = 'fit-width';
    var scale = 1.0;
    var pdfOriginalWidth = 0;
    var pdfOriginalHeight = 0;
    var brightness = options.brightness || 100;
    var isGrayscale = options.isGrayscale || false;

    // FabricJS canvas for both drawing and highlighting
    var fabricCanvas = null;

    // User and course information
    var userId = options.userId || 'anonymous';
    var username = options.username;
    var email = options.email;
    var courseId = options.courseId;
    var documentInfo = options.documentInfo || {
        title: 'PDF Document',
        url: options.pdfUrl
    };

    // Initialize tools and components
    var highlighter = new PdfxHighlight(element, {
        blockId: blockId,
        userId: userId,
        debugCallback: debugLog,
        saveCallback: saveAnnotations,
        getHighlightColor: getHighlightColor,
        allowAnnotation: options.allowAnnotation,
        courseId: courseId,
        documentInfo: documentInfo
    });

    var marker = new PdfxScribble(element, {
        blockId: blockId,
        userId: userId,
        debugCallback: debugLog,
        saveCallback: saveAnnotations,
        color: '#FF0000',
        width: 5,
        courseId: courseId,
        documentInfo: documentInfo,
        saveIntervalTime: 10000 // Save to server every 10 seconds
    });

    // Text highlighting is disabled by default until user selects highlighter tool
    var highlightingEnabled = false;

    // Add global debug functions immediately
    console.log("Initializing PdfxXBlock with ID:", options.blockId || 'default');
    window.pdfxDebug = window.pdfxDebug || {};
    window.pdfxDebug[options.blockId || 'default'] = {
        checkStatus: function() {
            console.log("=== PDF XBLOCK DEBUG INFO ===");
            console.log("Block ID:", options.blockId || 'default');
            console.log("FabricCanvas available:", !!fabricCanvas);
            if (fabricCanvas) {
                console.log("Drawing mode:", fabricCanvas.isDrawingMode);
                console.log("Marker mode:", fabricCanvas.freeDrawingBrush?.markerMode);
                console.log("Upper canvas pointer events:", fabricCanvas.upperCanvasEl.style.pointerEvents);
            }

            var drawContainer = $(element).find(`#draw-container-${options.blockId || 'default'}`)[0];
            if (drawContainer) {
                console.log("Draw container pointer events:", drawContainer.style.pointerEvents);
                console.log("Draw container classes:", drawContainer.className);
                console.log("Current tool:", drawContainer.dataset.currentTool);
            }

            console.log("Current tool UI state:", $(".tool-btn.active").attr('id'));
            return "Debug check complete - see console for details";
        },

        fixMarker: function() {
            console.log("Attempting to fix marker tool...");
            if (!fabricCanvas) {
                console.error("FabricCanvas not available!");
                return "ERROR: Canvas not available";
            }

            fabricCanvas.isDrawingMode = true;
            fabricCanvas.freeDrawingBrush.markerMode = true;
            fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

            var drawContainer = $(element).find(`#draw-container-${options.blockId || 'default'}`)[0];
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'auto';
                drawContainer.classList.add('draw-mode');
                drawContainer.dataset.currentTool = 'marker';
            }

            $(element).find(`#marker-tool-${options.blockId || 'default'}`).addClass('active');

            if (marker && typeof marker.enable === 'function') {
                marker.enable();
            }

            return "Marker fixed - tool should now work";
        }
    };

    console.log("Global debug functions added to window.pdfxDebug['" + (options.blockId || 'default') + "']");

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
        if (options.allowDownload) {
            $(element).find('.download-pdf').show().click(function() {
                window.open(options.pdfUrl, '_blank');
            });
        } else {
            $(element).find('.download-pdf').hide();
        }

        // Annotation tools
        if (options.allowAnnotation) {
            $(element).find('.annotation-tools').show();

            // Color picker for highlighting and drawing
            var colorPicker = $(element).find(`#color-input-${blockId}`);
            colorPicker.on('change', function() {
                var selectedColor = $(this).val();
                debugLog(`Color changed to: ${selectedColor}`);

                // If using the highlighter tool, update highlight color with some transparency
                if (highlightingEnabled) {
                    // Convert hex to rgba with transparency
                    var hex = selectedColor.replace('#', '');
                    var r = parseInt(hex.substring(0, 2), 16);
                    var g = parseInt(hex.substring(2, 4), 16);
                    var b = parseInt(hex.substring(4, 6), 16);

                    // Use the selected color with 50% transparency for highlighting
                    highlighter.setHighlightColor(`rgba(${r}, ${g}, ${b}, 0.5)`);
                }
            });

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

        // Show user info if available
        if (username) {
            $(element).find('.user-info').text(`User: ${username}`).show();
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
        isGrayscale = !isGrayscale;

        debugLog(`Toggled grayscale mode to: ${isGrayscale}`);

        // Apply filters with new grayscale setting
        applyFilters();

        // Save the setting
        saveViewSettings();
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
        var canvas = $(element).find(`#pdf-canvas-${blockId}`)[0];

        if (!canvas) {
            debugLog('Canvas element not found for applying filters');
            return;
        }

        // Apply brightness
        var brightnessValue = brightness / 100;

        // Apply grayscale if enabled
        var filterValue = '';
        if (isGrayscale) {
            filterValue += 'grayscale(1) ';
            $(element).find('.toggle-grayscale').addClass('active');
        } else {
            filterValue += 'grayscale(0) '; // Explicitly set grayscale to 0
            $(element).find('.toggle-grayscale').removeClass('active');
        }

        // Apply brightness filter
        filterValue += `brightness(${brightnessValue})`;

        // Set the filter on the canvas element directly, not the container
        canvas.style.filter = filterValue;

        // Make sure container doesn't have filter applied
        canvasContainer.css('filter', '');

        debugLog(`Applied filters: ${filterValue}`);
    }

    // Save view settings
    function saveViewSettings() {
        saveAnnotations({
            brightness: brightness,
            isGrayscale: isGrayscale
        });
    }

    // Get highlight color from color picker
    function getHighlightColor() {
        var colorPicker = $(element).find(`#color-input-${blockId}`);
        var selectedColor = colorPicker.val() || '#FFFF00';

        // Convert hex to rgba with transparency
        var hex = selectedColor.replace('#', '');
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);

        return `rgba(${r}, ${g}, ${b}, 0.5)`;
    }

    // Debug logging
    function debugLog(message) {
        console.log(`PDF XBlock (${blockId}): ${message}`);
    }

    // Save annotations including user highlights
    function saveAnnotations(data) {
        // If no specific data is provided, collect all annotations
        if (!data) {
            data = {
                currentPage: currentPage,
                drawings: fabricCanvas ? getDrawingsForStorage() : {},
                highlights: highlighter ? highlighter.getAllHighlights() : {},
                userHighlights: highlighter ? highlighter.getUserHighlightsForStorage() : {},
                markerStrokes: marker ? marker.getAllMarkerStrokes() : {},
                brightness: brightness,
                isGrayscale: isGrayscale
            };
        }

        // Send annotations to server via XBlock handler
        $.ajax({
            type: "POST",
            url: runtime.handlerUrl(element, 'save_annotations'),
            data: JSON.stringify(data),
            success: function(response) {
                if (response.result !== 'success') {
                    debugLog('Error saving annotations: ' + (response.message || 'Unknown error'));
                }
            },
            error: function(jqXHR) {
                debugLog('Error saving annotations: ' + jqXHR.responseText);
            }
        });
    }

    // Wait for PDF.js to be loaded
    function initializeWhenReady() {
        if (typeof pdfjsLib === 'undefined') {
            console.log('PDF XBlock: PDF.js library not loaded! Attempting to reload...');
            setTimeout(initializeWhenReady, 100);
            return;
        }

        // Set up tool selection handlers
        setupToolButtons();

        // Initialize the PDF viewer
        loadPdfDocument(options.pdfUrl);

        // Set up UI elements and event handlers
        setupUI();

        // Set initial view state
        if (isGrayscale) {
            $(element).find('.toggle-grayscale').addClass('active');
        }

        // Enable features based on permissions
        if (options.allowAnnotation) {
            // Set metadata for the highlighter
            highlighter.setMetadata(courseId, documentInfo);

            // Text highlighting is disabled by default - user must select highlighter tool
            highlighter.disableTextHighlighting();
            highlightingEnabled = false;
        }

        // After page is loaded, we should restore user highlights for viewing (but not enable highlighting)
        loadUserHighlights();

        // Add this inside the initializeWhenReady function, after fabric canvas initialization
        // Direct binding for marker tool button
        $(element).find(`#marker-tool-${blockId}`).off('click.pdfx').on('click.pdfx', function() {
            console.log("%c[DIRECT EVENT] Marker tool button clicked through direct binding", "background:#2980b9;color:white;padding:3px;border-radius:3px;");

            // Force drawing mode
            if (fabricCanvas) {
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.freeDrawingBrush.color = $(element).find(`#color-input-${blockId}`).val() || '#FF0000';
                fabricCanvas.freeDrawingBrush.width = parseInt($(element).find(`#width-input-${blockId}`).val() || 5);
                fabricCanvas.freeDrawingBrush.markerMode = true;
                fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

                // Add active class to button
                $(this).addClass('active');

                // Make sure draw container is in drawing mode
                var drawContainer = $(element).find(`#draw-container-${blockId}`)[0];
                if (drawContainer) {
                    drawContainer.style.pointerEvents = 'auto';
                    drawContainer.classList.add('draw-mode');
                    drawContainer.dataset.currentTool = 'marker';
                }

                // Enable marker in the marker object
                if (marker && typeof marker.enable === 'function') {
                    marker.enable();
                    console.log("[DIRECT EVENT] Marker tool enabled through direct call to marker.enable()");
                }
            } else {
                console.error("[DIRECT EVENT] Fabric canvas not available!");
            }

            return true;
        });
    }

    // Setup tool buttons in left sidebar
    function setupToolButtons() {
        // Tool selection
        $(element).find(`#marker-tool-${blockId}`).click(function() {
            setActiveTool('marker');
        });

        $(element).find(`#highlight-tool-${blockId}`).click(function() {
            setActiveTool('highlight');
        });

        // Text tool
        $(element).find('#text-tool-' + blockId).click(function() {
            setActiveTool('text');
        });

        // Shape tool
        $(element).find('#shape-tool-' + blockId).click(function() {
            setActiveTool('shape');
        });

        // Note tool
        $(element).find('#note-tool-' + blockId).click(function() {
            setActiveTool('note');
        });

        // Comment tool
        $(element).find('#comment-tool-' + blockId).click(function() {
            setActiveTool('comment');
        });

        // Select tool
        $(element).find('#select-tool-' + blockId).click(function() {
            setActiveTool('select');
        });

        // Eraser tool
        $(element).find('#eraser-tool-' + blockId).click(function() {
            setActiveTool('eraser');
        });

        // Undo button
        $(element).find('#undo-btn-' + blockId).click(function() {
            undoAction();
        });

        // Redo button
        $(element).find('#redo-btn-' + blockId).click(function() {
            redoAction();
        });
    }

    // Update the setActiveTool function to include more detailed logging
    function setActiveTool(tool) {
        console.log(`%c[TOOL EVENT] Setting active tool: ${tool}`, 'background:#3498db;color:white;padding:3px;border-radius:3px;');
        debugLog(`Setting active tool: ${tool}`);

        // First, disable active tools across all PDF blocks to prevent cross-block interference
        $('.draw-container').each(function() {
            if (this.id !== `draw-container-${blockId}`) {
                $(this).removeClass('draw-mode');
                $(this).css('pointerEvents', 'none');

                // Also disable any fabric canvas for this container
                if (this._fabricCanvas) {
                    this._fabricCanvas.isDrawingMode = false;
                    this._fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                }
            }
        });

        // Remove active class from all tool buttons
        $(element).find('.tool-btn').removeClass('active');

        // Disable text highlighting by default
        highlightingEnabled = false;
        highlighter.disableTextHighlighting();

        // Reset drawing container and canvas pointer events
        var drawContainer = $(element).find(`#draw-container-${blockId}`)[0];
        if (drawContainer) {
            drawContainer.classList.remove('draw-mode');
        }

        // Now set up the specific tool
        switch (tool) {
            case 'marker':
                console.log("%c[SCRIBBLE] Activating scribble tool", "background:#f39c12;color:white;padding:3px;border-radius:3px;");
                // Set active class on marker tool button
                $(element).find(`#marker-tool-${blockId}`).addClass('active');

                // Enable drawing mode with proper settings
                if (fabricCanvas) {
                    // Set up the drawing brush for marker
                    fabricCanvas.isDrawingMode = true;
                    fabricCanvas.freeDrawingBrush.color = $(element).find(`#color-input-${blockId}`).val() || '#FF0000';
                    fabricCanvas.freeDrawingBrush.width = parseInt($(element).find(`#width-input-${blockId}`).val() || 5);
                    fabricCanvas.freeDrawingBrush.markerMode = true;

                    // Make sure drawing container is interactive
                    if (drawContainer) {
                        drawContainer.classList.add('draw-mode');
                        drawContainer.style.pointerEvents = 'auto';
                        drawContainer.dataset.currentTool = 'marker';
                        drawContainer.dataset.blockId = blockId; // Add block ID to container for reference
                    }

                    // Make sure canvas elements have proper pointer events
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

                    // Call marker's enable function to ensure all settings are applied
                    marker.enable();

                    console.log("%c[SCRIBBLE] Tool activated successfully", "background:#2ecc71;color:white;padding:3px;border-radius:3px;");
                    debugLog('Scribble tool activated with proper pointer events settings');
                } else {
                    console.error("[SCRIBBLE] Fabric canvas not available");
                    debugLog('ERROR: Fabric canvas not available for scribble tool');
                }
                break;

            case 'highlight':
                $(element).find(`#highlight-tool-${blockId}`).addClass('active');
                highlightingEnabled = true;
                highlighter.setHighlightColor($(element).find(`#color-input-${blockId}`).val() + '80'); // Add 50% transparency
                highlighter.enableTextHighlighting();

                // Disable drawing mode
                if (fabricCanvas) {
                    fabricCanvas.isDrawingMode = false;
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                }
                break;

            case 'text':
            case 'shape':
            case 'sticky-note':
            case 'comment':
            case 'select':
            case 'eraser':
                // Add active class to the appropriate tool button
                $(element).find(`#${tool}-tool-${blockId}`).addClass('active');

                // Set appropriate drawing mode for each tool
                if (fabricCanvas) {
                    fabricCanvas.isDrawingMode = (tool === 'eraser');

                    if (tool === 'eraser') {
                        // Set up eraser
                        fabricCanvas.freeDrawingBrush.color = '#FFFFFF';
                        fabricCanvas.freeDrawingBrush.width = 20;
                        fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                        if (drawContainer) {
                            drawContainer.classList.add('draw-mode');
                            drawContainer.style.pointerEvents = 'auto';
                            drawContainer.dataset.blockId = blockId; // Add block ID to container for reference
                        }
                    } else if (tool === 'select') {
                        // Enable selection mode
                        fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                        fabricCanvas.selection = true;
                        fabricCanvas.forEachObject(function(o) {
                            o.selectable = true;
                        });
                    } else {
                        // Default handling for other tools
                        fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                    }
                }
                break;

            default:
                debugLog(`Unknown tool: ${tool}`);
                break;
        }

        // Save the current tool state
        saveAnnotations({
            currentTool: tool
        });

        return true;
    }

    // Undo last action
    function undoAction() {
        // Implement undo logic here
        debugLog('Undo action');
    }

    // Redo last undone action
    function redoAction() {
        // Implement redo logic here
        debugLog('Redo action');
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
        renderPage(pageNum);

        // Update marker's current page
        marker.setCurrentPage(pageNum);

        // Update navigation display
        $(element).find(`#page-num-${blockId}`).text(pageNum);

        // Save current page
        saveAnnotations({
            currentPage: pageNum
        });

        // For debugging
        debugLog(`Navigated to page ${pageNum}`);
    }

    // Update the renderCurrentPage function to properly handle drawing tools state
    function renderCurrentPage() {
        debugLog('Rendering current page: ' + currentPage);

        // Clear any existing page content
        $(element).find(`#pdf-page-${blockId}`).empty();

        // Get the page from cache if available
        if (pdfPages[currentPage - 1]) {
            renderPage(currentPage);
            // Do not automatically enable drawing tools when rendering pages
            if (marker) {
                // Only update the current page in the marker without enabling it
                marker.setCurrentPage(currentPage);
            }
            return;
        }

        // Otherwise, get the page from the PDF document
        pdfDoc.getPage(currentPage).then(function(page) {
            // Cache the page
            pdfPages[currentPage - 1] = page;
            renderPage(currentPage);

            // Do not automatically enable drawing tools when rendering pages
            if (marker) {
                // Only update the current page in the marker without enabling it
                marker.setCurrentPage(currentPage);
            }
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

    // Load user highlights from MongoDB and initialize highlighter
    function loadUserHighlights() {
        $.ajax({
            type: "POST",
            url: runtime.handlerUrl(element, 'get_user_highlights'),
            data: JSON.stringify({includeAll: options.isStaff}),
            success: function(response) {
                if (response.result === 'success') {
                    highlighter.setAllHighlights(response.highlights || {});
                    debugLog('Loaded user highlights');

                    // If we have marker strokes, load them
                    if (options.markerStrokes) {
                        marker.loadMarkerStrokes(options.markerStrokes);
                        debugLog('Loaded marker strokes');
                    }
                } else {
                    debugLog('Error loading highlights: ' + (response.message || 'Unknown error'));
                }
            },
            error: function(jqXHR) {
                debugLog('Error loading highlights: ' + jqXHR.responseText);
            }
        });
    }

    // Update the initFabricCanvas function to better handle drawing canvas initialization
    function initFabricCanvas() {
        console.log("%c[FABRIC] Initializing fabric canvas", "background:#2c3e50;color:white;padding:3px;border-radius:3px;");
        debugLog('Initializing fabric canvas');

        var drawContainer = $(element).find(`#draw-container-${blockId}`)[0];
        var pdfContainer = $(element).find(`#pdf-container-${blockId}`)[0];

        if (!drawContainer || !pdfContainer) {
            console.error("%c[FABRIC] Required containers not found:", "background:red;color:white;padding:3px;border-radius:3px;", {
                drawContainerFound: !!drawContainer,
                pdfContainerFound: !!pdfContainer,
                blockId: blockId
            });
            debugLog('Error: Required containers not found');
            return false;
        }

        try {
            console.log("[FABRIC] Container found, dimensions:", {
                drawContainer: drawContainer.getBoundingClientRect(),
                pdfContainer: pdfContainer.getBoundingClientRect()
            });

            // Create canvas element
            var canvas = document.createElement('canvas');
            canvas.id = `drawing-canvas-${blockId}`;
            canvas.width = pdfContainer.offsetWidth;
            canvas.height = pdfContainer.offsetHeight;
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';

            console.log("[FABRIC] Created canvas with dimensions:", {
                width: canvas.width,
                height: canvas.height
            });

            // Append canvas to draw container
            drawContainer.innerHTML = ''; // Clear any existing canvas
            drawContainer.appendChild(canvas);

            // Manually set critical styles on draw container
            drawContainer.style.position = 'absolute';
            drawContainer.style.top = '0';
            drawContainer.style.left = '0';
            drawContainer.style.width = '100%';
            drawContainer.style.height = '100%';
            drawContainer.style.zIndex = '20';

            // Check if fabric is loaded
            if (typeof fabric === 'undefined') {
                console.error("%c[FABRIC] fabric.js library not loaded!", "background:red;color:white;padding:3px;border-radius:3px;");
                debugLog('Error: fabric.js library not loaded');
                return false;
            }

            // Initialize fabric canvas with proper settings
            try {
                fabricCanvas = new fabric.Canvas(canvas, {
                    isDrawingMode: false,
                    selection: false,
                    renderOnAddRemove: true,
                    backgroundColor: null
                });

                console.log("%c[FABRIC] Canvas created successfully", "background:#27ae60;color:white;padding:3px;border-radius:3px;", fabricCanvas);
            } catch (err) {
                console.error("%c[FABRIC] Error creating fabric canvas:", "background:red;color:white;padding:3px;border-radius:3px;", err);
                debugLog('Error creating fabric canvas: ' + err.message);
                return false;
            }

            debugLog('Fabric canvas created');

            // Initialize the marker with fabric canvas
            if (marker && typeof marker.init === 'function') {
                console.log("[FABRIC] Initializing marker with fabric canvas");
                marker.init(fabricCanvas);
            } else {
                console.error("%c[FABRIC] Marker object not available or init method missing!", "background:red;color:white;padding:3px;border-radius:3px;");
            }

            // Set up brush
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
            fabricCanvas.freeDrawingBrush.color = $(element).find(`#color-input-${blockId}`).val() || '#FF0000';
            fabricCanvas.freeDrawingBrush.width = parseInt($(element).find(`#width-input-${blockId}`).val() || 5);

            // Update the fabric mouse event handlers to include more detailed logging
            fabricCanvas.on('mouse:down', function(e) {
                console.log("%c[MOUSE EVENT] mouse:down", "background:#9b59b6;color:white;padding:3px;border-radius:3px;", {
                    isDrawingMode: fabricCanvas.isDrawingMode,
                    markerMode: fabricCanvas.freeDrawingBrush?.markerMode,
                    activeTool: $(".tool-btn.active").attr('id')
                });

                debugLog('Canvas mouse:down event');
                if (fabricCanvas.isDrawingMode) {
                    // Important: Make sure pointer events are enabled during drawing
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                    drawContainer.style.pointerEvents = 'auto';
                    console.log("[MOUSE EVENT] Drawing mode active, set pointer-events to auto");
                }
            });

            fabricCanvas.on('mouse:move', function(e) {
                // Don't log every mouse move to avoid console spam
                // For marker tool, make sure pointer events stay enabled
                if (fabricCanvas.isDrawingMode && fabricCanvas.freeDrawingBrush.markerMode) {
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                    drawContainer.style.pointerEvents = 'auto';
                }
            });

            fabricCanvas.on('mouse:up', function(e) {
                console.log("%c[MOUSE EVENT] mouse:up", "background:#9b59b6;color:white;padding:3px;border-radius:3px;", {
                    isDrawingMode: fabricCanvas.isDrawingMode,
                    markerMode: fabricCanvas.freeDrawingBrush?.markerMode,
                    activeTool: $(".tool-btn.active").attr('id')
                });

                debugLog('Canvas mouse:up event');
                // Don't disable pointer events if still in drawing mode and marker is active
                if (fabricCanvas.isDrawingMode && fabricCanvas.freeDrawingBrush.markerMode) {
                    console.log("[MOUSE EVENT] Marker still active, keeping pointer-events auto");
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                    drawContainer.style.pointerEvents = 'auto';
                } else if (!fabricCanvas.isDrawingMode) {
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                }
            });

            // Path created event
            fabricCanvas.on('path:created', function(e) {
                console.log("%c[FABRIC EVENT] path:created", "background:#e74c3c;color:white;padding:3px;border-radius:3px;", {
                    isDrawingMode: fabricCanvas.isDrawingMode,
                    markerMode: fabricCanvas.freeDrawingBrush?.markerMode
                });

                debugLog('Path created on canvas');
                // Make sure drawing mode stays active for marker tool
                if (fabricCanvas.freeDrawingBrush.markerMode) {
                    console.log("[FABRIC EVENT] Keeping marker mode active after path creation");
                    fabricCanvas.isDrawingMode = true;
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                    drawContainer.style.pointerEvents = 'auto';
                }
            });

            // Store reference to fabricCanvas in draw container
            drawContainer._fabricCanvas = fabricCanvas;

            // Set up color picker event handler
            $(element).find(`#color-input-${blockId}`).on('change', function() {
                var color = $(this).val();
                if (fabricCanvas && fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush.color = color;
                    marker.setColor(color);
                    debugLog(`Color changed to ${color}`);
                }
            });

            // Set up width slider event handler
            $(element).find(`#width-input-${blockId}`).on('input', function() {
                var width = parseInt($(this).val());
                if (fabricCanvas && fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush.width = width;
                    marker.setWidth(width);
                    $(element).find(`#width-value-${blockId}`).text(width + 'px');
                    debugLog(`Width changed to ${width}px`);
                }
            });

            debugLog('Fabric canvas fully initialized');
            return true;
        } catch (error) {
            debugLog(`Error initializing fabric canvas: ${error.message}`);
            return false;
        }
    }

    // Set up the drawing and highlighting areas after PDF rendering
    function setupDrawingLayers(width, height) {
        var drawContainer = document.getElementById(`draw-container-${blockId}`);
        if (!drawContainer) {
            debugLog('Draw container not found for setup');
            return;
        }

        // Set the container dimensions
        drawContainer.style.width = width + 'px';
        drawContainer.style.height = height + 'px';

        // Ensure tools are disabled by default when setting up drawing layers
        drawContainer.classList.remove('draw-mode');
        drawContainer.style.pointerEvents = 'none';

        // Update highlighter dimensions
        var highlightLayer = $(element).find(`#highlight-layer-${blockId}`);
        highlightLayer.css({
            width: width + 'px',
            height: height + 'px'
        });

        // Update text layer dimensions
        var textLayer = $(element).find(`#text-layer-${blockId}`);
        textLayer.css({
            width: width + 'px',
            height: height + 'px'
        });

        // Resize fabric canvas if it exists
        if (fabricCanvas) {
            fabricCanvas.setWidth(width);
            fabricCanvas.setHeight(height);
            fabricCanvas.calcOffset();
            fabricCanvas.renderAll();

            // Ensure drawing mode is OFF by default on page render
            fabricCanvas.isDrawingMode = false;
            fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';

            // Make sure marker knows about new dimensions
            if (marker) {
                marker.setCurrentPage(currentPage);
            }
        }

        debugLog(`Drawing layers set up with dimensions: ${width}x${height}`);
    }

    // Modify the renderPage function to ensure filters are applied correctly
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
            var pdfCanvas = document.getElementById('pdf-canvas-' + blockId);
            var drawContainer = document.getElementById('draw-container-' + blockId);
            var pdfContainer = document.getElementById('pdf-container-' + blockId);
            var pdfViewer = element.querySelector('.pdf-viewer');

            if (!pdfCanvas || !pdfContainer || !pdfViewer) {
                debug('Required elements not found');
                return;
            }

            var context = pdfCanvas.getContext('2d');

            // Store original PDF dimensions
            pdfOriginalWidth = viewport.width;
            pdfOriginalHeight = viewport.height;

            // Determine container width based on viewer and mode
            var containerWidth = pdfViewer.offsetWidth - 30; // Subtracting padding
            var containerHeight = null;

            // Set orientation class
            if (viewport.width > viewport.height) {
                pdfContainer.classList.remove('portrait');
                pdfContainer.classList.add('landscape');
                debug('Page orientation: landscape');
            } else {
                pdfContainer.classList.remove('landscape');
                pdfContainer.classList.add('portrait');
                debug('Page orientation: portrait');
            }

            // Scale based on viewing mode
            var computedScale;
            if (viewMode === 'fit-width') {
                computedScale = containerWidth / viewport.width;
            } else if (viewMode === 'fit-page') {
                // Get available height
                var availableHeight = pdfViewer.offsetHeight - 30;
                var scaleW = containerWidth / viewport.width;
                var scaleH = availableHeight / viewport.height;
                computedScale = Math.min(scaleW, scaleH);
            } else {
                // Custom scale
                computedScale = scale;
            }

            debug('Computing scale: ' + computedScale);

            // Apply computed scale to viewport
            viewport = page.getViewport({ scale: computedScale });

            // Set canvas dimensions
            pdfCanvas.width = viewport.width;
            pdfCanvas.height = viewport.height;

            // Set container dimensions to match viewport
            containerWidth = viewport.width;
            containerHeight = viewport.height;
            pdfContainer.style.width = containerWidth + 'px';
            pdfContainer.style.height = containerHeight + 'px';

            // Set up drawing and highlighting layers
            setupDrawingLayers(containerWidth, containerHeight);

            // Reset any filter that might be on the PDF container
            pdfContainer.style.filter = '';

            // Default: make sure the canvas doesn't have grayscale applied
            if (!isGrayscale) {
                pdfCanvas.style.filter = `brightness(${brightness / 100}) grayscale(0)`;
            } else {
                pdfCanvas.style.filter = `brightness(${brightness / 100}) grayscale(100%)`;
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

                // Apply filters after page is rendered
                applyFilters();

                // Update text layer for highlighting
                updateTextLayer(page, viewport);

                // Restore highlights after rendering
                if (highlighter) {
                    highlighter.restoreHighlights();
                }
            }).catch(function(error) {
                debug('Error rendering page: ' + error);
            });
        }).catch(function(error) {
            debug('Error getting page: ' + error);
        });
    }

    // Add this function after the debugLog function
    function checkDrawingStatus() {
        var status = {
            drawContainer: $(element).find(`#draw-container-${blockId}`)[0],
            fabricCanvas: fabricCanvas,
            isDrawingMode: fabricCanvas ? fabricCanvas.isDrawingMode : false,
            freeDrawingBrush: fabricCanvas ? fabricCanvas.freeDrawingBrush : null,
            upperCanvasPointerEvents: fabricCanvas ? fabricCanvas.upperCanvasEl.style.pointerEvents : 'none',
            drawContainerPointerEvents: $(element).find(`#draw-container-${blockId}`)[0] ?
                $(element).find(`#draw-container-${blockId}`)[0].style.pointerEvents : 'none',
            activeTools: {
                marker: $(element).find(`#marker-tool-${blockId}`).hasClass('active'),
                highlight: $(element).find(`#highlight-tool-${blockId}`).hasClass('active')
            }
        };

        console.log('===== DRAWING STATUS =====');
        console.log(JSON.stringify(status, null, 2));

        if (fabricCanvas) {
            console.log('Canvas size:', fabricCanvas.width, 'x', fabricCanvas.height);
            console.log('Objects on canvas:', fabricCanvas.getObjects().length);

            if (fabricCanvas.freeDrawingBrush) {
                console.log('Drawing brush:',
                    'color =', fabricCanvas.freeDrawingBrush.color,
                    'width =', fabricCanvas.freeDrawingBrush.width,
                    'markerMode =', fabricCanvas.freeDrawingBrush.markerMode);
            }
        }

        debugLog('Drawing status checked - see console for details');

        // Do NOT force any mode changes in the status check function
        // This caused tools to be unexpectedly enabled

        return status;
    }

    // Add this to window for debugging if needed
    window.checkPdfDrawingStatus = function() {
        var blocks = document.querySelectorAll('.pdfx_block');
        blocks.forEach(function(block) {
            var blockId = block.id.replace('pdfx-block-', '');
            console.log('Checking PDF block:', blockId);
            if (window['checkDrawingStatus_' + blockId]) {
                window['checkDrawingStatus_' + blockId]();
            } else {
                console.log('No check function available for this block');
            }
        });
    };

    // Expose the check function with a block-specific name
    window['checkDrawingStatus_' + blockId] = checkDrawingStatus;

    // Add this function to the end of the file, before the initializeWhenReady() call
    function fixMarkerToolIssues() {
        debugLog('Attempting to fix marker tool issues...');

        // Force enable drawing mode
        if (fabricCanvas) {
            // Reset drawing mode
            fabricCanvas.isDrawingMode = true;

            // Configure brush
            fabricCanvas.freeDrawingBrush.color = $(element).find(`#color-input-${blockId}`).val() || '#FF0000';
            fabricCanvas.freeDrawingBrush.width = parseInt($(element).find(`#width-input-${blockId}`).val() || 5);
            fabricCanvas.freeDrawingBrush.markerMode = true;

            // Fix pointer events
            fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

            // Fix draw container
            var drawContainer = $(element).find(`#draw-container-${blockId}`)[0];
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'auto';
                drawContainer.classList.add('draw-mode');
                drawContainer.dataset.currentTool = 'marker';
            }

            // Set active state on marker button
            $(element).find(`#marker-tool-${blockId}`).addClass('active');

            // Explicitly call marker enable
            marker.enable();

            debugLog('Marker tool fixed and re-enabled');
        } else {
            debugLog('ERROR: Cannot fix marker tool - fabric canvas not available');
        }
    }

    // Expose the function globally for debugging purposes
    window[`fixMarkerTool_${blockId}`] = fixMarkerToolIssues;

    // Add global debug functions
    window.pdfxDebug = window.pdfxDebug || {};

    // Function to force initialize the marker tool
    window.forcePdfxInit = function(blockId) {
        console.log("%c[FORCE INIT] Forcing PDF XBlock initialization", "background:#9b59b6;color:white;padding:3px;border-radius:3px;");

        // If no blockId provided, try to find one
        if (!blockId) {
            var pdfxBlocks = document.querySelectorAll('.pdfx_block');
            if (pdfxBlocks.length > 0) {
                blockId = pdfxBlocks[0].id.replace('pdfx-block-', '');
                console.log("[FORCE INIT] Found block ID:", blockId);
            } else {
                console.error("[FORCE INIT] No PDF XBlock found on the page!");
                return false;
            }
        }

        // Find the marker tool button
        var markerBtn = document.getElementById('marker-tool-' + blockId);
        if (markerBtn) {
            console.log("[FORCE INIT] Found marker button, clicking it...");
            markerBtn.click();

            // Try to fix drawing issues
            setTimeout(function() {
                // Access our debug object if available
                if (window.pdfxDebug[blockId] && typeof window.pdfxDebug[blockId].fixMarker === 'function') {
                    console.log("[FORCE INIT] Running fixMarker()...");
                    window.pdfxDebug[blockId].fixMarker();
                } else {
                    console.log("[FORCE INIT] Debug functions not available, trying manual fix...");

                    // Manual fix - find the draw container and force drawing mode
                    var drawContainer = document.getElementById('draw-container-' + blockId);
                    if (drawContainer) {
                        drawContainer.style.pointerEvents = 'auto';
                        drawContainer.classList.add('draw-mode');
                        drawContainer.dataset.currentTool = 'marker';

                        // Find the canvas container
                        var canvasEl = drawContainer.querySelector('.upper-canvas');
                        if (canvasEl) {
                            canvasEl.style.pointerEvents = 'auto';
                        }

                        console.log("[FORCE INIT] Manual fix applied to draw container and canvas");
                    }
                }
            }, 500);

            return true;
        } else {
            console.error("[FORCE INIT] Marker button not found for block:", blockId);
            return false;
        }
    };

    // Global function to check all debug functions
    window.checkPdfxTools = function() {
        console.log("%c[DEBUG CHECK] Checking PDF XBlock tools", "background:#3498db;color:white;padding:3px;border-radius:3px;");

        // Check for fabric.js
        console.log("fabric.js loaded:", typeof fabric !== 'undefined');

        // Find all PDF XBlocks
        var pdfxBlocks = document.querySelectorAll('.pdfx_block');
        console.log("PDF XBlocks found:", pdfxBlocks.length);

        pdfxBlocks.forEach(function(block) {
            var blockId = block.id.replace('pdfx-block-', '');
            console.log("Checking block:", blockId);

            // Check draw container
            var drawContainer = document.getElementById('draw-container-' + blockId);
            console.log("Draw container:", !!drawContainer);
            if (drawContainer) {
                console.log("Draw container styles:", {
                    position: drawContainer.style.position,
                    zIndex: drawContainer.style.zIndex,
                    pointerEvents: drawContainer.style.pointerEvents,
                    className: drawContainer.className
                });
            }

            // Check marker button
            var markerBtn = document.getElementById('marker-tool-' + blockId);
            console.log("Marker button:", !!markerBtn);
            if (markerBtn) {
                console.log("Marker button active:", markerBtn.classList.contains('active'));
            }

            // Check debug functions
            console.log("Debug functions available:", !!window.pdfxDebug[blockId]);
        });

        return "Check complete - see console for details";
    };

    // Start initialization
    initializeWhenReady();
}