/* PDF Viewer XBlock - Scribble Functionality */

console.log('PDF XBlock: Scribble script loaded at: ' + new Date().toISOString());

/**
 * Scribble tool for freehand drawing on PDF
 */
function PdfxScribble(element, options) {
    'use strict';

    console.log('PDF XBlock: Creating scribble tool instance with options:', options);

    // Private variables
    var _options = options || {};
    var _blockId = _options.blockId || 'default';
    var _userId = _options.userId || 'anonymous';
    var _courseId = _options.courseId || null;
    var _documentInfo = _options.documentInfo || {};
    var _color = _options.color || '#FFFF00';
    var _width = _options.width || 5;
    var _scribbleStrokes = [];
    var _fabricCanvas = null;
    var _currentPage = 1;
    var _isActive = false;
    var _keepActiveInterval = null;
    var _saveToServerInterval = null;
    var _saveIntervalTime = _options.saveIntervalTime || 10000; // Default 10 seconds
    var _pendingChanges = false;
    var _storagePrefix = `pdfx_scribble_${_blockId}_${_userId}_`;
    var _useIndexedDB = true; // Flag to determine if we should use IndexedDB (falls back to localStorage)
    var _idbDatabase = null; // Reference to IndexedDB database

    console.log('PDF XBlock: Scribble tool created for block ' + _blockId);

    // Callback functions
    var _debugCallback = _options.debugCallback || function() {};
    var _saveCallback = _options.saveCallback || function() {};

    // Get block-specific element ID
    function getBlockElementId(baseId) {
        return `${baseId}-${_blockId}`;
    }

    // Initialize the scribble tool
    function init(fabricCanvas) {
        _fabricCanvas = fabricCanvas;
        console.log(`[SCRIBBLE] Initializing scribble tool for block ${_blockId}`);

        // Configure fabric for scribble behavior
        if (_fabricCanvas) {
            _fabricCanvas.freeDrawingBrush.color = _color;
            _fabricCanvas.freeDrawingBrush.width = _width;

            // Remove any existing path:created handlers to avoid duplicates
            _fabricCanvas.off('path:created');

            // Add custom events for scribble strokes
            _fabricCanvas.on('path:created', function(event) {
                console.log('[SCRIBBLE][DEBUG] Path created event triggered', event);
                if (_fabricCanvas.freeDrawingBrush.scribbleMode) {
                    handleScribbleStroke(event.path);
                }
            });

            // Add mouse:up event to ensure proper release
            _fabricCanvas.on('mouse:up', function() {
                console.log('[SCRIBBLE][DEBUG] Mouse up event triggered on canvas');
            });

            // Enhance the PencilBrush for better debugging
            enhancePencilBrush();
        }

        // Initialize IndexedDB
        initIndexedDB().then(function() {
            // Load strokes from browser storage
            loadScribbleStrokesFromBrowser();

            // Start periodic server saving if not already running
            startPeriodicSaving();

            _debugCallback('Scribble tool initialized with browser storage');
        }).catch(function(error) {
            console.error('Failed to initialize IndexedDB, falling back to localStorage:', error);
            _useIndexedDB = false;

            // Continue with localStorage
            loadScribbleStrokesFromBrowser();
            startPeriodicSaving();

            _debugCallback('Scribble tool initialized with localStorage fallback');
        });

        // Add a force save button to debug panel if it exists
        var debugPanel = document.getElementById(`pdfx-debug-panel-${_blockId}`);
        if (debugPanel) {
            var forceSaveBtn = document.createElement('button');
            forceSaveBtn.textContent = 'Force Save Scribbles';
            forceSaveBtn.className = 'btn btn-sm btn-primary';
            forceSaveBtn.onclick = function() {
                _pendingChanges = true;
                saveScribbleStrokesToServer()
                    .then(() => alert('Scribble data saved to server successfully!'))
                    .catch(err => alert('Error saving scribble data: ' + err.message));
            };
            debugPanel.appendChild(forceSaveBtn);
        }
    }

    // Initialize IndexedDB database
    function initIndexedDB() {
        return new Promise(function(resolve, reject) {
            if (!window.indexedDB) {
                _useIndexedDB = false;
                return reject(new Error('IndexedDB not supported'));
            }

            var request = indexedDB.open(`pdfx_scribble_db_${_blockId}`, 1);

            request.onerror = function(event) {
                console.error('IndexedDB error:', event.target.error);
                _useIndexedDB = false;
                reject(event.target.error);
            };

            request.onupgradeneeded = function(event) {
                var db = event.target.result;

                // Create an object store for this block
                if (!db.objectStoreNames.contains('strokes')) {
                    db.createObjectStore('strokes', { keyPath: 'page' });
                }
            };

            request.onsuccess = function(event) {
                _idbDatabase = event.target.result;
                console.log(`[SCRIBBLE] IndexedDB initialized for block ${_blockId}`);
                resolve();
            };
        });
    }

    // Handle scribble strokes when created
    function handleScribbleStroke(path) {
        console.log("%c[SCRIBBLE][DEBUG] handleScribbleStroke called", "background:#e67e22;color:white;padding:3px;border-radius:3px;");

        // Skip invalid paths
        if (!path) {
            console.error("[SCRIBBLE][DEBUG] Invalid path received in handleScribbleStroke");
            return;
        }

        // Ensure the path has required properties
        if (!path.path && !path.d) {
            console.error("[SCRIBBLE][DEBUG] Path is missing required path data", path);
            return;
        }

        // Verify we're handling strokes for the correct PDF block
        var activeDrawContainer = document.querySelector('.draw-container.draw-mode');
        if (activeDrawContainer) {
            var activeBlockId = activeDrawContainer.id.replace('draw-container-', '');
            if (activeBlockId !== _blockId) {
                console.log(`[SCRIBBLE][DEBUG] Ignoring stroke for different block: ${activeBlockId}, current block: ${_blockId}`);
                return;
            }
        }

        // Always set pending changes to true when a stroke is created
        _pendingChanges = true;

        // Add metadata to the path
        var strokeId = `scribble-${_blockId}-${_userId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        console.log(`[SCRIBBLE][DEBUG] Creating stroke with ID: ${strokeId} for page ${_currentPage}`);

        // Set properties on the fabric path object
        path.set({
            scribbleStroke: true,
            userId: _userId,
            page: _currentPage,
            timestamp: new Date().toISOString(),
            strokeId: strokeId,
            blockId: _blockId,
            selectable: false,
            evented: false
        });

        try {
            // Generate path JSON once to avoid repetition
            var pathJSON = path.toJSON();

            // Add to scribble strokes array for the current page
            var stroke = {
                path: pathJSON,
                color: path.stroke || _color,
                width: path.strokeWidth || _width,
                page: _currentPage,
                strokeId: strokeId,
                userId: _userId,
                timestamp: path.timestamp,
                courseId: _courseId,
                blockId: _blockId,
                documentInfo: _documentInfo
            };

            // Initialize the array for the current page if it doesn't exist
            if (!_scribbleStrokes[_currentPage]) {
                _scribbleStrokes[_currentPage] = [];
                console.log(`[SCRIBBLE][DEBUG] Created new strokes array for page ${_currentPage}`);
            }

            // Add the stroke to the current page's array
            _scribbleStrokes[_currentPage].push(stroke);

            console.log(`[SCRIBBLE][DEBUG] Stroke added to page ${_currentPage}, total strokes: ${_scribbleStrokes[_currentPage].length}, stroke data:`, {
                id: strokeId,
                color: stroke.color,
                width: stroke.width,
                pathLength: pathJSON ? JSON.stringify(pathJSON).length : 0
            });

            _debugCallback(`Scribble stroke added to page ${_currentPage}`);

            // Ensure scribble mode stays active
            if (_fabricCanvas) {
                _fabricCanvas.isDrawingMode = true;
                _fabricCanvas.freeDrawingBrush.scribbleMode = true;
                _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

                // Keep drawing mode active for container
                var drawContainer = $(element).find(`#draw-container-${_blockId}`)[0];
                if (drawContainer) {
                    drawContainer.style.pointerEvents = 'auto';
                    drawContainer.classList.add('draw-mode');
                }

                // Add the path to canvas if it's not already there
                if (!_fabricCanvas.contains(path)) {
                    _fabricCanvas.add(path);
                    _fabricCanvas.renderAll();
                    console.log(`[SCRIBBLE][DEBUG] Added path to canvas`);
                }
            } else {
                console.error(`[SCRIBBLE][DEBUG] _fabricCanvas is null or undefined in handleScribbleStroke`);
            }

            // Save to browser storage immediately
            saveScribbleStrokesToBrowser();
            console.log(`[SCRIBBLE][DEBUG] Saved stroke to browser storage`);

            // Force save to server after 3 strokes or on each 3rd stroke
            if (_scribbleStrokes[_currentPage].length % 3 === 0) {
                console.log(`[SCRIBBLE][DEBUG] Forcing save to server after ${_scribbleStrokes[_currentPage].length} strokes`);
                saveScribbleStrokesToServer();
            }
        } catch (e) {
            console.error("[SCRIBBLE][DEBUG] Error processing stroke:", e);
        }
    }

    // Save scribble strokes to browser storage using IndexedDB
    function saveStrokesToIndexedDB() {
        return new Promise(function(resolve, reject) {
            if (!_idbDatabase) {
                return reject(new Error('IndexedDB not initialized'));
            }

            var transaction = _idbDatabase.transaction(['strokes'], 'readwrite');
            var store = transaction.objectStore('strokes');

            // Get all page numbers with strokes
            var pageNumbers = Object.keys(_scribbleStrokes).filter(
                page => _scribbleStrokes[page] && _scribbleStrokes[page].length > 0
            );

            var completed = 0;
            var errors = [];

            // If no strokes to save, resolve immediately
            if (pageNumbers.length === 0) {
                return resolve();
            }

            // Save each page of strokes
            pageNumbers.forEach(function(pageNum) {
                var request = store.put({
                    page: parseInt(pageNum, 10),
                    strokes: _scribbleStrokes[pageNum],
                    lastModified: new Date().toISOString()
                });

                request.onsuccess = function() {
                    completed++;
                    if (completed === pageNumbers.length) {
                        if (errors.length === 0) {
                            resolve();
                        } else {
                            reject(new Error('Some pages failed to save: ' + errors.join(', ')));
                        }
                    }
                };

                request.onerror = function(event) {
                    errors.push(`Page ${pageNum}: ${event.target.error}`);
                    completed++;
                    if (completed === pageNumbers.length) {
                        reject(new Error('Some pages failed to save: ' + errors.join(', ')));
                    }
                };
            });

            transaction.oncomplete = function() {
                console.log(`[SCRIBBLE] Successfully saved ${pageNumbers.length} pages to IndexedDB`);
            };

            transaction.onerror = function(event) {
                reject(event.target.error);
            };
        });
    }

    // Load scribble strokes from IndexedDB
    function loadStrokesFromIndexedDB() {
        return new Promise(function(resolve, reject) {
            if (!_idbDatabase) {
                return reject(new Error('IndexedDB not initialized'));
            }

            var transaction = _idbDatabase.transaction(['strokes'], 'readonly');
            var store = transaction.objectStore('strokes');
            var request = store.getAll();

            request.onsuccess = function(event) {
                var results = event.target.result;
                var loadedStrokes = {};

                // Process the results
                if (results && results.length > 0) {
                    results.forEach(function(item) {
                        loadedStrokes[item.page] = item.strokes;
                    });

                    _scribbleStrokes = loadedStrokes;
                    console.log(`[SCRIBBLE] Loaded ${results.length} pages of strokes from IndexedDB`);
                }

                resolve(loadedStrokes);
            };

            request.onerror = function(event) {
                reject(event.target.error);
            };
        });
    }

    // Save scribble strokes to browser storage
    function saveScribbleStrokesToBrowser() {
        if (_useIndexedDB) {
            saveStrokesToIndexedDB().then(function() {
                console.log(`[SCRIBBLE] Saved strokes to IndexedDB at ${new Date().toISOString()}`);
                _debugCallback('Saved scribble strokes to IndexedDB storage');
            }).catch(function(error) {
                console.error(`[SCRIBBLE] Error saving to IndexedDB: ${error.message}`);
                _debugCallback(`Error saving to IndexedDB: ${error.message}`);

                // Fall back to localStorage
                saveToLocalStorage();
            });
        } else {
            saveToLocalStorage();
        }
    }

    // Save to localStorage (fallback method)
    function saveToLocalStorage() {
        try {
            // Use localStorage to store the data
            localStorage.setItem(`${_storagePrefix}scribbleStrokes`, JSON.stringify(_scribbleStrokes));
            localStorage.setItem(`${_storagePrefix}lastModified`, new Date().toISOString());
            console.log(`[SCRIBBLE] Saved strokes to localStorage at ${new Date().toISOString()}`);
            _debugCallback('Saved scribble strokes to localStorage');
        } catch (e) {
            console.error(`[SCRIBBLE] Error saving to localStorage: ${e.message}`);
            _debugCallback(`Error saving to browser storage: ${e.message}`);

            // If localStorage fails (e.g., quota exceeded), try to save to server directly
            saveScribbleStrokesToServer();
        }
    }

    // Load scribble strokes from browser storage
    function loadScribbleStrokesFromBrowser() {
        console.log(`[SCRIBBLE] Attempting to load strokes from browser storage for block ${_blockId}`);

        if (_useIndexedDB) {
            loadStrokesFromIndexedDB().then(function(loadedStrokes) {
                if (Object.keys(loadedStrokes).length > 0) {
                    console.log(`[SCRIBBLE] Successfully loaded ${Object.keys(loadedStrokes).length} pages of strokes from IndexedDB`);
                    _debugCallback(`Loaded ${Object.keys(loadedStrokes).length} pages of scribble strokes from IndexedDB`);

                    // Render strokes for current page
                    renderPageStrokes(_currentPage);
                } else {
                    console.log(`[SCRIBBLE] No strokes found in IndexedDB, trying localStorage`);
                    // Try fallback to localStorage if IndexedDB is empty
                    loadFromLocalStorage();
                }
            }).catch(function(error) {
                console.error(`[SCRIBBLE] Error loading from IndexedDB: ${error.message}`);
                _debugCallback(`Error loading from IndexedDB: ${error.message}`);

                // Fall back to localStorage
                loadFromLocalStorage();
            });
        } else {
            loadFromLocalStorage();
        }
    }

    // Load from localStorage (fallback method)
    function loadFromLocalStorage() {
        try {
            console.log(`[SCRIBBLE] Attempting to load from localStorage with key: ${_storagePrefix}scribbleStrokes`);
            var storedData = localStorage.getItem(`${_storagePrefix}scribbleStrokes`);
            if (storedData) {
                _scribbleStrokes = JSON.parse(storedData);
                console.log(`[SCRIBBLE] Successfully loaded ${Object.keys(_scribbleStrokes).length} pages of strokes from localStorage`);
                _debugCallback(`Loaded ${Object.keys(_scribbleStrokes).length} pages of scribble strokes from localStorage`);
                console.log(`[SCRIBBLE] Loaded strokes from localStorage, last modified: ${localStorage.getItem(`${_storagePrefix}lastModified`)}`);

                // Render strokes for current page
                renderPageStrokes(_currentPage);
            } else {
                console.log(`[SCRIBBLE] No data found in localStorage for key: ${_storagePrefix}scribbleStrokes`);

                // Try loading from server as last resort
                console.log(`[SCRIBBLE] No browser storage data, checking if server data is available in initialization`);
            }
        } catch (e) {
            console.error(`[SCRIBBLE] Error loading from localStorage: ${e.message}`);
            _debugCallback(`Error loading from localStorage: ${e.message}`);
        }
    }

    // Save scribble strokes to server
    function saveScribbleStrokesToServer() {
        console.log(`[SCRIBBLE][DEBUG] saveScribbleStrokesToServer called at ${new Date().toISOString()}`);

        // Check if we have any strokes to save at all
        var hasStrokes = false;
        var strokesByPage = {};
        var totalStrokes = 0;

        for (var page in _scribbleStrokes) {
            if (_scribbleStrokes[page] && _scribbleStrokes[page].length > 0) {
                hasStrokes = true;
                strokesByPage[page] = _scribbleStrokes[page].length;
                totalStrokes += _scribbleStrokes[page].length;
            }
        }

        console.log(`[SCRIBBLE][DEBUG] hasStrokes: ${hasStrokes}, totalStrokes: ${totalStrokes}, pages with strokes: ${Object.keys(strokesByPage).length}`, strokesByPage);

        if (!hasStrokes) {
            console.log(`[SCRIBBLE] No strokes to save at ${new Date().toISOString()}`);
            return Promise.resolve();
        }

        // Only check _pendingChanges if we actually have strokes
        if (!_pendingChanges && hasStrokes) {
            console.log(`[SCRIBBLE] Strokes exist but no pending changes at ${new Date().toISOString()}`);

            // Force save anyway for debugging purposes
            console.log(`[SCRIBBLE][DEBUG] Forcing save despite no pending changes for debugging`);
            _pendingChanges = true;
            // return Promise.resolve();
        }

        return new Promise(function(resolve, reject) {
            if (_saveCallback) {
                try {
                    console.log(`[SCRIBBLE][DEBUG] Sending ${Object.keys(_scribbleStrokes).length} pages of strokes to server callback. blockId: ${_blockId}, userId: ${_userId}`);

                    var saveData = {
                        scribbleStrokes: _scribbleStrokes,
                        userId: _userId,
                        courseId: _courseId,
                        blockId: _blockId,
                        currentPage: _currentPage,
                        markerStrokes: _scribbleStrokes // Pass to markerStrokes for backward compatibility
                    };

                    console.log(`[SCRIBBLE][DEBUG] Callback data prepared:`, {
                        pages: Object.keys(saveData.scribbleStrokes).length,
                        userId: saveData.userId,
                        blockId: saveData.blockId
                    });

                    _saveCallback(saveData);

                    console.log(`[SCRIBBLE] Saved strokes to server at ${new Date().toISOString()}`);
                    _debugCallback('Saved scribble strokes to server');
                    _pendingChanges = false;
                    resolve();
                } catch (error) {
                    console.error(`[SCRIBBLE][DEBUG] Error in saveScribbleStrokesToServer: ${error.message}`, error);
                    _debugCallback(`Error saving to server: ${error.message}`);
                    reject(error);
                }
            } else {
                console.warn('[SCRIBBLE][DEBUG] No save callback provided, cannot save to server');
                _debugCallback('Error: No save callback provided');
                reject(new Error('No save callback provided'));
            }
        });
    }

    // Start periodic saving to server
    function startPeriodicSaving() {
        if (_saveToServerInterval) {
            clearInterval(_saveToServerInterval);
        }

        _saveToServerInterval = setInterval(function() {
            // Check if we have any strokes to save at all before attempting to save
            var hasStrokes = false;
            for (var page in _scribbleStrokes) {
                if (_scribbleStrokes[page] && _scribbleStrokes[page].length > 0) {
                    hasStrokes = true;
                    break;
                }
            }

            if (hasStrokes) {
                console.log(`[SCRIBBLE] Periodic save check - has strokes, attempting to save`);
                // Always set _pendingChanges to true to force a save attempt
                _pendingChanges = true;
                saveScribbleStrokesToServer()
                    .then(() => console.log('[SCRIBBLE] Periodic save successful'))
                    .catch(error => console.error('[SCRIBBLE] Periodic save failed:', error));
            } else {
                console.log(`[SCRIBBLE] Periodic save check - no strokes to save`);
            }
        }, _saveIntervalTime);

        console.log(`[SCRIBBLE] Started periodic saving interval (every ${_saveIntervalTime/1000} seconds)`);
        _debugCallback(`Started periodic saving interval (every ${_saveIntervalTime/1000} seconds)`);

        // Add event listener for page unload to save before leaving
        window.addEventListener('beforeunload', function() {
            console.log('[SCRIBBLE] Page unloading, attempting final save');
            _pendingChanges = true; // Force save on unload
            saveScribbleStrokesToServer();
        });
    }

    // Stop periodic saving to server
    function stopPeriodicSaving() {
        if (_saveToServerInterval) {
            clearInterval(_saveToServerInterval);
            _saveToServerInterval = null;
            console.log('[SCRIBBLE] Stopped periodic saving interval');
            _debugCallback('Stopped periodic saving interval');
        }
    }

    // Save scribble strokes to storage (kept for backward compatibility)
    function saveScribbleStrokes() {
        // Mark as having pending changes
        _pendingChanges = true;

        // Save to browser storage immediately
        saveScribbleStrokesToBrowser();
    }

    // Load scribble strokes from storage
    function loadScribbleStrokes(strokes) {
        if (!strokes) return;

        _scribbleStrokes = strokes;
        _debugCallback(`Loaded ${Object.keys(_scribbleStrokes).length} pages of scribble strokes`);

        // Save to browser storage
        saveScribbleStrokesToBrowser();

        // Render strokes for current page
        renderPageStrokes(_currentPage);
    }

    // Render scribble strokes for a specific page
    function renderPageStrokes(page) {
        if (!_fabricCanvas) return;

        console.log(`[SCRIBBLE] Rendering strokes for page ${page}`);

        // Clear previous scribble strokes first
        clearScribbleStrokes();

        // If we have strokes for this page, render them
        if (_scribbleStrokes[page] && _scribbleStrokes[page].length > 0) {
            console.log(`[SCRIBBLE] Found ${_scribbleStrokes[page].length} strokes for page ${page}`);

            _scribbleStrokes[page].forEach(function(stroke) {
                try {
                    // Make sure this stroke belongs to this page
                    if (stroke.page && stroke.page != page) {
                        console.log(`[SCRIBBLE] Skipping stroke from page ${stroke.page} while on page ${page}`);
                        return; // Skip strokes from other pages
                    }

                    fabric.util.enlivenObjects([stroke.path], function(objects) {
                        objects.forEach(function(path) {
                            // Restore metadata
                            path.set({
                                scribbleStroke: true,
                                userId: stroke.userId,
                                page: page, // Always set to current page
                                timestamp: stroke.timestamp,
                                strokeId: stroke.strokeId,
                                selectable: false,
                                evented: false
                            });

                            _fabricCanvas.add(path);
                        });

                        _fabricCanvas.renderAll();
                    });
                } catch (e) {
                    _debugCallback(`Error rendering scribble stroke: ${e.message}`);
                    console.error(`[SCRIBBLE] Error rendering stroke:`, e, stroke);
                }
            });

            _debugCallback(`Rendered ${_scribbleStrokes[page].length} scribble strokes for page ${page}`);
        } else {
            console.log(`[SCRIBBLE] No strokes found for page ${page}`);
        }
    }

    // Clear scribble strokes from canvas
    function clearScribbleStrokes() {
        if (!_fabricCanvas) return;

        // Remove all scribble strokes from canvas
        var objects = _fabricCanvas.getObjects();
        for (var i = 0; i < objects.length; i++) {
            if (objects[i].scribbleStroke) {
                _fabricCanvas.remove(objects[i]);
                i--; // Adjust index since we removed an item
            }
        }

        _fabricCanvas.renderAll();
    }

    // Change the current page
    function setCurrentPage(pageNumber) {
        // Ensure it's a number
        pageNumber = parseInt(pageNumber, 10);
        if (isNaN(pageNumber)) {
            pageNumber = 1;
        }

        console.log(`[SCRIBBLE] Changing page from ${_currentPage} to ${pageNumber}`);

        // Save any pending changes for the current page before switching
        if (_pendingChanges) {
            console.log(`[SCRIBBLE] Saving pending changes before changing page`);
            saveScribbleStrokesToBrowser();
            saveScribbleStrokesToServer();
        }

        // Update current page
        _currentPage = pageNumber;

        // Always clear the canvas when changing pages, regardless of whether page changed
        clearScribbleStrokes();

        // Render strokes for the new page
        renderPageStrokes(_currentPage);

        console.log(`[SCRIBBLE] Page change complete, now on page ${_currentPage}`);
    }

    // Enable scribble
    function enable() {
        _isActive = true;
        console.log("%c[SCRIBBLE] Enabling scribble tool", "background:#16a085;color:white;padding:3px;border-radius:3px;");
        _debugCallback('Enabling scribble tool');

        if (_fabricCanvas) {
            // Reset canvas state
            _fabricCanvas.isDrawingMode = true;
            _fabricCanvas.selection = false;

            // Configure the brush
            if (!_fabricCanvas.freeDrawingBrush) {
                _fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(_fabricCanvas);
            }

            _fabricCanvas.freeDrawingBrush.color = _color;
            _fabricCanvas.freeDrawingBrush.width = _width;
            _fabricCanvas.freeDrawingBrush.scribbleMode = true;

            // Critical: Ensure pointer events are properly set
            _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

            // Make sure the brush is initialized correctly
            _fabricCanvas.calcOffset();
            _fabricCanvas.renderAll();

            // Enable interaction with the draw container
            var drawContainer = $(element).find(`#draw-container-${_blockId}`)[0];
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'auto';
                drawContainer.classList.add('draw-mode');

                // Set a flag on the container to indicate scribble mode
                drawContainer.dataset.currentTool = 'scribble';

                // Add an event listener to prevent select events
                drawContainer.removeEventListener('mousedown', preventDeselection);
                drawContainer.removeEventListener('mouseup', preventDeselection);
                drawContainer.removeEventListener('click', preventDeselection);

                drawContainer.addEventListener('mousedown', preventDeselection);
                drawContainer.addEventListener('mouseup', preventDeselection);
                drawContainer.addEventListener('click', preventDeselection);
            }

            // Add special mouse event listeners to prevent deselection
            if (_fabricCanvas._scribbleEventsBound) {
                // Remove existing handlers first to avoid duplicates
                _fabricCanvas.off('mouse:move', _handleScribbleMouseMove);
                _fabricCanvas.off('mouse:up', _handleScribbleMouseUp);
                _fabricCanvas.off('mouse:down', _handleScribbleMouseDown);
                _fabricCanvas._scribbleEventsBound = false;
            }

            // Add new handlers
            _fabricCanvas.on('mouse:move', _handleScribbleMouseMove);
            _fabricCanvas.on('mouse:up', _handleScribbleMouseUp);
            _fabricCanvas.on('mouse:down', _handleScribbleMouseDown);
            _fabricCanvas._scribbleEventsBound = true;

            // Set up keepActive timer
            if (_keepActiveInterval) {
                clearInterval(_keepActiveInterval);
            }
            _keepActiveInterval = setInterval(keepActive, 1000);

            // Start periodic saving if not running
            startPeriodicSaving();

            // Add to window for debugging
            window.scribble_debug = {
                instance: this,
                keepActive: keepActive,
                fabricCanvas: _fabricCanvas
            };

            console.log("[SCRIBBLE] Tool enabled with all event handlers and keep-alive timer");
            _debugCallback('Scribble tool enabled - all event handlers attached');
        } else {
            console.error("[SCRIBBLE] Canvas not initialized, cannot enable scribble");
            _debugCallback('Error: Cannot enable scribble tool - Fabric canvas not initialized');
        }
    }

    // Disable scribble
    function disable() {
        _isActive = false;
        console.log("[SCRIBBLE] Disabling scribble tool");
        _debugCallback('Disabling scribble tool');

        // Save any pending changes before disabling
        if (_pendingChanges) {
            saveScribbleStrokesToBrowser();
            saveScribbleStrokesToServer();
        }

        if (_fabricCanvas) {
            _fabricCanvas.isDrawingMode = false;

            // Disable interaction with the draw container
            var drawContainer = $(element).find(`#draw-container-${_blockId}`)[0];
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'none';
                drawContainer.classList.remove('draw-mode');
                drawContainer.dataset.currentTool = '';

                // Remove event listeners
                drawContainer.removeEventListener('mousedown', preventDeselection);
                drawContainer.removeEventListener('mouseup', preventDeselection);
                drawContainer.removeEventListener('click', preventDeselection);
            }

            // Remove fabric event listeners
            if (_fabricCanvas._scribbleEventsBound) {
                _fabricCanvas.off('mouse:move', _handleScribbleMouseMove);
                _fabricCanvas.off('mouse:up', _handleScribbleMouseUp);
                _fabricCanvas.off('mouse:down', _handleScribbleMouseDown);
                _fabricCanvas._scribbleEventsBound = false;
            }

            // Clear keep-alive timer
            if (_keepActiveInterval) {
                clearInterval(_keepActiveInterval);
                _keepActiveInterval = null;
            }
        }

        // Stop periodic saving
        stopPeriodicSaving();
    }

    // Add these helper methods to handle scribble-specific mouse events
    function _handleScribbleMouseMove(opt) {
        if (!_isActive) return;

        // Make sure drawing mode stays active
        if (_fabricCanvas) {
            _fabricCanvas.isDrawingMode = true;
            _fabricCanvas.freeDrawingBrush.scribbleMode = true;
            _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
        }
    }

    function _handleScribbleMouseUp(opt) {
        if (!_isActive) return;

        console.log('[SCRIBBLE][DEBUG] Mouse up event in handler');

        // Make sure drawing mode stays active
        if (_fabricCanvas) {
            _fabricCanvas.isDrawingMode = true;
            _fabricCanvas.freeDrawingBrush.scribbleMode = true;
            _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

            // Clear the current drawing points to prevent continued drawing
            if (_fabricCanvas.freeDrawingBrush && _fabricCanvas.freeDrawingBrush._points) {
                _fabricCanvas.freeDrawingBrush._points = [];
                console.log('[SCRIBBLE][DEBUG] Reset brush points on mouse up to prevent continued drawing');
            }

            // Check if we need to force a path creation
            // This helps when the mouse:up event doesn't properly trigger path:created
            if (_fabricCanvas.freeDrawingBrush._points && _fabricCanvas.freeDrawingBrush._points.length > 0) {
                console.log('[SCRIBBLE][DEBUG] Forcing finalize of brush path on mouse up');
                console.log('[SCRIBBLE][DEBUG] Points:', _fabricCanvas.freeDrawingBrush._points.length);

                try {
                    var path = _fabricCanvas.freeDrawingBrush.convertPointsToSVGPath(
                        _fabricCanvas.freeDrawingBrush._points
                    ).join('');

                    if (path && _fabricCanvas.freeDrawingBrush._points.length > 1) {
                        console.log('[SCRIBBLE][DEBUG] Creating path object from points');
                        var pathObj = new fabric.Path(path);
                        pathObj.set({
                            fill: null,
                            stroke: _fabricCanvas.freeDrawingBrush.color,
                            strokeWidth: _fabricCanvas.freeDrawingBrush.width,
                            strokeLineCap: _fabricCanvas.freeDrawingBrush.strokeLineCap,
                            strokeLineJoin: _fabricCanvas.freeDrawingBrush.strokeLineJoin,
                            strokeDashArray: _fabricCanvas.freeDrawingBrush.strokeDashArray,
                        });

                        // Create manual path:created event
                        console.log('[SCRIBBLE][DEBUG] Firing path:created event manually');
                        _fabricCanvas.fire('path:created', { path: pathObj });

                        // Reset points
                        _fabricCanvas.freeDrawingBrush._points = [];
                    } else {
                        console.log('[SCRIBBLE][DEBUG] Not enough points to create a path');
                    }
                } catch (e) {
                    console.error('[SCRIBBLE][DEBUG] Error creating path from points:', e);
                }
            } else {
                console.log('[SCRIBBLE][DEBUG] No points to create path from on mouse up');
            }
        } else {
            console.error('[SCRIBBLE][DEBUG] fabric canvas is null on mouse up');
        }
    }

    function _handleScribbleMouseDown(opt) {
        if (!_isActive) return;

        console.log('[SCRIBBLE][DEBUG] Mouse down event in handler');

        // Make sure drawing mode stays active
        if (_fabricCanvas) {
            _fabricCanvas.isDrawingMode = true;
            _fabricCanvas.freeDrawingBrush.scribbleMode = true;
            _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

            // Reset points array at start of stroke
            if (_fabricCanvas.freeDrawingBrush) {
                _fabricCanvas.freeDrawingBrush._points = [];
                console.log('[SCRIBBLE][DEBUG] Reset brush points on mouse down');
            }
        } else {
            console.error('[SCRIBBLE][DEBUG] fabric canvas is null on mouse down');
        }
    }

    function preventDeselection(e) {
        if (!_isActive) return;
        e.stopPropagation();
    }

    function keepActive() {
        if (!_isActive) return;

        if (_fabricCanvas) {
            _fabricCanvas.isDrawingMode = true;
            _fabricCanvas.freeDrawingBrush.scribbleMode = true;
            _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

            // Ensure pointer events are properly set on draw container
            var drawContainer = $(element).find(`#draw-container-${_blockId}`)[0];
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'auto';
                drawContainer.classList.add('draw-mode');
            }
        }
    }

    // Set a color for the scribble
    function setColor(color) {
        _color = color;
        if (_fabricCanvas && _fabricCanvas.freeDrawingBrush) {
            _fabricCanvas.freeDrawingBrush.color = _color;
        }
        _debugCallback('Updated scribble color to ' + _color);
    }

    // Set a width for the scribble
    function setWidth(width) {
        _width = width;
        if (_fabricCanvas && _fabricCanvas.freeDrawingBrush) {
            _fabricCanvas.freeDrawingBrush.width = _width;
        }
        _debugCallback('Updated scribble width to ' + _width);
    }

    // Clear all strokes
    function clearAll() {
        _scribbleStrokes = {};
        clearScribbleStrokes();
        _pendingChanges = true;

        // Clear from browser storage
        if (_useIndexedDB && _idbDatabase) {
            var transaction = _idbDatabase.transaction(['strokes'], 'readwrite');
            var store = transaction.objectStore('strokes');
            var request = store.clear();

            request.onsuccess = function() {
                console.log('[SCRIBBLE] Cleared all strokes from IndexedDB');
                _debugCallback('Cleared all strokes from IndexedDB');
            };

            request.onerror = function(event) {
                console.error('[SCRIBBLE] Error clearing IndexedDB:', event.target.error);
                _debugCallback('Error clearing IndexedDB');
            };
        } else {
            localStorage.removeItem(`${_storagePrefix}scribbleStrokes`);
            localStorage.removeItem(`${_storagePrefix}lastModified`);
        }

        // Save empty state to server
        saveScribbleStrokesToServer();

        _debugCallback('Cleared all scribble strokes');
    }

    // Monkey patch the PencilBrush to track drawing better
    function enhancePencilBrush() {
        if (typeof fabric === 'undefined' || !fabric.PencilBrush) {
            console.error('[SCRIBBLE][DEBUG] fabric.js or PencilBrush not available for enhancement');
            return;
        }

        console.log('[SCRIBBLE][DEBUG] Enhancing PencilBrush for better tracking');

        // Save original method
        var originalOnMouseMove = fabric.PencilBrush.prototype._onMouseMove;

        // Enhance the method to debug drawing
        fabric.PencilBrush.prototype._onMouseMove = function(pointer, options) {
            // Call original method
            originalOnMouseMove.call(this, pointer, options);

            // Add debug logging only occasionally to avoid console spam
            if (this.scribbleMode && this._points && this._points.length % 10 === 0) {
                console.log('[SCRIBBLE][DEBUG] Brush mouse move, points:', this._points.length);
            }
        };

        // Save original method
        var originalOnMouseUp = fabric.PencilBrush.prototype._onMouseUp;

        // Enhance to ensure path:created always fires
        fabric.PencilBrush.prototype._onMouseUp = function(pointer) {
            if (this.scribbleMode) {
                console.log('[SCRIBBLE][DEBUG] PencilBrush mouse up, points:',
                    this._points ? this._points.length : 0);
            }

            // Call original method
            originalOnMouseUp.call(this, pointer);
        };

        console.log('[SCRIBBLE][DEBUG] PencilBrush enhancement complete');
    }

    // Public API
    return {
        init: init,
        enable: enable,
        disable: disable,
        setColor: setColor,
        setWidth: setWidth,
        clearAll: clearAll,
        saveScribbleStrokes: saveScribbleStrokes,
        loadScribbleStrokes: loadScribbleStrokes,
        renderPageStrokes: renderPageStrokes,
        clearScribbleStrokes: clearScribbleStrokes,
        setCurrentPage: setCurrentPage
    };
}