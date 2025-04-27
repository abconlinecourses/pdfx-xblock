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

    // Callback functions
    var _debugCallback = _options.debugCallback || function() {};
    var _saveCallback = _options.saveCallback || function() {};

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
            var color = _options.getHighlightColor ? _options.getHighlightColor() : '#FFFF0080';

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
                        height: spanRect.height
                    });
                });

                // Create highlight elements
                createHighlightElements(rects, color);
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

    // Create highlight elements
    function createHighlightElements(rects, color) {
        var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];
        var pageHighlights = [];

        for (var i = 0; i < rects.length; i++) {
            var rect = rects[i];
            var highlightEl = document.createElement('div');
            highlightEl.className = `highlight-${_blockId}`;
            highlightEl.style.left = `${rect.left}px`;
            highlightEl.style.top = `${rect.top}px`;
            highlightEl.style.width = `${rect.width}px`;
            highlightEl.style.height = `${rect.height}px`;
            highlightEl.style.backgroundColor = color;
            highlightEl.style.position = 'absolute';
            highlightEl.style.pointerEvents = 'none';
            highlightEl.style.zIndex = '3';

            textLayer.appendChild(highlightEl);

            // Store highlight data for saving
            pageHighlights.push({
                rect: rect,
                color: color,
                page: _currentPage
            });
        }

        // Save highlights
        _highlights = _highlights.concat(pageHighlights);
        saveHighlights();

        // Trigger save callback if provided
        if (_saveCallback) {
            _saveCallback(_highlights);
        }
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

    // Restore highlights from storage
    function restoreHighlights() {
        try {
            // Get saved highlights for current page and block
            var savedHighlights = localStorage.getItem(`pdf_highlights_${_blockId}_page_${_currentPage}`);

            if (savedHighlights) {
                var pageHighlights = JSON.parse(savedHighlights);
                var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];

                for (var i = 0; i < pageHighlights.length; i++) {
                    var highlight = pageHighlights[i];
                    var highlightEl = document.createElement('div');
                    highlightEl.className = `highlight-${_blockId}`;
                    highlightEl.style.left = `${highlight.rect.left}px`;
                    highlightEl.style.top = `${highlight.rect.top}px`;
                    highlightEl.style.width = `${highlight.rect.width}px`;
                    highlightEl.style.height = `${highlight.rect.height}px`;
                    highlightEl.style.backgroundColor = highlight.color;
                    highlightEl.style.position = 'absolute';
                    highlightEl.style.pointerEvents = 'none';
                    highlightEl.style.zIndex = '3';

                    textLayer.appendChild(highlightEl);
                }

                _debugCallback(`Restored ${pageHighlights.length} highlights for block ${_blockId} page ${_currentPage}`);
            }
        } catch (error) {
            _debugCallback(`Error restoring highlights: ${error.message}`);
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

    // Clear all highlights on current page
    function clearHighlights() {
        var textLayer = $(element).find(`#text-layer-${_blockId}`)[0];
        if (!textLayer) return;

        // Remove highlight elements
        var highlightElements = textLayer.querySelectorAll(`.highlight-${_blockId}`);
        highlightElements.forEach(function(el) {
            el.remove();
        });

        // Remove highlights from array for current page
        _highlights = _highlights.filter(function(h) {
            return h.page !== _currentPage;
        });

        // Save updated highlights
        saveHighlights();

        // Trigger save callback if provided
        if (_saveCallback) {
            _saveCallback(_highlights);
        }

        _debugCallback(`Cleared highlights for block ${_blockId} page ${_currentPage}`);
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
        clearHighlights: clearHighlights
    };
}