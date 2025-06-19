/**
 * AnnotationStorage - Manages annotation data persistence
 *
 * Handles saving, loading, and caching of annotations with enhanced periodic saving
 */

import { EventEmitter } from '../utils/EventEmitter.js';

export class AnnotationStorage extends EventEmitter {
    constructor(options = {}) {
        super();

        this.blockId = options.blockId;
        this.handlerUrl = options.handlerUrl;

        // Extract context from DOM if not provided
        const blockElement = document.getElementById(`pdfx-block-${this.blockId}`);

        this.userId = options.userId || (blockElement && blockElement.getAttribute('data-user-id')) || 'anonymous';
        this.courseId = options.courseId || (blockElement && blockElement.getAttribute('data-course-id')) || '';
        this.allowAnnotation = options.allowAnnotation !== false &&
                              (blockElement ? blockElement.getAttribute('data-allow-annotation') !== 'false' : true);

        // Extract CSRF token from block element
        this.csrfToken = options.csrfToken || (blockElement && blockElement.getAttribute('data-csrf-token')) || null;

        console.log(`[AnnotationStorage] INIT_CALLED: Initialized for block: ${this.blockId}, user: ${this.userId}, course: ${this.courseId}`);
        console.log(`[AnnotationStorage] INIT_CALLED: Handler URL: ${this.handlerUrl}`);
        console.log(`[AnnotationStorage] INIT_CALLED: CSRF token available: ${this.csrfToken ? 'Yes' : 'No'}`);

        // Storage configuration
        this.config = {
            autoSave: true,
            saveInterval: 5000, // 5 seconds for more responsive saving
            activeSaveInterval: 2000, // 2 seconds when tools are active
            cacheExpiry: 3600000, // 1 hour
            maxRetries: 3,
            retryDelay: 1000,
            ...options.config
        };

        console.log(`[AnnotationStorage] INIT_CALLED: Auto-save enabled: ${this.config.autoSave}, Allow annotation: ${this.allowAnnotation}`);

        // Cache
        this.annotationCache = new Map();
        this.dirtyPages = new Set();

        // Save state
        this.isSaving = false;
        this.saveQueue = [];
        this.deleteQueue = [];
        this.autoSaveTimer = null;
        this.retryCount = 0;

        // Tool activity tracking for enhanced periodic saving
        this.isToolActive = false;
        this.lastActivity = Date.now();
        this.activityCheckTimer = null;

        // Bind methods
        this._bindMethods();

        // Start auto-save if enabled and annotations are allowed
        if (this.config.autoSave && this.allowAnnotation) {
            this._startAutoSave();
            this._startActivityMonitoring();
        }
    }

    /**
     * Set tool activity status for enhanced periodic saving
     */
    setToolActive(isActive) {
        const wasActive = this.isToolActive;
        this.isToolActive = isActive;
        this.lastActivity = Date.now();

        if (isActive && !wasActive) {
            console.log(`[AnnotationStorage] Tool activated - switching to enhanced periodic saving`);
            this._startAutoSave(); // Restart with active interval
        } else if (!isActive && wasActive) {
            console.log(`[AnnotationStorage] Tool deactivated - switching to normal periodic saving`);
            this._startAutoSave(); // Restart with normal interval
        }
    }

    /**
     * Start activity monitoring to detect when tools become inactive
     */
    _startActivityMonitoring() {
        if (this.activityCheckTimer) {
            clearInterval(this.activityCheckTimer);
        }

        this.activityCheckTimer = setInterval(() => {
            const timeSinceActivity = Date.now() - this.lastActivity;
            const inactivityThreshold = 30000; // 30 seconds

            if (this.isToolActive && timeSinceActivity > inactivityThreshold) {
                console.log(`[AnnotationStorage] Tool inactive for ${timeSinceActivity}ms - switching to normal saving`);
                this.setToolActive(false);
            }
        }, 10000); // Check every 10 seconds
    }

