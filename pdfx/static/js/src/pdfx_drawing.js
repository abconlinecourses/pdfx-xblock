/* PDF Viewer XBlock - Drawing Functions */

/**
 * Recording and playback of drawing strokes
 */
function PdfxDrawing(element, options) {
    'use strict';

    // Private variables
    var _options = options || {};
    var _drawingCanvas = null;
    var _drawingStrokes = [];
    var _isRecording = false;
    var _currentStroke = null;
    var _playbackInterval = null;
    var _isPlaying = false;
    var _currentPage = 1;

    // Callback functions
    var _debugCallback = _options.debugCallback || function() {};
    var _saveCallback = _options.saveCallback || function() {};

    // Initialize
    function init(canvas) {
        _drawingCanvas = canvas;
        _debugCallback('Drawing functions initialized');
    }

    // Record stroke points
    function startRecordingStroke(pointer) {
        if (!_drawingCanvas) return;

        _currentStroke = {
            points: [{x: pointer.x, y: pointer.y, time: Date.now()}],
            color: options.getColor ? options.getColor() : '#000000',
            width: options.getWidth ? options.getWidth() : 5
        };
        _isRecording = true;
        _debugCallback('Started recording stroke');
    }

    function recordStrokePoint(pointer) {
        if (!_isRecording || !_currentStroke) return;
        _currentStroke.points.push({x: pointer.x, y: pointer.y, time: Date.now()});
    }

    function endRecordingStroke() {
        if (!_isRecording || !_currentStroke) return;
        _drawingStrokes.push(_currentStroke);
        _isRecording = false;
        _currentStroke = null;
        saveDrawingToStorage();
        _debugCallback('Ended recording stroke');

        // Trigger save callback if provided
        if (_saveCallback) {
            _saveCallback(_drawingStrokes);
        }
    }

    // Save and load drawing data
    function saveDrawingToStorage() {
        var drawingData = {
            strokes: _drawingStrokes,
            page: _currentPage
        };

        try {
            localStorage.setItem(`pdf_drawing_page_${_currentPage}`, JSON.stringify(drawingData));
            _debugCallback(`Saved ${_drawingStrokes.length} strokes for page ${_currentPage}`);
        } catch (e) {
            _debugCallback(`Error saving strokes to storage: ${e.message}`);
        }
    }

    function loadDrawingFromStorage(page) {
        var pageNum = page || _currentPage;

        try {
            var savedData = localStorage.getItem(`pdf_drawing_page_${pageNum}`);
            if (savedData) {
                var drawingData = JSON.parse(savedData);
                if (drawingData.page === pageNum) {
                    _drawingStrokes = drawingData.strokes;
                    _debugCallback(`Loaded ${_drawingStrokes.length} strokes for page ${pageNum}`);
                    return _drawingStrokes;
                }
            }
        } catch (e) {
            _debugCallback(`Error loading strokes from storage: ${e.message}`);
        }

        // If we reach here, reset strokes
        _drawingStrokes = [];
        return _drawingStrokes;
    }

    // Playback functions
    function startPlayback() {
        if (_isPlaying) return;

        if (!_drawingStrokes || _drawingStrokes.length === 0) {
            _debugCallback('No drawing strokes to play');
            return;
        }

        var firstStroke = _drawingStrokes[0];
        if (!firstStroke || !firstStroke.points || firstStroke.points.length === 0) {
            _debugCallback('Invalid stroke data');
            return;
        }

        // Trigger UI update callback if provided
        if (options.onPlaybackStart) {
            options.onPlaybackStart();
        }

        _isPlaying = true;

        // Store a copy of the strokes for playback
        var strokesBackup = JSON.parse(JSON.stringify(_drawingStrokes));

        // Now clear the canvas for playback
        if (_drawingCanvas) {
            _drawingCanvas.clear();
        }

        var strokeIndex = 0;
        var pointIndex = 0;

        var lastTime = firstStroke.points[0].time;
        var speed = options.getPlaybackSpeed ? options.getPlaybackSpeed() : 1;

        _playbackInterval = setInterval(function() {
            if (!_isPlaying) return;

            var currentStroke = strokesBackup[strokeIndex];
            if (!currentStroke) {
                stopPlayback();
                return;
            }

            var point = currentStroke.points[pointIndex];
            var nextPoint = currentStroke.points[pointIndex + 1];

            if (point && nextPoint) {
                var timeDiff = (nextPoint.time - point.time) / speed;

                if (_drawingCanvas) {
                    _drawingCanvas.freeDrawingBrush.color = currentStroke.color;
                    _drawingCanvas.freeDrawingBrush.width = currentStroke.width;

                    var path = new fabric.Path(`M ${point.x} ${point.y} L ${nextPoint.x} ${nextPoint.y}`, {
                        stroke: currentStroke.color,
                        strokeWidth: currentStroke.width,
                        selectable: false
                    });

                    _drawingCanvas.add(path);
                    _drawingCanvas.renderAll();
                }

                pointIndex++;
            } else {
                strokeIndex++;
                pointIndex = 0;
                if (strokeIndex >= strokesBackup.length) {
                    stopPlayback();
                }
            }
        }, 16); // ~60fps
    }

    function pausePlayback() {
        _isPlaying = false;
        if (_playbackInterval) {
            clearInterval(_playbackInterval);
        }

        // Trigger UI update callback if provided
        if (options.onPlaybackPause) {
            options.onPlaybackPause();
        }
    }

    function stopPlayback() {
        pausePlayback();

        if (_drawingCanvas) {
            _drawingCanvas.clear();
            _drawingStrokes.forEach(function(stroke) {
                stroke.points.forEach(function(point, index) {
                    if (index < stroke.points.length - 1) {
                        var nextPoint = stroke.points[index + 1];
                        var path = new fabric.Path(`M ${point.x} ${point.y} L ${nextPoint.x} ${nextPoint.y}`, {
                            stroke: stroke.color,
                            strokeWidth: stroke.width,
                            selectable: false
                        });
                        _drawingCanvas.add(path);
                    }
                });
            });
            _drawingCanvas.renderAll();
        }

        // Trigger UI update callback if provided
        if (options.onPlaybackStop) {
            options.onPlaybackStop();
        }
    }

    function resetPlayback() {
        pausePlayback();

        if (_drawingCanvas) {
            _drawingCanvas.clear();
        }

        _drawingStrokes = [];
        saveDrawingToStorage();

        // Trigger UI update callback if provided
        if (options.onPlaybackReset) {
            options.onPlaybackReset();
        }

        // Trigger save callback if provided
        if (_saveCallback) {
            _saveCallback(_drawingStrokes);
        }
    }

    // Set current page
    function setCurrentPage(page) {
        _currentPage = page;
    }

    // Get all strokes
    function getAllStrokes() {
        return _drawingStrokes;
    }

    // Set all strokes
    function setAllStrokes(strokes) {
        if (Array.isArray(strokes)) {
            _drawingStrokes = strokes;
        }
    }

    // Export drawing as PNG
    function exportDrawingAsPNG(callback) {
        if (!_drawingCanvas) {
            callback(null);
            return;
        }

        try {
            var dataUrl = _drawingCanvas.toDataURL({
                format: 'png',
                multiplier: 1
            });

            callback(dataUrl);
        } catch (e) {
            _debugCallback(`Error exporting drawing: ${e.message}`);
            callback(null);
        }
    }

    // Public API
    return {
        init: init,
        startRecordingStroke: startRecordingStroke,
        recordStrokePoint: recordStrokePoint,
        endRecordingStroke: endRecordingStroke,
        saveDrawingToStorage: saveDrawingToStorage,
        loadDrawingFromStorage: loadDrawingFromStorage,
        startPlayback: startPlayback,
        pausePlayback: pausePlayback,
        stopPlayback: stopPlayback,
        resetPlayback: resetPlayback,
        setCurrentPage: setCurrentPage,
        getAllStrokes: getAllStrokes,
        setAllStrokes: setAllStrokes,
        exportDrawingAsPNG: exportDrawingAsPNG
    };
}