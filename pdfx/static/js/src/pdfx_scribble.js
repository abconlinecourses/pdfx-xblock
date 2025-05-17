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
        console.log(`[SCRIBBLE] Initializing scribble tool for block ${_blockId}`);
        _fabricCanvas = fabricCanvas;

        // Fix canvas dimensions to match the PDF container
        if (_fabricCanvas) {
            var pdfContainer = document.getElementById(`pdf-container-${_blockId}`);
            if (pdfContainer) {
                var containerWidth = pdfContainer.offsetWidth;
                var containerHeight = pdfContainer.offsetHeight;

                // Set canvas dimensions to match container
                _fabricCanvas.setWidth(containerWidth);
                _fabricCanvas.setHeight(containerHeight);

                // Also update the canvas-container wrapper
                var canvasWrapper = document.querySelector(`#draw-container-${_blockId} .canvas-container`);
                if (canvasWrapper) {
                    canvasWrapper.style.width = containerWidth + 'px';
                    canvasWrapper.style.height = containerHeight + 'px';
                }

                // Force re-render
                _fabricCanvas.calcOffset();
                _fabricCanvas.renderAll();

                console.log(`[SCRIBBLE] Canvas dimensions set to ${containerWidth}x${containerHeight}`);
            }
        }

        // If browser has IndexedDB, initialize it
        if (window.indexedDB) {
            // Add custom properties to the fabric brush
            if (fabricCanvas && fabricCanvas.freeDrawingBrush) {
                fabricCanvas.freeDrawingBrush.scribbleMode = false;
                fabricCanvas.freeDrawingBrush.markerMode = false;
                console.log(`[SCRIBBLE] Added custom properties to brush`);
            }

            // Set up event handlers for fabric canvas
            if (fabricCanvas && !fabricCanvas._scribbleEventsBound) {
                fabricCanvas.on('path:created', function(e) {
                    // Check if we're in scribble mode when path is created
                    if (fabricCanvas.freeDrawingBrush.scribbleMode || fabricCanvas.freeDrawingBrush.markerMode) {
                        handleScribbleStroke(e.path);
                    }
                });

                fabricCanvas.on('mouse:down', _handleScribbleMouseDown);
                fabricCanvas.on('mouse:move', _handleScribbleMouseMove);
                fabricCanvas.on('mouse:up', _handleScribbleMouseUp);
                fabricCanvas._scribbleEventsBound = true;
                console.log(`[SCRIBBLE] Set up fabric event handlers`);
            }

            // Enhance pencil brush for better scribble handling
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
            forceSaveBtn.textContent = 'Save Scribbles';
            forceSaveBtn.className = 'btn btn-sm btn-primary';
            forceSaveBtn.onclick = function() {
                _pendingChanges = true;
                saveScribbleStrokesToServer();
            };
            debugPanel.appendChild(forceSaveBtn);
        }

        // Make this instance globally available
        window[`scribbleInstance_${_blockId}`] = this;
        console.log(`[SCRIBBLE] Made instance globally available as scribbleInstance_${_blockId}`);
    }

    // Initialize IndexedDB database
    function initIndexedDB() {
        return new Promise(function(resolve, reject) {
            if (!window.indexedDB) {
                console.error('[SCRIBBLE][INDEXEDDB] IndexedDB not supported by this browser');
                _useIndexedDB = false;
                return reject(new Error('IndexedDB not supported'));
            }

            console.log(`[SCRIBBLE][INDEXEDDB] Initializing IndexedDB database: pdfx_scribble_db_${_blockId}`);
            var request = indexedDB.open(`pdfx_scribble_db_${_blockId}`, 1);

            request.onerror = function(event) {
                console.error('[SCRIBBLE][INDEXEDDB] Error opening database:', event.target.error);
                _useIndexedDB = false;
                reject(event.target.error);
            };

            request.onupgradeneeded = function(event) {
                var db = event.target.result;
                console.log('[SCRIBBLE][INDEXEDDB] Database upgrade needed, creating object store');

                // Create an object store for this block
                if (!db.objectStoreNames.contains('strokes')) {
                    db.createObjectStore('strokes', { keyPath: 'page' });
                    console.log('[SCRIBBLE][INDEXEDDB] Object store "strokes" created successfully');
                }
            };

            request.onsuccess = function(event) {
                _idbDatabase = event.target.result;
                console.log(`[SCRIBBLE][INDEXEDDB] Database initialized successfully for block ${_blockId}`);

                // Set up error handler for the database
                _idbDatabase.onerror = function(event) {
                    console.error('[SCRIBBLE][INDEXEDDB] Database error:', event.target.error);
                };

                resolve();
            };
        });
    }

    // Handle scribble strokes when created
    function handleScribbleStroke(path) {
        // Skip invalid paths
        if (!path) {
            console.error("[SCRIBBLE] Invalid path received in handleScribbleStroke");
            return;
        }

        // Ensure the path has required properties
        if (!path.path && !path.d) {
            console.error("[SCRIBBLE] Path is missing required path data");
            return;
        }

        // Verify we're handling strokes for the correct PDF block
        var activeDrawContainer = document.querySelector('.draw-container.draw-mode');
        if (activeDrawContainer) {
            var activeBlockId = activeDrawContainer.id.replace('draw-container-', '');
            if (activeBlockId !== _blockId) {
                console.log(`[SCRIBBLE] Ignoring stroke for different block: ${activeBlockId}, current block: ${_blockId}`);
                return;
            }
        }

        // Always set pending changes to true when a stroke is created
        _pendingChanges = true;

        // Add metadata to the path
        var strokeId = `scribble-${_blockId}-${_userId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

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
            // We need to make sure the array is long enough to hold the page index
            if (_currentPage >= _scribbleStrokes.length) {
                // Expand the array to fit the current page
                _scribbleStrokes.length = _currentPage + 1;
            }

            // Initialize the page's stroke array if needed
            if (!_scribbleStrokes[_currentPage]) {
                _scribbleStrokes[_currentPage] = [];
            }

            // Add the stroke to the current page's array
            _scribbleStrokes[_currentPage].push(stroke);

            _debugCallback(`Scribble stroke added to page ${_currentPage}`);

            // Ensure scribble mode stays active
            if (_fabricCanvas) {
                _fabricCanvas.isDrawingMode = true;
                _fabricCanvas.freeDrawingBrush.scribbleMode = true;
                _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

                // Keep drawing mode active for container
                var drawContainer = document.getElementById(`draw-container-${_blockId}`);
                if (drawContainer) {
                    drawContainer.style.pointerEvents = 'auto';
                    drawContainer.classList.add('draw-mode');
                }

                // Add the path to canvas if it's not already there
                if (!_fabricCanvas.contains(path)) {
                    _fabricCanvas.add(path);
                    _fabricCanvas.renderAll();
                }
            }

            // Save to browser storage immediately
            saveScribbleStrokesToBrowser();

            // Save to server after every stroke for reliability
            saveScribbleStrokesToServer();
        } catch (e) {
            console.error("[SCRIBBLE] Error processing stroke:", e);
        }
    }

    // Save scribble strokes to browser storage using IndexedDB
    function saveStrokesToIndexedDB() {
        return new Promise(function(resolve, reject) {
            if (!_idbDatabase) {
                console.error('[SCRIBBLE][INDEXEDDB] Database not initialized, cannot save strokes');
                return reject(new Error('IndexedDB not initialized'));
            }

            // Get all page numbers (array indices) with strokes
            var pageIndices = [];
            for (var i = 0; i < _scribbleStrokes.length; i++) {
                if (_scribbleStrokes[i] && Array.isArray(_scribbleStrokes[i]) && _scribbleStrokes[i].length > 0) {
                    pageIndices.push(i);
                }
            }

            console.log(`[SCRIBBLE][INDEXEDDB] Found ${pageIndices.length} pages with strokes to save:`, pageIndices);

            var transaction = _idbDatabase.transaction(['strokes'], 'readwrite');
            var store = transaction.objectStore('strokes');

            var completed = 0;
            var errors = [];

            // If no strokes to save, resolve immediately
            if (pageIndices.length === 0) {
                console.log('[SCRIBBLE][INDEXEDDB] No pages with strokes to save');
                return resolve();
            }

            // Save each page of strokes
            pageIndices.forEach(function(pageNum) {
                var strokeCount = _scribbleStrokes[pageNum] ? _scribbleStrokes[pageNum].length : 0;
                console.log(`[SCRIBBLE][INDEXEDDB] Saving page ${pageNum} with ${strokeCount} strokes`);

                // Ensure the strokes array is properly formed
                if (!Array.isArray(_scribbleStrokes[pageNum])) {
                    console.error(`[SCRIBBLE][INDEXEDDB] Page ${pageNum} strokes is not an array, skipping`);
                    completed++;
                    errors.push(`Page ${pageNum}: Strokes is not an array`);

                    if (completed === pageIndices.length) {
                        if (errors.length === 0) {
                            resolve();
                        } else {
                            reject(new Error('Some pages failed to save: ' + errors.join(', ')));
                        }
                    }
                    return;
                }

                // Create a copy of the strokes array to avoid issues with reference modifications
                var strokesCopy = JSON.parse(JSON.stringify(_scribbleStrokes[pageNum]));

                var request = store.put({
                    page: parseInt(pageNum, 10),
                    strokes: strokesCopy,
                    lastModified: new Date().toISOString(),
                    strokeCount: strokeCount
                });

                request.onsuccess = function(event) {
                    console.log(`[SCRIBBLE][INDEXEDDB] Successfully saved page ${pageNum} with ${strokeCount} strokes, key: ${event.target.result}`);
                    completed++;

                    if (completed === pageIndices.length) {
                        if (errors.length === 0) {
                            resolve();
                        } else {
                            reject(new Error('Some pages failed to save: ' + errors.join(', ')));
                        }
                    }
                };

                request.onerror = function(event) {
                    console.error(`[SCRIBBLE][INDEXEDDB] Error saving page ${pageNum}:`, event.target.error);
                    errors.push(`Page ${pageNum}: ${event.target.error}`);
                    completed++;
                    if (completed === pageIndices.length) {
                        reject(new Error('Some pages failed to save: ' + errors.join(', ')));
                    }
                };
            });

            transaction.oncomplete = function() {
                console.log(`[SCRIBBLE][INDEXEDDB] Transaction completed, saved ${pageIndices.length} pages to IndexedDB`);

                // Verify the saved data
                setTimeout(function() {
                    var verifyTx = _idbDatabase.transaction(['strokes'], 'readonly');
                    var verifyStore = verifyTx.objectStore('strokes');
                    var verifyRequest = verifyStore.getAll();

                    verifyRequest.onsuccess = function() {
                        var result = verifyRequest.result;
                        var totalSaved = 0;
                        if (result && result.length) {
                            result.forEach(function(item) {
                                if (item.strokes && item.strokes.length) {
                                    totalSaved += item.strokes.length;
                                }
                            });
                            console.log(`[SCRIBBLE][INDEXEDDB] Verification: ${result.length} pages with a total of ${totalSaved} strokes saved in IndexedDB`);
                        } else {
                            console.warn(`[SCRIBBLE][INDEXEDDB] Verification: No strokes found in IndexedDB after save!`);
                        }
                    };
                }, 100);
            };

            transaction.onerror = function(event) {
                console.error('[SCRIBBLE][INDEXEDDB] Transaction error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // Load scribble strokes from IndexedDB
    function loadStrokesFromIndexedDB(page) {
        console.log(`[SCRIBBLE][INDEXEDDB] Attempting to load strokes for page ${page} from IndexedDB`);

        return new Promise(function(resolve, reject) {
            if (!_idbDatabase) {
                console.error('[SCRIBBLE][INDEXEDDB] Database not initialized for loading');
                return reject(new Error('IndexedDB not initialized'));
            }

            try {
                var transaction = _idbDatabase.transaction(['strokes'], 'readonly');
                var store = transaction.objectStore('strokes');
                var request = store.get(parseInt(page, 10)); // Ensure page is an integer

                console.log(`[SCRIBBLE][INDEXEDDB] Request sent for page ${page}`);

                request.onsuccess = function(event) {
                    var result = event.target.result;
                    if (result && result.strokes && Array.isArray(result.strokes)) {
                        console.log(`[SCRIBBLE][INDEXEDDB] Found ${result.strokes.length} strokes for page ${page}`);
                        resolve({ strokes: result.strokes });
                    } else {
                        console.log(`[SCRIBBLE][INDEXEDDB] No valid strokes found for page ${page}`, result ? 'Result exists but is invalid' : 'No result');
                        if (result) {
                            console.log(`[SCRIBBLE][INDEXEDDB] Result data:`, {
                                hasStrokes: !!result.strokes,
                                strokesIsArray: Array.isArray(result.strokes),
                                strokeCount: result.strokeCount,
                                lastModified: result.lastModified
                            });
                        }
                        resolve(null);
                    }
                };

                request.onerror = function(event) {
                    console.error(`[SCRIBBLE][INDEXEDDB] Error loading strokes for page ${page}:`, event.target.error);
                    reject(event.target.error);
                };

                transaction.oncomplete = function() {
                    console.log(`[SCRIBBLE][INDEXEDDB] Load transaction completed for page ${page}`);
                };

                transaction.onerror = function(event) {
                    console.error(`[SCRIBBLE][INDEXEDDB] Load transaction error for page ${page}:`, event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error(`[SCRIBBLE][INDEXEDDB] Exception during load operation for page ${page}:`, error);
                reject(error);
            }
        });
    }

    // Save scribble strokes to browser storage
    function saveScribbleStrokesToBrowser() {
        console.log(`[SCRIBBLE][STORAGE] Saving strokes to browser storage at ${new Date().toISOString()}`);

        // Count total strokes to save
        var totalStrokes = 0;
        var pageCount = 0;
        for (var i = 0; i < _scribbleStrokes.length; i++) {
            if (_scribbleStrokes[i] && _scribbleStrokes[i].length > 0) {
                totalStrokes += _scribbleStrokes[i].length;
                pageCount++;
            }
        }

        console.log(`[SCRIBBLE][STORAGE] Saving ${totalStrokes} strokes across ${pageCount} pages`);

        if (_useIndexedDB) {
            console.log('[SCRIBBLE][STORAGE] Using IndexedDB for storage');
            saveStrokesToIndexedDB().then(function() {
                console.log(`[SCRIBBLE][STORAGE] Successfully saved ${totalStrokes} strokes to IndexedDB at ${new Date().toISOString()}`);
                _debugCallback(`Saved ${totalStrokes} scribble strokes to IndexedDB storage`);

                // Reset pending changes flag after successful save
                _pendingChanges = false;
            }).catch(function(error) {
                console.error(`[SCRIBBLE][STORAGE] Error saving to IndexedDB: ${error.message}`);
                _debugCallback(`Error saving to IndexedDB: ${error.message}`);

                // Fall back to localStorage
                console.log('[SCRIBBLE][STORAGE] Falling back to localStorage due to IndexedDB error');
                saveToLocalStorage();
            });
        } else {
            console.log('[SCRIBBLE][STORAGE] IndexedDB not available, using localStorage');
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

    // Render strokes from saved stroke data
    function renderStrokes(strokes) {
        if (!_fabricCanvas) {
            console.error('[SCRIBBLE] Cannot render strokes - fabric canvas not available');
            return;
        }

        if (!strokes || !Array.isArray(strokes) || strokes.length === 0) {
            console.log('[SCRIBBLE] No strokes to render');
            return;
        }

        console.log(`[SCRIBBLE] Rendering ${strokes.length} strokes`);

        // First clear any existing strokes to avoid duplication
        clearScribbleStrokes();

        // Render each stroke
        strokes.forEach(function(stroke) {
            try {
                if (!stroke.path) {
                    console.warn('[SCRIBBLE] Skipping invalid stroke - missing path data');
                    return;
                }

                // Create fabric path from the saved path data
                var path;
                if (typeof fabric.Path.fromObject === 'function') {
                    // Use fromObject if available (newer fabric versions)
                    fabric.Path.fromObject(stroke.path, function(p) {
                        path = p;
                        addPathToCanvas(path, stroke);
                    });
                } else {
                    // Fallback to direct creation
                    path = new fabric.Path(stroke.path.path || stroke.path.d);
                    addPathToCanvas(path, stroke);
                }
            } catch (e) {
                console.error('[SCRIBBLE] Error rendering stroke:', e);
            }
        });

        // Helper function to add path with proper properties
        function addPathToCanvas(path, stroke) {
            if (!path) return;

            // Set all the properties from the stored stroke
            path.set({
                stroke: stroke.color || '#FF0000',
                strokeWidth: stroke.width || 5,
                fill: false,
                scribbleStroke: true,
                userId: stroke.userId || _userId,
                page: stroke.page || _currentPage,
                timestamp: stroke.timestamp || new Date().toISOString(),
                strokeId: stroke.strokeId || `scribble-${_blockId}-${_userId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                blockId: stroke.blockId || _blockId,
                selectable: false,
                evented: false
            });

            // Add to canvas
            _fabricCanvas.add(path);
        }

        // Render all changes
        _fabricCanvas.renderAll();
    }

    // Load scribble strokes from browser storage
    function loadScribbleStrokesFromBrowser() {
        console.log(`[SCRIBBLE] Attempting to load strokes from browser storage for block ${_blockId}`);

        // Check if there's any data already in the _scribbleStrokes array for the current page
        if (_scribbleStrokes && _scribbleStrokes[_currentPage] && _scribbleStrokes[_currentPage].length > 0) {
            console.log(`[SCRIBBLE] Memory already has ${_scribbleStrokes[_currentPage].length} strokes for page ${_currentPage}`);
            // We'll continue with storage check anyway
        }

        if (_useIndexedDB) {
            console.log(`[SCRIBBLE] Checking IndexedDB storage for block: ${_blockId}`, '%c[PDF DEBUG]', 'background:#2ecc71;color:white;padding:3px;border-radius:3px;');

            // Debug IndexedDB storage stats
            try {
                var dbName = `pdfx_scribble_db_${_blockId}`;
                indexedDB.databases().then(function(databases) {
                    var found = databases.find(db => db.name === dbName);
                    console.log(`[SCRIBBLE] IndexedDB database found: ${found ? 'YES' : 'NO'}`);
                }).catch(e => console.log(`[SCRIBBLE] Error checking databases: ${e.message}`));

                // Count PDFs in storage
                var req = indexedDB.open(dbName);
                req.onsuccess = function(event) {
                    var db = event.target.result;
                    var tx = db.transaction('strokes', 'readonly');
                    var store = tx.objectStore('strokes');
                    var countRequest = store.count();

                    countRequest.onsuccess = function() {
                        console.log(`[SCRIBBLE] IndexedDB has ${countRequest.result} pages with strokes`);

                        // Get all strokes for debugging
                        var getAllRequest = store.getAll();
                        getAllRequest.onsuccess = function() {
                            var totalStrokes = 0;
                            if (getAllRequest.result) {
                                getAllRequest.result.forEach(function(item) {
                                    if (item.strokes && item.strokes.length) {
                                        totalStrokes += item.strokes.length;
                                    }
                                });
                                console.log(`[SCRIBBLE] IndexedDB has ${totalStrokes} total strokes across all pages`);
                            }
                        };
                    };

                    // Also gather storage stats
                    if (navigator.storage && navigator.storage.estimate) {
                        navigator.storage.estimate().then(function(estimate) {
                            console.log("Storage statistics:", {
                                totalPdfs: countRequest.result,
                                totalSize: estimate.usage,
                                oldestAccess: db.firstEntry,
                                newestAccess: db.lastEntry,
                                totalSizeFormatted: ((estimate.usage || 0) / (1024 * 1024)).toFixed(2) + ' MB'
                            });
                        });
                    }

                    db.close();
                };
            } catch (e) {
                console.error(`[SCRIBBLE] Error getting storage stats: ${e.message}`);
            }

            // Continue with normal loading
            loadStrokesFromIndexedDB(_currentPage).then(function(pageStrokes) {
                if (pageStrokes && pageStrokes.strokes) {
                    console.log(`[SCRIBBLE] Successfully loaded ${pageStrokes.strokes.length} strokes for page ${_currentPage} from IndexedDB`);
                    try {
                        renderStrokes(pageStrokes.strokes);
                        console.log(`[SCRIBBLE] Rendered strokes successfully from IndexedDB`);
                    } catch (e) {
                        console.error(`[SCRIBBLE] Error rendering strokes for page ${_currentPage} from IndexedDB:`, e);
                    }
                } else {
                    console.log(`[SCRIBBLE] No strokes found for page ${_currentPage} in IndexedDB`);
                    // Try fallback to localStorage if IndexedDB is empty
                    loadFromLocalStorage();
                }
            }).catch(function(error) {
                console.error(`[SCRIBBLE] Error loading strokes for page ${_currentPage} from IndexedDB:`, error);
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
            console.log(`[SCRIBBLE] Attempting to load from localStorage with key: ${_storagePrefix}${_currentPage}`);
            var storedData = localStorage.getItem(`${_storagePrefix}${_currentPage}`);
            if (storedData) {
                var parsed = JSON.parse(storedData);

                // Convert to array if it's not already
                if (!Array.isArray(parsed)) {
                    var newArray = [];
                    Object.keys(parsed).forEach(function(pageKey) {
                        var pageNum = parseInt(pageKey, 10);
                        if (isNaN(pageNum)) return;

                        // Ensure array is long enough
                        if (pageNum >= newArray.length) {
                            newArray.length = pageNum + 1;
                        }

                        // Add strokes for this page
                        newArray[pageNum] = parsed[pageKey];
                    });
                    _scribbleStrokes = newArray;
                } else {
                    _scribbleStrokes = parsed;
                }

                _debugCallback(`Loaded ${Object.keys(_scribbleStrokes).length} pages of scribble strokes from localStorage`);

                // Render strokes for current page
                renderPageStrokes(_currentPage);
            } else {
                console.log(`[SCRIBBLE] No data found in localStorage for key: ${_storagePrefix}${_currentPage}`);

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

        // Array-specific debug to check structure
        console.log(`[SCRIBBLE][DEBUG] _scribbleStrokes is array: ${Array.isArray(_scribbleStrokes)}, length: ${_scribbleStrokes.length}`);
        // Log non-empty indices
        for (let i = 0; i < _scribbleStrokes.length; i++) {
            if (_scribbleStrokes[i] && _scribbleStrokes[i].length > 0) {
                console.log(`[SCRIBBLE][DEBUG] _scribbleStrokes[${i}] has ${_scribbleStrokes[i].length} strokes`);
            }
        }

        // Check if we have any strokes to save at all - use proper array checking
        var hasStrokes = false;
        var strokesByPage = {};
        var totalStrokes = 0;

        // Since we're using an array, use numeric indexing to iterate
        for (var i = 0; i < _scribbleStrokes.length; i++) {
            if (_scribbleStrokes[i] && Array.isArray(_scribbleStrokes[i]) && _scribbleStrokes[i].length > 0) {
                hasStrokes = true;
                strokesByPage[i] = _scribbleStrokes[i].length;
                totalStrokes += _scribbleStrokes[i].length;
                console.log(`[SCRIBBLE][DEBUG] Page ${i} has ${_scribbleStrokes[i].length} strokes`);

                // Ensure each stroke has proper metadata
                _scribbleStrokes[i].forEach(function(stroke) {
                    if (!stroke.userId) stroke.userId = _userId;
                    if (!stroke.page) stroke.page = i;
                    if (!stroke.courseId) stroke.courseId = _courseId;
                    if (!stroke.blockId) stroke.blockId = _blockId;
                    if (!stroke.timestamp) stroke.timestamp = new Date().toISOString();
                });
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

            // Force save anyway for debugging/reliability
            console.log(`[SCRIBBLE][DEBUG] Forcing save despite no pending changes for reliability`);
            _pendingChanges = true;
        }

        return new Promise(function(resolve, reject) {
            if (_saveCallback) {
                try {
                    console.log(`[SCRIBBLE][DEBUG] Sending strokes to server callback. blockId: ${_blockId}, userId: ${_userId}, totalPages: ${_scribbleStrokes.length}, totalStrokes: ${totalStrokes}`);

                    // Create a deep copy to avoid reference issues
                    var strokesCopy = JSON.parse(JSON.stringify(_scribbleStrokes));

                    // Convert array to object format for server compatibility
                    var strokesObject = {};
                    for (var i = 0; i < strokesCopy.length; i++) {
                        if (strokesCopy[i] && strokesCopy[i].length > 0) {
                            strokesObject[i] = strokesCopy[i];
                        }
                    }

                    var saveData = {
                        markerStrokes: strokesObject, // Use object format for compatibility
                        userId: _userId,
                        courseId: _courseId,
                        blockId: _blockId,
                        currentPage: _currentPage,
                        timestamp: new Date().toISOString(),
                        totalStrokes: totalStrokes
                    };

                    console.log(`[SCRIBBLE][DEBUG] Callback data prepared:`, {
                        totalPages: _scribbleStrokes.length,
                        nonEmptyPages: Object.keys(strokesByPage).length,
                        userId: saveData.userId,
                        blockId: saveData.blockId,
                        totalStrokes: totalStrokes
                    });

                    _saveCallback(saveData);

                    console.log(`[SCRIBBLE] Saved ${totalStrokes} strokes to server at ${new Date().toISOString()}`);
                    _pendingChanges = false;
                    resolve();
                } catch (e) {
                    console.error('[SCRIBBLE] Error saving to server:', e);
                    reject(e);
                }
            } else {
                console.log('[SCRIBBLE] No save callback available, cannot save to server');
                reject(new Error('No save callback available'));
            }
        });
    }

    // Start periodic saving to server
    function startPeriodicSaving() {
        if (_saveToServerInterval) {
            clearInterval(_saveToServerInterval);
        }
        console.log(`[SCRIBBLE] Starting periodic saving function every ${_saveIntervalTime}ms`);

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
        if (!_fabricCanvas) {
            console.error(`[SCRIBBLE] No fabric canvas available for renderPageStrokes`);
            return;
        }

        // First clear any existing strokes to avoid duplication
        clearScribbleStrokes();

        console.log(`[SCRIBBLE] Rendering strokes for page ${page}`);

        // When switching pages, make sure drawing mode is preserved if active
        var isDrawingActive = _isActive;

        // Get the draw container
        var drawContainer = document.getElementById(`draw-container-${_blockId}`);

        // Check current tool before modifying container
        var currentTool = drawContainer ? drawContainer.getAttribute('data-current-tool') : null;
        var wasActive = currentTool === 'marker' || currentTool === 'scribble';

        // Now we need to find all strokes for this specific page
        if (_useIndexedDB && _idbDatabase) {
            loadStrokesFromIndexedDB(page).then(function(pageStrokes) {
                if (pageStrokes && pageStrokes.strokes) {
                    try {
                        renderStrokes(pageStrokes.strokes);
                        console.log(`[SCRIBBLE] Successfully rendered ${pageStrokes.strokes.length} strokes for page ${page} from IndexedDB`);
                    } catch (e) {
                        console.error(`[SCRIBBLE] Error rendering strokes for page ${page} from IndexedDB:`, e);
                    }
                } else {
                    console.log(`[SCRIBBLE] No strokes found for page ${page} in IndexedDB`);
                }

                // Restore active state if needed
                if (isDrawingActive && wasActive) {
                    // Keep drawing mode active if the tool was active
                    if (_fabricCanvas) {
                        _fabricCanvas.isDrawingMode = true;
                        if (_fabricCanvas.freeDrawingBrush) {
                            _fabricCanvas.freeDrawingBrush.scribbleMode = true;
                            _fabricCanvas.freeDrawingBrush.markerMode = true;
                        }

                        if (_fabricCanvas.upperCanvasEl) {
                            _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                        }
                    }

                    if (drawContainer) {
                        drawContainer.classList.add('draw-mode');
                        drawContainer.style.pointerEvents = 'auto';
                        drawContainer.setAttribute('data-current-tool', 'marker');
                    }
                }
            }).catch(function(error) {
                console.error(`[SCRIBBLE] Error loading strokes for page ${page} from IndexedDB:`, error);

                // Fallback to localStorage
                var storedData = localStorage.getItem(`${_storagePrefix}${page}`);
                if (storedData) {
                    try {
                        var pageStrokes = JSON.parse(storedData);
                        renderStrokes(pageStrokes);
                    } catch (e) {
                        console.error(`[SCRIBBLE] Error rendering strokes for page ${page} from localStorage:`, e);
                    }
                } else {
                    console.log(`[SCRIBBLE] No strokes found for page ${page} in localStorage`);
                }

                // Restore active state if needed
                if (isDrawingActive && wasActive) {
                    if (_fabricCanvas) {
                        _fabricCanvas.isDrawingMode = true;
                        if (_fabricCanvas.freeDrawingBrush) {
                            _fabricCanvas.freeDrawingBrush.scribbleMode = true;
                            _fabricCanvas.freeDrawingBrush.markerMode = true;
                        }

                        if (_fabricCanvas.upperCanvasEl) {
                            _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                        }
                    }

                    if (drawContainer) {
                        drawContainer.classList.add('draw-mode');
                        drawContainer.style.pointerEvents = 'auto';
                        drawContainer.setAttribute('data-current-tool', 'marker');
                    }
                }
            });
        } else {
            // Use localStorage as fallback
            var storedData = localStorage.getItem(`${_storagePrefix}${page}`);
            if (storedData) {
                try {
                    var pageStrokes = JSON.parse(storedData);
                    renderStrokes(pageStrokes);
                } catch (e) {
                    console.error(`[SCRIBBLE] Error rendering strokes for page ${page} from localStorage:`, e);
                }
            } else {
                console.log(`[SCRIBBLE] No strokes found for page ${page} in localStorage`);
            }

            // Restore active state if needed
            if (isDrawingActive && wasActive) {
                if (_fabricCanvas) {
                    _fabricCanvas.isDrawingMode = true;
                    if (_fabricCanvas.freeDrawingBrush) {
                        _fabricCanvas.freeDrawingBrush.scribbleMode = true;
                        _fabricCanvas.freeDrawingBrush.markerMode = true;
                    }

                    if (_fabricCanvas.upperCanvasEl) {
                        _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                    }
                }

                if (drawContainer) {
                    drawContainer.classList.add('draw-mode');
                    drawContainer.style.pointerEvents = 'auto';
                    drawContainer.setAttribute('data-current-tool', 'marker');
                }
            }
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

    // Set current page
    function setCurrentPage(pageNumber) {
        // If the page is the same, do nothing
        if (_currentPage === pageNumber) {
            return;
        }

        console.log(`[SCRIBBLE] Changing from page ${_currentPage} to page ${pageNumber}`);

        // Save the current page's strokes before changing pages
        if (_fabricCanvas && _pendingChanges) {
            console.log(`[SCRIBBLE] Saving strokes before changing page`);
            saveScribbleStrokesToBrowser();
        }

        // Clear the current scribble strokes to avoid showing them on the wrong page
        clearScribbleStrokes();

        // Update the current page
        _currentPage = pageNumber;

        // Load strokes for the new page
        renderPageStrokes(_currentPage);

        // Make sure drawing mode is reset properly
        if (_isActive && _fabricCanvas) {
            console.log(`[SCRIBBLE] Reactivating tool for new page`);

            // Setting active state
            _fabricCanvas.isDrawingMode = true;
            _fabricCanvas.freeDrawingBrush.scribbleMode = true;
            _fabricCanvas.freeDrawingBrush.color = _color;
            _fabricCanvas.freeDrawingBrush.width = _width;

            // Make sure canvas is interactive
            if (_fabricCanvas.upperCanvasEl) {
                _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                _fabricCanvas.upperCanvasEl.style.cursor = 'crosshair';
            }

            // Set draw container mode
            var drawContainer = document.getElementById(`draw-container-${_blockId}`);
            if (drawContainer) {
                drawContainer.classList.add('draw-mode');
                drawContainer.style.pointerEvents = 'auto';
            }
        } else {
            console.log(`[SCRIBBLE] Tool not active, keeping inactive for new page`);
        }

        return _currentPage;
    }

    // Enable scribble
    function enable() {
        _isActive = true;
        console.log(`[SCRIBBLE] Enabling scribble tool for block ${_blockId}`);

        // Skip if no canvas available
        if (!_fabricCanvas) {
            console.error('[SCRIBBLE] Cannot enable scribble tool - no fabric canvas available');
            return;
        }

        try {
            // Get the user-selected color from the color picker
            var colorInput = document.getElementById(`color-input-${_blockId}`);
            if (colorInput) {
                _color = colorInput.value;
                console.log(`[SCRIBBLE] Using color from color picker: ${_color}`);
            }

            // Fix canvas dimensions again if needed
            var pdfContainer = document.getElementById(`pdf-container-${_blockId}`);
            if (pdfContainer && _fabricCanvas) {
                var containerWidth = pdfContainer.offsetWidth;
                var containerHeight = pdfContainer.offsetHeight;

                // Check if canvas size doesn't match container
                if (_fabricCanvas.width !== containerWidth || _fabricCanvas.height !== containerHeight) {
                    console.log(`[SCRIBBLE] Fixing canvas dimensions to: ${containerWidth}x${containerHeight}`);
                    _fabricCanvas.setWidth(containerWidth);
                    _fabricCanvas.setHeight(containerHeight);

                    // Also update the canvas-container wrapper
                    var canvasWrapper = document.querySelector(`#draw-container-${_blockId} .canvas-container`);
                    if (canvasWrapper) {
                        canvasWrapper.style.width = containerWidth + 'px';
                        canvasWrapper.style.height = containerHeight + 'px';
                    }

                    _fabricCanvas.calcOffset();
                    _fabricCanvas.renderAll();
                }
            }

            // Enable drawing mode on canvas with necessary configurations
            _fabricCanvas.isDrawingMode = true;

            // Set scribble mode flag
            if (_fabricCanvas.freeDrawingBrush) {
                _fabricCanvas.freeDrawingBrush.scribbleMode = true;
                _fabricCanvas.freeDrawingBrush.markerMode = true;
                _fabricCanvas.freeDrawingBrush.color = _color; // Apply current color
                _fabricCanvas.freeDrawingBrush.width = _width;
                console.log(`[SCRIBBLE] Set brush color to ${_color} and width to ${_width}`);
            }

            // Enable pointer events on upper canvas - critical for drawing to work
            if (_fabricCanvas.upperCanvasEl) {
                _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                _fabricCanvas.upperCanvasEl.style.cursor = 'crosshair';
                console.log(`[SCRIBBLE] Set canvas cursor to crosshair`);
            }

            // Enable drawing mode on container - critical for drawing to work
            var drawContainer = document.getElementById(`draw-container-${_blockId}`);
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'auto';
                drawContainer.classList.add('draw-mode');
                drawContainer.style.cursor = 'crosshair';
                drawContainer.setAttribute('data-current-tool', 'marker');
                console.log(`[SCRIBBLE] Enabled draw container with crosshair cursor`);
            }

            // Activate scribble tool button
            var scribbleButton = document.getElementById(`scribble-tool-${_blockId}`);
            var markerButton = document.getElementById(`marker-tool-${_blockId}`); // Legacy ID

            // Try both possible button IDs (scribble-tool or marker-tool)
            var button = scribbleButton || markerButton;

            if (button) {
                // Add active class to scribble tool button
                button.classList.add('active');
                console.log(`[SCRIBBLE] Activated ${button.id} button`);
            }

            // Ensure we have event listeners for mouse events
            if (!_fabricCanvas._scribbleEventsBound) {
                _fabricCanvas.on('path:created', function(e) {
                    if (_fabricCanvas.freeDrawingBrush.scribbleMode || _fabricCanvas.freeDrawingBrush.markerMode) {
                        handleScribbleStroke(e.path);
                    }
                });

                _fabricCanvas.on('mouse:down', _handleScribbleMouseDown);
                _fabricCanvas.on('mouse:move', _handleScribbleMouseMove);
                _fabricCanvas.on('mouse:up', _handleScribbleMouseUp);
                _fabricCanvas._scribbleEventsBound = true;
                console.log(`[SCRIBBLE] Set up fabric event handlers`);
            }

            // Load existing strokes for the current page
            renderPageStrokes(_currentPage);

            // Start keep-active timer if not already running
            if (!_keepActiveInterval) {
                _keepActiveInterval = setInterval(keepActive, 1000);
            }

            // Set up event listeners for real-time color changes
            var colorInput = document.getElementById(`color-input-${_blockId}`);
            if (colorInput) {
                // Remove existing event listener first to avoid duplicates
                colorInput.removeEventListener('change', handleColorChange);
                colorInput.addEventListener('change', handleColorChange);
                colorInput.removeEventListener('input', handleColorChange);
                colorInput.addEventListener('input', handleColorChange);
                console.log(`[SCRIBBLE] Set up color change listeners`);
            }

            _debugCallback('Scribble tool enabled');
        } catch (e) {
            console.error('[SCRIBBLE] Error enabling scribble tool:', e);
        }
    }

    // Handle color changes from the color picker in real-time
    function handleColorChange(event) {
        var newColor = event.target.value;
        console.log(`[SCRIBBLE] Color changed to: ${newColor}`);
        setColor(newColor);
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

        // Remove color picker event listeners
        var colorInput = document.getElementById(`color-input-${_blockId}`);
        if (colorInput) {
            colorInput.removeEventListener('change', handleColorChange);
            colorInput.removeEventListener('input', handleColorChange);
            console.log(`[SCRIBBLE] Removed color change listeners`);
        }

        // Cleanup fabricCanvas properly
        if (_fabricCanvas) {
            // Force drawing mode to off
            _fabricCanvas.isDrawingMode = false;

            // Reset brush properties
            if (_fabricCanvas.freeDrawingBrush) {
                _fabricCanvas.freeDrawingBrush.scribbleMode = false;
                _fabricCanvas.freeDrawingBrush.markerMode = false;
            }

            // Clear any pending fabric rendering
            if (_fabricCanvas.renderAll) {
                _fabricCanvas.renderAll();
            }

            console.log("[SCRIBBLE] Disabled fabric drawing mode");

            // Reset cursor and pointer events on canvas - CRITICAL FIX
            if (_fabricCanvas.upperCanvasEl) {
                _fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                _fabricCanvas.upperCanvasEl.style.cursor = 'default';
                console.log("[SCRIBBLE] Reset canvas cursor and pointer events");
            }

            // Reset any canvas-container element - CRITICAL FIX
            var canvasContainer = document.querySelector(`#draw-container-${_blockId} .canvas-container`);
            if (canvasContainer) {
                canvasContainer.style.pointerEvents = 'none';
                console.log("[SCRIBBLE] Reset canvas-container pointer events");
            }

            // Disable interaction with the draw container - CRITICAL FIX
            var drawContainer = document.getElementById(`draw-container-${_blockId}`);
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'none';
                drawContainer.classList.remove('draw-mode');
                drawContainer.removeAttribute('data-current-tool');
                drawContainer.style.cursor = 'default';
                drawContainer.style.zIndex = '20'; // Ensure original z-index
                console.log("[SCRIBBLE] Disabled draw container");

                // Remove event listeners
                drawContainer.removeEventListener('mousedown', preventDeselection);
                drawContainer.removeEventListener('mouseup', preventDeselection);
                drawContainer.removeEventListener('click', preventDeselection);
            }

            // Ensure all canvas elements are properly reset
            try {
                var allCanvasElements = document.querySelectorAll(`#draw-container-${_blockId} canvas`);
                allCanvasElements.forEach(function(canvas) {
                    canvas.style.pointerEvents = 'none';
                });
                console.log("[SCRIBBLE] Reset all canvas elements pointer events");
            } catch (e) {
                console.error("[SCRIBBLE] Error resetting canvas elements:", e);
            }

            // Remove fabric event listeners
            try {
                if (_fabricCanvas._scribbleEventsBound) {
                    _fabricCanvas.off('path:created');
                    _fabricCanvas.off('mouse:move', _handleScribbleMouseMove);
                    _fabricCanvas.off('mouse:up', _handleScribbleMouseUp);
                    _fabricCanvas.off('mouse:down', _handleScribbleMouseDown);
                    _fabricCanvas._scribbleEventsBound = false;
                    console.log("[SCRIBBLE] Removed fabric event listeners");
                }
            } catch (e) {
                console.error("[SCRIBBLE] Error removing fabric event listeners:", e);
            }

            // Clear keep-alive timer
            if (_keepActiveInterval) {
                clearInterval(_keepActiveInterval);
                _keepActiveInterval = null;
            }
        }

        // Make sure document body can receive events
        document.body.style.pointerEvents = 'auto';

        // Stop periodic saving
        stopPeriodicSaving();

        // Force a small delay before enabling interactivity again
        setTimeout(function() {
            // Make absolutely sure UI is responsive
            var toolButtons = document.querySelectorAll(`[id$="-tool-${_blockId}"]`);
            toolButtons.forEach(function(button) {
                button.style.pointerEvents = 'auto';
            });

            var drawContainer = document.getElementById(`draw-container-${_blockId}`);
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'none';
            }

            console.log("[SCRIBBLE] Re-enabled tool button interactivity");
        }, 100);

        console.log("[SCRIBBLE] Tool fully disabled");
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

    // Handle scribble mouse up
    function _handleScribbleMouseUp(opt) {
        console.log(`[SCRIBBLE] Mouse up triggered at ${new Date().toISOString()}`);

        if (!_fabricCanvas) {
            console.error(`[SCRIBBLE] No fabric canvas available for _handleScribbleMouseUp`);
            return;
        }

        if (!_fabricCanvas.freeDrawingBrush || !_fabricCanvas.freeDrawingBrush.scribbleMode) {
            console.log(`[SCRIBBLE] Not in scribble mode, ignoring mouse up`);
            return;
        }

        // Get the latest added path
        var lastPath = null;
        if (_fabricCanvas._objects && _fabricCanvas._objects.length > 0) {
            lastPath = _fabricCanvas._objects[_fabricCanvas._objects.length - 1];
        }

        if (lastPath && !lastPath.scribbleStroke) {
            console.log(`[SCRIBBLE] Setting metadata on last created path`);
            // This might be a path that was just created but hasn't gone through handleScribbleStroke yet
            // Add the metadata and save
            lastPath.set({
                scribbleStroke: true,
                userId: _userId,
                page: _currentPage,
                timestamp: new Date().toISOString(),
                strokeId: `scribble-${_blockId}-${_userId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                blockId: _blockId,
                selectable: false,
                evented: false
            });

            // Set pending changes
            _pendingChanges = true;

            // Save strokes immediately to browser storage
            saveScribbleStrokesToBrowser();
        }

        // If in debug mode, add a visual marker to help debug
        var debugPanel = document.getElementById(`pdfx-debug-panel-${_blockId}`);
        if (debugPanel && debugPanel.dataset.debugLevel >= 2) {
            var endMarker = new fabric.Circle({
                left: opt.e.pointer.x,
                top: opt.e.pointer.y,
                radius: 5,
                fill: 'blue',
                opacity: 0.5,
                selectable: false,
                evented: false,
                metadata: {
                    debug: true,
                    type: 'end',
                    time: new Date().toISOString()
                }
            });
            _fabricCanvas.add(endMarker);
            setTimeout(function() {
                _fabricCanvas.remove(endMarker);
                _fabricCanvas.renderAll();
            }, 2000);
        }

        // Ensure we render
        _fabricCanvas.renderAll();
    }

    function _handleScribbleMouseDown(opt) {
        if (!_isActive) return;

        console.log('[SCRIBBLE] Mouse down event in handler');

        // Make sure drawing mode stays active
        if (_fabricCanvas) {
            _fabricCanvas.isDrawingMode = true;
            _fabricCanvas.freeDrawingBrush.scribbleMode = true;
            _fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';

            // Reset points array at start of stroke
            if (_fabricCanvas.freeDrawingBrush) {
                _fabricCanvas.freeDrawingBrush._points = [];
                console.log('[SCRIBBLE] Reset brush points on mouse down');
            }
        } else {
            console.error('[SCRIBBLE] Fabric canvas is null on mouse down');
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
            var drawContainer = document.getElementById(`draw-container-${_blockId}`);
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'auto';
                drawContainer.classList.add('draw-mode');
            }
        }
    }

    // Set a color for the scribble
    function setColor(color) {
        _color = color;
        console.log(`[SCRIBBLE] Setting color to ${color}`);
        if (_fabricCanvas && _fabricCanvas.freeDrawingBrush) {
            _fabricCanvas.freeDrawingBrush.color = _color;
            console.log(`[SCRIBBLE] Applied color ${color} to drawing brush`);
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
        _scribbleStrokes = [];
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

    // Monkey patch the PencilBrush to ensure proper drawing behavior
    function enhancePencilBrush() {
        if (typeof fabric === 'undefined' || !fabric.PencilBrush) {
            console.error('[SCRIBBLE] fabric.js or PencilBrush not available for enhancement');
            return;
        }

        // Save original method
        var originalOnMouseUp = fabric.PencilBrush.prototype._onMouseUp;

        // Create a completely new function to ensure proper handling
        fabric.PencilBrush.prototype._onMouseUp = function(pointer) {
            // Check if we have points before original is called
            var hasPoints = this._points && this._points.length > 0;

            // Call original method to create the path
            originalOnMouseUp.call(this, pointer);

            // Extra important fix: Make sure _points is emptied and drawing is stopped
            if (this.scribbleMode) {
                // Ensure points are cleared completely
                this._points = [];

                // Force canvas rendering if available
                if (this.canvas) {
                    this.canvas.renderAll();
                }

                // Create a slight delay and reset again to ensure drawing stops
                var brush = this;
                setTimeout(function() {
                    brush._points = [];
                    if (brush.canvas) {
                        brush.canvas.renderAll();
                    }
                }, 50);
            }
        };
    }

    // Load marker strokes from server data
    function loadMarkerStrokes(data) {
        console.log(`[SCRIBBLE] Loading marker strokes from server data for block ${_blockId}`);

        if (!data || typeof data !== 'object') {
            console.warn('[SCRIBBLE] No valid marker stroke data from server');
            return;
        }

        try {
            // If data is in legacy format (using the markerStrokes key), handle it
            var strokeData = data.markerStrokes || data;
            var pageCount = 0;
            var totalStrokes = 0;

            console.log(`[SCRIBBLE] Server marker data type: ${typeof strokeData}, isArray: ${Array.isArray(strokeData)}`);

            // Initialize stroke array if needed
            if (!_scribbleStrokes) {
                _scribbleStrokes = [];
            }

            // Handle object format (page number keys with arrays of strokes)
            if (typeof strokeData === 'object' && !Array.isArray(strokeData)) {
                Object.keys(strokeData).forEach(function(pageKey) {
                    if (pageKey === '_last_saved' || pageKey === 'timestamp') return; // Skip metadata

                    var pageNum = parseInt(pageKey, 10);
                    if (isNaN(pageNum)) return;

                    // Ensure the strokes array is long enough
                    if (pageNum >= _scribbleStrokes.length) {
                        _scribbleStrokes.length = pageNum + 1;
                    }

                    // Make sure the page array exists
                    if (!_scribbleStrokes[pageNum]) {
                        _scribbleStrokes[pageNum] = [];
                    }

                    // Skip if no strokes for this page
                    if (!Array.isArray(strokeData[pageKey]) || strokeData[pageKey].length === 0) {
                        return;
                    }

                    // Add strokes to the appropriate page array
                    _scribbleStrokes[pageNum] = strokeData[pageKey].map(function(stroke) {
                        // Ensure stroke has required properties
                        return {
                            path: stroke.path,
                            color: stroke.color || '#FF0000',
                            width: stroke.width || 5,
                            page: pageNum,
                            strokeId: stroke.strokeId || `scribble-server-${_blockId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                            userId: stroke.userId || _userId,
                            timestamp: stroke.timestamp || new Date().toISOString(),
                            courseId: stroke.courseId || _courseId,
                            blockId: stroke.blockId || _blockId
                        };
                    });

                    pageCount++;
                    totalStrokes += _scribbleStrokes[pageNum].length;
                });

                console.log(`[SCRIBBLE] Loaded ${totalStrokes} strokes across ${pageCount} pages from server data`);

                // Save to browser storage for persistence
                saveScribbleStrokesToBrowser();

                // Render strokes for current page
                renderPageStrokes(_currentPage);
            } else {
                console.warn('[SCRIBBLE] Invalid stroke data format from server');
            }
        } catch (error) {
            console.error('[SCRIBBLE] Error loading marker strokes from server:', error);
        }
    }

    // Public API
    return {
        init: init,
        enable: enable,
        disable: disable,
        handleScribbleStroke: handleScribbleStroke,
        clearAll: clearAll,
        setColor: setColor,
        setWidth: setWidth,
        setCurrentPage: setCurrentPage,
        getAllMarkerStrokes: function() { return _scribbleStrokes; },
        saveScribbleStrokesToServer: saveScribbleStrokesToServer,
        saveScribbleStrokesToBrowser: saveScribbleStrokesToBrowser,
        loadMarkerStrokes: loadMarkerStrokes,
        checkStatus: function() {
            return {
                isActive: _isActive,
                hasCanvas: !!_fabricCanvas,
                currentPage: _currentPage,
                drawingMode: _fabricCanvas ? _fabricCanvas.isDrawingMode : false,
                markerMode: _fabricCanvas && _fabricCanvas.freeDrawingBrush ? _fabricCanvas.freeDrawingBrush.markerMode : false,
                scribbleMode: _fabricCanvas && _fabricCanvas.freeDrawingBrush ? _fabricCanvas.freeDrawingBrush.scribbleMode : false,
                strokesLoaded: _scribbleStrokes.length,
                useIndexedDB: _useIndexedDB,
                pendingChanges: _pendingChanges,
                drawContainerEnabled: (() => {
                    const container = document.getElementById(`draw-container-${_blockId}`);
                    return container ? {
                        pointerEvents: container.style.pointerEvents,
                        hasDrawMode: container.classList.contains('draw-mode'),
                        currentTool: container.getAttribute('data-current-tool')
                    } : null;
                })()
            };
        }
    };
}