    /**
     * Save annotation with proper user context
     */
    async saveAnnotation(annotation) {
        if (!this.allowAnnotation) {
            console.warn(`[AnnotationStorage] Annotations not allowed for block: ${this.blockId}`);
            return;
        }

        try {
            // Ensure annotation has proper user context
            annotation.userId = this.userId;
            annotation.blockId = this.blockId;
            annotation.timestamp = annotation.timestamp || Date.now();

            // Add to cache
            this.annotationCache.set(annotation.id, annotation);

            // Mark page as dirty
            this.dirtyPages.add(annotation.pageNum);

            // Add to save queue
            this.saveQueue.push({
                type: 'save',
                annotation: annotation,
                timestamp: Date.now()
            });

            // Update activity
            this.lastActivity = Date.now();

            console.log(`[AnnotationStorage] SAVE_TRIGGER: Queued annotation for save:`, annotation.id, `(type: ${annotation.type}, page: ${annotation.pageNum}), queue length: ${this.saveQueue.length}`);
            this.emit('annotationCached', annotation);

            // Save immediately if not auto-saving or if queue is getting large
            if (!this.config.autoSave || this.saveQueue.length >= 10) {
                await this._processSaveQueue();
            }

        } catch (error) {
            console.error(`[AnnotationStorage] Error saving annotation:`, error);
            this.emit('error', error);
        }
    }

    /**
     * Delete annotation
     */
    async deleteAnnotation(annotation) {
        if (!this.allowAnnotation) {
            console.warn(`[AnnotationStorage] Annotations not allowed for block: ${this.blockId}`);
            return;
        }

        try {
            // Remove from cache
            this.annotationCache.delete(annotation.id);

            // Mark page as dirty
            this.dirtyPages.add(annotation.pageNum);

            // Add to delete queue for server persistence
            this.deleteQueue.push({
                id: annotation.id,
                type: annotation.type,
                pageNum: annotation.pageNum,
                userId: this.userId,
                blockId: this.blockId,
                timestamp: Date.now()
            });

            // Add to save queue (to trigger save process)
            this.saveQueue.push({
                type: 'delete',
                annotation: annotation,
                timestamp: Date.now()
            });

            // Update activity
            this.lastActivity = Date.now();

            console.log(`[AnnotationStorage] Queued annotation for deletion:`, annotation.id);
            this.emit('annotationDeleted', annotation);

            // Save immediately if not auto-saving
            if (!this.config.autoSave) {
                await this._processSaveQueue();
            }

        } catch (error) {
            console.error(`[AnnotationStorage] Error deleting annotation:`, error);
            this.emit('error', error);
        }
    }

    /**
     * Load annotations from server with proper user context
     */
    async loadAnnotations(existingData = {}) {
        try {
            console.log(`[AnnotationStorage] Loading annotations for user: ${this.userId}, block: ${this.blockId}`);

            if (!this.handlerUrl) {
                console.warn(`[AnnotationStorage] No handler URL provided, using existing data`);
                return existingData;
            }

            // Add user context to load request
            const loadUrl = `${this.handlerUrl}?action=load&userId=${encodeURIComponent(this.userId)}&blockId=${encodeURIComponent(this.blockId)}&courseId=${encodeURIComponent(this.courseId)}&timestamp=${Date.now()}`;

            const response = await this._makeRequest('GET', loadUrl);

            if (response.success && response.data) {
                console.log(`[AnnotationStorage] Loaded annotations from server:`, Object.keys(response.data));

                // Merge with existing data
                const mergedData = { ...existingData, ...response.data };

                // Cache loaded annotations
                this._cacheAnnotations(mergedData);

                this.emit('annotationsLoaded', mergedData);
                return mergedData;
            } else {
                console.warn(`[AnnotationStorage] Failed to load from server, using existing data:`, response);
                return existingData;
            }

        } catch (error) {
            console.error(`[AnnotationStorage] Error loading annotations:`, error);
            this.emit('error', error);
            return existingData;
        }
    }

