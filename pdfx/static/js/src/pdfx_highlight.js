/* PDF Viewer XBlock - Text Highlighting Functions */

/**
 * Text highlighting and management
 */
function PdfxHighlight(element, options) {
    'use strict';

    // Private variables
    var _options = options || {};
    var _highlights = [];
    var _currentPage = 1;
    var _blockId = _options.blockId || 'default';
    var _userId = _options.userId || 'anonymous';  // User ID for tracking
    var _color = '#FFFF0050';  // Default highlight color with transparency (less intensive yellow)
    var _courseId = _options.courseId || null;
    var _documentInfo = _options.documentInfo || {};
    var _isHighlightingActive = false; // Track if highlighting is currently enabled

    // Callback functions
    var _saveCallback = _options.saveCallback || function() {};

    // MongoDB highlight cache to avoid duplicates
    var _mongoHighlightIds = {};

    // Handle text selection - with debounce to prevent excessive processing
    var _selectionTimeout = null;

    // Get block-specific element ID
    function getBlockElementId(baseId) {
        return `${baseId}-${_blockId}`;
    }

    // Apply text cursors to make text layer spans show text-selection cursor on hover
    function applyTextCursors() {
        var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];
        if (!textLayer) {
            return;
        }

        // Make each text span show text cursor on hover
        var textSpans = textLayer.querySelectorAll('span');
        textSpans.forEach(function(span) {
            span.style.cursor = 'text';  // Always show text cursor on hover

            // Keep text selectable, but don't enable full highlighting behavior yet
            span.style.userSelect = 'text';
            span.style.webkitUserSelect = 'text';
            span.style.MozUserSelect = 'text';
            span.style.msUserSelect = 'text';

            // Ensure text is transparent but still selectable
            span.style.color = 'transparent';
            span.style.backgroundColor = 'rgba(255, 255, 255, 0.0)';

            // Enable basic pointer events for cursor to work
            span.style.pointerEvents = 'auto';
        });
    }

    // Enhanced visual feedback for active text layer - optimized for large documents
    function applyActiveHighlightingStyles() {
        try {
            var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];
            if (!textLayer) {
                return false;
            }

            // Add visual indicator for highlighter active state to the container first
            $(textLayer).addClass('highlight-tool-active');

            // Count all spans to determine approach
            var allSpans = textLayer.querySelectorAll('span');
            var spanCount = allSpans.length;

            // Optimize for large documents
            if (spanCount > 2000) {
                // Apply styles to the text layer as a whole rather than individual spans
                textLayer.style.transition = 'background-color 0.2s ease';

                // Create and add a style element with a class-based rule instead of modifying each span
                var styleId = `highlight-style-${_blockId}`;
                var existingStyle = document.getElementById(styleId);

                if (!existingStyle) {
                    var style = document.createElement('style');
                    style.id = styleId;
                    style.textContent = `
                        #text-layer-${_blockId}.highlight-tool-active span:hover {
                            background-color: rgba(255, 255, 0, 0.2) !important;
                            border-radius: 2px;
                            transition: background-color 0.2s ease;
                        }
                    `;
                    document.head.appendChild(style);
                }
            } else {
                // For smaller documents, we can afford to process individual spans
                allSpans.forEach(function(span) {
                    // Add hover effect for better visual feedback
                    span.classList.add('highlight-hover-effect');

                    // Make sure the span has all needed properties for highlighting
                    span.style.transition = 'background-color 0.2s ease';
                    span.style.borderRadius = '2px';
                });
            }
        } catch (error) {
        }
    }

    // Remove active highlighting styles - also optimized
    function removeActiveHighlightingStyles() {
        try {
            var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];
            if (!textLayer) {
                return;
            }

            $(textLayer).removeClass('highlight-tool-active');

            // Count spans to determine approach
            var spanCount = textLayer.querySelectorAll('span').length;

            if (spanCount <= 2000) {
                // Only remove classes from individual spans for smaller documents
                var spans = textLayer.querySelectorAll('span.highlight-hover-effect');

                // Use a more efficient method if there are many spans
                if (spans.length > 500) {
                    // Use className replacement instead of classList for better performance
                    for (var i = 0; i < spans.length; i++) {
                        spans[i].className = spans[i].className.replace('highlight-hover-effect', '').trim();
                    }
                } else {
                    spans.forEach(function(span) {
                        span.classList.remove('highlight-hover-effect');
                    });
                }
            }
        } catch (error) {
        }
    }

    // Enable text selection and highlighting
    function enableTextHighlighting() {
        var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];
        if (!textLayer) {
            return false;
        }

        try {
            // Get the user-selected color from the color picker
            var colorInput = document.getElementById(`color-input-${_blockId}`);
            if (colorInput) {
                // Use color picker color with 50% transparency for highlights
                var colorValue = colorInput.value;
                _color = colorValue + '80'; // Add 50% transparency
            }

            // Make text layer visible and selectable
            $(textLayer).addClass('active');

            // Make each text span selectable - use a more efficient approach
            var textSpans = textLayer.querySelectorAll('span');

            // Safety check to prevent hanging if there are too many spans
            if (textSpans.length > 5000) {
                // Apply styles directly to the text layer instead of each span
                textLayer.style.pointerEvents = 'auto';
                textLayer.style.cursor = 'text';
                textLayer.style.userSelect = 'text';
                textLayer.style.webkitUserSelect = 'text';
                textLayer.style.MozUserSelect = 'text';
                textLayer.style.msUserSelect = 'text';
            } else {
                // Process individual spans since the count is reasonable
                textSpans.forEach(function(span) {
                    span.style.pointerEvents = 'auto';
                    span.style.cursor = 'text';
                    span.style.userSelect = 'text';
                    span.style.webkitUserSelect = 'text';
                    span.style.MozUserSelect = 'text';
                    span.style.msUserSelect = 'text';

                    // Ensure text is transparent but still selectable
                    span.style.color = 'transparent';
                    span.style.backgroundColor = 'rgba(255, 255, 255, 0.0)';

                    // Add hover effect class for better visual feedback
                    span.classList.add('highlight-hover-effect');
                });
            }

            // Remove existing event listener first to avoid duplicates
            try {
                textLayer.removeEventListener('mouseup', handleTextSelection);
                // Add mouse up event for text selection
                textLayer.addEventListener('mouseup', handleTextSelection);
            } catch (eventError) {
            }

            // Set up event listeners for real-time color changes
            try {
                var colorInput = document.getElementById(`color-input-${_blockId}`);
                if (colorInput) {
                    // Remove existing event listener first to avoid duplicates
                    colorInput.removeEventListener('change', handleColorChange);
                    colorInput.addEventListener('change', handleColorChange);
                    colorInput.removeEventListener('input', handleColorChange);
                    colorInput.addEventListener('input', handleColorChange);
                }
            } catch (colorError) {
            }

            // Apply active highlighting styles for better visual feedback
            try {
                applyActiveHighlightingStyles();
            } catch (styleError) {
            }

            // Set flag
            _isHighlightingActive = true;

            return true;
        } catch (error) {
            // Try to reset to a safe state
            _isHighlightingActive = false;
            return false;
        }
    }

    // Handle color changes from the color picker in real-time
    function handleColorChange(event) {
        var newColor = event.target.value;
        // Add 50% transparency for highlights
        var newColorWithTransparency = newColor + '80';
        setHighlightColor(newColorWithTransparency);
    }

    // Disable text selection and highlighting
    function disableTextHighlighting() {
        // Set flag first to prevent any new highlights while disabling
        _isHighlightingActive = false;

        var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];
        if (!textLayer) {
            return false;
        }

        try {
            // Make text layer non-interactive
            $(textLayer).removeClass('active');

            // Remove event listeners
            try {
                textLayer.removeEventListener('mouseup', handleTextSelection);
            } catch (eventError) {
            }

            // Remove color change event listeners
            try {
                var colorInput = document.getElementById(`color-input-${_blockId}`);
                if (colorInput) {
                    colorInput.removeEventListener('change', handleColorChange);
                    colorInput.removeEventListener('input', handleColorChange);
                }
            } catch (colorError) {
            }

            // Remove active highlighting styles
            try {
                removeActiveHighlightingStyles();
            } catch (styleError) {
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    // Handle text selection - with debounce to prevent excessive processing
    function handleTextSelection(event) {
        if (!_isHighlightingActive) {
            return;
        }

        // Clear any existing timeout to prevent multiple rapid selections
        if (_selectionTimeout) {
            clearTimeout(_selectionTimeout);
        }

        // Use setTimeout to debounce selection processing
        _selectionTimeout = setTimeout(function() {
            processTextSelection(event);
        }, 100); // 100ms delay to prevent excessive processing
    }

    // Process the text selection (called by handleTextSelection after debounce)
    function processTextSelection(event) {
        var selection = window.getSelection();
        if (!selection) {
            return;
        }

        var selectedText = selection.toString().trim();

        if (selectedText === '') {
            return; // No text selected
        }

        try {
            // Safety check: make sure we have a range
            if (selection.rangeCount === 0) {
                return;
            }

            var range = selection.getRangeAt(0);

            // Get color from color picker if available
            var colorInput = document.getElementById(`color-input-${_blockId}`);
            if (colorInput) {
                var colorValue = colorInput.value;
                _color = colorValue + '80'; // Add 50% transparency
            } else {
                _color = _options.getHighlightColor ? _options.getHighlightColor() : '#FFFF0050';
            }

            // Get all selected spans within this block's text layer
            var selectedSpans = getSelectedSpans(range);

            if (selectedSpans.length > 0) {
                // Create highlight elements for each selected span
                var rects = [];
                selectedSpans.forEach(function(span) {
                    try {
                        var spanRect = span.getBoundingClientRect();
                        var containerRect = $(element).find(`#pdf-container-${_blockId}`)[0].getBoundingClientRect();
                        if (!containerRect) {
                            return;
                        }
                        rects.push({
                            left: spanRect.left - containerRect.left,
                            top: spanRect.top - containerRect.top,
                            width: spanRect.width,
                            height: spanRect.height,
                            text: span.textContent
                        });
                    } catch (rectError) {
                    }
                });

                if (rects.length === 0) {
                    return;
                }

                // Create highlight elements - check if it was successful
                var highlightsCreated = createSafeHighlightElements(rects, _color, selectedText);

                // Only save if highlights were successfully created
                if (highlightsCreated) {
                    // Save highlights after creation
                    try {
                        saveHighlights();
                    } catch (saveError) {
                    }
                }
            }
        } catch (e) {
        } finally {
            // Always clear the text selection after processing
            try {
                if (window.getSelection) {
                    if (window.getSelection().empty) {  // Chrome
                        window.getSelection().empty();
                    } else if (window.getSelection().removeAllRanges) {  // Firefox
                        window.getSelection().removeAllRanges();
                    }
                } else if (document.selection) {  // IE
                    document.selection.empty();
                }
            } catch (clearError) {
            }
        }
    }

    // Safer version of createHighlightElements with better error handling
    function createSafeHighlightElements(rects, color, text) {
        if (!rects || !Array.isArray(rects) || rects.length === 0) {
            return false;
        }

        var highlightLayer = $(element).find(`#highlight-layer-${_blockId}`)[0];
        if (!highlightLayer) {
            return false;
        }

        // Only proceed if text selection highlighting is enabled
        if (!_isHighlightingActive) {
            return false;
        }

        // Check if we have a fabric canvas to work with from drawing
        var drawContainer = $(element).find(`#draw-container-${_blockId}`)[0];
        var fabricCanvas = drawContainer && drawContainer._fabricCanvas;

        var timestamp = new Date().toISOString();
        var highlightId = `highlight-${_blockId}-${_userId}-${timestamp.replace(/[:.]/g, '-')}`;
        var pageHighlights = [];
        var success = false;

        try {
            // Use DOM-based highlighting as the primary method (more reliable)
            for (var i = 0; i < rects.length; i++) {
                var rect = rects[i];
                var highlightEl = document.createElement('div');
                highlightEl.className = `highlight-${_blockId}`;
                highlightEl.setAttribute('data-highlight-id', highlightId);
                highlightEl.style.left = `${rect.left}px`;
                highlightEl.style.top = `${rect.top}px`;
                highlightEl.style.width = `${rect.width}px`;
                highlightEl.style.height = `${rect.height}px`;
                highlightEl.style.backgroundColor = color;
                highlightEl.style.position = 'absolute';
                highlightEl.style.pointerEvents = 'none';
                highlightEl.style.zIndex = '3';
                highlightEl.style.borderRadius = '2px';
                highlightEl.style.transition = 'opacity 0.2s';
                highlightEl.style.opacity = '0.8';
                highlightEl.style.mixBlendMode = 'multiply';

                // Add data attributes for tracking
                highlightEl.setAttribute('data-user', _userId);
                highlightEl.setAttribute('data-page', _currentPage);
                highlightEl.setAttribute('data-timestamp', timestamp);
                highlightEl.setAttribute('data-text', text || rect.text || '');

                // Add double-click event to remove highlight
                highlightEl.addEventListener('dblclick', function(e) {
                    if (_options.allowAnnotation) {
                        removeHighlight(this.getAttribute('data-highlight-id'));
                    }
                    e.stopPropagation();
                });

                // Add hover effect
                highlightEl.addEventListener('mouseenter', function() {
                    this.style.opacity = '1';
                    this.style.boxShadow = '0 0 3px rgba(0, 0, 0, 0.3)';
                });

                highlightEl.addEventListener('mouseleave', function() {
                    this.style.opacity = '0.8';
                    this.style.boxShadow = 'none';
                });

                highlightLayer.appendChild(highlightEl);

                // Store highlight data for saving
                pageHighlights.push({
                    rect: rect,
                    color: color,
                    page: _currentPage,
                    highlightId: highlightId,
                    text: text || rect.text || '',
                    timestamp: timestamp,
                    userId: _userId,
                    courseId: _courseId,
                    blockId: _blockId,
                    documentInfo: _documentInfo
                });
            }

            // Only use fabric.js for highlights if it's definitely available and initialized
            if (fabricCanvas && typeof fabric !== 'undefined' && fabricCanvas.getContext) {
                // Attempt to also add to the fabric canvas, but don't rely on it
                try {
                    for (var j = 0; j < rects.length; j++) {
                        var fabricRect = new fabric.Rect({
                            left: rects[j].left,
                            top: rects[j].top,
                            width: rects[j].width,
                            height: rects[j].height,
                            fill: color,
                            opacity: 0.3, // Lower opacity for fabric version to avoid double-highlighting
                            selectable: _options.allowAnnotation === true,
                            hoverCursor: _options.allowAnnotation ? 'pointer' : 'default',
                            highlightId: highlightId,
                            userId: _userId,
                            page: _currentPage,
                            text: text || rects[j].text || '',
                            rx: 2, // rounded corners
                            ry: 2
                        });

                        fabricCanvas.add(fabricRect);
                    }
                    fabricCanvas.renderAll();
                } catch (fabricError) {
                    // Continue with DOM-based highlights even if fabric.js fails
                }
            }

            success = true;

            // Add to global highlights array
            _highlights = _highlights.concat(pageHighlights);

            // Try the save callback but don't let it block the operation
            if (_saveCallback) {
                try {
                    _saveCallback({
                        userHighlights: getUserHighlightsForStorage()
                    });
                } catch (saveCallbackError) {
                }
            }
        } catch (e) {
        }

        return success;
    }

    // Keep the original createHighlightElements for backward compatibility
    function createHighlightElements(rects, color, text) {
        return createSafeHighlightElements(rects, color, text);
    }

    // Get all text spans within the selection range - optimized for performance
    function getSelectedSpans(range) {
        try {
            if (!range) {
                return [];
            }

            var spans = [];
            var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];

            if (!textLayer) {
                return [];
            }

            // Get text nodes that are contained in the range
            var allSpans = textLayer.querySelectorAll('span');
            var spanCount = allSpans.length;

            // For large documents, use a more efficient approach
            if (spanCount > 2000) {
                // Use faster range comparison instead of intersectsNode
                var startContainer = range.startContainer;
                var endContainer = range.endContainer;

                // Find starting and ending spans
                var startSpan = startContainer.nodeType === Node.TEXT_NODE ?
                    startContainer.parentNode : startContainer;
                var endSpan = endContainer.nodeType === Node.TEXT_NODE ?
                    endContainer.parentNode : endContainer;

                if (startSpan.tagName !== 'SPAN') {
                    startSpan = $(startSpan).closest('span')[0];
                }

                if (endSpan.tagName !== 'SPAN') {
                    endSpan = $(endSpan).closest('span')[0];
                }

                // If we can't find valid spans, return empty
                if (!startSpan || !endSpan) {
                    return [];
                }

                // Find position in the DOM
                var inSelection = false;

                // Convert NodeList to Array for faster access
                var spansArray = Array.prototype.slice.call(allSpans);
                var startIdx = spansArray.indexOf(startSpan);
                var endIdx = spansArray.indexOf(endSpan);

                // Handle reverse selections
                if (startIdx > endIdx) {
                    var temp = startIdx;
                    startIdx = endIdx;
                    endIdx = temp;
                }

                // Only process the spans that are in the selection range
                for (var i = startIdx; i <= endIdx; i++) {
                    spans.push(spansArray[i]);
                }
            } else {
                // For smaller documents, we can use the normal approach
                allSpans.forEach(function(span) {
                    if (range.intersectsNode(span)) {
                        spans.push(span);
                    }
                });
            }

            return spans;
        } catch (error) {
            return [];
        }
    }

    // Shared method for other tools to detect if they can interact with text selection
    function canInteractWithTextSelection() {
        return _isHighlightingActive;
    }

    // Shared utility to get all text spans in the current page of this block
    function getAllTextSpans() {
        var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];
        if (!textLayer) {
            return [];
        }
        return Array.from(textLayer.querySelectorAll('span'));
    }

    // Remove highlight by ID
    function removeHighlight(highlightId) {
        if (!highlightId) return;

        // Check if we have a fabric canvas to work with
        var drawContainer = $(element).find(`#draw-container-${_blockId}`)[0];
        var fabricCanvas = drawContainer && drawContainer._fabricCanvas;

        if (fabricCanvas) {
            // Remove from fabric canvas if available
            var objectsToRemove = [];
            fabricCanvas.getObjects().forEach(function(obj) {
                if (obj.highlightId === highlightId || (obj.metadata && obj.metadata.highlightId === highlightId)) {
                    objectsToRemove.push(obj);
                }
            });

            objectsToRemove.forEach(function(obj) {
                fabricCanvas.remove(obj);
            });

            if (objectsToRemove.length > 0) {
                fabricCanvas.renderAll();
            }
        }

        // Also remove DOM elements as fallback
        var highlightLayer = $(element).find(`#highlight-layer-${_blockId}`)[0];
        if (highlightLayer) {
            // Remove highlight elements
            var highlightElements = highlightLayer.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
            highlightElements.forEach(function(el) {
                el.remove();
            });
        }

        // Remove from internal array
        _highlights = _highlights.filter(function(h) {
            return h.highlightId !== highlightId;
        });

        // Save updated highlights
        saveHighlights();

        // Delete from MongoDB if it has a MongoDB ID
        if (_mongoHighlightIds[highlightId]) {
            // Call delete handler
            var handlerUrl = runtime.handlerUrl(element, 'delete_highlight');
            $.post(handlerUrl, JSON.stringify({
                highlightId: _mongoHighlightIds[highlightId]
            }));
            delete _mongoHighlightIds[highlightId];
        }
    }

    // Prepare highlights for storage
    function getUserHighlightsForStorage() {
        var highlightsByPage = {};

        _highlights.forEach(function(highlight) {
            var pageStr = highlight.page.toString();
            if (!highlightsByPage[pageStr]) {
                highlightsByPage[pageStr] = [];
            }

            highlightsByPage[pageStr].push({
                rect: highlight.rect,
                color: highlight.color,
                highlightId: highlight.highlightId,
                text: highlight.text,
                timestamp: highlight.timestamp,
                userId: highlight.userId,
                courseId: highlight.courseId,
                blockId: highlight.blockId,
                documentInfo: highlight.documentInfo
            });
        });

        return highlightsByPage;
    }

    // Save highlights to server
    function saveHighlights() {
        if (typeof _saveCallback === 'function') {
            var data = {
                highlights: _highlights,
                userId: _userId,
                blockId: _blockId
            };

            // Save data through callback
            _saveCallback(data);
        }
    }

    // Set highlights from external source
    function setHighlightsFromData(highlightsData) {
        if (!highlightsData) return;

        // Clear existing highlights
        clearHighlights();

        _highlights = [];
        var pageStr = _currentPage.toString();

        if (highlightsData[pageStr] && Array.isArray(highlightsData[pageStr])) {
            highlightsData[pageStr].forEach(function(highlight) {
                if (highlight.rect) {
                    var rects = [highlight.rect];
                    var mongoId = highlight.highlightId;
                    var clientId = highlight.highlightId;

                    // For MongoDB highlights, store the mapping
                    if (mongoId && mongoId.length === 24) {
                        // This is likely a MongoDB ObjectId - create a client-side ID
                        clientId = `highlight-from-mongo-${mongoId}`;
                        _mongoHighlightIds[clientId] = mongoId;
                    }

                    createHighlightElementFromData(
                        rects,
                        highlight.color || _color,
                        highlight.text || '',
                        clientId,
                        highlight.userId,
                        highlight.timestamp
                    );
                }
            });
        }
    }

    // Create highlight elements from existing data - modified to use fabric.js
    function createHighlightElementFromData(rects, color, text, highlightId, userId, timestamp) {
        var highlightLayer = $(element).find(`#highlight-layer-${_blockId}`)[0];
        if (!highlightLayer) {
            return;
        }

        // Check if we have a fabric canvas
        var drawContainer = $(element).find(`#draw-container-${_blockId}`)[0];
        var fabricCanvas = drawContainer && drawContainer._fabricCanvas;

        var pageHighlights = [];
        timestamp = timestamp || new Date().toISOString();
        highlightId = highlightId || `highlight-${_blockId}-${_userId}-${timestamp.replace(/[:.]/g, '-')}`;
        userId = userId || _userId;

        // If we have a fabric canvas, use it for highlighting
        if (fabricCanvas) {
            for (var i = 0; i < rects.length; i++) {
                var rect = rects[i];

                // Create a fabric rectangle for the highlight
                var fabricRect = new fabric.Rect({
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                    fill: color,
                    opacity: 0.5,
                    selectable: userId === _userId && _options.allowAnnotation === true,
                    hoverCursor: userId === _userId && _options.allowAnnotation ? 'pointer' : 'default',
                    highlightId: highlightId,
                    userId: userId,
                    page: _currentPage,
                    text: text,
                    rx: 2, // rounded corners
                    ry: 2
                });

                // Add metadata
                fabricRect.set('metadata', {
                    highlightId: highlightId,
                    userId: userId,
                    page: _currentPage,
                    timestamp: timestamp,
                    text: text
                });

                // Add double click handler for removal if it's the user's own highlight
                if (userId === _userId) {
                    fabricRect.on('mousedblclick', function() {
                        if (_options.allowAnnotation) {
                            removeHighlight(this.highlightId);
                        }
                    });
                }

                // Add to canvas
                fabricCanvas.add(fabricRect);

                // Store highlight data
                pageHighlights.push({
                    rect: rect,
                    color: color,
                    page: _currentPage,
                    highlightId: highlightId,
                    text: text,
                    timestamp: timestamp,
                    userId: userId,
                    courseId: _courseId,
                    blockId: _blockId,
                    documentInfo: _documentInfo
                });
            }

            // Render the canvas to show highlights
            fabricCanvas.renderAll();
        } else {
            // Fallback to DOM-based highlighting
            for (var i = 0; i < rects.length; i++) {
                var rect = rects[i];
                var highlightEl = document.createElement('div');
                highlightEl.className = `highlight-${_blockId}`;
                highlightEl.setAttribute('data-highlight-id', highlightId);
                highlightEl.style.left = `${rect.left}px`;
                highlightEl.style.top = `${rect.top}px`;
                highlightEl.style.width = `${rect.width}px`;
                highlightEl.style.height = `${rect.height}px`;
                highlightEl.style.backgroundColor = color;
                highlightEl.style.position = 'absolute';
                highlightEl.style.pointerEvents = 'none';
                highlightEl.style.zIndex = '3';
                highlightEl.style.borderRadius = '2px';
                highlightEl.style.transition = 'opacity 0.2s';
                highlightEl.style.opacity = '0.8';
                highlightEl.style.mixBlendMode = 'multiply';

                // Add data attributes for tracking
                highlightEl.setAttribute('data-user', userId);
                highlightEl.setAttribute('data-page', _currentPage);
                highlightEl.setAttribute('data-timestamp', timestamp);
                highlightEl.setAttribute('data-text', text);

                // Add double-click event to remove highlight if it belongs to current user
                if (userId === _userId) {
                    highlightEl.addEventListener('dblclick', function(e) {
                        if (_options.allowAnnotation) {
                            removeHighlight(this.getAttribute('data-highlight-id'));
                        }
                        e.stopPropagation();
                    });

                    // Add hover effect
                    highlightEl.addEventListener('mouseenter', function() {
                        this.style.opacity = '1';
                        this.style.boxShadow = '0 0 3px rgba(0, 0, 0, 0.3)';
                    });

                    highlightEl.addEventListener('mouseleave', function() {
                        this.style.opacity = '0.8';
                        this.style.boxShadow = 'none';
                    });

                    // Make it more interactive for the owner
                    highlightEl.style.pointerEvents = 'auto';
                    highlightEl.style.cursor = 'pointer';

                    // Show a tooltip with the highlighted text
                    if (text) {
                        highlightEl.title = text;
                    }
                }

                highlightLayer.appendChild(highlightEl);

                // Store highlight data
                pageHighlights.push({
                    rect: rect,
                    color: color,
                    page: _currentPage,
                    highlightId: highlightId,
                    text: text,
                    timestamp: timestamp,
                    userId: userId,
                    courseId: _courseId,
                    blockId: _blockId,
                    documentInfo: _documentInfo
                });
            }
        }

        // Add to highlights array
        _highlights = _highlights.concat(pageHighlights);
    }

    // Restore highlights from storage
    function restoreHighlights() {
        try {
            // Get saved highlights for current page and block
            var savedHighlights = localStorage.getItem(`pdf_highlights_${_blockId}_page_${_currentPage}`);

            var highlightLayer = $(element).find(`#highlight-layer-${_blockId}`)[0];
            if (!highlightLayer) {
                return;
            }

            // Clear existing highlights
            clearHighlights();

            if (savedHighlights) {
                var pageHighlights = JSON.parse(savedHighlights);
                _highlights = pageHighlights;

                pageHighlights.forEach(function(highlight) {
                    createHighlightElementFromData(
                        [highlight.rect],
                        highlight.color,
                        highlight.text,
                        highlight.highlightId,
                        highlight.userId,
                        highlight.timestamp
                    );
                });
            }

            // Now fetch highlights from MongoDB
            fetchMongoDBHighlights();
        } catch (error) {
        }
    }

    // Fetch highlights from MongoDB
    function fetchMongoDBHighlights() {
        try {
            // Call the handler to get highlights
            var handlerUrl = runtime.handlerUrl(element, 'get_user_highlights');
            $.post(handlerUrl, JSON.stringify({})).done(function(response) {
                if (response.result === 'success' && response.highlights) {
                    setHighlightsFromData(response.highlights);
                }
            }).fail(function(error) {
            });
        } catch (error) {
        }
    }

    // Set the current page and update highlight display
    function setCurrentPage(page) {
        // If we're already on this page, do nothing
        if (_currentPage === page) {
            return;
        }

        // Save highlights for current page before switching
        saveHighlights();

        // Clear highlights for the old page
        clearHighlights();

        // Update current page
        _currentPage = page;

        // Load and render highlights for the new page
        restoreHighlights();

        return _currentPage;
    }

    // Get all highlights
    function getAllHighlights() {
        return _highlights;
    }

    // Set all highlights
    function setAllHighlights(highlights) {
        if (Array.isArray(highlights)) {
            _highlights = highlights;
        }
    }

    // Clear all highlights
    function clearHighlights() {
        // Clear highlight layer
        var highlightLayer = $(element).find(`#highlight-layer-${_blockId}`)[0];
        if (highlightLayer) {
            $(highlightLayer).empty();
        }

        // Also clear from fabric canvas if available
        var drawContainer = $(element).find(`#draw-container-${_blockId}`)[0];
        var fabricCanvas = drawContainer && drawContainer._fabricCanvas;

        if (fabricCanvas) {
            // Remove all highlight objects from the canvas
            var objectsToRemove = [];
            fabricCanvas.getObjects().forEach(function(obj) {
                if (obj.highlightId || (obj.metadata && obj.metadata.highlightId)) {
                    objectsToRemove.push(obj);
                }
            });

            objectsToRemove.forEach(function(obj) {
                fabricCanvas.remove(obj);
            });
        }

        // Reset highlights array
        _highlights = [];

        // Trigger save callback
        if (_saveCallback) {
            _saveCallback({
                userHighlights: {}
            });
        }
    }

    // Set highlight color
    function setHighlightColor(color) {
        if (color) {
            _color = color;
        }
    }

    // Set user ID
    function setUserId(userId) {
        _userId = userId || 'anonymous';
    }

    // Set additional metadata
    function setMetadata(courseId, documentInfo) {
        _courseId = courseId || _courseId;
        _documentInfo = documentInfo || _documentInfo;
    }

    // Check if highlighting is currently active
    function isHighlightingActive() {
        return _isHighlightingActive;
    }

    // Public API
    return {
        enableTextHighlighting: enableTextHighlighting,
        disableTextHighlighting: disableTextHighlighting,
        restoreHighlights: restoreHighlights,
        saveHighlights: saveHighlights,
        setCurrentPage: setCurrentPage,
        getAllHighlights: getAllHighlights,
        setAllHighlights: setAllHighlights,
        clearHighlights: clearHighlights,
        setHighlightColor: setHighlightColor,
        setUserId: setUserId,
        setHighlightsFromData: setHighlightsFromData,
        setMetadata: setMetadata,
        fetchMongoDBHighlights: fetchMongoDBHighlights,
        applyTextCursors: applyTextCursors,
        isHighlightingActive: isHighlightingActive,
        canInteractWithTextSelection: canInteractWithTextSelection,
        getAllTextSpans: getAllTextSpans
    };
}