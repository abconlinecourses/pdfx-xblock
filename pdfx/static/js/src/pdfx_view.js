/* PDF Viewer XBlock - Student View */
function PdfxXBlock(runtime, element, initArgs) {
    'use strict';

    // Initialize PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // Variables from XBlock backend
    var pdfUrl = initArgs.pdfUrl;
    var allowDownload = initArgs.allowDownload;
    var allowAnnotation = initArgs.allowAnnotation;
    var savedAnnotations = initArgs.savedAnnotations;
    var currentPage = initArgs.currentPage;

    // PDF Variables
    var pdfDoc = null;
    var pdfCanvas = $(element).find('#pdf-canvas')[0];
    var pdfCtx = pdfCanvas.getContext('2d');
    var pdfOriginalWidth = 0;
    var pdfOriginalHeight = 0;
    var pdfTextContent = null;
    var currentZoom = 1.0;

    // Drawing Variables
    var drawingCanvas = null;
    var currentTool = 'pen';
    var currentShape = null;
    var currentShapeType = 'rect';
    var isDrawing = false;
    var startPoint = null;
    var canvasHistory = [];
    var historyIndex = -1;
    var maxHistorySteps = 50;
    var commentIndex = 1;

    // View Variables
    var currentBrightness = 100;
    var minBrightness = 50;
    var maxBrightness = 150;
    var brightnessStep = 10;
    var isGrayscale = false;
    var isInkMode = false;

    // Drawing recording variables
    var drawingStrokes = [];
    var isRecording = false;
    var currentStroke = null;
    var playbackInterval = null;
    var isPlaying = false;

    // Initialize the viewer
    function init() {
        // Load PDF
        loadPDF();

        // Initialize tools
        initializeTools();

        // Initialize keyboard shortcuts
        initializeKeyboardShortcuts();

        // Load saved annotations if available
        if (savedAnnotations && Object.keys(savedAnnotations).length > 0) {
            loadSavedAnnotations();
        }

        // Disable annotation tools if not allowed
        if (!allowAnnotation) {
            disableAnnotationTools();
        }

        // Hide download button if not allowed
        if (!allowDownload) {
            $(element).find('#download-tool').hide();
        }
    }

    // Load PDF
    async function loadPDF() {
        try {
            debug('Loading PDF...');
            pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
            debug(`PDF loaded successfully. Pages: ${pdfDoc.numPages}`);
            $(element).find('#page-count').text(pdfDoc.numPages);
            await renderPage(currentPage);
            // Auto-fit page on initial load
            fitToPage();
            debug('Initial page fit applied');
        } catch (error) {
            debug(`Error loading PDF: ${error.message}`);
            showError('Failed to load PDF');
        }
    }

    // Render PDF page
    async function renderPage(pageNum) {
        try {
            debug(`Rendering page ${pageNum}...`);
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: currentZoom });

            // Store original dimensions for page fit
            pdfOriginalWidth = viewport.width / currentZoom;
            pdfOriginalHeight = viewport.height / currentZoom;

            // Set canvas size to match PDF page
            pdfCanvas.width = viewport.width;
            pdfCanvas.height = viewport.height;

            // Render PDF to canvas
            await page.render({
                canvasContext: pdfCtx,
                viewport: viewport
            }).promise;

            // Set up text layer
            const textLayer = $(element).find('#text-layer');
            textLayer.empty();
            textLayer.width(viewport.width).height(viewport.height);
            textLayer.css('--scale-factor', currentZoom);

            // Get text content
            debug('Getting text content from PDF...');
            const textContent = await page.getTextContent();
            pdfTextContent = textContent;

            // Render text layer
            const renderTextLayerTask = pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayer[0],
                viewport: viewport,
                textDivs: []
            });

            await renderTextLayerTask.promise;
            debug('Text layer rendered successfully');

            // Set up drawing canvas
            initDrawingCanvas(viewport.width, viewport.height);

            // Update page number display
            $(element).find('#current-page').text(pageNum);
            $(element).find('#zoom-level').text(`${Math.round(currentZoom * 100)}%`);

            // Save current page to server
            saveAnnotations();

            debug('Page rendered successfully');
        } catch (error) {
            debug(`Error rendering page: ${error.message}`);
            showError('Failed to render page');
        }
    }

    // Initialize drawing canvas
    function initDrawingCanvas(width, height) {
        debug(`Initializing drawing canvas (${width}x${height})`);

        // Remove previous canvas if it exists
        if (drawingCanvas) {
            drawingCanvas.dispose();
            $(element).find('#draw-container').empty();
        }

        // Create new canvas element
        const canvasEl = $('<canvas>').attr({
            id: 'drawing-canvas',
            width: width,
            height: height
        });
        $(element).find('#draw-container').append(canvasEl);

        // Initialize Fabric.js canvas
        drawingCanvas = new fabric.Canvas('drawing-canvas', {
            isDrawingMode: true,
            backgroundColor: 'rgba(0,0,0,0)'
        });

        // Position canvas over PDF
        drawingCanvas.wrapperEl.style.position = 'absolute';
        drawingCanvas.wrapperEl.style.top = '0';
        drawingCanvas.wrapperEl.style.left = '0';

        // Setup brush
        drawingCanvas.freeDrawingBrush = new fabric.PencilBrush(drawingCanvas);
        updateBrush();

        // Add event listeners
        setupCanvasEventListeners();

        // Reset history for the new page
        canvasHistory = [];
        historyIndex = -1;

        // Add initial blank state
        saveCanvasState();

        debug('Drawing canvas initialized');
    }

    // Setup canvas event listeners
    function setupCanvasEventListeners() {
        drawingCanvas.on('mouse:down', onMouseDown);
        drawingCanvas.on('mouse:move', onMouseMove);
        drawingCanvas.on('mouse:up', onMouseUp);

        drawingCanvas.on('path:created', () => {
            debug('Path created');
            saveCanvasState();
        });

        drawingCanvas.on('object:added', () => {
            saveCanvasState();
        });

        drawingCanvas.on('object:modified', () => {
            saveCanvasState();
        });

        drawingCanvas.on('object:removed', () => {
            saveCanvasState();
        });
    }

    // Initialize tools
    function initializeTools() {
        // Tool buttons
        $(element).find('.tool-btn').on('click', function() {
            const toolId = $(this).attr('id');
            switch(toolId) {
                case 'pen-tool':
                    setTool('pen');
                    break;
                case 'highlighter-tool':
                    setTool('highlighter');
                    break;
                case 'shape-tool':
                    toggleShapeMenu();
                    break;
                case 'sticky-note-tool':
                    setTool('sticky-note');
                    break;
                case 'comment-tool':
                    setTool('comment');
                    break;
                case 'eraser-tool':
                    setTool('eraser');
                    break;
                case 'select-tool':
                    setTool('select');
                    break;
                case 'text-tool':
                    setTool('text');
                    break;
            }
        });

        // Shape options
        $(element).find('.shape-option').on('click', function() {
            currentShapeType = $(this).data('shape');
            setTool('shape');
            $(element).find('.shape-menu').removeClass('visible');
        });

        // Drawing controls
        $(element).find('#color-input, #width-input').on('change', updateBrush);

        // Page navigation
        $(element).find('#prev-page').on('click', () => changePage(-1));
        $(element).find('#next-page').on('click', () => changePage(1));

        // Zoom controls
        $(element).find('#zoom-in').on('click', () => adjustZoom(0.1));
        $(element).find('#zoom-out').on('click', () => adjustZoom(-0.1));

        // View controls
        $(element).find('#fullscreen-btn').on('click', toggleFullscreen);
        $(element).find('#page-fit-btn').on('click', fitToPage);
        $(element).find('#page-list-btn').on('click', openPageList);

        // Playback controls
        $(element).find('#play-drawing').on('click', startPlayback);
        $(element).find('#pause-drawing').on('click', pausePlayback);
        $(element).find('#reset-drawing').on('click', resetPlayback);

        // Other controls
        $(element).find('#clear-tool').on('click', clearCanvas);
        $(element).find('#download-tool').on('click', downloadPDF);
        $(element).find('#undo-btn').on('click', undo);
        $(element).find('#redo-btn').on('click', redo);
    }

    // Save annotations to server
    function saveAnnotations() {
        if (!allowAnnotation) return;

        const data = {
            annotations: {
                strokes: drawingStrokes,
                canvasState: drawingCanvas ? drawingCanvas.toJSON() : null
            },
            currentPage: currentPage
        };

        const handlerUrl = runtime.handlerUrl(element, 'save_annotations');

        $.post(handlerUrl, JSON.stringify(data))
            .fail(function() {
                debug('Failed to save annotations');
            });
    }

    // Load saved annotations
    function loadSavedAnnotations() {
        if (!savedAnnotations || !drawingCanvas) return;

        if (savedAnnotations.canvasState) {
            drawingCanvas.loadFromJSON(savedAnnotations.canvasState, function() {
                drawingCanvas.renderAll();
                debug('Loaded saved canvas state');
            });
        }

        if (savedAnnotations.strokes) {
            drawingStrokes = savedAnnotations.strokes;
            debug(`Loaded ${drawingStrokes.length} saved strokes`);
        }
    }

    // Disable annotation tools
    function disableAnnotationTools() {
        $(element).find('.tool-btn').not('#page-fit-btn, #fullscreen-btn, #page-list-btn').prop('disabled', true);
        $(element).find('.drawing-controls').hide();
        if (drawingCanvas) {
            drawingCanvas.isDrawingMode = false;
            drawingCanvas.selection = false;
        }
    }

    // Debug function
    function debug(message) {
        const debugContent = $(element).find('#debug-content');
        debugContent.append(message + '<br>');
        console.log(message);
    }

    // Show error message
    function showError(message) {
        // Implement error display logic here
        console.error(message);
    }

    // Initialize the viewer
    init();

    // Return public API
    return {
        renderPage: renderPage,
        setTool: setTool,
        clearCanvas: clearCanvas
    };
}