    /**
     * Process save queue with enhanced data structure
     */
    async _processSaveQueue() {
        if (this.isSaving || (this.saveQueue.length === 0 && this.deleteQueue.length === 0)) {
            console.log(`[AnnotationStorage] SAVE_QUEUE: Skipping save - isSaving: ${this.isSaving}, saveQueue: ${this.saveQueue.length}, deleteQueue: ${this.deleteQueue.length}`);
            return;
        }

        this.isSaving = true;
        console.log(`[AnnotationStorage] SAVE_QUEUE: Processing save queue - saveQueue: ${this.saveQueue.length}, deleteQueue: ${this.deleteQueue.length}`);

        try {
            // Prepare data to save with proper user context
            const saveData = this._prepareSaveData();

            if (!saveData || (Object.keys(saveData).length === 0 && this.deleteQueue.length === 0)) {
                console.log(`[AnnotationStorage] SAVE_QUEUE: No data to save - saveData: ${!!saveData}, deleteQueue: ${this.deleteQueue.length}`);
                this.isSaving = false;
                return;
            }

            console.log(`[AnnotationStorage] SAVE_REQUEST: Sending request to server for user: ${this.userId}, block: ${this.blockId}, handlerUrl: ${this.handlerUrl}`);
            console.log(`[AnnotationStorage] SAVE_REQUEST: Save data structure:`, Object.keys(saveData));

            // Save to server with user context
            if (this.handlerUrl) {
                const requestData = {
                    action: 'save',
                    userId: this.userId,
                    courseId: this.courseId,
                    blockId: this.blockId,
                    data: saveData,
                    deletions: this.deleteQueue, // Include deletions
                    timestamp: Date.now()
                };

                console.log(`[AnnotationStorage] SAVE_REQUEST: About to make POST request to ${this.handlerUrl}`);
                const response = await this._makeRequest('POST', this.handlerUrl, requestData);
                console.log(`[AnnotationStorage] SAVE_RESPONSE: Received response:`, response);

                if (response.result === 'success') {
                    // Clear save queue, delete queue, and dirty pages on success
                    this.saveQueue = [];
                    this.deleteQueue = [];
                    this.dirtyPages.clear();
                    this.retryCount = 0;

                    console.log(`[AnnotationStorage] SAVE_SUCCESS: Successfully saved annotations for ${response.saved_types?.join(', ') || 'unknown types'}`);
                    this.emit('annotationsSaved', saveData);
                } else {
                    console.error(`[AnnotationStorage] SAVE_ERROR: Save failed:`, response.message || 'Unknown error');
                    this._handleSaveError(new Error(response.message || 'Save failed'));
                }
            } else {
                console.error(`[AnnotationStorage] SAVE_ERROR: No handler URL configured`);
            }

        } catch (error) {
            console.error(`[AnnotationStorage] SAVE_ERROR: Error during save:`, error);
            this._handleSaveError(error);
        } finally {
            this.isSaving = false;
            console.log(`[AnnotationStorage] SAVE_QUEUE: Save queue processing completed`);
        }
    }

    /**
     * Handle save errors with retry mechanism
     */
    _handleSaveError(error) {
        this.retryCount++;

        if (this.retryCount <= this.config.maxRetries) {
            console.warn(`[AnnotationStorage] Save failed, retrying (${this.retryCount}/${this.config.maxRetries}):`, error.message);

            // Retry after delay
            setTimeout(() => {
                this.retryCount--;
                this._processSaveQueue();
            }, this.config.retryDelay * this.retryCount);
        } else {
            console.error(`[AnnotationStorage] Save failed after ${this.config.maxRetries} retries:`, error);
            this.retryCount = 0;
            this.emit('error', error);
        }
    }

