/**
 * PDF Viewer XBlock - Shape Tool Functions
 *
 * This file implements shape annotation functionality for the PDF XBlock.
 * It allows users to add shapes (rectangle, circle, triangle, line) to the PDF.
 */
function PdfxShape(element, options) {
    'use strict';

    // Private variables
    var _options = options || {};
    var _blockId = _options.blockId || 'default';
    var _userId = _options.userId || 'anonymous';
    var _courseId = _options.courseId || null;
    var _documentInfo = _options.documentInfo || {};
    var _shapeAnnotations = [];
    var _isActive = false;
    var _currentPage = 1;
    var _color = '#FF0000';
    var _strokeWidth = 2;
    var _opacity = 0.5;
    var _currentShapeType = 'rectangle'; // Default shape type
    var _fabricCanvas = null;
    var _drawingShape = false;
    var _startPoint = null;
    var _pendingShape = null;
    var _shapeTypes = ['rectangle', 'circle', 'triangle', 'line', 'arrow'];

    // Callback functions
    var _debugCallback = _options.debugCallback || function() {};
    var _saveCallback = _options.saveCallback || function() {};

    /**
     * Initialize the shape tool
     */
    function init(fabricCanvas) {
        _fabricCanvas = fabricCanvas;
        _debugCallback('Shape tool initialized');

        // Get current color from UI if available
        var colorInput = document.getElementById(`color-input-${_blockId}`);
        if (colorInput) {
            _color = colorInput.value;
        }

        // Set up event handlers for fabric canvas
        if (_fabricCanvas && !_fabricCanvas._shapeEventsBound) {
            _fabricCanvas.on('mouse:down', _handleMouseDown);
            _fabricCanvas.on('mouse:move', _handleMouseMove);
            _fabricCanvas.on('mouse:up', _handleMouseUp);
            _fabricCanvas._shapeEventsBound = true;
        }

        // Create shape selector UI if it doesn't exist already
        createShapeSelector();

        // Make this instance globally available
        window[`shapeInstance_${_blockId}`] = this;
    }

    /**
     * Create shape selector UI
     */
    function createShapeSelector() {
        // Check if selector already exists
        var existingSelector = document.getElementById(`shape-selector-${_blockId}`);
        if (existingSelector) return;

        // Create shape selector container
        var selectorContainer = document.createElement('div');
        selectorContainer.id = `shape-selector-${_blockId}`;
        selectorContainer.className = 'shape-selector-container';
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

        // Create buttons for each shape type
        _shapeTypes.forEach(function(shapeType) {
            var button = document.createElement('button');
            button.className = 'shape-type-btn';
            button.setAttribute('data-shape-type', shapeType);
            button.style.margin = '3px';
            button.style.padding = '5px';
            button.style.border = '1px solid #ccc';
            button.style.borderRadius = '3px';
            button.style.backgroundColor = '#f8f8f8';
            button.style.cursor = 'pointer';
            button.style.width = '30px';
            button.style.height = '30px';

            // Set icon based on shape type
            var icon;
            switch(shapeType) {
                case 'rectangle':
                    icon = '■';
                    break;
                case 'circle':
                    icon = '●';
                    break;
                case 'triangle':
                    icon = '▲';
                    break;
                case 'line':
                    icon = '—';
                    break;
                case 'arrow':
                    icon = '→';
                    break;
                default:
                    icon = '■';
            }
            button.textContent = icon;

            // Add click handler
            button.addEventListener('click', function() {
                _currentShapeType = shapeType;
                highlightSelectedButton(this);
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
    }

    /**
     * Highlight the selected shape button
     */
    function highlightSelectedButton(selectedButton) {
        var buttons = document.querySelectorAll(`#shape-selector-${_blockId} .shape-type-btn`);
        buttons.forEach(function(button) {
            button.style.backgroundColor = '#f8f8f8';
            button.style.color = '#000';
        });

        if (selectedButton) {
            selectedButton.style.backgroundColor = '#0075b4';
            selectedButton.style.color = '#fff';
        }
    }

    /**
     * Handle mouse down event for shape drawing
     */
    function _handleMouseDown(event) {
        if (!_isActive || !_fabricCanvas) return;

        // Get mouse coordinates relative to canvas
        var pointer = _fabricCanvas.getPointer(event.e);
        _startPoint = pointer;
        _drawingShape = true;

        // Create the shape
        switch(_currentShapeType) {
            case 'rectangle':
                _pendingShape = new fabric.Rect({
                    left: pointer.x,
                    top: pointer.y,
                    width: 0,
                    height: 0,
                    fill: 'transparent',
                    stroke: _color,
                    strokeWidth: _strokeWidth,
                    opacity: _opacity,
                    selectable: true
                });
                break;
            case 'circle':
                _pendingShape = new fabric.Circle({
                    left: pointer.x,
                    top: pointer.y,
                    radius: 0,
                    fill: 'transparent',
                    stroke: _color,
                    strokeWidth: _strokeWidth,
                    opacity: _opacity,
                    selectable: true
                });
                break;
            case 'triangle':
                _pendingShape = new fabric.Triangle({
                    left: pointer.x,
                    top: pointer.y,
                    width: 0,
                    height: 0,
                    fill: 'transparent',
                    stroke: _color,
                    strokeWidth: _strokeWidth,
                    opacity: _opacity,
                    selectable: true
                });
                break;
            case 'line':
            case 'arrow':
                _pendingShape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
                    stroke: _color,
                    strokeWidth: _strokeWidth,
                    opacity: _opacity,
                    selectable: true
                });
                break;
        }

        // Add metadata to the shape
        if (_pendingShape) {
            _pendingShape.set({
                shapeType: _currentShapeType,
                userId: _userId,
                page: _currentPage,
                timestamp: new Date().toISOString(),
                blockId: _blockId
            });

            // Add to canvas
            _fabricCanvas.add(_pendingShape);
            _fabricCanvas.renderAll();
        }
    }

    /**
     * Handle mouse move event for shape drawing
     */
    function _handleMouseMove(event) {
        if (!_isActive || !_drawingShape || !_pendingShape || !_fabricCanvas) return;

        var pointer = _fabricCanvas.getPointer(event.e);

        // Update shape dimensions based on mouse movement
        switch(_currentShapeType) {
            case 'rectangle':
                var width = Math.abs(pointer.x - _startPoint.x);
                var height = Math.abs(pointer.y - _startPoint.y);

                if (pointer.x < _startPoint.x) {
                    _pendingShape.set({ left: pointer.x });
                }
                if (pointer.y < _startPoint.y) {
                    _pendingShape.set({ top: pointer.y });
                }

                _pendingShape.set({
                    width: width,
                    height: height
                });
                break;
            case 'circle':
                var radius = Math.sqrt(
                    Math.pow(pointer.x - _startPoint.x, 2) +
                    Math.pow(pointer.y - _startPoint.y, 2)
                ) / 2;

                _pendingShape.set({
                    radius: radius
                });
                break;
            case 'triangle':
                var width = Math.abs(pointer.x - _startPoint.x);
                var height = Math.abs(pointer.y - _startPoint.y);

                if (pointer.x < _startPoint.x) {
                    _pendingShape.set({ left: pointer.x });
                }
                if (pointer.y < _startPoint.y) {
                    _pendingShape.set({ top: pointer.y });
                }

                _pendingShape.set({
                    width: width,
                    height: height
                });
                break;
            case 'line':
            case 'arrow':
                _pendingShape.set({
                    x2: pointer.x,
                    y2: pointer.y
                });
                break;
        }

        _fabricCanvas.renderAll();
    }

    /**
     * Handle mouse up event for shape drawing
     */
    function _handleMouseUp(event) {
        if (!_isActive || !_drawingShape || !_pendingShape || !_fabricCanvas) return;

        _drawingShape = false;

        // Finalize the shape
        var shapeData = {
            type: _currentShapeType,
            properties: _pendingShape.toObject(['shapeType', 'userId', 'page', 'timestamp', 'blockId']),
            page: _currentPage,
            userId: _userId,
            timestamp: new Date().toISOString(),
            courseId: _courseId,
            blockId: _blockId,
            documentInfo: _documentInfo
        };

        // Special handling for arrow (add arrowhead)
        if (_currentShapeType === 'arrow' && _pendingShape.type === 'line') {
            addArrowhead(_pendingShape);
        }

        // Add to annotations array, indexed by page
        if (!_shapeAnnotations[_currentPage]) {
            _shapeAnnotations[_currentPage] = [];
        }
        _shapeAnnotations[_currentPage].push(shapeData);

        // Reset pending shape
        _pendingShape = null;

        // Save annotations
        saveShapeAnnotations();
    }

    /**
     * Add arrowhead to a line
     */
    function addArrowhead(line) {
        if (!line || !_fabricCanvas) return;

        var x1 = line.x1;
        var y1 = line.y1;
        var x2 = line.x2;
        var y2 = line.y2;

        // Calculate angle of the line
        var angle = Math.atan2(y2 - y1, x2 - x1);

        // Create arrowhead triangle
        var arrowSize = 15;
        var arrowAngle = Math.PI / 6; // 30 degrees

        var x3 = x2 - arrowSize * Math.cos(angle - arrowAngle);
        var y3 = y2 - arrowSize * Math.sin(angle - arrowAngle);
        var x4 = x2 - arrowSize * Math.cos(angle + arrowAngle);
        var y4 = y2 - arrowSize * Math.sin(angle + arrowAngle);

        var arrowhead = new fabric.Polygon([
            { x: x2, y: y2 },
            { x: x3, y: y3 },
            { x: x4, y: y4 }
        ], {
            fill: _color,
            stroke: _color,
            strokeWidth: 1,
            opacity: _opacity,
            selectable: false
        });

        // Group the line and arrowhead
        var group = new fabric.Group([line, arrowhead], {
            selectable: true,
            shapeType: 'arrow',
            userId: _userId,
            page: _currentPage,
            timestamp: line.timestamp,
            blockId: _blockId
        });

        // Replace line with grouped object
        _fabricCanvas.remove(line);
        _fabricCanvas.add(group);
        _fabricCanvas.renderAll();
    }

    /**
     * Save shape annotations
     */
    function saveShapeAnnotations() {
        if (_saveCallback && typeof _saveCallback === 'function') {
            _saveCallback({
                type: 'shape',
                shapeAnnotations: _shapeAnnotations,
                userId: _userId,
                blockId: _blockId,
                currentPage: _currentPage
            });
        }
    }

    /**
     * Enable the shape tool
     */
    function enable() {
        if (_isActive) return;

        _isActive = true;

        // Show shape selector
        var selector = document.getElementById(`shape-selector-${_blockId}`);
        if (selector) {
            selector.style.display = 'block';
        }

        // Set cursor on fabric canvas
        if (_fabricCanvas && _fabricCanvas.upperCanvasEl) {
            _fabricCanvas.upperCanvasEl.style.cursor = 'crosshair';
            _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
        }

        // Set draw container
        var drawContainer = document.getElementById(`draw-container-${_blockId}`);
        if (drawContainer) {
            drawContainer.style.cursor = 'crosshair';
            drawContainer.classList.add('draw-mode');
            drawContainer.style.pointerEvents = 'auto';
        }

        // Get current color
        var colorInput = document.getElementById(`color-input-${_blockId}`);
        if (colorInput) {
            _color = colorInput.value;
        }

        // Highlight the currently selected shape button
        var selectedButton = document.querySelector(`#shape-selector-${_blockId} [data-shape-type="${_currentShapeType}"]`);
        highlightSelectedButton(selectedButton);

        // Load shapes for current page
        loadShapesForPage(_currentPage);

        _debugCallback('Shape tool enabled');
    }

    /**
     * Disable the shape tool
     */
    function disable() {
        if (!_isActive) return;

        _isActive = false;

        // Hide shape selector
        var selector = document.getElementById(`shape-selector-${_blockId}`);
        if (selector) {
            selector.style.display = 'none';
        }

        // Reset cursor on fabric canvas
        if (_fabricCanvas && _fabricCanvas.upperCanvasEl) {
            _fabricCanvas.upperCanvasEl.style.cursor = 'default';
        }

        // Reset draw container
        var drawContainer = document.getElementById(`draw-container-${_blockId}`);
        if (drawContainer) {
            drawContainer.style.cursor = 'default';
            drawContainer.classList.remove('draw-mode');
            drawContainer.style.pointerEvents = 'none';
        }

        _debugCallback('Shape tool disabled');
    }

    /**
     * Set current page
     */
    function setCurrentPage(page) {
        if (page === _currentPage) return;

        _currentPage = page;

        // Load shapes for this page
        if (_isActive) {
            loadShapesForPage(page);
        }
    }

    /**
     * Load shapes for the current page
     */
    function loadShapesForPage(page) {
        // First clear any shapes from canvas that might be from another page
        if (_fabricCanvas) {
            var objects = _fabricCanvas.getObjects();
            for (var i = 0; i < objects.length; i++) {
                if (objects[i].shapeType) {
                    _fabricCanvas.remove(objects[i]);
                }
            }
        }

        // Then load shapes for this page
        if (_shapeAnnotations[page] && _shapeAnnotations[page].length > 0) {
            _shapeAnnotations[page].forEach(function(shapeData) {
                createShapeFromData(shapeData);
            });

            if (_fabricCanvas) {
                _fabricCanvas.renderAll();
            }
        }
    }

    /**
     * Create a shape object from saved data
     */
    function createShapeFromData(shapeData) {
        if (!_fabricCanvas || !shapeData.properties) return;

        var shape;
        var props = shapeData.properties;

        switch(shapeData.type) {
            case 'rectangle':
                shape = new fabric.Rect({
                    left: props.left,
                    top: props.top,
                    width: props.width,
                    height: props.height,
                    fill: props.fill,
                    stroke: props.stroke,
                    strokeWidth: props.strokeWidth,
                    opacity: props.opacity,
                    selectable: props.userId === _userId
                });
                break;
            case 'circle':
                shape = new fabric.Circle({
                    left: props.left,
                    top: props.top,
                    radius: props.radius,
                    fill: props.fill,
                    stroke: props.stroke,
                    strokeWidth: props.strokeWidth,
                    opacity: props.opacity,
                    selectable: props.userId === _userId
                });
                break;
            case 'triangle':
                shape = new fabric.Triangle({
                    left: props.left,
                    top: props.top,
                    width: props.width,
                    height: props.height,
                    fill: props.fill,
                    stroke: props.stroke,
                    strokeWidth: props.strokeWidth,
                    opacity: props.opacity,
                    selectable: props.userId === _userId
                });
                break;
            case 'line':
                shape = new fabric.Line([props.x1, props.y1, props.x2, props.y2], {
                    stroke: props.stroke,
                    strokeWidth: props.strokeWidth,
                    opacity: props.opacity,
                    selectable: props.userId === _userId
                });
                break;
            case 'arrow':
                // For arrow, we need to recreate both the line and arrowhead
                var line = new fabric.Line([props.x1, props.y1, props.x2, props.y2], {
                    stroke: props.stroke,
                    strokeWidth: props.strokeWidth,
                    opacity: props.opacity
                });

                // Recreate the arrowhead
                var arrowhead = recreateArrowhead(line);

                // Group them together
                shape = new fabric.Group([line, arrowhead], {
                    selectable: props.userId === _userId
                });
                break;
        }

        if (shape) {
            // Add metadata to the shape
            shape.set({
                shapeType: shapeData.type,
                userId: shapeData.userId,
                page: shapeData.page,
                timestamp: shapeData.timestamp,
                blockId: shapeData.blockId
            });

            // Add to canvas
            _fabricCanvas.add(shape);
        }
    }

    /**
     * Recreate arrowhead for a saved line
     */
    function recreateArrowhead(line) {
        var x1 = line.x1;
        var y1 = line.y1;
        var x2 = line.x2;
        var y2 = line.y2;

        // Calculate angle of the line
        var angle = Math.atan2(y2 - y1, x2 - x1);

        // Create arrowhead triangle
        var arrowSize = 15;
        var arrowAngle = Math.PI / 6; // 30 degrees

        var x3 = x2 - arrowSize * Math.cos(angle - arrowAngle);
        var y3 = y2 - arrowSize * Math.sin(angle - arrowAngle);
        var x4 = x2 - arrowSize * Math.cos(angle + arrowAngle);
        var y4 = y2 - arrowSize * Math.sin(angle + arrowAngle);

        return new fabric.Polygon([
            { x: x2, y: y2 },
            { x: x3, y: y3 },
            { x: x4, y: y4 }
        ], {
            fill: line.stroke,
            stroke: line.stroke,
            strokeWidth: 1,
            opacity: line.opacity,
            selectable: false
        });
    }

    /**
     * Set shape color
     */
    function setColor(color) {
        _color = color;
    }

    /**
     * Set stroke width
     */
    function setStrokeWidth(width) {
        _strokeWidth = width;
    }

    /**
     * Set shape opacity
     */
    function setOpacity(opacity) {
        _opacity = opacity;
    }

    /**
     * Get all shape annotations
     */
    function getAllShapeAnnotations() {
        return _shapeAnnotations;
    }

    /**
     * Set shape annotations
     */
    function setShapeAnnotations(annotations) {
        if (!annotations) return;
        _shapeAnnotations = annotations;

        // Load shapes for current page
        loadShapesForPage(_currentPage);
    }

    /**
     * Clear all shapes from current page
     */
    function clearCurrentPage() {
        // Remove shapes from canvas
        if (_fabricCanvas) {
            var objects = _fabricCanvas.getObjects();
            for (var i = 0; i < objects.length; i++) {
                if (objects[i].shapeType) {
                    _fabricCanvas.remove(objects[i]);
                }
            }
            _fabricCanvas.renderAll();
        }

        // Clear from annotations array
        _shapeAnnotations[_currentPage] = [];

        // Save the cleared state
        saveShapeAnnotations();
    }

    // Public API
    return {
        init: init,
        enable: enable,
        disable: disable,
        setCurrentPage: setCurrentPage,
        setColor: setColor,
        setStrokeWidth: setStrokeWidth,
        setOpacity: setOpacity,
        getAllShapeAnnotations: getAllShapeAnnotations,
        setShapeAnnotations: setShapeAnnotations,
        clearCurrentPage: clearCurrentPage
    };
}