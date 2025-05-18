/**
 * pdfx_storage.js
 * Provides IndexedDB storage functionality for PDF XBlock
 * Handles storing and retrieving PDF files to reduce bandwidth usage
 */

(function() {
    // Define the storage module in global scope
    window.PdfxStorage = (function() {
        const DB_NAME = 'pdfx_storage';
        const DB_VERSION = 1;
        const PDF_STORE = 'pdf_files';
        const META_STORE = 'pdf_metadata';

        let db = null;
        let isIndexedDBSupported = true;

        // Check if IndexedDB is supported and available
        try {
            isIndexedDBSupported = window.indexedDB !== undefined &&
                                  window.indexedDB !== null &&
                                  typeof window.indexedDB === 'object';

            // Additional checks for private browsing modes
            if (isIndexedDBSupported) {
                const testRequest = window.indexedDB.open('test');
                testRequest.onerror = function() {
                    isIndexedDBSupported = false;
                };
            }
        } catch (e) {
            isIndexedDBSupported = false;
        }

        /**
         * Initialize the IndexedDB database
         * @returns {Promise} - Resolves when DB is ready
         */
        function initDB() {
            return new Promise((resolve, reject) => {
                if (!isIndexedDBSupported) {
                    reject(new Error('IndexedDB not supported by this browser'));
                    return;
                }

                if (db) {
                    resolve(db);
                    return;
                }

                try {
                    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

                    request.onerror = (event) => {
                        isIndexedDBSupported = false; // Disable further attempts
                        reject(event.target.error);
                    };

                    request.onsuccess = (event) => {
                        db = event.target.result;

                        // Add error handler for database
                        db.onerror = (event) => {
                        };

                        resolve(db);
                    };

                    request.onupgradeneeded = (event) => {
                        db = event.target.result;

                        // Create object stores if they don't exist
                        if (!db.objectStoreNames.contains(PDF_STORE)) {
                            db.createObjectStore(PDF_STORE, { keyPath: 'pdfId' });
                        }

                        if (!db.objectStoreNames.contains(META_STORE)) {
                            const metaStore = db.createObjectStore(META_STORE, { keyPath: 'pdfId' });
                            metaStore.createIndex('url', 'url', { unique: false });
                            metaStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
                        }
                    };

                    // Handle blocked or failed version change
                    request.onblocked = (event) => {
                        reject(new Error('Database upgrade was blocked. Please close other tabs with this site open.'));
                    };
                } catch (error) {
                    isIndexedDBSupported = false;
                    reject(error);
                }
            });
        }

        /**
         * Generate a unique ID for the PDF based on URL and other metadata
         * @param {string} url - The PDF URL
         * @param {object} metadata - Additional metadata (filename, courseId, etc.)
         * @returns {string} - A unique ID string
         */
        function generatePdfId(url, metadata = {}) {
            // Create a unique identifier from URL and available metadata
            const idParts = [
                url,
                metadata.filename || '',
                metadata.courseId || '',
                metadata.blockId || '',
                metadata.lastModified || ''
            ];

            // Use a simple hash function for the combined string
            const idString = idParts.join('|');
            let hash = 0;

            for (let i = 0; i < idString.length; i++) {
                const char = idString.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }

            return 'pdf_' + Math.abs(hash).toString(16);
        }

        /**
         * Store a PDF file in IndexedDB
         * @param {string} url - The original URL of the PDF
         * @param {ArrayBuffer} pdfData - The PDF file data as ArrayBuffer
         * @param {object} metadata - Additional metadata about the PDF
         * @returns {Promise} - Resolves when storage is complete
         */
        function storePdf(url, pdfData, metadata = {}) {
            return initDB().then(db => {
                return new Promise((resolve, reject) => {
                    const pdfId = generatePdfId(url, metadata);
                    const timestamp = Date.now();

                    // Start a transaction
                    const tx = db.transaction([PDF_STORE, META_STORE], 'readwrite');

                    // Store the PDF data
                    const pdfStore = tx.objectStore(PDF_STORE);
                    const pdfRequest = pdfStore.put({
                        pdfId: pdfId,
                        data: pdfData,
                        timestamp: timestamp
                    });

                    // Store the metadata
                    const metaStore = tx.objectStore(META_STORE);
                    const metaRequest = metaStore.put({
                        pdfId: pdfId,
                        url: url,
                        filename: metadata.filename || '',
                        courseId: metadata.courseId || '',
                        blockId: metadata.blockId || '',
                        size: pdfData.byteLength,
                        lastModified: metadata.lastModified || '',
                        timestamp: timestamp,
                        lastAccessed: timestamp,
                        accessCount: 1
                    });

                    // Handle transaction completion
                    tx.oncomplete = () => {
                        resolve(pdfId);
                    };

                    tx.onerror = (event) => {
                        reject(event.target.error);
                    };
                });
            });
        }

        /**
         * Get a PDF file from IndexedDB if it exists
         * @param {string} url - The original URL of the PDF
         * @param {object} metadata - Additional metadata to match
         * @returns {Promise} - Resolves with PDF data or null if not found
         */
        function getPdf(url, metadata = {}) {
            return initDB().then(db => {
                return new Promise((resolve, reject) => {
                    const pdfId = generatePdfId(url, metadata);

                    // Start a transaction
                    const tx = db.transaction([PDF_STORE, META_STORE], 'readwrite');

                    // Get the PDF data
                    const pdfStore = tx.objectStore(PDF_STORE);
                    const pdfRequest = pdfStore.get(pdfId);

                    pdfRequest.onsuccess = (event) => {
                        const result = event.target.result;

                        if (result) {
                            // Get metadata to check freshness
                            const metaStore = tx.objectStore(META_STORE);
                            const metaRequest = metaStore.get(pdfId);

                            metaRequest.onsuccess = (event) => {
                                const meta = event.target.result;
                                if (meta) {
                                    // Update access info
                                    meta.lastAccessed = Date.now();
                                    meta.accessCount = (meta.accessCount || 0) + 1;
                                    metaStore.put(meta);

                                    // Check if we need to verify freshness with HEAD request
                                    const cacheAge = Date.now() - (meta.timestamp || 0);
                                    const CACHE_MAX_AGE = 1000 * 60 * 60; // 1 hour

                                    if (cacheAge > CACHE_MAX_AGE && url.indexOf('http') === 0) {
                                        // Make HEAD request to check Last-Modified
                                        fetch(url, { method: 'HEAD', cache: 'no-cache' })
                                            .then(response => {
                                                const serverLastModified = response.headers.get('Last-Modified');

                                                // If we have a Last-Modified date and it's different from our cached one
                                                if (serverLastModified && serverLastModified !== meta.lastModified) {
                                                    resolve(null);
                                                } else {
                                                    resolve(result.data);
                                                }
                                            })
                                            .catch(() => {
                                                resolve(result.data);
                                            });
                                    } else {
                                        resolve(result.data);
                                    }
                                } else {
                                    resolve(result.data);
                                }
                            };

                            metaRequest.onerror = () => {
                                resolve(result.data);
                            };
                        } else {
                            resolve(null);
                        }
                    };

                    pdfRequest.onerror = (event) => {
                        reject(event.target.error);
                    };
                });
            }).catch(error => {
                return null;
            });
        }

        /**
         * Clear all stored PDF data that matches certain criteria
         * @param {object} criteria - Criteria for deletion (url, courseId, etc.)
         * @returns {Promise} - Resolves when deletion is complete
         */
        function clearPdfs(criteria = {}) {
            return initDB().then(db => {
                return new Promise((resolve, reject) => {
                    // If no criteria specified, clear the entire store
                    if (Object.keys(criteria).length === 0) {
                        const tx = db.transaction([PDF_STORE, META_STORE], 'readwrite');
                        tx.objectStore(PDF_STORE).clear();
                        tx.objectStore(META_STORE).clear();

                        tx.oncomplete = () => {
                            resolve();
                        };

                        tx.onerror = (event) => {
                            reject(event.target.error);
                        };

                        return;
                    }

                    // Otherwise, find matching records and delete them
                    const tx = db.transaction([META_STORE], 'readonly');
                    const metaStore = tx.objectStore(META_STORE);
                    const request = metaStore.openCursor();

                    const idsToDelete = [];

                    request.onsuccess = (event) => {
                        const cursor = event.target.result;

                        if (cursor) {
                            const meta = cursor.value;
                            let match = true;

                            // Check each criteria field
                            for (const key in criteria) {
                                if (meta[key] !== criteria[key]) {
                                    match = false;
                                    break;
                                }
                            }

                            if (match) {
                                idsToDelete.push(meta.pdfId);
                            }

                            cursor.continue();
                        } else {
                            // Delete all matched records
                            if (idsToDelete.length > 0) {
                                const deleteTx = db.transaction([PDF_STORE, META_STORE], 'readwrite');
                                const pdfStore = deleteTx.objectStore(PDF_STORE);
                                const metaStore = deleteTx.objectStore(META_STORE);

                                idsToDelete.forEach(id => {
                                    pdfStore.delete(id);
                                    metaStore.delete(id);
                                });

                                deleteTx.oncomplete = () => {
                                    resolve(idsToDelete.length);
                                };

                                deleteTx.onerror = (event) => {
                                    reject(event.target.error);
                                };
                            } else {
                                resolve(0);
                            }
                        }
                    };

                    request.onerror = (event) => {
                        reject(event.target.error);
                    };
                });
            });
        }

        /**
         * Check if a PDF exists in storage
         * @param {string} url - The PDF URL
         * @param {object} metadata - Additional metadata to match
         * @returns {Promise} - Resolves with boolean indicating if PDF exists
         */
        function hasPdf(url, metadata = {}) {
            return initDB().then(db => {
                return new Promise((resolve, reject) => {
                    const pdfId = generatePdfId(url, metadata);

                    const tx = db.transaction([PDF_STORE], 'readonly');
                    const store = tx.objectStore(PDF_STORE);
                    const request = store.count(pdfId);

                    request.onsuccess = (event) => {
                        resolve(event.target.result > 0);
                    };

                    request.onerror = (event) => {
                        reject(event.target.error);
                    };
                });
            }).catch(error => {
                return false;
            });
        }

        /**
         * Get storage usage statistics
         * @returns {Promise} - Resolves with storage stats object
         */
        function getStorageStats() {
            return initDB().then(db => {
                return new Promise((resolve, reject) => {
                    const tx = db.transaction([PDF_STORE, META_STORE], 'readonly');
                    const pdfStore = tx.objectStore(PDF_STORE);
                    const metaStore = tx.objectStore(META_STORE);

                    const stats = {
                        totalPdfs: 0,
                        totalSize: 0,
                        oldestAccess: null,
                        newestAccess: null
                    };

                    const countRequest = pdfStore.count();
                    countRequest.onsuccess = (event) => {
                        stats.totalPdfs = event.target.result;
                    };

                    const metaRequest = metaStore.openCursor();
                    metaRequest.onsuccess = (event) => {
                        const cursor = event.target.result;

                        if (cursor) {
                            const meta = cursor.value;
                            stats.totalSize += meta.size || 0;

                            if (!stats.oldestAccess || meta.lastAccessed < stats.oldestAccess) {
                                stats.oldestAccess = meta.lastAccessed;
                            }

                            if (!stats.newestAccess || meta.lastAccessed > stats.newestAccess) {
                                stats.newestAccess = meta.lastAccessed;
                            }

                            cursor.continue();
                        } else {
                            // Convert to human-readable format
                            stats.totalSizeFormatted = formatBytes(stats.totalSize);
                            resolve(stats);
                        }
                    };

                    tx.onerror = (event) => {
                        reject(event.target.error);
                    };
                });
            });
        }

        /**
         * Format bytes into human-readable format
         * @param {number} bytes - Number of bytes
         * @returns {string} - Formatted string (e.g., "1.5 MB")
         */
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';

            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));

            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        /**
         * Fetch a PDF as ArrayBuffer
         * @param {string} url - The PDF URL
         * @returns {Promise} - Resolves with ArrayBuffer of PDF data
         */
        function fetchPdfAsArrayBuffer(url) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.responseType = 'arraybuffer';

                xhr.onload = function() {
                    if (this.status === 200) {
                        resolve(this.response);
                    } else {
                        reject(new Error(`Failed to fetch PDF: ${this.status} ${this.statusText}`));
                    }
                };

                xhr.onerror = function() {
                    reject(new Error('Network error while fetching PDF'));
                };

                xhr.send();
            });
        }

        // Public API
        return {
            initDB,
            hasPdf,
            getPdf,
            storePdf,
            clearPdfs,
            getStorageStats,
            fetchPdfAsArrayBuffer
        };
    })();
})();