    /**
     * Prepare save data with enhanced structure and user context
     */
    _prepareSaveData() {
        if (this.saveQueue.length === 0) {
            return null;
        }

        const dataByType = {};
        const processedAnnotations = new Set();

        // Group annotations by type and page
        this.saveQueue.forEach(item => {
            if (item.type !== 'save' || processedAnnotations.has(item.annotation.id)) {
                return;
            }

            const annotation = item.annotation;
            const annotationType = annotation.type || 'annotations';
            const pageNum = annotation.pageNum || 1;

            // Initialize type structure if needed
            if (!dataByType[annotationType]) {
                dataByType[annotationType] = {};
            }

            // Initialize page array if needed
            if (!dataByType[annotationType][pageNum]) {
                dataByType[annotationType][pageNum] = [];
            }

            // Ensure annotation has proper user context
            const annotationData = {
                id: annotation.id,
                type: annotation.type,
                userId: this.userId,
                blockId: this.blockId,
                pageNum: annotation.pageNum,
                timestamp: annotation.timestamp || Date.now(),
                data: annotation.data || {},
                config: annotation.config || {}
            };

            dataByType[annotationType][pageNum].push(annotationData);
            processedAnnotations.add(annotation.id);
        });

        // Add current page if available
        if (this.currentPage) {
            dataByType.currentPage = this.currentPage;
        }

        console.log(`[AnnotationStorage] Prepared save data for ${Object.keys(dataByType).length} annotation types`);
        return dataByType;
    }

    /**
     * Cache annotations with validation
     */
    _cacheAnnotations(annotationsData) {
        if (!annotationsData || typeof annotationsData !== 'object') {
            return;
        }

        let cachedCount = 0;

        Object.entries(annotationsData).forEach(([type, typeData]) => {
            if (type === 'currentPage' || type === 'brightness' || type === 'is_grayscale') {
                // Skip non-annotation data
                return;
            }

            if (typeof typeData === 'object' && typeData !== null) {
                Object.entries(typeData).forEach(([pageNum, pageAnnotations]) => {
                    if (Array.isArray(pageAnnotations)) {
                        pageAnnotations.forEach(annotation => {
                            if (annotation && annotation.id) {
                                // Validate user context
                                if (!annotation.userId || annotation.userId === this.userId) {
                                    annotation.userId = this.userId;
                                    annotation.blockId = this.blockId;

                                    this.annotationCache.set(annotation.id, annotation);
                                    cachedCount++;
                                } else {
                                    console.warn(`[AnnotationStorage] Skipping annotation with different user ID:`, annotation.userId, 'vs', this.userId);
                                }
                            }
                        });
                    }
                });
            }
        });

        console.log(`[AnnotationStorage] Cached ${cachedCount} annotations`);
    }

    /**
     * Enhanced HTTP request with better error handling
     */
    async _makeRequest(method, url, data = null) {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        };

