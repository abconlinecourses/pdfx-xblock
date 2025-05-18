/**
 * PDF Viewer XBlock - Text Tool Functions
 *
 * This file implements text annotation functionality for the PDF XBlock.
 * It allows users to add text annotations to the PDF.
 */
function PdfxText(element, options) {
    'use strict';

    // Private variables
    var _options = options || {};
    var _blockId = _options.blockId || 'default';
    var _userId = _options.userId || 'anonymous';
    var _textAnnotations = [];
    var _isActive = false;
    var _currentPage = 1;
    var _color = '#FF0000';
    var _fontSize = 14;

    // Callback functions
    var _debugCallback = _options.debugCallback || function() {};
    var _saveCallback = _options.saveCallback || function() {};

    /**
     * Initialize the text tool
     */
    function initialize() {
        _debugCallback('Text tool initialized');

        // Get current color from UI if available
        var colorInput = document.getElementById(`color-input-${_blockId}`);
        if (colorInput) {
            _color = colorInput.value;
        }

        // Set up event listeners for the draw container
        var drawContainer = document.getElementById(`draw-container-${_blockId}`);
        if (drawContainer) {
            // Store reference to remove later
            drawContainer._textToolClickHandler = handleContainerClick;
        }
    }

    /**
     * Handle clicks on the draw container when text tool is active
     */
    function handleContainerClick(event) {
        if (!_isActive) return;

        // Create text input at click position
        createTextInput(event.offsetX, event.offsetY);
    }

    /**
     * Create text input at specified position
     */
    function createTextInput(x, y) {
        // Get the draw container
        var drawContainer = document.getElementById(`draw-container-${_blockId}`);
        if (!drawContainer) return;

        // Create text input element
        var textInput = document.createElement('textarea');
        textInput.className = 'pdf-text-annotation';
        textInput.style.position = 'absolute';
        textInput.style.left = x + 'px';
        textInput.style.top = y + 'px';
        textInput.style.color = _color;
        textInput.style.fontSize = _fontSize + 'px';
        textInput.style.minWidth = '100px';
        textInput.style.minHeight = '30px';
        textInput.style.background = 'rgba(255, 255, 255, 0.7)';
        textInput.style.border = '1px solid ' + _color;
        textInput.style.borderRadius = '3px';
        textInput.style.padding = '5px';
        textInput.style.zIndex = '30';
        textInput.style.resize = 'both';
        textInput.style.overflow = 'auto';
        textInput.setAttribute('data-page', _currentPage);
        textInput.setAttribute('data-user-id', _userId);
        textInput.setAttribute('data-timestamp', new Date().toISOString());

        // Add to container
        drawContainer.appendChild(textInput);

        // Focus the input
        textInput.focus();

        // Handle blur event to save text
        textInput.addEventListener('blur', function() {
            saveTextAnnotation(textInput);
        });

        return textInput;
    }

    /**
     * Save text annotation
     */
    function saveTextAnnotation(textInput) {
        if (!textInput.value.trim()) {
            // Remove empty annotations
            textInput.remove();
            return;
        }

        // Create annotation data object
        var annotation = {
            text: textInput.value,
            x: parseInt(textInput.style.left),
            y: parseInt(textInput.style.top),
            width: textInput.offsetWidth,
            height: textInput.offsetHeight,
            color: _color,
            fontSize: _fontSize,
            page: _currentPage,
            userId: _userId,
            timestamp: textInput.getAttribute('data-timestamp')
        };

        // Add to annotations array
        _textAnnotations.push(annotation);

        // Convert textarea to div for display
        convertToDisplayElement(textInput, annotation);

        // Save annotations using callback if provided
        if (_saveCallback && typeof _saveCallback === 'function') {
            _saveCallback({
                type: 'text',
                annotations: _textAnnotations,
                userId: _userId,
                blockId: _blockId
            });
        }
    }

    /**
     * Convert textarea to display element
     */
    function convertToDisplayElement(textInput, annotation) {
        // Create display element
        var displayEl = document.createElement('div');
        displayEl.className = 'pdf-text-annotation-display';
        displayEl.style.position = 'absolute';
        displayEl.style.left = annotation.x + 'px';
        displayEl.style.top = annotation.y + 'px';
        displayEl.style.width = annotation.width + 'px';
        displayEl.style.height = annotation.height + 'px';
        displayEl.style.color = annotation.color;
        displayEl.style.fontSize = annotation.fontSize + 'px';
        displayEl.style.background = 'rgba(255, 255, 255, 0.7)';
        displayEl.style.border = '1px solid ' + annotation.color;
        displayEl.style.borderRadius = '3px';
        displayEl.style.padding = '5px';
        displayEl.style.zIndex = '25';
        displayEl.style.overflow = 'auto';
        displayEl.textContent = annotation.text;
        displayEl.setAttribute('data-annotation-id', annotation.timestamp);
        displayEl.setAttribute('data-page', annotation.page);

        // Add double-click handler to edit
        displayEl.addEventListener('dblclick', function() {
            if (_isActive) {
                editTextAnnotation(displayEl, annotation);
            }
        });

        // Replace textarea with display element
        var parent = textInput.parentNode;
        if (parent) {
            parent.replaceChild(displayEl, textInput);
        }

        return displayEl;
    }

    /**
     * Edit existing text annotation
     */
    function editTextAnnotation(displayEl, annotation) {
        // Create textarea with same properties
        var textInput = document.createElement('textarea');
        textInput.className = 'pdf-text-annotation';
        textInput.style.position = 'absolute';
        textInput.style.left = displayEl.style.left;
        textInput.style.top = displayEl.style.top;
        textInput.style.width = displayEl.style.width;
        textInput.style.height = displayEl.style.height;
        textInput.style.color = annotation.color;
        textInput.style.fontSize = annotation.fontSize + 'px';
        textInput.style.background = 'rgba(255, 255, 255, 0.7)';
        textInput.style.border = '1px solid ' + annotation.color;
        textInput.style.borderRadius = '3px';
        textInput.style.padding = '5px';
        textInput.style.zIndex = '30';
        textInput.style.resize = 'both';
        textInput.style.overflow = 'auto';
        textInput.value = annotation.text;
        textInput.setAttribute('data-annotation-id', annotation.timestamp);
        textInput.setAttribute('data-page', annotation.page);

        // Replace display element with textarea
        var parent = displayEl.parentNode;
        if (parent) {
            parent.replaceChild(textInput, displayEl);
        }

        // Focus the input
        textInput.focus();

        // Handle blur event to save changes
        textInput.addEventListener('blur', function() {
            // Update annotation object
            annotation.text = textInput.value;
            annotation.width = textInput.offsetWidth;
            annotation.height = textInput.offsetHeight;

            // Save and convert back to display
            saveTextAnnotation(textInput);
        });
    }

    /**
     * Load text annotations for current page
     */
    function loadAnnotationsForPage(page) {
        // Get the draw container
        var drawContainer = document.getElementById(`draw-container-${_blockId}`);
        if (!drawContainer) return;

        // Remove all existing text annotations
        var existingAnnotations = drawContainer.querySelectorAll('.pdf-text-annotation-display');
        existingAnnotations.forEach(function(annotation) {
            annotation.remove();
        });

        // Load annotations for current page
        var pageAnnotations = _textAnnotations.filter(function(annotation) {
            return annotation.page === page;
        });

        // Create display elements for each annotation
        pageAnnotations.forEach(function(annotation) {
            var textInput = document.createElement('textarea');
            textInput.value = annotation.text;
            textInput.style.left = annotation.x + 'px';
            textInput.style.top = annotation.y + 'px';

            // Convert to display element
            convertToDisplayElement(textInput, annotation);
        });
    }

    /**
     * Set current page
     */
    function setCurrentPage(page) {
        _currentPage = page;
        loadAnnotationsForPage(page);
    }

    /**
     * Enable text tool
     */
    function enable() {
        if (_isActive) return;

        _isActive = true;

        // Add click handler to draw container
        var drawContainer = document.getElementById(`draw-container-${_blockId}`);
        if (drawContainer && drawContainer._textToolClickHandler) {
            drawContainer.addEventListener('click', drawContainer._textToolClickHandler);
        }

        // Set cursor style
        if (drawContainer) {
            drawContainer.style.cursor = 'text';
        }
    }

    /**
     * Disable text tool
     */
    function disable() {
        if (!_isActive) return;

        _isActive = false;

        // Remove click handler from draw container
        var drawContainer = document.getElementById(`draw-container-${_blockId}`);
        if (drawContainer && drawContainer._textToolClickHandler) {
            drawContainer.removeEventListener('click', drawContainer._textToolClickHandler);
        }

        // Reset cursor style
        if (drawContainer) {
            drawContainer.style.cursor = 'default';
        }
    }

    /**
     * Set text color
     */
    function setColor(color) {
        _color = color;
    }

    /**
     * Set font size
     */
    function setFontSize(size) {
        _fontSize = size;
    }

    /**
     * Get all text annotations
     */
    function getAllAnnotations() {
        return _textAnnotations;
    }

    /**
     * Set text annotations from data
     */
    function setAnnotations(annotations) {
        if (Array.isArray(annotations)) {
            _textAnnotations = annotations;
            loadAnnotationsForPage(_currentPage);
        }
    }

    // Initialize on creation
    initialize();

    // Return public API
    return {
        enable: enable,
        disable: disable,
        setCurrentPage: setCurrentPage,
        setColor: setColor,
        setFontSize: setFontSize,
        getAllAnnotations: getAllAnnotations,
        setAnnotations: setAnnotations
    };
}

// Register text tool globally for initialization
window.initTextTool = function(blockId, options) {
    if (!blockId) return null;

    // Set default options
    options = options || {};
    options.blockId = blockId;

    // Create the text tool instance
    var block = document.getElementById('pdfx-block-' + blockId);
    if (!block) return null;

    // Create text tool instance
    var textTool = new PdfxText(block, options);

    // Register globally
    window['textTool_' + blockId] = textTool;

    return textTool;
};

// Debug logging helper - can be disabled in production
function logText(blockId, message) {
    // Empty implementation
}

// Save handler for text annotations
window.saveTextAnnotations = function(blockId, data) {
    // Empty debug implementation
};

// Module loaded notification
// Module loaded