/**
 * PDF Viewer XBlock - Note Tool Functions
 *
 * This file implements sticky note functionality for the PDF XBlock.
 * It allows users to add colorful sticky notes to the PDF.
 */
function PdfxNote(element, options) {
    'use strict';

    // Private variables
    var _options = options || {};
    var _blockId = _options.blockId || 'default';
    var _userId = _options.userId || 'anonymous';
    var _courseId = _options.courseId || null;
    var _documentInfo = _options.documentInfo || {};
    var _noteAnnotations = [];
    var _isActive = false;
    var _currentPage = 1;
    var _color = '#FFFF99'; // Default sticky note color
    var _fabricCanvas = null;
    var _defaultNoteWidth = 150;
    var _defaultNoteHeight = 150;

    // Note color options
    var _noteColors = [
        '#FFFF99', // Yellow
        '#FFD700', // Gold
        '#FF9999', // Pink
        '#99FF99', // Green
        '#99CCFF', // Blue
        '#CC99FF'  // Purple
    ];

    // Callback functions
    var _debugCallback = _options.debugCallback || function() {};
    var _saveCallback = _options.saveCallback || function() {};

    /**
     * Initialize the note tool
     */
    function init(fabricCanvas) {
        _fabricCanvas = fabricCanvas;
        _debugCallback('Note tool initialized');
        console.log(`[NOTE] Initializing note tool for block ${_blockId}`);

        // Create color selector UI if it doesn't exist already
        createColorSelector();

        // Make this instance globally available
        window[`noteInstance_${_blockId}`] = this;
    }

    /**
     * Create color selector UI for notes
     */
    function createColorSelector() {
        // Check if selector already exists
        var existingSelector = document.getElementById(`note-color-selector-${_blockId}`);
        if (existingSelector) return;

        // Create color selector container
        var selectorContainer = document.createElement('div');
        selectorContainer.id = `note-color-selector-${_blockId}`;
        selectorContainer.className = 'note-color-selector-container';
        selectorContainer.style.position = 'absolute';
        selectorContainer.style.display = 'none'; // Hidden by default
        selectorContainer.style.top = '50px';
        selectorContainer.style.left = '60px';
        selectorContainer.style.zIndex = '100';
        selectorContainer.style.backgroundColor = '#fff';
        selectorContainer.style.border = '1px solid #ddd';
        selectorContainer.style.borderRadius = '4px';
        selectorContainer.style.padding = '5px';
        selectorContainer.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

        // Create buttons for each color
        _noteColors.forEach(function(color) {
            var button = document.createElement('button');
            button.className = 'note-color-btn';
            button.setAttribute('data-note-color', color);
            button.style.margin = '3px';
            button.style.width = '25px';
            button.style.height = '25px';
            button.style.backgroundColor = color;
            button.style.border = '1px solid #ccc';
            button.style.borderRadius = '3px';
            button.style.cursor = 'pointer';

            // Add click handler
            button.addEventListener('click', function() {
                _color = color;
                highlightSelectedColor(this);
                console.log(`[NOTE] Selected note color: ${color}`);
            });

            selectorContainer.appendChild(button);
        });

        // Add to the document
        var toolbarContainer = document.querySelector('.toolbar-container');
        if (toolbarContainer) {
            toolbarContainer.appendChild(selectorContainer);
        } else {
            document.body.appendChild(selectorContainer);
        }

        console.log('[NOTE] Created note color selector UI');
    }

    /**
     * Highlight the selected color button
     */
    function highlightSelectedColor(selectedButton) {
        var buttons = document.querySelectorAll(`#note-color-selector-${_blockId} .note-color-btn`);
        buttons.forEach(function(button) {
            button.style.boxShadow = 'none';
        });

        if (selectedButton) {
            selectedButton.style.boxShadow = '0 0 5px #000';
        }
    }

    /**
     * Create a new note at the specified position
     */
    function createNote(x, y) {
        if (!_fabricCanvas) return;

        console.log(`[NOTE] Creating new note at (${x}, ${y})`);

        var noteId = 'note-' + _blockId + '-' + _userId + '-' + Date.now();

        // Create the note container
        var noteRect = new fabric.Rect({
            left: x,
            top: y,
            width: _defaultNoteWidth,
            height: _defaultNoteHeight,
            fill: _color,
            rx: 5,
            ry: 5,
            stroke: '#ccc',
            strokeWidth: 1,
            shadow: new fabric.Shadow({
                color: 'rgba(0,0,0,0.3)',
                offsetX: 3,
                offsetY: 3,
                blur: 5
            }),
            selectable: true,
            hasControls: true,
            hasBorders: true
        });

        // Create editable text
        var noteText = new fabric.Textbox('Click to edit note', {
            left: x + 10,
            top: y + 10,
            width: _defaultNoteWidth - 20,
            fontSize: 14,
            fontFamily: 'Arial',
            fill: '#000',
            selectable: true,
            editable: true,
            editingBorderColor: '#03A9F4',
            cursorWidth: 2,
            cursorColor: '#03A9F4',
            lockMovementX: true,
            lockMovementY: true
        });

        // Create header with close button (X)
        var noteHeader = new fabric.Rect({
            left: x,
            top: y,
            width: _defaultNoteWidth,
            height: 20,
            fill: darkenColor(_color, 20),
            rx: 5,
            ry: 5,
            selectable: false
        });

        var closeIcon = new fabric.Text('✕', {
            left: x + _defaultNoteWidth - 15,
            top: y + 5,
            fontSize: 12,
            fontFamily: 'Arial',
            fill: '#000',
            selectable: true,
            hoverCursor: 'pointer'
        });

        // Create the group
        var noteGroup = new fabric.Group([noteRect, noteHeader, noteText, closeIcon], {
            left: x,
            top: y,
            selectable: true,
            hasControls: true,
            hasBorders: true,
            noteId: noteId,
            userId: _userId,
            page: _currentPage,
            timestamp: new Date().toISOString(),
            blockId: _blockId
        });

        // Add metadata
        noteGroup.set({
            noteType: 'sticky',
            noteId: noteId,
            userId: _userId,
            page: _currentPage,
            timestamp: new Date().toISOString(),
            blockId: _blockId,
            noteColor: _color,
            noteText: noteText.text
        });

        // Add custom handlers for this group
        noteGroup._objects[3].on('mousedown', function(e) {
            // Handle close button click
            deleteNote(noteGroup);
            e.stopPropagation();
        });

        // Add to canvas
        _fabricCanvas.add(noteGroup);
        _fabricCanvas.setActiveObject(noteText);
        _fabricCanvas.renderAll();

        // Save the note data
        var noteData = {
            id: noteId,
            x: x,
            y: y,
            width: _defaultNoteWidth,
            height: _defaultNoteHeight,
            color: _color,
            text: noteText.text,
            page: _currentPage,
            userId: _userId,
            timestamp: new Date().toISOString(),
            courseId: _courseId,
            blockId: _blockId,
            documentInfo: _documentInfo
        };

        // Store in annotations array
        if (!_noteAnnotations[_currentPage]) {
            _noteAnnotations[_currentPage] = [];
        }
        _noteAnnotations[_currentPage].push(noteData);

        // Save to server
        saveNoteAnnotations();

        return noteGroup;
    }

    /**
     * Delete a note
     */
    function deleteNote(noteGroup) {
        if (!_fabricCanvas || !noteGroup) return;

        console.log(`[NOTE] Deleting note: ${noteGroup.noteId}`);

        // Remove from fabric canvas
        _fabricCanvas.remove(noteGroup);

        // Remove from annotations array
        if (_noteAnnotations[_currentPage]) {
            _noteAnnotations[_currentPage] = _noteAnnotations[_currentPage].filter(function(note) {
                return note.id !== noteGroup.noteId;
            });
        }

        // Save the changes
        saveNoteAnnotations();
    }

    /**
     * Handle note text editing completed
     */
    function handleNoteTextEdited(textbox, noteGroup) {
        // Update the note data
        _noteAnnotations[_currentPage].forEach(function(note) {
            if (note.id === noteGroup.noteId) {
                note.text = textbox.text;
            }
        });

        // Save the changes
        saveNoteAnnotations();
    }

    /**
     * Save note annotations
     */
    function saveNoteAnnotations() {
        if (_saveCallback && typeof _saveCallback === 'function') {
            _saveCallback({
                type: 'note',
                noteAnnotations: _noteAnnotations,
                userId: _userId,
                blockId: _blockId,
                currentPage: _currentPage
            });
        }

        console.log(`[NOTE] Saved note annotations for page ${_currentPage}`);
    }

    /**
     * Load notes for the current page
     */
    function loadNotesForPage(page) {
        if (!_fabricCanvas) return;

        // Clear existing notes from canvas
        var objects = _fabricCanvas.getObjects();
        for (var i = 0; i < objects.length; i++) {
            if (objects[i].noteType === 'sticky') {
                _fabricCanvas.remove(objects[i]);
            }
        }

        // Load notes for this page
        if (_noteAnnotations[page] && _noteAnnotations[page].length > 0) {
            _noteAnnotations[page].forEach(function(noteData) {
                createNoteFromData(noteData);
            });

            _fabricCanvas.renderAll();
        }
    }

    /**
     * Create a note from saved data
     */
    function createNoteFromData(noteData) {
        if (!_fabricCanvas) return;

        var x = noteData.x;
        var y = noteData.y;
        var width = noteData.width || _defaultNoteWidth;
        var height = noteData.height || _defaultNoteHeight;
        var color = noteData.color || _color;

        // Create the note container
        var noteRect = new fabric.Rect({
            left: x,
            top: y,
            width: width,
            height: height,
            fill: color,
            rx: 5,
            ry: 5,
            stroke: '#ccc',
            strokeWidth: 1,
            shadow: new fabric.Shadow({
                color: 'rgba(0,0,0,0.3)',
                offsetX: 3,
                offsetY: 3,
                blur: 5
            }),
            selectable: true,
            hasControls: true,
            hasBorders: true
        });

        // Create editable text
        var noteText = new fabric.Textbox(noteData.text || 'Note', {
            left: x + 10,
            top: y + 10,
            width: width - 20,
            fontSize: 14,
            fontFamily: 'Arial',
            fill: '#000',
            selectable: true,
            editable: noteData.userId === _userId,
            editingBorderColor: '#03A9F4',
            cursorWidth: 2,
            cursorColor: '#03A9F4',
            lockMovementX: true,
            lockMovementY: true
        });

        // Create header with close button (X)
        var noteHeader = new fabric.Rect({
            left: x,
            top: y,
            width: width,
            height: 20,
            fill: darkenColor(color, 20),
            rx: 5,
            ry: 5,
            selectable: false
        });

        var closeIcon = new fabric.Text('✕', {
            left: x + width - 15,
            top: y + 5,
            fontSize: 12,
            fontFamily: 'Arial',
            fill: '#000',
            selectable: noteData.userId === _userId,
            hoverCursor: noteData.userId === _userId ? 'pointer' : 'not-allowed'
        });

        // Create the group
        var noteGroup = new fabric.Group([noteRect, noteHeader, noteText, closeIcon], {
            left: x,
            top: y,
            selectable: noteData.userId === _userId,
            hasControls: noteData.userId === _userId,
            hasBorders: noteData.userId === _userId,
            noteId: noteData.id,
            userId: noteData.userId,
            page: noteData.page,
            timestamp: noteData.timestamp,
            blockId: noteData.blockId
        });

        // Add metadata
        noteGroup.set({
            noteType: 'sticky',
            noteId: noteData.id,
            userId: noteData.userId,
            page: noteData.page,
            timestamp: noteData.timestamp,
            blockId: noteData.blockId,
            noteColor: color,
            noteText: noteData.text
        });

        // Add custom handlers for this group if it belongs to the current user
        if (noteData.userId === _userId) {
            noteGroup._objects[3].on('mousedown', function(e) {
                // Handle close button click
                deleteNote(noteGroup);
                e.stopPropagation();
            });
        }

        // Add to canvas
        _fabricCanvas.add(noteGroup);

        return noteGroup;
    }

    /**
     * Enable the note tool
     */
    function enable() {
        if (_isActive) return;

        _isActive = true;
        console.log(`[NOTE] Enabling note tool for block ${_blockId}`);

        // Show color selector
        var selector = document.getElementById(`note-color-selector-${_blockId}`);
        if (selector) {
            selector.style.display = 'block';
        }

        // Set draw container for click events
        var drawContainer = document.getElementById(`draw-container-${_blockId}`);
        if (drawContainer) {
            drawContainer.style.cursor = 'cell';
            drawContainer.classList.add('draw-mode');
            drawContainer.style.pointerEvents = 'auto';

            // Add click handler
            drawContainer._noteToolClickHandler = function(event) {
                if (!_isActive) return;

                // Calculate position relative to the container
                var rect = drawContainer.getBoundingClientRect();
                var x = event.clientX - rect.left;
                var y = event.clientY - rect.top;

                createNote(x, y);
            };

            drawContainer.addEventListener('click', drawContainer._noteToolClickHandler);
        }

        // Set cursor on fabric canvas
        if (_fabricCanvas && _fabricCanvas.upperCanvasEl) {
            _fabricCanvas.upperCanvasEl.style.cursor = 'cell';
            _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
        }

        // Highlight the currently selected color
        var selectedButton = document.querySelector(`#note-color-selector-${_blockId} [data-note-color="${_color}"]`);
        highlightSelectedColor(selectedButton);

        // Load notes for current page
        loadNotesForPage(_currentPage);

        _debugCallback('Note tool enabled');
    }

    /**
     * Disable the note tool
     */
    function disable() {
        if (!_isActive) return;

        _isActive = false;
        console.log(`[NOTE] Disabling note tool for block ${_blockId}`);

        // Hide color selector
        var selector = document.getElementById(`note-color-selector-${_blockId}`);
        if (selector) {
            selector.style.display = 'none';
        }

        // Reset draw container
        var drawContainer = document.getElementById(`draw-container-${_blockId}`);
        if (drawContainer) {
            drawContainer.style.cursor = 'default';
            drawContainer.classList.remove('draw-mode');
            drawContainer.style.pointerEvents = 'none';

            // Remove click handler
            if (drawContainer._noteToolClickHandler) {
                drawContainer.removeEventListener('click', drawContainer._noteToolClickHandler);
            }
        }

        // Reset cursor on fabric canvas
        if (_fabricCanvas && _fabricCanvas.upperCanvasEl) {
            _fabricCanvas.upperCanvasEl.style.cursor = 'default';
        }

        _debugCallback('Note tool disabled');
    }

    /**
     * Set current page
     */
    function setCurrentPage(page) {
        if (page === _currentPage) return;

        _currentPage = page;
        console.log(`[NOTE] Changed to page ${page}`);

        // Load notes for this page
        if (_isActive) {
            loadNotesForPage(page);
        }
    }

    /**
     * Set note color
     */
    function setColor(color) {
        _color = color;
        console.log(`[NOTE] Color set to ${color}`);
    }

    /**
     * Get all note annotations
     */
    function getAllNoteAnnotations() {
        return _noteAnnotations;
    }

    /**
     * Set note annotations
     */
    function setNoteAnnotations(annotations) {
        if (!annotations) return;
        _noteAnnotations = annotations;

        // Load notes for current page
        loadNotesForPage(_currentPage);
    }

    /**
     * Utility function to darken a color
     */
    function darkenColor(color, percent) {
        var r = parseInt(color.substring(1, 3), 16);
        var g = parseInt(color.substring(3, 5), 16);
        var b = parseInt(color.substring(5, 7), 16);

        r = Math.max(0, r - percent);
        g = Math.max(0, g - percent);
        b = Math.max(0, b - percent);

        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    // Public API
    return {
        init: init,
        enable: enable,
        disable: disable,
        setCurrentPage: setCurrentPage,
        setColor: setColor,
        getAllNoteAnnotations: getAllNoteAnnotations,
        setNoteAnnotations: setNoteAnnotations
    };
}