        // Add CSRF token for POST requests to prevent 403 errors
        if (method === 'POST') {
            const csrfToken = this._getCSRFToken();
            console.log(`[AnnotationStorage] DEBUG: Retrieved CSRF token: "${csrfToken}" (length: ${csrfToken ? csrfToken.length : 0})`);
            console.log(`[AnnotationStorage] DEBUG: CSRF token type: ${typeof csrfToken}`);
            console.log(`[AnnotationStorage] DEBUG: CSRF token truthiness: ${!!csrfToken}`);

            if (csrfToken) {
                options.headers['X-CSRFToken'] = csrfToken;
                console.log(`[AnnotationStorage] DEBUG: Added X-CSRFToken header: "${csrfToken}"`);
                console.log(`[AnnotationStorage] DEBUG: Request headers after CSRF addition:`, JSON.stringify(options.headers));
            } else {
                console.error(`[AnnotationStorage] DEBUG: No CSRF token available - request will likely fail with 403`);
            }
        }

        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }

        try {
            console.log(`[AnnotationStorage] Making ${method} request to:`, url);
            if (data) {
                console.log(`[AnnotationStorage] Request data:`, Object.keys(data));
            }

            const response = await fetch(url, options);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const responseData = await response.json();
            console.log(`[AnnotationStorage] Response received:`, responseData.result || responseData.success ? 'success' : 'error');

            return responseData;

        } catch (error) {
            console.error(`[AnnotationStorage] Request failed:`, error);

            // Check for network errors vs server errors
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error: Unable to connect to server');
            } else if (error.message.includes('HTTP 403')) {
                throw new Error('Permission denied: User not authorized or CSRF token missing');
            } else if (error.message.includes('HTTP 404')) {
                throw new Error('Endpoint not found: Invalid handler URL');
            } else {
                throw error;
            }
        }
    }

    /**
     * Get CSRF token for Django requests
     */
    _getCSRFToken() {
        console.log(`[AnnotationStorage] DEBUG: Starting CSRF token retrieval for block: ${this.blockId}`);

        // Check stored token first
        console.log(`[AnnotationStorage] DEBUG: Checking stored token: "${this.csrfToken}"`);
        if (this.csrfToken) {
            console.log(`[AnnotationStorage] DEBUG: Using stored CSRF token`);
            return this.csrfToken;
        }

        // Check block element data attribute
        const blockElement = document.getElementById(`pdfx-block-${this.blockId}`);
        console.log(`[AnnotationStorage] DEBUG: Block element found: ${!!blockElement}`);
        if (blockElement) {
            const dataToken = blockElement.getAttribute('data-csrf-token');
            console.log(`[AnnotationStorage] DEBUG: Block data-csrf-token: "${dataToken}"`);
            if (dataToken) {
                console.log(`[AnnotationStorage] DEBUG: Using block data CSRF token`);
                return dataToken;
            }
        }

        // Check form input
        const formToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value;
        console.log(`[AnnotationStorage] DEBUG: Form csrfmiddlewaretoken: "${formToken}"`);
        if (formToken) {
            console.log(`[AnnotationStorage] DEBUG: Using form CSRF token`);
            return formToken;
        }

        // Check meta tag
        const metaToken = document.querySelector('meta[name=csrf-token]')?.content;
        console.log(`[AnnotationStorage] DEBUG: Meta csrf-token: "${metaToken}"`);
        if (metaToken) {
            console.log(`[AnnotationStorage] DEBUG: Using meta CSRF token`);
            return metaToken;
        }

        // Check cookie
        const cookieToken = this._getCookie('csrftoken');
        console.log(`[AnnotationStorage] DEBUG: Cookie csrftoken: "${cookieToken}"`);
        if (cookieToken) {
            console.log(`[AnnotationStorage] DEBUG: Using cookie CSRF token`);
            return cookieToken;
        }

        // Check window object
        const windowToken = window.csrftoken;
        console.log(`[AnnotationStorage] DEBUG: Window csrftoken: "${windowToken}"`);
        if (windowToken) {
            console.log(`[AnnotationStorage] DEBUG: Using window CSRF token`);
            return windowToken;
        }

        console.error('[AnnotationStorage] DEBUG: No CSRF token found in any source');
        return null;
    }

    /**
     * Get cookie value by name
     */
    _getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return parts.pop().split(';').shift();
        }
        return null;
    }

    /**
     * Get annotations by type with user validation
     */
    getAnnotationsByType(type) {
        const annotations = {};

        this.annotationCache.forEach(annotation => {
            // Only return annotations for current user
            if (annotation.type === type && annotation.userId === this.userId) {
                const pageNum = annotation.pageNum || 1;
                if (!annotations[pageNum]) {
                    annotations[pageNum] = [];
                }
                annotations[pageNum].push(annotation);
            }
        });

        return annotations;
    }

    /**
     * Get annotations for page with user validation
     */
    getAnnotationsForPage(pageNum, type = null) {
        const annotations = [];

        this.annotationCache.forEach(annotation => {
            // Only return annotations for current user and page
            if (annotation.pageNum === pageNum && annotation.userId === this.userId) {
                if (!type || annotation.type === type) {
                    annotations.push(annotation);
                }
            }
        });

        return annotations;
    }

    /**
     * Get all annotations for current user
     */
    getAllAnnotations() {
        const annotations = [];

        this.annotationCache.forEach(annotation => {
            // Only return annotations for current user
            if (annotation.userId === this.userId) {
                annotations.push(annotation);
            }
        });

        return annotations;
    }

    /**
     * Clear all annotations for current user
     */
    clearAllAnnotations() {
        const userAnnotations = this.getAllAnnotations();

        userAnnotations.forEach(annotation => {
            this.annotationCache.delete(annotation.id);
            this.dirtyPages.add(annotation.pageNum);
        });

        // Add all to delete queue
        userAnnotations.forEach(annotation => {
            this.deleteQueue.push({
                id: annotation.id,
                type: annotation.type,
                pageNum: annotation.pageNum,
                userId: this.userId,
                blockId: this.blockId,
                timestamp: Date.now()
            });
        });

        console.log(`[AnnotationStorage] Cleared ${userAnnotations.length} annotations for user: ${this.userId}`);
        this.emit('allAnnotationsCleared', userAnnotations.length);

        // Trigger save if auto-save is disabled
        if (!this.config.autoSave) {
            this._processSaveQueue();
        }
    }

    /**
     * Start auto-save with enhanced timing based on tool activity
     */
    _startAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        // Use different intervals based on tool activity
        const interval = this.isToolActive ? this.config.activeSaveInterval : this.config.saveInterval;

        this.autoSaveTimer = setInterval(() => {
            if (this.saveQueue.length > 0 || this.deleteQueue.length > 0) {
                const activityStatus = this.isToolActive ? 'ACTIVE' : 'IDLE';
                console.log(`[AnnotationStorage] AUTO_SAVE_TRIGGER: Auto-save triggered (${activityStatus}): ${this.saveQueue.length} saves, ${this.deleteQueue.length} deletions`);
                this._processSaveQueue();
            }
        }, interval);

        console.log(`[AnnotationStorage] AUTO_SAVE_STARTED: Auto-save timer started with ${interval}ms interval (tool active: ${this.isToolActive})`);
    }

    /**
     * Stop auto-save
     */
    _stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
            console.log(`[AnnotationStorage] Auto-save stopped`);
        }
    }

    /**
     * Force save all pending changes
     */
    async forceSave() {
        console.log(`[AnnotationStorage] Force save requested`);
        return await this._processSaveQueue();
    }

    /**
     * Get cache statistics
     */
    getCacheStatistics() {
        const userAnnotations = this.getAllAnnotations();
        const annotationsByType = {};
        const annotationsByPage = {};

        userAnnotations.forEach(annotation => {
            // Count by type
            annotationsByType[annotation.type] = (annotationsByType[annotation.type] || 0) + 1;

            // Count by page
            const pageNum = annotation.pageNum || 1;
            annotationsByPage[pageNum] = (annotationsByPage[pageNum] || 0) + 1;
        });

        return {
            totalAnnotations: userAnnotations.length,
            annotationsByType,
            annotationsByPage,
            dirtyPages: Array.from(this.dirtyPages),
            pendingSaves: this.saveQueue.length,
            pendingDeletes: this.deleteQueue.length,
            userId: this.userId,
            blockId: this.blockId,
            autoSaveEnabled: !!this.autoSaveTimer,
            isToolActive: this.isToolActive,
            lastActivity: this.lastActivity
        };
    }

    /**
     * Bind methods to this context
     */
    _bindMethods() {
        this.saveAnnotation = this.saveAnnotation.bind(this);
        this.deleteAnnotation = this.deleteAnnotation.bind(this);
        this.loadAnnotations = this.loadAnnotations.bind(this);
        this._processSaveQueue = this._processSaveQueue.bind(this);
        this.setToolActive = this.setToolActive.bind(this);
    }

    /**
     * Cleanup and destroy storage manager
     */
    destroy() {
        console.log(`[AnnotationStorage] Destroying storage manager for block: ${this.blockId}`);

        // Force save any pending changes
        if (this.saveQueue.length > 0 || this.deleteQueue.length > 0) {
            this.forceSave();
        }

        // Stop auto-save and activity monitoring
        this._stopAutoSave();
        if (this.activityCheckTimer) {
            clearInterval(this.activityCheckTimer);
            this.activityCheckTimer = null;
        }

        // Clear caches
        this.annotationCache.clear();
        this.dirtyPages.clear();
        this.saveQueue = [];
        this.deleteQueue = [];

        // Remove all listeners
        this.removeAllListeners();
    }
}

export default AnnotationStorage;