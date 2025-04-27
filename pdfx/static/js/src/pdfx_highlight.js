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

    // Callback functions
    var _debugCallback = _options.debugCallback || function() {};
    var _saveCallback = _options.saveCallback || function() {};

    // MongoDB highlight cache to avoid duplicates
    var _mongoHighlightIds = {};

    // Get block-specific element ID
    function getBlockElementId(baseId) {
        return `${baseId}-${_blockId}`;
    }

    // Enable text selection and highlighting
    function enableTextHighlighting() {
        var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];
        if (!textLayer) {
            _debugCallback('Text layer not found');
            return;
        }

        // Make text layer visible and selectable
        $(textLayer).addClass('active');

        // Make each text span selectable
        var textSpans = textLayer.querySelectorAll('span');
        textSpans.forEach(function(span) {
            span.style.pointerEvents = 'auto';
            span.style.cursor = 'text';
            span.style.userSelect = 'text';
            span.style.webkitUserSelect = 'text';
        });

        // Add mouse up event for text selection
        textLayer.removeEventListener('mouseup', handleTextSelection);
        textLayer.addEventListener('mouseup', handleTextSelection);

        _debugCallback('Text highlighting enabled');
    }

    // Disable text selection and highlighting
    function disableTextHighlighting() {
        var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];
        if (!textLayer) {
            _debugCallback('Text layer not found');
            return;
        }

        // Make text layer non-interactive
        $(textLayer).removeClass('active');

        // Remove event listener
        textLayer.removeEventListener('mouseup', handleTextSelection);

        _debugCallback('Text highlighting disabled');
    }

    // Handle text selection for highlighting
    function handleTextSelection() {
        var selection = window.getSelection();
        var selectedText = selection.toString().trim();

        if (selectedText === '') {
            return; // No text selected
        }

        _debugCallback(`Selected text: "${selectedText}"`);

        try {
            var range = selection.getRangeAt(0);
            _color = _options.getHighlightColor ? _options.getHighlightColor() : '#FFFF0050';

            // Get all selected spans within this block's text layer
            var selectedSpans = getSelectedSpans(range);
            _debugCallback(`Selected ${selectedSpans.length} text spans`);

            if (selectedSpans.length > 0) {
                // Create highlight elements for each selected span
                var rects = [];
                selectedSpans.forEach(function(span) {
                    var spanRect = span.getBoundingClientRect();
                    var containerRect = $(element).find(`#pdf-container-${_blockId}`)[0].getBoundingClientRect();
                    rects.push({
                        left: spanRect.left - containerRect.left,
                        top: spanRect.top - containerRect.top,
                        width: spanRect.width,
                        height: spanRect.height,
                        text: span.textContent
                    });
                });

                // Create highlight elements
                createHighlightElements(rects, _color, selectedText);
                _debugCallback(`Created ${rects.length} highlight elements`);

                // Clear selection after a short delay
                setTimeout(function() {
                    selection.removeAllRanges();
                }, 100);
            }
        } catch (error) {
            _debugCallback(`Error highlighting text: ${error.message}`);
        }
    }

    // Get all text spans within the selection range
    function getSelectedSpans(range) {
        var spans = [];
        var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];

        // Get all spans in the text layer
        var allSpans = textLayer.querySelectorAll('span');

        // Check each span if it's within the selection range
        allSpans.forEach(function(span) {
            if (range.intersectsNode(span)) {
                spans.push(span);
            }
        });

        return spans;
    }

    // Create highlight elements using fabric.js rectangles
    function createHighlightElements(rects, color, text) {
        var highlightLayer = $(element).find(`#highlight-layer-${_blockId}`)[0];
        if (!highlightLayer) {
            _debugCallback('Highlight layer not found');
            return;
        }

        // Only proceed if text selection highlighting is enabled
        if (!$(element).find(`#text-layer-${_blockId}`).hasClass('active')) {
            _debugCallback('Text highlighting not currently enabled');
            return;
        }

        // Check if we have a fabric canvas to work with from drawing
        var drawContainer = $(element).find(`#draw-container-${_blockId}`)[0];
        var fabricCanvas = drawContainer && drawContainer._fabricCanvas;

        var timestamp = new Date().toISOString();
        var highlightId = `highlight-${_blockId}-${_userId}-${timestamp.replace(/[:.]/g, '-')}`;
        var pageHighlights = [];

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
                    selectable: _options.allowAnnotation === true,
                    hoverCursor: _options.allowAnnotation ? 'pointer' : 'default',
                    highlightId: highlightId,
                    userId: _userId,
                    page: _currentPage,
                    text: text || rect.text || '',
                    rx: 2, // rounded corners
                    ry: 2
                });

                // Add metadata
                fabricRect.set('metadata', {
                    highlightId: highlightId,
                    userId: _userId,
                    page: _currentPage,
                    timestamp: timestamp,
                    text: text || rect.text || ''
                });

                // Add to canvas
                fabricCanvas.add(fabricRect);

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

            // Render the canvas to show highlights
            fabricCanvas.renderAll();
        } else {
            // Fallback to original DOM-based highlighting if fabric.js not available
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
        }

        // Save highlights
        _highlights = _highlights.concat(pageHighlights);
        saveHighlights();

        // Trigger save callback if provided
        if (_saveCallback) {
            _saveCallback({
                userHighlights: getUserHighlightsForStorage()
            });
        }

        _debugCallback(`Created ${pageHighlights.length} highlights with color ${color}`);
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

        _debugCallback(`Removed highlight: ${highlightId}`);
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

    // Save highlights to storage
    function saveHighlights() {
        // Filter highlights for current page
        var pageHighlights = _highlights.filter(function(h) {
            return h.page === _currentPage;
        });

        // Store in localStorage with block-specific key
        try {
            localStorage.setItem(`pdf_highlights_${_blockId}_page_${_currentPage}`, JSON.stringify(pageHighlights));
            _debugCallback(`Saved ${pageHighlights.length} highlights for block ${_blockId} page ${_currentPage}`);
        } catch (e) {
            _debugCallback(`Error saving highlights: ${e.message}`);
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

        _debugCallback(`Loaded highlights from data for page ${_currentPage}`);
    }

    // Create highlight elements from existing data - modified to use fabric.js
    function createHighlightElementFromData(rects, color, text, highlightId, userId, timestamp) {
        var highlightLayer = $(element).find(`#highlight-layer-${_blockId}`)[0];
        if (!highlightLayer) {
            _debugCallback('Highlight layer not found');
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
                _debugCallback('Highlight layer not found');
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

                _debugCallback(`Restored ${pageHighlights.length} highlights for block ${_blockId} page ${_currentPage}`);
            }

            // Now fetch highlights from MongoDB
            fetchMongoDBHighlights();
        } catch (error) {
            _debugCallback(`Error restoring highlights: ${error.message}`);
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
                    _debugCallback('Loaded highlights from MongoDB');
                }
            }).fail(function(error) {
                _debugCallback('Error loading highlights from MongoDB: ' + JSON.stringify(error));
            });
        } catch (error) {
            _debugCallback(`Error fetching MongoDB highlights: ${error.message}`);
        }
    }

    // Set current page
    function setCurrentPage(page) {
        _currentPage = page;
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

            if (objectsToRemove.length > 0) {
                fabricCanvas.renderAll();
            }
        }

        // Reset highlights array
        _highlights = [];

        // Trigger save callback
        if (_saveCallback) {
            _saveCallback({
                userHighlights: {}
            });
        }

        _debugCallback('Cleared all highlights');
    }

    // Set highlight color
    function setHighlightColor(color) {
        if (color) {
            _color = color;
            _debugCallback(`Highlight color set to: ${color}`);
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
        fetchMongoDBHighlights: fetchMongoDBHighlights
    };
}