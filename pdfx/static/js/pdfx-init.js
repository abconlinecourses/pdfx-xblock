/**
 * PDF.js XBlock Initializer
 * Integrates PDF.js viewer with Open edX XBlock architecture
 * Following Mozilla's viewer.mjs pattern exactly
 */

/**
 * Simple EventEmitter for annotation storage
 */
class SimpleEventEmitter {
    constructor() {
        this._events = {};
    }

    on(event, listener) {
        if (!this._events[event]) {
            this._events[event] = [];
        }
        this._events[event].push(listener);
    }

    emit(event, ...args) {
        if (this._events[event]) {
            this._events[event].forEach(listener => {
                try {
                    listener(...args);
                } catch (error) {
                    console.error('Event listener error:', error);
                }
            });
        }
    }

    removeListener(event, listener) {
        if (this._events[event]) {
            const index = this._events[event].indexOf(listener);
            if (index > -1) {
                this._events[event].splice(index, 1);
            }
            // Clean up empty event arrays
            if (this._events[event].length === 0) {
                delete this._events[event];
            }
        }
    }

    removeAllListeners() {
        this._events = {};
    }
}

/**
 * AnnotationStorage - Manages annotation data persistence (XBlock compatible)
 */
class AnnotationStorage extends SimpleEventEmitter {
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
            maxRetries: 5, // Limit to 5 retries maximum
            retryDelay: 1000, // Base delay of 1 second
            maxRetryDelay: 30000, // Maximum delay of 30 seconds
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
        this.consecutiveFailures = 0; // Track consecutive failures
        this.lastFailureTime = 0; // Track when last failure occurred
        this.isInErrorState = false; // Flag to prevent continuous retries

        // Tool activity tracking for enhanced periodic saving
        this.isToolActive = false;
        this.lastActivity = Date.now();
        this.activityCheckTimer = null;

        // Page tracking
        this.currentPage = 1;

        // Bind methods
        this._bindMethods();

        // Start auto-save if enabled and annotations are allowed
        if (this.config.autoSave && this.allowAnnotation) {
            this._startAutoSave();
            this._startActivityMonitoring();
        }
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

            // FIXED: Check if annotation is already in save queue to prevent duplicates
            const existingInQueue = this.saveQueue.find(item =>
                item.type === 'save' && item.annotation.id === annotation.id
            );

            if (!existingInQueue) {
                // Add to save queue only if not already present
                this.saveQueue.push({
                    type: 'save',
                    annotation: annotation,
                    timestamp: Date.now()
                });
            } else {
                // Update existing queue item with latest annotation data
                existingInQueue.annotation = annotation;
                existingInQueue.timestamp = Date.now();
                console.log(`[AnnotationStorage] SAVE_TRIGGER: Updated existing annotation in queue:`, annotation.id);
            }

            // Update activity
            this.lastActivity = Date.now();

            console.log(`[AnnotationStorage] SAVE_TRIGGER: Queued annotation for save:`, annotation.id, `(type: ${annotation.type}, page: ${annotation.pageNum}), queue length: ${this.saveQueue.length}`);
            this.emit('annotationCached', annotation);

            // Save immediately if not auto-saving or if queue is getting large
            // FIXED: Reduce immediate saves to allow accumulation of multiple highlights
            if (!this.config.autoSave || this.saveQueue.length >= 50) {
                await this._processSaveQueue();
            }

        } catch (error) {
            console.error(`[AnnotationStorage] Error saving annotation:`, error);
            this.emit('error', error);
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

        // Check if we're in error state and should wait before retrying
        if (this.isInErrorState) {
            const timeSinceLastFailure = Date.now() - this.lastFailureTime;
            const waitTime = Math.min(this.config.retryDelay * Math.pow(2, this.consecutiveFailures), this.config.maxRetryDelay);

            if (timeSinceLastFailure < waitTime) {
                console.log(`[AnnotationStorage] SAVE_QUEUE: In error state, waiting ${Math.ceil((waitTime - timeSinceLastFailure) / 1000)}s before retry`);
                return;
            }

            // Reset error state if enough time has passed
            console.log(`[AnnotationStorage] SAVE_QUEUE: Exiting error state, attempting save`);
            this.isInErrorState = false;
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
                        currentPage: this.currentPage, // Include current page
                        timestamp: Date.now()
                    };

                console.log(`[AnnotationStorage] SAVE_REQUEST: About to make POST request to ${this.handlerUrl}`);
                const response = await this._makeRequest('POST', this.handlerUrl, requestData);
                console.log(`[AnnotationStorage] SAVE_RESPONSE: Received response:`, response);

                if (response.result === 'success') {
                    // FIXED: Only clear the annotations that were actually saved in this batch
                    // Create a set of saved annotation IDs to track what was actually processed
                    const savedAnnotationIds = new Set();

                    // Extract the annotation IDs that were in the save data
                    Object.values(saveData).forEach(typeData => {
                        Object.values(typeData).forEach(pageAnnotations => {
                            if (Array.isArray(pageAnnotations)) {
                                pageAnnotations.forEach(annotation => {
                                    savedAnnotationIds.add(annotation.id);
                                });
                            }
                        });
                    });

                    // Only remove items from saveQueue that were actually saved
                    this.saveQueue = this.saveQueue.filter(item =>
                        item.type !== 'save' || !savedAnnotationIds.has(item.annotation.id)
                    );

                    // Clear delete queue (these are always processed completely)
                    this.deleteQueue = [];

                    // Only clear dirty pages that had annotations saved
                    const savedPages = new Set();
                    Object.values(saveData).forEach(typeData => {
                        Object.keys(typeData).forEach(pageNum => {
                            savedPages.add(parseInt(pageNum));
                        });
                    });
                    savedPages.forEach(pageNum => this.dirtyPages.delete(pageNum));

                    this.retryCount = 0;
                    this.consecutiveFailures = 0; // Reset failure count on success
                    this.isInErrorState = false; // Clear error state

                    console.log(`[AnnotationStorage] SAVE_SUCCESS: Successfully saved ${savedAnnotationIds.size} annotations for ${response.saved_types?.join(', ') || 'unknown types'}, remaining queue: ${this.saveQueue.length}`);
                    this.emit('annotationsSaved', saveData);
                } else {
                    console.error(`[AnnotationStorage] SAVE_ERROR: Save failed:`, response.message || 'Unknown error');
                    this._handleSaveError(new Error(response.message || 'Save failed'));
                }
            } else {
                console.error(`[AnnotationStorage] SAVE_ERROR: No handler URL configured`);
                this._handleSaveError(new Error('No handler URL configured'));
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

        console.log(`[AnnotationStorage] Prepared save data for ${Object.keys(dataByType).length} annotation types`);
        return dataByType;
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
            // Don't trigger auto-save if we're in error state
            if (this.isInErrorState) {
                console.log(`[AnnotationStorage] AUTO_SAVE_TRIGGER: Skipping auto-save due to error state`);
                return;
            }

            if (this.saveQueue.length > 0 || this.deleteQueue.length > 0) {
                const activityStatus = this.isToolActive ? 'ACTIVE' : 'IDLE';
                console.log(`[AnnotationStorage] AUTO_SAVE_TRIGGER: Auto-save triggered (${activityStatus}): ${this.saveQueue.length} saves, ${this.deleteQueue.length} deletions`);
                this._processSaveQueue();
            }
        }, interval);

        console.log(`[AnnotationStorage] AUTO_SAVE_STARTED: Auto-save timer started with ${interval}ms interval (tool active: ${this.isToolActive})`);
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
            console.log(`[AnnotationStorage] *** CSRF DEBUG *** Retrieved token: "${csrfToken}"`);
            console.log(`[AnnotationStorage] *** CSRF DEBUG *** Token type: ${typeof csrfToken}`);
            console.log(`[AnnotationStorage] *** CSRF DEBUG *** Token length: ${csrfToken ? csrfToken.length : 0}`);
            console.log(`[AnnotationStorage] *** CSRF DEBUG *** Token is falsy: ${!csrfToken}`);

            if (csrfToken) {
                options.headers['X-CSRFToken'] = csrfToken;
                console.log(`[AnnotationStorage] *** CSRF DEBUG *** Added X-CSRFToken header`);
                console.log(`[AnnotationStorage] *** CSRF DEBUG *** Final headers:`, JSON.stringify(options.headers, null, 2));
            } else {
                console.error(`[AnnotationStorage] *** CSRF DEBUG *** NO TOKEN FOUND - REQUEST WILL FAIL`);
                // Try emergency token retrieval methods
                console.log(`[AnnotationStorage] *** CSRF DEBUG *** Emergency check - all cookies:`, document.cookie);
                console.log(`[AnnotationStorage] *** CSRF DEBUG *** Emergency check - all meta tags:`, Array.from(document.querySelectorAll('meta')).map(m => ({name: m.name, content: m.content})));
                console.log(`[AnnotationStorage] *** CSRF DEBUG *** Emergency check - all form inputs:`, Array.from(document.querySelectorAll('input[name*="csrf"]')).map(i => ({name: i.name, value: i.value})));
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
        console.log(`[AnnotationStorage] *** CSRF DEBUG *** Starting token retrieval for block: ${this.blockId}`);

        // Check stored token first
        console.log(`[AnnotationStorage] *** CSRF DEBUG *** Stored token: "${this.csrfToken}"`);
        if (this.csrfToken) {
            console.log(`[AnnotationStorage] *** CSRF DEBUG *** Using stored CSRF token`);
            return this.csrfToken;
        }

        // Check block element data attribute
        const blockElement = document.getElementById(`pdfx-block-${this.blockId}`);
        console.log(`[AnnotationStorage] *** CSRF DEBUG *** Block element found: ${!!blockElement}`);
        if (blockElement) {
            const dataToken = blockElement.getAttribute('data-csrf-token');
            console.log(`[AnnotationStorage] *** CSRF DEBUG *** Block data-csrf-token: "${dataToken}"`);
            if (dataToken) {
                console.log(`[AnnotationStorage] *** CSRF DEBUG *** Using block data CSRF token`);
                return dataToken;
            }
        }

        // Check form input
        const formInput = document.querySelector('[name=csrfmiddlewaretoken]');
        const formToken = formInput?.value;
        console.log(`[AnnotationStorage] *** CSRF DEBUG *** Form input found: ${!!formInput}`);
        console.log(`[AnnotationStorage] *** CSRF DEBUG *** Form csrfmiddlewaretoken: "${formToken}"`);
        if (formToken) {
            console.log(`[AnnotationStorage] *** CSRF DEBUG *** Using form CSRF token`);
            return formToken;
        }

        // Check meta tag
        const metaTag = document.querySelector('meta[name=csrf-token]');
        const metaToken = metaTag?.content;
        console.log(`[AnnotationStorage] *** CSRF DEBUG *** Meta tag found: ${!!metaTag}`);
        console.log(`[AnnotationStorage] *** CSRF DEBUG *** Meta csrf-token: "${metaToken}"`);
        if (metaToken) {
            console.log(`[AnnotationStorage] *** CSRF DEBUG *** Using meta CSRF token`);
            return metaToken;
        }

        // Check cookie
        const cookieToken = this._getCookie('csrftoken');
        console.log(`[AnnotationStorage] *** CSRF DEBUG *** Cookie csrftoken: "${cookieToken}"`);
        if (cookieToken) {
            console.log(`[AnnotationStorage] *** CSRF DEBUG *** Using cookie CSRF token`);
            return cookieToken;
        }

        // Check window object
        const windowToken = window.csrftoken;
        console.log(`[AnnotationStorage] *** CSRF DEBUG *** Window csrftoken: "${windowToken}"`);
        if (windowToken) {
            console.log(`[AnnotationStorage] *** CSRF DEBUG *** Using window CSRF token`);
            return windowToken;
        }

        console.error('[AnnotationStorage] *** CSRF DEBUG *** NO TOKEN FOUND IN ANY SOURCE ***');
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
     * Handle save errors with improved retry mechanism and exponential backoff
     */
    _handleSaveError(error) {
        this.consecutiveFailures++;
        this.lastFailureTime = Date.now();

        console.error(`[AnnotationStorage] SAVE_ERROR: Save failed (attempt ${this.consecutiveFailures}):`, error.message);

        // Check if we've exceeded maximum retries
        if (this.consecutiveFailures >= this.config.maxRetries) {
            console.error(`[AnnotationStorage] SAVE_ERROR: Maximum retries (${this.config.maxRetries}) exceeded. Stopping auto-save.`);

            // Stop auto-save to prevent continuous failures
            this._stopAutoSave();
            this.isInErrorState = true;

            // Clear the save queue to prevent accumulation
            const failedSaveCount = this.saveQueue.length;
            const failedDeleteCount = this.deleteQueue.length;
            this.saveQueue = [];
            this.deleteQueue = [];

            console.error(`[AnnotationStorage] SAVE_ERROR: Cleared ${failedSaveCount} pending saves and ${failedDeleteCount} pending deletions`);

            // Emit error event for UI handling
            this.emit('error', {
                type: 'max_retries_exceeded',
                message: `Failed to save annotations after ${this.config.maxRetries} attempts: ${error.message}`,
                originalError: error,
                failedSaveCount,
                failedDeleteCount
            });

            // Show user notification
            this._showPersistentErrorNotification(error);

            return;
        }

        // Calculate exponential backoff delay
        const baseDelay = this.config.retryDelay;
        const exponentialDelay = baseDelay * Math.pow(2, this.consecutiveFailures - 1);
        const jitteredDelay = exponentialDelay + (Math.random() * 1000); // Add jitter
        const finalDelay = Math.min(jitteredDelay, this.config.maxRetryDelay);

        console.warn(`[AnnotationStorage] SAVE_ERROR: Will retry in ${Math.ceil(finalDelay / 1000)}s (attempt ${this.consecutiveFailures}/${this.config.maxRetries})`);

        // Enter error state to prevent immediate retries
        this.isInErrorState = true;

        // Schedule retry with exponential backoff
        setTimeout(() => {
            if (this.consecutiveFailures < this.config.maxRetries) {
                console.log(`[AnnotationStorage] RETRY: Attempting retry ${this.consecutiveFailures}/${this.config.maxRetries}`);
                this._processSaveQueue();
            }
        }, finalDelay);

        // Emit warning event for UI handling
        this.emit('warning', {
            type: 'save_retry',
            message: `Save failed, retrying in ${Math.ceil(finalDelay / 1000)}s (${this.consecutiveFailures}/${this.config.maxRetries})`,
            retryCount: this.consecutiveFailures,
            maxRetries: this.config.maxRetries,
            retryDelay: finalDelay,
            originalError: error
        });
    }

    /**
     * Show persistent error notification to user
     */
    _showPersistentErrorNotification(error) {
        // Create error notification element
        const errorId = `annotation-error-${this.blockId}`;
        let errorNotification = document.getElementById(errorId);

        if (!errorNotification) {
            errorNotification = document.createElement('div');
            errorNotification.id = errorId;
            errorNotification.className = 'annotation-error-notification';
            errorNotification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ff4444;
                color: white;
                padding: 15px 20px;
                border-radius: 5px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                max-width: 400px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                line-height: 1.4;
            `;

            document.body.appendChild(errorNotification);
        }

        errorNotification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Annotation Save Failed</div>
            <div style="margin-bottom: 8px;">Your annotations could not be saved. Please check your connection and try again.</div>
            <div style="font-size: 12px; opacity: 0.9;">Error: ${error.message}</div>
            <button onclick="this.parentElement.remove()" style="
                background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 5px 10px;
                border-radius: 3px;
                cursor: pointer;
                margin-top: 10px;
                font-size: 12px;
            ">Dismiss</button>
        `;

        // Auto-remove after 30 seconds
        setTimeout(() => {
            if (errorNotification.parentNode) {
                errorNotification.remove();
            }
        }, 30000);
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

                console.log(`[AnnotationStorage] Merged annotation data:`, Object.keys(mergedData));
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
     * Bind methods to this context
     */
    _bindMethods() {
        this.saveAnnotation = this.saveAnnotation.bind(this);
        this._processSaveQueue = this._processSaveQueue.bind(this);
        this.setToolActive = this.setToolActive.bind(this);
        this.loadAnnotations = this.loadAnnotations.bind(this);
    }

    /**
     * Stop auto-save
     */
    _stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
            console.log(`[AnnotationStorage] AUTO_SAVE_STOPPED: Auto-save timer stopped`);
        }
    }

    /**
     * Restart auto-save after error recovery
     */
    restartAutoSave() {
        if (!this.config.autoSave || !this.allowAnnotation) {
            console.log(`[AnnotationStorage] RESTART_AUTO_SAVE: Auto-save not enabled or annotations not allowed`);
            return;
        }

        // Reset error state
        this.consecutiveFailures = 0;
        this.isInErrorState = false;
        this.lastFailureTime = 0;

        // Remove any error notifications
        const errorNotification = document.getElementById(`annotation-error-${this.blockId}`);
        if (errorNotification) {
            errorNotification.remove();
        }

        // Restart auto-save
        this._startAutoSave();
        console.log(`[AnnotationStorage] RESTART_AUTO_SAVE: Auto-save restarted after error recovery`);
    }
}

/**
 * AnnotationInterface - Wrapper for annotation operations (XBlock compatible)
 */
class AnnotationInterface extends SimpleEventEmitter {
    constructor(storageManager, options = {}) {
        super();

        this.storageManager = storageManager;
        this.blockId = options.blockId;
        this.userId = options.userId;

        console.log(`[AnnotationInterface] INIT_CALLED: Initialized for block: ${this.blockId}, user: ${this.userId}`);
    }

    async saveAnnotation(annotation) {
        if (!this.storageManager) {
            console.warn('[AnnotationInterface] INTERFACE_SAVE: No storage manager available');
            return false;
        }

        try {
            // Ensure annotation has required fields
            annotation.userId = this.userId;
            annotation.blockId = this.blockId;
            annotation.timestamp = annotation.timestamp || Date.now();

            console.log(`[AnnotationInterface] INTERFACE_SAVE: Saving annotation:`, annotation.id, `(type: ${annotation.type}, page: ${annotation.pageNum})`);

            await this.storageManager.saveAnnotation(annotation);

            console.log(`[AnnotationInterface] INTERFACE_SAVE: Delegated to storage manager for annotation:`, annotation.id);
            this.emit('annotationSaved', annotation);
            return true;

        } catch (error) {
            console.error('[AnnotationInterface] INTERFACE_SAVE: Error saving annotation:', error);
            this.emit('error', error);
            return false;
        }
    }
}

// Debug utility to inspect XBlock elements and configuration
window.debugPdfxXBlock = function(blockId) {
    console.log('=== PDFX XBLOCK DEBUG ===');

    if (blockId) {
        const element = document.getElementById(`pdfx-block-${blockId}`);
        if (element) {
            console.log('Block element found:', element);
            console.log('Block dataset:', element.dataset);
            console.log('PDF URL from dataset:', element.dataset.pdfUrl);
        } else {
            console.log('Block element not found with ID:', `pdfx-block-${blockId}`);
        }

        const viewer = window[`pdfxViewer_${blockId}`];
        if (viewer) {
            console.log('Viewer instance found:', viewer);
            console.log('Viewer config:', viewer.config);
        } else {
            console.log('Viewer instance not found');
        }
    } else {
        // Find all pdfx blocks
        const pdfxBlocks = document.querySelectorAll('[data-block-type="pdfx"]');
        console.log('Found PDFX blocks:', pdfxBlocks.length);

        pdfxBlocks.forEach((block, index) => {
            console.log(`Block ${index}:`, {
                id: block.id,
                blockId: block.dataset.blockId,
                pdfUrl: block.dataset.pdfUrl,
                dataset: block.dataset
            });
        });
    }

    console.log('Available PDF.js globals:', {
        pdfjsLib: typeof window.pdfjsLib,
        pdfjsViewer: typeof window.pdfjsViewer,
        loadPdfJsLibraries: typeof window.loadPdfJsLibraries
    });

    if (window.pdfjsLib) {
        console.log('pdfjsLib exports:', Object.keys(window.pdfjsLib));
    }

    if (window.pdfjsViewer) {
        console.log('pdfjsViewer exports:', Object.keys(window.pdfjsViewer));
        console.log('PDFViewer class:', typeof window.pdfjsViewer.PDFViewer);
        console.log('EventBus class:', typeof window.pdfjsViewer.EventBus);
        console.log('PDFLinkService class:', typeof window.pdfjsViewer.PDFLinkService);
        console.log('PDFRenderingQueue class:', typeof window.pdfjsViewer.PDFRenderingQueue);

        // Test individual class constructors
        if (window.pdfjsViewer.PDFViewer) {
            console.log('PDFViewer constructor test:', window.pdfjsViewer.PDFViewer.toString().substring(0, 200));
        }
        if (window.pdfjsViewer.EventBus) {
            console.log('EventBus constructor test:', window.pdfjsViewer.EventBus.toString().substring(0, 100));
        }
        if (window.pdfjsViewer.PDFLinkService) {
            console.log('PDFLinkService constructor test:', window.pdfjsViewer.PDFLinkService.toString().substring(0, 100));
        }
        if (window.pdfjsViewer.PDFRenderingQueue) {
            console.log('PDFRenderingQueue constructor test:', window.pdfjsViewer.PDFRenderingQueue.toString().substring(0, 100));
        }
    }

    console.log('=== END DEBUG ===');
};

// HighlightTool is now imported from external file HighlightTool.js



// TextTool is now imported from external file TextTool.js

// ClearTool is now imported from external file ClearTool.js

// StampTool is now imported from external file StampTool.js

class PdfxViewer {
    constructor(blockId, config) {
        this.blockId = blockId;
        this.config = config;

        // Initialize state following Mozilla pattern
        this.pdfDocument = null;
        this.pdfLoadingTask = null;
        this.pdfViewer = null;
        this.pdfLinkService = null;
        this.pdfRenderingQueue = null;
        this.eventBus = null;
        this.isInitialized = false;

        // Document state
        this.url = "";
        this.baseUrl = "";
        this.documentInfo = null;
        this.metadata = null;

        // Page tracking state
        this.currentPage = config.currentPage || 1;

        // Debug configuration
        console.log(`[PdfxViewer] Initializing with config:`, config);
        console.log(`[PdfxViewer] PDF URL:`, config.pdfUrl);

        // Initialize annotation storage system
        this.initializeAnnotationStorage();

        this.init();
    }

    /**
     * Initialize annotation storage system
     */
    initializeAnnotationStorage() {
        if (!this.config.allowAnnotation) {
            console.log(`[PdfxViewer] STORAGE_INIT: Annotations disabled, skipping storage initialization`);
            return;
        }

        try {
            // Initialize AnnotationStorage
            this.annotationStorage = new AnnotationStorage({
                blockId: this.blockId,
                userId: this.config.userId,
                courseId: this.config.courseId,
                handlerUrl: this.config.handlerUrl,
                allowAnnotation: this.config.allowAnnotation
            });

            // Initialize AnnotationInterface
            this.annotationInterface = new AnnotationInterface(this.annotationStorage, {
                blockId: this.blockId,
                userId: this.config.userId
            });

            console.log(`[PdfxViewer] STORAGE_INIT: Successfully initialized annotation storage system`);
            console.log(`[PdfxViewer] STORAGE_INIT: Handler URL: ${this.config.handlerUrl}`);

        } catch (error) {
            console.error(`[PdfxViewer] STORAGE_INIT: Failed to initialize annotation storage:`, error);
            this.annotationStorage = null;
            this.annotationInterface = null;
        }
    }

    async init() {
        console.log(`[PdfxViewer] Initializing viewer for block ${this.blockId}`);

        try {
            // Validate PDF URL first
            if (!this.config.pdfUrl || this.config.pdfUrl.trim() === '') {
                console.warn('[PdfxViewer] No PDF URL provided. Using example PDF for testing.');
                // Use the example PDF from the web folder as fallback for testing
                this.config.pdfUrl = '/static/pdfx/example/compressed.tracemonkey-pldi-09.pdf';
            }

            console.log(`[PdfxViewer] Final PDF URL: ${this.config.pdfUrl}`);

            // Wait for PDF.js to be loaded
            await this.waitForPdfJs();

            // Initialize the viewer components (following Mozilla pattern)
            await this.initializeViewer();

            // Open the PDF document (following Mozilla pattern)
            await this.open({ url: this.config.pdfUrl });

            this.isInitialized = true;
            console.log(`[PdfxViewer] Successfully initialized`);
        } catch (error) {
            console.error(`[PdfxViewer] Initialization failed:`, error);
            this.showError(error.message);
        }
    }

    async waitForPdfJs() {
        // Use the dedicated PDF.js loader if available
        if (typeof window.loadPdfJsLibraries === 'function') {
            console.log(`[PdfxViewer] Using dedicated PDF.js loader`);
            try {
                await window.loadPdfJsLibraries();
                console.log(`[PdfxViewer] PDF.js libraries loaded via dedicated loader`);
                return;
            } catch (error) {
                console.error(`[PdfxViewer] Dedicated loader failed:`, error);
                // Fall back to polling method
            }
        }

        // Fallback polling method
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 300; // 30 seconds max for ES modules

            const checkPdfJs = () => {
                // Check for PDF.js global objects
                const hasPdfjsLib = typeof window.pdfjsLib !== 'undefined';
                const hasPdfjsViewer = typeof window.pdfjsViewer !== 'undefined';

                if (hasPdfjsLib && hasPdfjsViewer) {
                    console.log(`[PdfxViewer] PDF.js libraries loaded after ${attempts} attempts`);
                    console.log(`[PdfxViewer] pdfjsLib version:`, window.pdfjsLib.version);
                    resolve();
                } else if (attempts < maxAttempts) {
                    attempts++;
                    if (attempts % 50 === 0) {
                        console.log(`[PdfxViewer] Still waiting for PDF.js libraries... (attempt ${attempts}/${maxAttempts})`);
                        console.log(`[PdfxViewer] pdfjsLib available: ${hasPdfjsLib}, pdfjsViewer available: ${hasPdfjsViewer}`);
                    }
                    setTimeout(checkPdfJs, 100);
                } else {
                    console.error('[PdfxViewer] PDF.js libraries failed to load after 30 seconds');
                    console.error('[PdfxViewer] Available globals:', Object.keys(window).filter(key => key.includes('pdf')));
                    reject(new Error('PDF.js libraries failed to load after 30 seconds'));
                }
            };
            checkPdfJs();
        });
    }

    // Following Mozilla's exact initialization pattern
    async initializeViewer() {
        console.log('[PdfxViewer] Initializing viewer components...');

        const container = document.getElementById(`viewerContainer-${this.blockId}`);
        const viewer = document.getElementById(`viewer-${this.blockId}`);

        if (!container || !viewer) {
            throw new Error('PDF viewer container elements not found');
        }

        // Create event bus (following Mozilla pattern)
        this.eventBus = new pdfjsViewer.EventBus();

        // Create PDF link service (following Mozilla pattern)
        this.pdfLinkService = new pdfjsViewer.PDFLinkService({
            eventBus: this.eventBus,
        });

        // Create rendering queue (following Mozilla pattern) - make it optional
        if (pdfjsViewer.PDFRenderingQueue && typeof pdfjsViewer.PDFRenderingQueue === 'function') {
            try {
                this.pdfRenderingQueue = new pdfjsViewer.PDFRenderingQueue();
                console.log('[PdfxViewer] PDFRenderingQueue created successfully');
            } catch (error) {
                console.warn('[PdfxViewer] Failed to create PDFRenderingQueue, continuing without it:', error);
                this.pdfRenderingQueue = null;
            }
        } else {
            console.warn('[PdfxViewer] PDFRenderingQueue not available, creating viewer without it');
            this.pdfRenderingQueue = null;
        }

        // Create PDF viewer configuration
        const viewerConfig = {
            container: container,
            viewer: viewer,
            eventBus: this.eventBus,
            linkService: this.pdfLinkService,
            // Basic options following Mozilla defaults
            textLayerMode: pdfjsViewer.TextLayerMode?.ENABLE || 1,
            annotationMode: window.pdfjsLib.AnnotationMode?.ENABLE_FORMS || 2,
            // Rendering options
            useOnlyCssZoom: false,
            maxCanvasPixels: 16777216,
            enableWebGL: true
        };

        // Add rendering queue if available
        if (this.pdfRenderingQueue) {
            viewerConfig.renderingQueue = this.pdfRenderingQueue;
        }

        // Create PDF viewer with Mozilla's configuration pattern
        this.pdfViewer = new pdfjsViewer.PDFViewer(viewerConfig);

        // Link services together (following Mozilla pattern)
        if (this.pdfRenderingQueue) {
            this.pdfRenderingQueue.setViewer(this.pdfViewer);
        }
        this.pdfLinkService.setViewer(this.pdfViewer);

        // Setup event listeners for UI controls
        this.setupEventListeners();

        console.log('[PdfxViewer] Viewer components initialized');
    }

    // Following Mozilla's open() method pattern exactly
    async open(args) {
        console.log('[PdfxViewer] Opening PDF document:', args.url);

        // Close any existing document first
        if (this.pdfLoadingTask) {
            await this.close();
        }

        // Set URL and title (following Mozilla pattern)
        if (args.url) {
            this.setTitleUsingUrl(args.originalUrl || args.url, args.url);
        }

        // Show loading bar
        const loadingBar = document.getElementById(`loadingBar-${this.blockId}`);
        if (loadingBar) {
            loadingBar.classList.remove('hidden');
        }

        // Create loading task (following Mozilla pattern)
        const loadingTask = pdfjsLib.getDocument({
            url: args.url,
            withCredentials: true,
            enableScripting: false
        });

        this.pdfLoadingTask = loadingTask;

        // Setup progress callback (following Mozilla pattern)
        loadingTask.onProgress = ({ loaded, total }) => {
            if (total > 0) {
                const percent = Math.round((loaded / total) * 100);
                this.updateLoadingProgress(percent);
                console.log(`[PdfxViewer] Loading progress: ${percent}% (${loaded}/${total})`);
            }
        };

        // Load document and handle success/error (following Mozilla pattern)
        return loadingTask.promise.then(
            pdfDocument => {
                this.load(pdfDocument);
                return pdfDocument;
            },
            reason => {
                if (loadingTask !== this.pdfLoadingTask) {
                    return undefined;
                }
                console.error('[PdfxViewer] Failed to load PDF:', reason);
                this.showError(`Failed to load PDF: ${reason.message}`);
                throw reason;
            }
        );
    }

    // Following Mozilla's load() method pattern exactly
    load(pdfDocument) {
        console.log('[PdfxViewer] Loading PDF document into viewer');

        this.pdfDocument = pdfDocument;

        // Hide loading bar
        const loadingBar = document.getElementById(`loadingBar-${this.blockId}`);
        if (loadingBar) {
            loadingBar.classList.add('hidden');
        }

        // Remove loading class from outer container
        const outerContainer = document.getElementById(`outerContainer-${this.blockId}`);
        if (outerContainer) {
            outerContainer.classList.remove('loadingInProgress');
        }

        // Set document in services (following Mozilla pattern)
        this.pdfLinkService.setDocument(pdfDocument);
        this.pdfViewer.setDocument(pdfDocument);

        // Get the firstPagePromise and pagesPromise from the viewer (following Mozilla pattern)
        const { firstPagePromise, onePageRendered, pagesPromise } = this.pdfViewer;

        // Update page count
        const numPagesElement = document.getElementById(`numPages-${this.blockId}`);
        if (numPagesElement) {
            numPagesElement.textContent = ` of ${pdfDocument.numPages}`;
        }

        // Wait for first page to load before setting page number (following Mozilla pattern)
        if (firstPagePromise) {
            firstPagePromise.then(() => {
                console.log('[PdfxViewer] First page loaded, setting initial page');

                // Set initial page (now it's safe to do this)
                const initialPage = this.config.currentPage || 1;
                this.pdfViewer.currentPageNumber = initialPage;

                // Set default zoom to fit width
                this.pdfViewer.currentScaleValue = 'page-width';

                // Update page number input
                const pageNumberInput = document.getElementById(`pageNumber-${this.blockId}`);
                if (pageNumberInput) {
                    pageNumberInput.value = initialPage;
                    pageNumberInput.max = pdfDocument.numPages;
                }

                // Load saved annotations after first page is ready
                this.loadSavedAnnotations().catch(error => {
                    console.error('[PdfxViewer] Error loading saved annotations:', error);
                });

                console.log(`[PdfxViewer] PDF document loaded: ${pdfDocument.numPages} pages, current page: ${initialPage}`);
            }).catch(error => {
                console.error('[PdfxViewer] Error loading first page:', error);
                this.showError(`Error loading first page: ${error.message}`);
            });
        } else {
            // Fallback: set initial page immediately if firstPagePromise is not available
            console.warn('[PdfxViewer] firstPagePromise not available, setting page immediately');
            const initialPage = this.config.currentPage || 1;

            // Use setTimeout to defer execution slightly
            setTimeout(() => {
                try {
                    this.pdfViewer.currentPageNumber = initialPage;

                    // Set default zoom to fit width
                    this.pdfViewer.currentScaleValue = 'page-width';

                    const pageNumberInput = document.getElementById(`pageNumber-${this.blockId}`);
                    if (pageNumberInput) {
                        pageNumberInput.value = initialPage;
                        pageNumberInput.max = pdfDocument.numPages;
                    }
                    this.loadSavedAnnotations().catch(error => {
                        console.error('[PdfxViewer] Error loading saved annotations (fallback):', error);
                    });
                    console.log(`[PdfxViewer] PDF document loaded (fallback): ${pdfDocument.numPages} pages, current page: ${initialPage}`);
                } catch (error) {
                    console.error('[PdfxViewer] Error in fallback page setting:', error);
                }
            }, 100);
        }
    }

    // Close document (following Mozilla pattern)
    async close() {
        if (!this.pdfLoadingTask) {
            return;
        }

        console.log('[PdfxViewer] Closing PDF document');

        const promises = [];
        promises.push(this.pdfLoadingTask.destroy());
        this.pdfLoadingTask = null;

        if (this.pdfDocument) {
            this.pdfDocument = null;
            this.pdfViewer.setDocument(null);
            this.pdfLinkService.setDocument(null);
        }

        // Reset state
        this.url = "";
        this.baseUrl = "";
        this.documentInfo = null;
        this.metadata = null;

        await Promise.all(promises);
    }

    setTitleUsingUrl(url = "", downloadUrl = null) {
        this.url = url;
        this.baseUrl = url; // Simplified for XBlock use
        console.log('[PdfxViewer] Set URL:', url);
    }

    setupEventListeners() {
        console.log(`[PdfxViewer] Setting up event listeners`);

        // Navigation
        this.setupNavigationListeners();

        // Zoom
        this.setupZoomListeners();

        // Download
        this.setupDownloadListener();

        // Toolbar toggle
        this.setupToolbarToggle();

        // Error handling
        this.setupErrorListeners();

        // PDF.js events
        if (this.eventBus) {
            this.eventBus.on('pagesinit', () => {
                console.log('[PdfxViewer] Pages initialized event received');
                // Don't initialize annotation tools here - wait for first page to load
                // This event fires too early, before pages are fully ready

                // Initialize download tool early since it doesn't depend on page content
                this.initDownloadTool();
            });

            this.eventBus.on('pagechanging', (evt) => {
                const pageNumber = evt.pageNumber;
                const pageNumberInput = document.getElementById(`pageNumber-${this.blockId}`);
                if (pageNumberInput) {
                    pageNumberInput.value = pageNumber;
                }
                this.saveCurrentPage(pageNumber);

                // Emit custom event for other components (like ToolManager)
                document.dispatchEvent(new CustomEvent('pageChanged', {
                    detail: {
                        blockId: this.blockId,
                        pageNum: pageNumber
                    }
                }));
            });

            this.eventBus.on('scalechanging', (evt) => {
                const scale = evt.scale;
                this.updateZoomDisplay(scale);
            });

            // Listen for when pages are actually rendered and ready
            this.eventBus.on('pagesloaded', () => {
                console.log('[PdfxViewer] All pages loaded and ready');
                this.initAnnotationTools();
                this.initDownloadTool(); // Initialize download tool separately from annotation tools
            });
        }
    }

    initAnnotationTools() {
        if (!this.config.allowAnnotation) {
            return;
        }

        if (!this.annotationInterface) {
            console.error(`[PdfxViewer] TOOLS_INIT: No annotation interface available - tools cannot save annotations!`);
            return;
        }

        // Check if secondary toolbar exists first
        const secondaryToolbar = document.getElementById(`secondaryToolbar-${this.blockId}`);
        console.log(`[PdfxViewer] Secondary toolbar found: ${!!secondaryToolbar}`);
        if (secondaryToolbar) {
            console.log(`[PdfxViewer] Secondary toolbar classes:`, secondaryToolbar.className);
        }

        // Initialize highlight tool using new HighlightTool class
        this.initHighlightTool();
        this.initScribbleTool();
        this.initTextTool();
        this.initStampTool();
        this.initNoteTool();
        this.initClearTool();

        this.initManualSaveTool();

        // Add global click listener to close parameter toolbars
        this.initGlobalClickHandler();
    }

    initHighlightTool() {
        // Initialize the HighlightTool with annotation interface
        this.highlightTool = new HighlightTool(this, this.annotationInterface);
        console.log(`[PdfxViewer] HighlightTool initialized successfully with annotation interface`);
    }

    initScribbleTool() {
        // Initialize the ScribbleTool with annotation interface
        this.scribbleTool = new ScribbleTool(this, this.annotationInterface);
        console.log(`[PdfxViewer] ScribbleTool initialized successfully with annotation interface`);
    }

    initTextTool() {
        // Initialize the TextTool with annotation interface
        this.textTool = new TextTool(this, this.annotationInterface);
        console.log(`[PdfxViewer] TextTool initialized successfully with annotation interface`);
    }

    initStampTool() {
        // Initialize the StampTool with annotation interface
        this.stampTool = new StampTool(this, this.annotationInterface);
        console.log(`[PdfxViewer] StampTool initialized successfully with annotation interface`);
    }

    initNoteTool() {
        const noteBtn = document.getElementById(`noteTool-${this.blockId}`);
        if (noteBtn) {
            noteBtn.addEventListener('click', () => {
                this.setActiveTool('note');
            });
        }
    }

    initClearTool() {
        // Initialize the ClearTool with annotation interface
        this.clearTool = new ClearTool(this, this.annotationInterface);
        console.log(`[PdfxViewer] ClearTool initialized successfully with annotation interface`);
    }

    initManualSaveTool() {
        // Initialize the ManualSaveTool with storage manager
        if (this.storageManager) {
            if (typeof ManualSaveTool === 'undefined') {
                console.error(`[PdfxViewer] ERROR: ManualSaveTool class is not defined!`);
                return;
            }

            try {
                this.manualSaveTool = new ManualSaveTool(this.blockId, this, this.storageManager);
            } catch (error) {
                console.error(`[PdfxViewer] ERROR: Failed to initialize ManualSaveTool:`, error);
            }
        }
    }

    initDownloadTool() {
        console.log(`[PdfxViewer] Initializing DownloadTool for block: ${this.blockId}`);

        // Prevent duplicate initialization
        if (this.downloadTool) {
            console.log(`[PdfxViewer] DownloadTool already initialized`);
            return;
        }

        if (!this.config.allowDownload) {
            console.debug(`[PdfxViewer] allowDownload is false, but initializing DownloadTool for testing anyway`);
            // Temporarily continue initialization for testing
            // return;
        }

        console.log(`[PdfxViewer] About to check if DownloadTool class is available...`);

        if (typeof DownloadTool === 'undefined') {
            console.error(`[PdfxViewer] ERROR: DownloadTool class is not defined!`);
            return;
        }

        try {
            this.downloadTool = new DownloadTool(this, this.annotationInterface);
            console.log(`[PdfxViewer] DownloadTool initialized successfully`);
        } catch (error) {
            console.error(`[PdfxViewer] ERROR: Failed to initialize DownloadTool:`, error);
        }
    }

    setActiveTool(toolName) {
        // Deactivate previous tool first
        this.deactivateCurrentTool();

        this.currentTool = toolName;
        console.log(`[PdfxViewer] Active tool: ${toolName}`);

        // Update UI to show active tool
        this.updateActiveToolUI(toolName);

        // Activate the specific tool functionality
        this.activateToolFunctionality(toolName);
    }

    deactivateCurrentTool() {
        if (!this.currentTool) return;

        console.log(`[PdfxViewer] Deactivating current tool: ${this.currentTool}`);

        // Deactivate the specific tool
        if (this.currentTool === 'highlight') {
            if (this.highlightTool) {
                this.highlightTool.deactivate();
            }
        } else if (this.currentTool === 'scribble') {
            if (this.scribbleTool) {
                this.scribbleTool.deactivate();
            }
        } else if (this.currentTool === 'text') {
            if (this.textTool) {
                this.textTool.deactivate();
            }
        } else if (this.currentTool === 'stamp') {
            if (this.stampTool) {
                this.stampTool.deactivate();
            }
        } else if (this.currentTool === 'clear') {
            if (this.clearTool) {
                this.clearTool.deactivate();
            }
        }

        // Clear any tool-specific states
        const textLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer`);
        textLayers.forEach(textLayer => {
            textLayer.classList.remove('highlighting', 'scribbling');
            textLayer.style.pointerEvents = 'none';
            textLayer.style.userSelect = 'none';
        });
    }

    activateToolFunctionality(toolName) {
        console.log(`[PdfxViewer] Activating functionality for tool: ${toolName}`);

        switch(toolName) {
            case 'highlight':
                if (this.highlightTool) {
                    this.highlightTool.activate();
                }
                break;
            case 'scribble':
                if (this.scribbleTool) {
                    this.scribbleTool.activate();
                }
                break;
            case 'text':
                if (this.textTool) {
                    this.textTool.activate();
                }
                break;
            case 'stamp':
                if (this.stampTool) {
                    this.stampTool.activate();
                }
                break;
            case 'clear':
                if (this.clearTool) {
                    this.clearTool.activate();
                }
                break;
            case 'note':
                // Enable note creation mode
                this.enableNoteMode();
                break;
            default:
                console.log(`[PdfxViewer] No specific functionality for tool: ${toolName}`);
        }
    }

    // Highlight functionality moved to HighlightTool class

    // Text selection and highlight creation methods moved to HighlightTool class

    // Drawing/scribble functionality moved to ScribbleTool class

    // Canvas drawing methods moved to ScribbleTool class





    enableNoteMode() {
        console.log(`[PdfxViewer] Enabling note mode for block: ${this.blockId}`);
        // TODO: Implement note functionality
    }

    updateActiveToolUI(toolName) {
        // Remove active class from all tool buttons
        const toolButtons = document.querySelectorAll(`#secondaryToolbar-${this.blockId} .secondaryToolbarButton`);
        toolButtons.forEach(btn => btn.classList.remove('toggled'));

        // Add active class to current tool
        const activeBtn = document.getElementById(`${toolName}Tool-${this.blockId}`);
        if (activeBtn) {
            activeBtn.classList.add('toggled');
        }
    }

    toggleParameterToolbar(button, toolbar) {
        console.log(`[PdfxViewer-${this.blockId}] toggleParameterToolbar called with:`, {
            button: button,
            toolbar: toolbar,
            buttonId: button?.id,
            toolbarId: toolbar?.id
        });

        if (!toolbar) {
            console.log(`[PdfxViewer-${this.blockId}] No toolbar provided, returning`);
            return;
        }

        const isHidden = toolbar.classList.contains('hidden');
        const isCurrentlyActive = button.getAttribute('aria-expanded') === 'true';

        // If clicking the same button that's already active, just close it
        if (isCurrentlyActive && !isHidden) {
            console.log(`[PdfxViewer-${this.blockId}] Toggling off active toolbar ${toolbar.id}`);
            this.hideParameterToolbar(toolbar, button);
            return;
        }

        // Close all other parameter toolbars first
        this.closeAllParameterToolbars();

        // Show the clicked toolbar
        if (isHidden) {
            console.log(`[PdfxViewer-${this.blockId}] Showing toolbar ${toolbar.id}`);
            this.showParameterToolbar(toolbar, button);
        }
    }

    showParameterToolbar(toolbar, button) {
        // Clear any existing auto-hide timer for this toolbar
        if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
            clearTimeout(this.parameterToolbarTimers[toolbar.id]);
            delete this.parameterToolbarTimers[toolbar.id];
        }

        // Position and show the toolbar
        this.positionParameterToolbar(button, toolbar);
        toolbar.classList.remove('hidden');
        button.setAttribute('aria-expanded', 'true');

        // Change text layer cursor to default when toolbar is active
        this.setTextLayerCursorForToolbar(true);

        // Set up mouse leave behavior instead of auto-hide timer
        this.setupToolbarMouseLeave(toolbar, button);

        console.log(`[PdfxViewer-${this.blockId}] Showed toolbar ${toolbar.id} with mouse leave behavior`);
    }

    setupToolbarMouseLeave(toolbar, button) {
        // Set up mouse leave behavior that works reliably with child elements
        let isInteracting = false; // Flag to prevent hiding during interactions

        const checkMousePosition = (event) => {
            // Don't check position if user is actively interacting
            if (isInteracting) return;

            // Get toolbar bounds
            const rect = toolbar.getBoundingClientRect();
            const mouseX = event.clientX;
            const mouseY = event.clientY;

            // Check if mouse is outside toolbar bounds
            let isOutside = (
                mouseX < rect.left ||
                mouseX > rect.right ||
                mouseY < rect.top ||
                mouseY > rect.bottom
            );

            // If highlight or scribble tool is active, also check if mouse is over text layer area
            if (isOutside && (this.currentTool === 'highlight' || this.currentTool === 'scribble')) {
                const viewerContainer = document.getElementById(`viewerContainer-${this.blockId}`);
                if (viewerContainer) {
                    const viewerRect = viewerContainer.getBoundingClientRect();
                    const isOverTextArea = (
                        mouseX >= viewerRect.left &&
                        mouseX <= viewerRect.right &&
                        mouseY >= viewerRect.top &&
                        mouseY <= viewerRect.bottom
                    );

                    // If mouse is over text area, don't consider it "outside"
                    if (isOverTextArea) {
                        isOutside = false;
                    }
                }
            }

            if (isOutside) {
                // Mouse is outside toolbar and text area, start hide timer
                if (!this.parameterToolbarTimers) {
                    this.parameterToolbarTimers = {};
                }

                // Clear existing timer first
                if (this.parameterToolbarTimers[toolbar.id]) {
                    clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                }

                this.parameterToolbarTimers[toolbar.id] = setTimeout(() => {
                    console.log(`[PdfxViewer-${this.blockId}] Mouse left toolbar ${toolbar.id}, hiding`);
                    this.hideParameterToolbar(toolbar, button);
                    delete this.parameterToolbarTimers[toolbar.id];
                }, 300); // Increased delay to 300ms for better UX
            } else {
                // Mouse is inside valid area, cancel hide timer
                if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                    clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                    delete this.parameterToolbarTimers[toolbar.id];
                }
            }
        };

        const onMouseMove = (event) => {
            checkMousePosition(event);
        };

        const onMouseLeave = (event) => {
            // Double-check on mouseleave as well
            checkMousePosition(event);
        };

        // Prevent hiding during active interactions
        const onMouseDown = (event) => {
            isInteracting = true;
            // Clear any pending hide timer
            if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                delete this.parameterToolbarTimers[toolbar.id];
            }
        };

        const onMouseUp = (event) => {
            // Extended delay before re-enabling position checking for complex interactions
            setTimeout(() => {
                isInteracting = false;
            }, 200);
        };

        const onClick = (event) => {
            // Prevent hiding on click
            event.stopPropagation();
            // Clear any pending hide timer
            if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                delete this.parameterToolbarTimers[toolbar.id];
            }
        };

        const onMouseEnter = (event) => {
            // Always clear hide timer when mouse enters toolbar
            if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                delete this.parameterToolbarTimers[toolbar.id];
            }
        };

        const onInput = (event) => {
            // Prevent hiding during input interactions (sliders, etc.)
            isInteracting = true;
            if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                delete this.parameterToolbarTimers[toolbar.id];
            }
            // Reset after longer delay for input elements
            setTimeout(() => {
                isInteracting = false;
            }, 300);
        };

        const onChange = (event) => {
            // Prevent hiding during change events (select, etc.)
            isInteracting = true;
            if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
                clearTimeout(this.parameterToolbarTimers[toolbar.id]);
                delete this.parameterToolbarTimers[toolbar.id];
            }
            // Reset after delay
            setTimeout(() => {
                isInteracting = false;
            }, 200);
        };

        // Add event listeners
        document.addEventListener('mousemove', onMouseMove);
        toolbar.addEventListener('mouseleave', onMouseLeave);
        toolbar.addEventListener('mouseenter', onMouseEnter);
        toolbar.addEventListener('mousedown', onMouseDown);
        toolbar.addEventListener('mouseup', onMouseUp);
        toolbar.addEventListener('click', onClick);
        toolbar.addEventListener('input', onInput);
        toolbar.addEventListener('change', onChange);

        // Store listeners for cleanup
        if (!this.toolbarListeners) {
            this.toolbarListeners = {};
        }
        this.toolbarListeners[toolbar.id] = {
            mousemove: onMouseMove,
            mouseleave: onMouseLeave,
            mouseenter: onMouseEnter,
            mousedown: onMouseDown,
            mouseup: onMouseUp,
            click: onClick,
            input: onInput,
            change: onChange
        };

        console.log(`[PdfxViewer-${this.blockId}] Set mouse leave behavior for toolbar ${toolbar.id}`);
    }

    hideParameterToolbar(toolbar, button) {
        // Clear any existing timer
        if (this.parameterToolbarTimers && this.parameterToolbarTimers[toolbar.id]) {
            clearTimeout(this.parameterToolbarTimers[toolbar.id]);
            delete this.parameterToolbarTimers[toolbar.id];
        }

        // Clean up event listeners
        if (this.toolbarListeners && this.toolbarListeners[toolbar.id]) {
            const listeners = this.toolbarListeners[toolbar.id];
            document.removeEventListener('mousemove', listeners.mousemove);
            toolbar.removeEventListener('mouseleave', listeners.mouseleave);
            toolbar.removeEventListener('mouseenter', listeners.mouseenter);
            toolbar.removeEventListener('mousedown', listeners.mousedown);
            toolbar.removeEventListener('mouseup', listeners.mouseup);
            toolbar.removeEventListener('click', listeners.click);
            toolbar.removeEventListener('input', listeners.input);
            toolbar.removeEventListener('change', listeners.change);
            delete this.toolbarListeners[toolbar.id];
        }

        toolbar.classList.add('hidden');
        button.setAttribute('aria-expanded', 'false');

        // Restore text layer cursor to text when toolbar is hidden
        this.setTextLayerCursorForToolbar(false);

        console.log(`[PdfxViewer-${this.blockId}] Hidden toolbar ${toolbar.id}`);
    }

    positionParameterToolbar(button, toolbar) {
        if (!button || !toolbar) return;

        // Get button position relative to its closest positioned parent
        const buttonRect = button.getBoundingClientRect();

        // Find the toolbar's positioned parent (usually the main toolbar container)
        let positionedParent = toolbar.offsetParent;
        if (!positionedParent) {
            positionedParent = document.body;
        }

        const parentRect = positionedParent.getBoundingClientRect();

        // Calculate position relative to the positioned parent
        const leftPosition = buttonRect.right - parentRect.left + 10; // 10px gap from button
        const topPosition = buttonRect.top - parentRect.top; // Align with button top

        console.log(`[PdfxViewer] Positioning toolbar relative to parent:`, {
            buttonRect: { left: buttonRect.left, right: buttonRect.right, top: buttonRect.top },
            parentRect: { left: parentRect.left, top: parentRect.top },
            calculatedLeft: leftPosition,
            calculatedTop: topPosition
        });

        toolbar.style.left = `${leftPosition}px`;
        toolbar.style.top = `${topPosition}px`;

        // Ensure toolbar doesn't go off screen
        setTimeout(() => {
            const toolbarRect = toolbar.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let adjustedLeft = leftPosition;
            let adjustedTop = topPosition;

            // Adjust if toolbar goes off right edge
            if (toolbarRect.right > viewportWidth - 20) {
                adjustedLeft = buttonRect.left - parentRect.left - toolbarRect.width - 10; // Position to the left of button
                console.log(`[PdfxViewer] Adjusted left position to: ${adjustedLeft}px (prevented overflow)`);
            }

            // Adjust if toolbar goes off bottom edge
            if (toolbarRect.bottom > viewportHeight - 20) {
                adjustedTop = buttonRect.bottom - parentRect.top - toolbarRect.height; // Position above button
                console.log(`[PdfxViewer] Adjusted top position to: ${adjustedTop}px (prevented overflow)`);
            }

            // Apply adjustments if needed
            if (adjustedLeft !== leftPosition || adjustedTop !== topPosition) {
                toolbar.style.left = `${adjustedLeft}px`;
                toolbar.style.top = `${adjustedTop}px`;
            }
        }, 0);
    }

    closeAllParameterToolbars() {
        // Use block-specific selector to target only this instance's parameter toolbars
        const toolbars = document.querySelectorAll(`#secondaryToolbar-${this.blockId} .editorParamsToolbar-${this.blockId}`);
        const buttons = document.querySelectorAll(`#secondaryToolbar-${this.blockId} .secondaryToolbarButton[aria-expanded]`);

        console.log(`[PdfxViewer-${this.blockId}] Closing ${toolbars.length} parameter toolbars for block ${this.blockId}`);

        // Clear any active auto-hide timers
        if (this.parameterToolbarTimers) {
            Object.keys(this.parameterToolbarTimers).forEach(toolbarId => {
                clearTimeout(this.parameterToolbarTimers[toolbarId]);
                delete this.parameterToolbarTimers[toolbarId];
            });
        }

        toolbars.forEach(toolbar => toolbar.classList.add('hidden'));
        buttons.forEach(button => button.setAttribute('aria-expanded', 'false'));

        // Restore text layer cursor when all toolbars are closed
        this.setTextLayerCursorForToolbar(false);
    }

    // Highlight color picker and controls moved to HighlightTool class

    // Scribble controls moved to ScribbleTool class



    setTextLayerCursorForToolbar(isToolbarActive) {
        // Find all text layers with highlighting or scribbling class
        const highlightingLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer.highlighting`);
        const scribblingLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer.scribbling`);

        // Combine both sets
        const allLayers = [...highlightingLayers, ...scribblingLayers];

        allLayers.forEach(textLayer => {
            if (isToolbarActive) {
                // Add toolbar-active class to change cursor to default
                textLayer.classList.add('toolbar-active');
            } else {
                // Remove toolbar-active class to restore text cursor
                textLayer.classList.remove('toolbar-active');
            }
        });

        console.log(`[PdfxViewer-${this.blockId}] Set text layer cursor - toolbar active: ${isToolbarActive}, highlighting layers: ${highlightingLayers.length}, scribbling layers: ${scribblingLayers.length}, total: ${allLayers.length}`);
    }

    initGlobalClickHandler() {
        // Close parameter toolbars when clicking outside
        document.addEventListener('click', (e) => {
            const secondaryToolbar = document.getElementById(`secondaryToolbar-${this.blockId}`);

            // Check if click is outside secondary toolbar and any parameter toolbars
            const isOutsideSecondaryToolbar = secondaryToolbar && !secondaryToolbar.contains(e.target);
            const isOutsideParameterToolbars = !e.target.closest(`[class*="editorParamsToolbar-${this.blockId}"]`);

            if (isOutsideSecondaryToolbar && isOutsideParameterToolbars) {
                console.log(`[PdfxViewer-${this.blockId}] Clicked outside toolbars, closing all parameter toolbars`);
                this.closeAllParameterToolbars();
            }
        });
    }

    setupNavigationListeners() {
        const prevBtn = document.getElementById(`previous-${this.blockId}`);
        const nextBtn = document.getElementById(`next-${this.blockId}`);
        const pageInput = document.getElementById(`pageNumber-${this.blockId}`);

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.previousPage());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextPage());
        }

        if (pageInput) {
            pageInput.addEventListener('change', (e) => {
                const pageNumber = parseInt(e.target.value);
                this.goToPage(pageNumber);
            });

            pageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const pageNumber = parseInt(e.target.value);
                    this.goToPage(pageNumber);
                }
            });
        }
    }

    setupZoomListeners() {
        const zoomInBtn = document.getElementById(`zoomIn-${this.blockId}`);
        const zoomOutBtn = document.getElementById(`zoomOut-${this.blockId}`);
        const scaleSelect = document.getElementById(`scaleSelect-${this.blockId}`);

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => this.zoomIn());
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
        }

        if (scaleSelect) {
            scaleSelect.addEventListener('change', (e) => {
                this.setZoom(e.target.value);
            });
        }
    }

    setupDownloadListener() {
        // Download functionality moved to DownloadTool.js
        // The DownloadTool will be initialized in initAnnotationTools()
    }

    setupToolbarToggle() {
        const toggleBtn = document.getElementById(`secondaryToolbarToggle-${this.blockId}`);
        const secondaryToolbar = document.getElementById(`secondaryToolbar-${this.blockId}`);

        console.log(`[PdfxViewer] setupToolbarToggle - toggleBtn found: ${!!toggleBtn}, secondaryToolbar found: ${!!secondaryToolbar}`);
        if (toggleBtn) console.log(`[PdfxViewer] Toggle button ID: ${toggleBtn.id}`);
        if (secondaryToolbar) console.log(`[PdfxViewer] Secondary toolbar ID: ${secondaryToolbar.id}, initial classes: ${secondaryToolbar.className}`);

        if (toggleBtn && secondaryToolbar) {
            toggleBtn.addEventListener('click', () => {
                console.log(`[PdfxViewer] Secondary toolbar toggle clicked!`);
                const wasHidden = secondaryToolbar.classList.contains('hidden');
                console.log(`[PdfxViewer] Secondary toolbar was hidden: ${wasHidden}`);

                secondaryToolbar.classList.toggle('hidden');
                toggleBtn.classList.toggle('toggled');

                const isNowHidden = secondaryToolbar.classList.contains('hidden');
                console.log(`[PdfxViewer] Secondary toolbar is now hidden: ${isNowHidden}`);
            });
        }
    }

    setupErrorListeners() {
        const errorClose = document.getElementById(`errorClose-${this.blockId}`);
        if (errorClose) {
            errorClose.addEventListener('click', () => {
                this.hideError();
            });
        }
    }

    async loadSavedAnnotations() {
        console.log(`[PdfxViewer] Loading saved annotations from server`);

        if (!this.annotationStorage) {
            console.warn(`[PdfxViewer] No annotation storage available - cannot load annotations`);
            return;
        }

                try {
            // Load annotations from server through the storage system
            // Only include data for available tools: highlight, scribble, text, stamp
            const existingData = {
                highlights: this.config.highlights || {},
                drawing_strokes: this.config.drawingStrokes || {},
                marker_strokes: this.config.markerStrokes || {},
                text_annotations: this.config.textAnnotations || {},
                shape_annotations: this.config.shapeAnnotations || {}
            };

            console.log(`[PdfxViewer] Loading annotations with existing data:`, Object.keys(existingData));

            const loadedData = await this.annotationStorage.loadAnnotations(existingData);

            console.log(`[PdfxViewer] Successfully loaded annotations:`, Object.keys(loadedData));

            // Update config with loaded data for available tools only
            this.config.highlights = loadedData.highlights || {};
            this.config.drawingStrokes = loadedData.drawing_strokes || {};
            this.config.markerStrokes = loadedData.marker_strokes || {};
            this.config.textAnnotations = loadedData.text_annotations || {};
            this.config.shapeAnnotations = loadedData.shape_annotations || {};

            // Update current page if available
            if (loadedData.currentPage && loadedData.currentPage !== this.config.currentPage) {
                this.config.currentPage = loadedData.currentPage;
                this.currentPage = loadedData.currentPage;
                console.log(`[PdfxViewer] Updated current page from server: ${this.config.currentPage}`);
            }

            // Render loaded annotations
            this.renderLoadedAnnotations(loadedData);

        } catch (error) {
            console.error(`[PdfxViewer] Error loading saved annotations:`, error);
            // Continue with existing data if loading fails
        }
    }

    renderLoadedAnnotations(loadedData) {
        console.log(`[PdfxViewer] Rendering loaded annotations:`, Object.keys(loadedData));

        try {
            // Render scribble/drawing annotations
            if (loadedData.drawing_strokes && Object.keys(loadedData.drawing_strokes).length > 0) {
                this.renderScribbleAnnotations(loadedData.drawing_strokes);
            }

            // Render highlight annotations
            if (loadedData.highlights && Object.keys(loadedData.highlights).length > 0) {
                this.renderHighlightAnnotations(loadedData.highlights);
            }

            // Render text annotations
            if (loadedData.text_annotations && Object.keys(loadedData.text_annotations).length > 0) {
                this.renderTextAnnotations(loadedData.text_annotations);
            }

            // Render shape/stamp annotations
            if (loadedData.shape_annotations && Object.keys(loadedData.shape_annotations).length > 0) {
                this.renderShapeAnnotations(loadedData.shape_annotations);
            }

        } catch (error) {
            console.error(`[PdfxViewer] Error rendering loaded annotations:`, error);
        }
    }

    renderScribbleAnnotations(drawingStrokes) {
        console.log(`[PdfxViewer] Rendering scribble annotations for ${Object.keys(drawingStrokes).length} pages`);

        // Load saved annotations into ScribbleTool's internal data structure first
        if (this.scribbleTool && this.scribbleTool.loadSavedAnnotations) {
            this.scribbleTool.loadSavedAnnotations(drawingStrokes);
        }

        Object.entries(drawingStrokes).forEach(([pageNum, pageStrokes]) => {
            const page = parseInt(pageNum);
            if (!Array.isArray(pageStrokes)) return;

            // Find the page container
            const pageContainer = document.querySelector(`#pdfx-block-${this.blockId} .page[data-page-number="${page}"]`);
            if (!pageContainer) {
                console.warn(`[PdfxViewer] Page container not found for page: ${page}`);
                return;
            }

            // Find or create drawing container for this page
            let container = pageContainer.querySelector('.drawing-container');
            if (!container) {
                container = document.createElement('div');
                container.className = 'drawing-container';
                container.setAttribute('data-page-number', page);
                container.style.position = 'absolute';
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.zIndex = '25';
                container.style.pointerEvents = 'none';

                pageContainer.style.position = 'relative';
                pageContainer.appendChild(container);
            }

            // Render strokes as SVG elements
            pageStrokes.forEach(stroke => {
                if (stroke.data && stroke.data.strokeData) {
                    // Pass annotation ID to stroke data for deletion tracking
                    stroke.data.strokeData.annotationId = stroke.id;
                    stroke.data.annotationId = stroke.id;

                    // Use new SVG-based stroke data
                    this.renderSvgStroke(container, stroke.data.strokeData, stroke.data);
                } else if (stroke.data && stroke.data.imageData) {
                    // Fallback for legacy canvas-based strokes - convert to div
                    this.renderLegacyCanvasStroke(container, stroke.data);
                }
            });
        });
    }

    renderSvgStroke(container, strokeData, strokeConfig) {
        if (!strokeData || !strokeData.points) return;

        // Check if this stroke already exists to prevent duplicates
        const existingStroke = container.querySelector(`[data-stroke-id="${strokeData.id}"]`);
        if (existingStroke) {
            console.log(`[PdfxViewer] Stroke ${strokeData.id} already exists in container, skipping render`);
            return;
        }

        // Use ScribbleTool's optimized SVG creation if available
        let svgElement = null;
        if (this.scribbleTool && this.scribbleTool.createOptimizedSvgElement) {
            console.log(`[PdfxViewer] Using ScribbleTool's optimized SVG creation for stroke: ${strokeData.id}`);

            // Ensure annotation ID is preserved from server data for deletion tracking
            if (!strokeData.annotationId && strokeConfig.annotationId) {
                strokeData.annotationId = strokeConfig.annotationId;
            }

            svgElement = this.scribbleTool.createOptimizedSvgElement(container, strokeData);
            if (svgElement) {
                svgElement.classList.add('saved-stroke');
                return; // ScribbleTool handles the complete creation and adding to container
            }
        }

        // Fallback to old method if ScribbleTool not available or failed
        console.log(`[PdfxViewer] Using fallback full-page SVG creation for stroke: ${strokeData.id}`);
        svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgElement.setAttribute('class', 'stroke-svg saved-stroke fallback-stroke');
        svgElement.setAttribute('data-stroke-id', strokeData.id);
        // Use full-page dimensions for fallback strokes
        svgElement.style.setProperty('position', 'absolute', 'important');
        svgElement.style.setProperty('top', '0px', 'important');
        svgElement.style.setProperty('left', '0px', 'important');
        svgElement.style.setProperty('width', '100%', 'important');
        svgElement.style.setProperty('height', '100%', 'important');
        svgElement.style.setProperty('pointer-events', 'auto', 'important');
        svgElement.style.setProperty('z-index', '10', 'important');
        svgElement.style.setProperty('cursor', 'pointer', 'important');
        svgElement.style.setProperty('overflow', 'visible', 'important');

        // Create path element
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.setAttribute('fill', 'none');

        // Handle different stroke data formats
        if (strokeData.points && strokeData.points.length > 0) {
            pathElement.setAttribute('stroke', strokeData.points[0].color || '#FF0000');
            pathElement.setAttribute('stroke-width', strokeData.points[0].thickness || 2);
            pathElement.setAttribute('stroke-opacity', strokeData.points[0].opacity || 1);
        } else {
            // Fallback for older data format
            pathElement.setAttribute('stroke', strokeData.color || '#FF0000');
            pathElement.setAttribute('stroke-width', strokeData.thickness || 2);
            pathElement.setAttribute('stroke-opacity', strokeData.opacity || 1);
        }

        pathElement.setAttribute('stroke-linecap', 'round');
        pathElement.setAttribute('stroke-linejoin', 'round');

        // Create path data
        let pathData = '';
        if (strokeData.pathData) {
            // Use stored path data if available
            pathData = strokeData.pathData;
        } else {
            // Reconstruct path from points
            if (strokeData.points.length === 1) {
                const point = strokeData.points[0];
                const radius = point.thickness / 2;
                pathData = `DownloadTool ${point.x - radius} ${point.y} A ${radius} ${radius} 0 1 1 ${point.x + radius} ${point.y} A ${radius} ${radius} 0 1 1 ${point.x - radius} ${point.y}`;
            } else {
                pathData = `M ${strokeData.points[0].x} ${strokeData.points[0].y}`;
                for (let i = 1; i < strokeData.points.length; i++) {
                    pathData += ` L ${strokeData.points[i].x} ${strokeData.points[i].y}`;
                }
            }
        }

        pathElement.setAttribute('d', pathData);
        svgElement.appendChild(pathElement);
        container.appendChild(svgElement);
    }

    renderLegacyCanvasStroke(container, strokeData) {
        // Convert legacy canvas stroke to div representation
        if (!strokeData.imageData) return;

        const strokeElement = document.createElement('div');
        strokeElement.className = 'stroke-path legacy-stroke';
        strokeElement.style.position = 'absolute';
        strokeElement.style.pointerEvents = 'none';
        strokeElement.style.zIndex = '1';
        strokeElement.style.top = '0';
        strokeElement.style.left = '0';
        strokeElement.style.width = '100%';
        strokeElement.style.height = '100%';

        // Create an image element to display the legacy canvas data
        const img = document.createElement('img');
        img.src = strokeData.imageData;
        img.style.position = 'absolute';
        img.style.top = '0';
        img.style.left = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.opacity = strokeData.opacity || 1;

        strokeElement.appendChild(img);
        container.appendChild(strokeElement);
    }

    createLineSegment(point1, point2) {
        const segment = document.createElement('div');
        segment.style.position = 'absolute';

        // Calculate line properties
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        // Style the line segment
        segment.style.left = `${point1.x}px`;
        segment.style.top = `${point1.y}px`;
        segment.style.width = `${length}px`;
        segment.style.height = `${point1.thickness}px`;
        segment.style.backgroundColor = point1.color;
        segment.style.opacity = point1.opacity;
        segment.style.transformOrigin = '0 50%';
        segment.style.transform = `rotate(${angle}deg)`;
        segment.style.borderRadius = `${point1.thickness / 2}px`;

        return segment;
    }

    renderHighlightAnnotations(highlights) {
        console.log(`[PdfxViewer] Rendering highlight annotations for ${Object.keys(highlights).length} pages`);

        // First, clear all existing saved highlights to prevent duplicates
        this.clearExistingSavedHighlights();

        Object.entries(highlights).forEach(([pageNum, pageHighlights]) => {
            const page = parseInt(pageNum);
            if (!Array.isArray(pageHighlights)) return;

            console.log(`[PdfxViewer] Rendering ${pageHighlights.length} highlights for page ${page}`);

            pageHighlights.forEach(highlight => {
                if (!highlight.data) {
                    console.warn(`[PdfxViewer] Highlight missing data:`, highlight);
                    return;
                }

                // Find the appropriate text layer for this page
                const textLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer`);
                let targetTextLayer = null;

                // Try to find text layer by various methods
                for (const textLayer of textLayers) {
                    // Method 1: Check data-page-number attribute
                    const layerPageNum = textLayer.getAttribute('data-page-number');
                    if (layerPageNum && parseInt(layerPageNum) === page) {
                        targetTextLayer = textLayer;
                        break;
                    }

                    // Method 2: Check parent page container
                    const pageContainer = textLayer.closest('.page');
                    if (pageContainer) {
                        const containerPageNum = pageContainer.getAttribute('data-page-number');
                        if (containerPageNum && parseInt(containerPageNum) === page) {
                            targetTextLayer = textLayer;
                            break;
                        }

                        // Method 3: Check by page container ID pattern (pageContainer1, pageContainer2, etc.)
                        const pageId = pageContainer.id;
                        const match = pageId.match(/pageContainer(\d+)/);
                        if (match && parseInt(match[1]) === page) {
                            targetTextLayer = textLayer;
                            break;
                        }
                    }
                }

                if (!targetTextLayer) {
                    console.warn(`[PdfxViewer] Could not find text layer for page ${page}, highlight skipped:`, highlight.id);
                    return;
                }

                console.log(`[PdfxViewer] About to render highlight ${highlight.id} on page ${page}`);
                console.log(`[PdfxViewer] Highlight data:`, highlight.data);
                console.log(`[PdfxViewer] Target text layer:`, targetTextLayer);

                // Create highlight visualization using HighlightTool
                if (this.highlightTool && this.highlightTool.renderSavedHighlight) {
                    this.highlightTool.renderSavedHighlight(highlight, targetTextLayer);
                } else {
                    // Fallback to old method if HighlightTool not available
                    console.warn(`[PdfxViewer] HighlightTool not available, using fallback`);
                    this.renderSavedHighlight(highlight, targetTextLayer);
                }
            });
        });
    }

    /**
     * Clear existing saved highlights to prevent duplicates on reload
     */
    clearExistingSavedHighlights() {
        const existingHighlights = document.querySelectorAll(`#viewerContainer-${this.blockId} .highlight-group.saved-highlight`);
        console.log(`[PdfxViewer] Clearing ${existingHighlights.length} existing saved highlights`);
        existingHighlights.forEach(highlight => highlight.remove());
    }

    /**
     * Clear existing saved text annotations to prevent duplicates on reload
     */
    clearExistingSavedTextAnnotations() {
        const existingTextAnnotations = document.querySelectorAll(`#viewerContainer-${this.blockId} .text-annotation-final.saved-text-annotation`);
        console.log(`[PdfxViewer] Clearing ${existingTextAnnotations.length} existing saved text annotations`);
        existingTextAnnotations.forEach(textAnnotation => textAnnotation.remove());
    }

    /**
     * Render a single saved highlight on a text layer
     */
    renderSavedHighlight(highlight, textLayer) {
        // Check if this highlight already exists to prevent duplicates
        const existingHighlight = textLayer.querySelector(`[data-annotation-id="${highlight.id}"]`);
        if (existingHighlight) {
            console.log(`[PdfxViewer] Highlight ${highlight.id} already exists, skipping render`);
            return;
        }

        // Get or create highlight container for this text layer
        let highlightContainer = textLayer.querySelector('.highlight-container');
        if (!highlightContainer) {
            highlightContainer = document.createElement('div');
            highlightContainer.className = 'highlight-container';
            highlightContainer.style.position = 'absolute';
            highlightContainer.style.top = '0';
            highlightContainer.style.left = '0';
            highlightContainer.style.width = '100%';
            highlightContainer.style.height = '100%';
            highlightContainer.style.pointerEvents = 'none';
            highlightContainer.style.zIndex = '1';
            textLayer.appendChild(highlightContainer);
        }

        // For saved highlights, we need to reconstruct the visualization
        // Since we don't have the original text selection ranges, we'll create a simple highlight representation
        const highlightGroup = document.createElement('div');
        highlightGroup.className = 'highlight-group saved-highlight';
        highlightGroup.setAttribute('data-annotation-id', highlight.id);
        highlightGroup.setAttribute('data-text', highlight.data.selectedText || highlight.text || '');

        // If we have stored rectangle data, use it
        if (highlight.data.rects && Array.isArray(highlight.data.rects)) {
            highlight.data.rects.forEach(rect => {
                const highlightRect = document.createElement('div');
                highlightRect.className = 'highlight-element';
                highlightRect.style.position = 'absolute';
                highlightRect.style.left = `${rect.left}px`;
                highlightRect.style.top = `${rect.top}px`;
                highlightRect.style.width = `${rect.width}px`;
                highlightRect.style.height = `${rect.height}px`;
                highlightRect.style.backgroundColor = highlight.data.color || '#FFFF98';
                highlightRect.style.opacity = '0.4';
                highlightRect.style.pointerEvents = 'none';
                highlightRect.style.borderRadius = '2px';

                highlightGroup.appendChild(highlightRect);
            });

            console.log(`[PdfxViewer] Rendered saved highlight with ${highlight.data.rects.length} rectangles:`, highlight.id);
        } else {
            // Fallback: create a simple highlight marker if we don't have precise rectangle data
            // This is a limitation of the current implementation - we'd need to store more precise selection data
            const fallbackHighlight = document.createElement('div');
            fallbackHighlight.className = 'highlight-element fallback';
            fallbackHighlight.style.position = 'relative';
            fallbackHighlight.style.display = 'inline-block';
            fallbackHighlight.style.backgroundColor = highlight.data.color || '#FFFF98';
            fallbackHighlight.style.opacity = '0.4';
            fallbackHighlight.style.padding = '2px 4px';
            fallbackHighlight.style.borderRadius = '2px';
            fallbackHighlight.style.fontSize = '0.8em';
            fallbackHighlight.style.color = '#666';
            fallbackHighlight.textContent = `[Highlight: ${(highlight.data.selectedText || highlight.text || 'text').substring(0, 20)}...]`;

            highlightGroup.appendChild(fallbackHighlight);
            console.log(`[PdfxViewer] Rendered fallback highlight marker:`, highlight.id);
        }

        highlightContainer.appendChild(highlightGroup);

        // Make saved highlight interactive if highlight tool is available
        if (this.highlightTool && typeof this.highlightTool.makeHighlightInteractive === 'function') {
            this.highlightTool.makeHighlightInteractive(highlightGroup);
            console.log(`[PdfxViewer] Made saved highlight interactive: ${highlight.id}`);
        }
    }

    renderTextAnnotations(textAnnotations) {
        console.log(`[PdfxViewer] Rendering text annotations for ${Object.keys(textAnnotations).length} pages`);

        // First, clear all existing saved text annotations to prevent duplicates
        this.clearExistingSavedTextAnnotations();

        Object.entries(textAnnotations).forEach(([pageNum, pageTexts]) => {
            const page = parseInt(pageNum);
            if (!Array.isArray(pageTexts)) return;

            console.log(`[PdfxViewer] Rendering ${pageTexts.length} text annotations for page ${page}`);

            // Try multiple selectors to find the page container (PDF.js can use different patterns)
            let pageContainer = null;

            // Method 1: Try data-page-number attribute
            pageContainer = document.querySelector(`#pdfx-block-${this.blockId} .page[data-page-number="${page}"]`);

            if (!pageContainer) {
                // Method 2: Try pageContainer ID pattern
                pageContainer = document.querySelector(`#pageContainer${page}`);
            }

            if (!pageContainer) {
                // Method 3: Try finding by index (0-based index for page 1, etc.)
                const allPages = document.querySelectorAll(`#viewerContainer-${this.blockId} .page`);
                if (allPages.length >= page) {
                    pageContainer = allPages[page - 1]; // Convert 1-based to 0-based index
                }
            }

            if (!pageContainer) {
                console.warn(`[PdfxViewer] Could not find page container for page ${page}, text annotations skipped`);
                return;
            }

            console.log(`[PdfxViewer] Found page container for page ${page}:`, pageContainer.id || pageContainer.className);

            pageTexts.forEach(textAnnotation => {
                if (!textAnnotation.data) {
                    console.warn(`[PdfxViewer] Text annotation missing data:`, textAnnotation);
                    return;
                }

                // Check if this text annotation already exists to prevent duplicates
                const existingTextAnnotation = pageContainer.querySelector(`[data-annotation-id="${textAnnotation.id}"]`);
                if (existingTextAnnotation) {
                    console.log(`[PdfxViewer] Text annotation ${textAnnotation.id} already exists, skipping render`);
                    return;
                }

                const textBox = document.createElement('div');
                textBox.className = 'text-annotation-final saved-text-annotation';
                textBox.textContent = textAnnotation.data.text || '';
                textBox.style.position = 'absolute';

                // Use percentage data if available for zoom-scalable positioning
                if (textAnnotation.data.percentageData) {
                    const pageRect = pageContainer.getBoundingClientRect();
                    const percentData = textAnnotation.data.percentageData;

                    textBox.style.left = `${(percentData.xPercent / 100) * pageRect.width}px`;
                    textBox.style.top = `${(percentData.yPercent / 100) * pageRect.height}px`;
                    textBox.style.fontSize = `${(percentData.fontSizePercent / 100) * pageRect.height}px`;

                    // Store percentage data for zoom handling
                    textBox.setAttribute('data-percentage-position', JSON.stringify(percentData));
                } else {
                    // Fallback to pixel positioning for legacy annotations
                    textBox.style.left = `${textAnnotation.data.x || 0}px`;
                    textBox.style.top = `${textAnnotation.data.y || 0}px`;
                    textBox.style.fontSize = `${textAnnotation.data.fontSize || 16}px`;
                }

                textBox.style.color = textAnnotation.data.color || '#000000';
                textBox.style.fontFamily = textAnnotation.data.fontFamily || 'Arial, sans-serif';
                textBox.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                textBox.style.border = '1px solid #ccc';
                textBox.style.borderRadius = '3px';
                textBox.style.padding = '5px';
                textBox.style.zIndex = '30';
                textBox.style.cursor = 'pointer';
                textBox.style.whiteSpace = 'pre-wrap';
                textBox.style.wordWrap = 'break-word';
                textBox.style.minWidth = '140px';
                textBox.style.minHeight = '20px';

                // Add data attribute for identification
                textBox.setAttribute('data-annotation-id', textAnnotation.id);

                // Add double-click to edit functionality
                textBox.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    console.log(`[PdfxViewer] Double-clicked saved text annotation for editing:`, textAnnotation.id);
                    // TODO: Implement edit functionality for saved text annotations
                });

                // Make page relative positioned if not already
                if (getComputedStyle(pageContainer).position === 'static') {
                    pageContainer.style.position = 'relative';
                }

                pageContainer.appendChild(textBox);
                console.log(`[PdfxViewer] Rendered text annotation "${textAnnotation.data.text}" on page ${page}`);
            });
        });
    }

    renderShapeAnnotations(shapeAnnotations) {
        console.log(`[PdfxViewer] Rendering shape annotations for ${Object.keys(shapeAnnotations).length} pages`);

        Object.entries(shapeAnnotations).forEach(([pageNum, pageShapes]) => {
            const page = parseInt(pageNum);
            if (!Array.isArray(pageShapes)) return;

            // Find the page container
            const pageContainer = document.querySelector(`#pdfx-block-${this.blockId} .page[data-page-number="${page}"]`);
            if (!pageContainer) return;

            pageShapes.forEach(shape => {
                if (!shape.data) return;

                if (shape.data.imageDataUrl) {
                    // Render stamp/image as simple img element first
                    // StampTool will recreate proper containers later
                    const img = document.createElement('img');
                    img.src = shape.data.imageDataUrl;
                    img.style.position = 'absolute';
                    img.style.zIndex = '30';

                    // Use percentage data if available for zoom-scalable positioning
                    if (shape.data.percentageData) {
                        const pageRect = pageContainer.getBoundingClientRect();
                        const percentData = shape.data.percentageData;

                        img.style.left = `${(percentData.xPercent / 100) * pageRect.width}px`;
                        img.style.top = `${(percentData.yPercent / 100) * pageRect.height}px`;
                        img.style.width = `${(percentData.widthPercent / 100) * pageRect.width}px`;
                        img.style.height = `${(percentData.heightPercent / 100) * pageRect.height}px`;
                    } else {
                        // Fallback to pixel positioning for legacy stamps
                        img.style.left = `${shape.data.x || 0}px`;
                        img.style.top = `${shape.data.y || 0}px`;
                        img.style.width = `${shape.data.width || 100}px`;
                        img.style.height = `${shape.data.height || 100}px`;
                    }

                    // Store the original annotation ID as a data attribute
                    if (shape.id) {
                        img.setAttribute('data-annotation-id', shape.id);
                    }

                    pageContainer.style.position = 'relative';
                    pageContainer.appendChild(img);

                    console.log(`[PdfxViewer] Rendered saved stamp with ID: ${shape.id}`);
                }
            });
        });

        // After rendering all shape annotations, recreate proper stamp containers
        if (this.stampTool) {
            // Use setTimeout to ensure all DOM elements are fully rendered
            setTimeout(() => {
                this.stampTool.recreateSavedStamps();
            }, 100);
        }
    }

    async saveAnnotations(annotationData) {
        console.log('[PdfxViewer] Delegating annotation saving to AnnotationStorage system', annotationData);
        // NOTE: Annotation saving is now handled by the modern AnnotationStorage system
        // in src/storage/AnnotationStorage.js with proper CSRF handling and auto-save
        // Individual tools automatically save through the storageManager instance
        return { result: 'delegated_to_storage_system' };
    }

    clearAllAnnotations() {
        if (confirm('Are you sure you want to clear all annotations?')) {
            console.log(`[PdfxViewer] Clearing all annotations`);
            this.saveAnnotations({ _deletionOnly: true, _clearAll: true });
        }
    }

    // Navigation methods
    previousPage() {
        if (this.pdfViewer && this.pdfViewer.currentPageNumber > 1) {
            this.pdfViewer.currentPageNumber--;
        }
    }

    nextPage() {
        if (this.pdfViewer && this.pdfViewer.currentPageNumber < this.pdfDocument.numPages) {
            this.pdfViewer.currentPageNumber++;
        }
    }

    goToPage(pageNumber) {
        if (this.pdfViewer && pageNumber >= 1 && pageNumber <= this.pdfDocument.numPages) {
            this.pdfViewer.currentPageNumber = pageNumber;
        }
    }

    // Zoom methods
    zoomIn() {
        if (this.pdfViewer) {
            const newScale = Math.min(this.pdfViewer.currentScale * 1.1, 10);
            this.pdfViewer.currentScale = newScale;
        }
    }

    zoomOut() {
        if (this.pdfViewer) {
            const newScale = Math.max(this.pdfViewer.currentScale / 1.1, 0.1);
            this.pdfViewer.currentScale = newScale;
        }
    }

    setZoom(value) {
        if (!this.pdfViewer) return;

        switch (value) {
            case 'auto':
                this.pdfViewer.currentScaleValue = 'auto';
                break;
            case 'page-actual':
                this.pdfViewer.currentScaleValue = 'page-actual';
                break;
            case 'page-fit':
                this.pdfViewer.currentScaleValue = 'page-fit';
                break;
            case 'page-width':
                this.pdfViewer.currentScaleValue = 'page-width';
                break;
            default:
                this.pdfViewer.currentScale = parseFloat(value);
                break;
        }
    }

    updateZoomDisplay(scale) {
        const scaleSelect = document.getElementById(`scaleSelect-${this.blockId}`);
        if (scaleSelect) {
            const scaleValue = (scale * 100).toFixed(0);
            const customOption = document.getElementById(`customScaleOption-${this.blockId}`);

            // Check if it matches a predefined scale
            let found = false;
            for (let option of scaleSelect.options) {
                if (option.value === scale.toString()) {
                    scaleSelect.value = option.value;
                    found = true;
                    break;
                }
            }

            // If not found, use custom option
            if (!found && customOption) {
                customOption.textContent = `${scaleValue}%`;
                customOption.value = 'custom';
                customOption.removeAttribute('hidden');
                scaleSelect.value = 'custom';
            }
        }
    }

    // Download functionality moved to DownloadTool.js - remove this old method

    // Utility methods
    updateLoadingProgress(percent) {
        const progressBar = document.querySelector(`#loadingBar-${this.blockId} .progress`);
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
    }

    showError(message) {
        console.error(`[PdfxViewer] Error: ${message}`);

        const errorWrapper = document.getElementById(`errorWrapper-${this.blockId}`);
        const errorMessage = document.getElementById(`errorMessage-${this.blockId}`);

        if (errorWrapper && errorMessage) {
            errorMessage.textContent = message;
            errorWrapper.removeAttribute('hidden');
        }

        // Hide loading elements
        const loadingBar = document.getElementById(`loadingBar-${this.blockId}`);
        if (loadingBar) {
            loadingBar.classList.add('hidden');
        }

        const outerContainer = document.getElementById(`outerContainer-${this.blockId}`);
        if (outerContainer) {
            outerContainer.classList.remove('loadingInProgress');
        }
    }

    hideError() {
        const errorWrapper = document.getElementById(`errorWrapper-${this.blockId}`);
        if (errorWrapper) {
            errorWrapper.setAttribute('hidden', 'true');
        }
    }

    saveCurrentPage(pageNumber) {
        // Update internal state
        this.currentPage = pageNumber;

        // Also update storage manager if available
        if (this.annotationStorage) {
            this.annotationStorage.currentPage = pageNumber;
        }

        // Save current page to XBlock
        this.saveAnnotations({ currentPage: pageNumber });
    }

    cleanup() {
        // Clean up all tools
        if (this.highlightTool) {
            this.highlightTool.cleanup();
        }
        if (this.scribbleTool) {
            this.scribbleTool.cleanup();
        }
        if (this.textTool) {
            this.textTool.cleanup();
        }
        if (this.stampTool) {
            this.stampTool.cleanup();
        }
        if (this.clearTool) {
            this.clearTool.cleanup();
        }
        if (this.manualSaveTool) {
            this.manualSaveTool.destroy();
        }
        if (this.downloadTool) {
            this.downloadTool.cleanup();
        }
    }

    /**
     * Manually restart annotation saving after failures
     */
    restartAnnotationSaving() {
        if (this.annotationStorage) {
            console.log(`[PdfxViewer] Manually restarting annotation saving`);
            this.annotationStorage.restartAutoSave();

            // Show success notification
            const successNotification = document.createElement('div');
            successNotification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #28a745;
                color: white;
                padding: 15px 20px;
                border-radius: 5px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                font-family: Arial, sans-serif;
                font-size: 14px;
            `;
            successNotification.innerHTML = `
                <div style="font-weight: bold;">✅ Annotation Saving Restarted</div>
                <div style="margin-top: 5px; font-size: 12px;">Auto-save has been restored. Your annotations will now be saved automatically.</div>
            `;

            document.body.appendChild(successNotification);

            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (successNotification.parentNode) {
                    successNotification.remove();
                }
            }, 5000);
        } else {
            console.warn(`[PdfxViewer] No annotation storage available to restart`);
        }
    }
}

// Global initialization function for XBlock
window.PdfxXBlockInit = function(runtime, element) {
    console.log('[PdfxXBlockInit] Initializing PDF.js XBlock viewer');
    console.log('[PdfxXBlockInit] Element:', element);
    console.log('[PdfxXBlockInit] Element dataset:', element.dataset);

    // Find the main pdfx-block element if element is the wrapper
    let pdfxElement = element;
    if (!element.dataset.blockId) {
        pdfxElement = element.querySelector('[data-block-id]');
        if (!pdfxElement) {
            console.error('[PdfxXBlockInit] No element with data-block-id found');
            return null;
        }
    }

    const blockId = pdfxElement.dataset.blockId;
    if (!blockId) {
        console.error('[PdfxXBlockInit] No block ID found in element dataset');
        return null;
    }

    // Extract configuration from data attributes
    console.log('[PdfxXBlockInit] Raw allowAnnotation value:', pdfxElement.dataset.allowAnnotation);
    console.log('[PdfxXBlockInit] Raw allowDownload value:', pdfxElement.dataset.allowDownload);

    const config = {
        blockId: blockId,
        pdfUrl: pdfxElement.dataset.pdfUrl || '',
        pdfFileName: pdfxElement.dataset.pdfFileName || pdfxElement.dataset.pdfFilename || '', // Add original filename
        allowDownload: pdfxElement.dataset.allowDownload === 'true',
        // TEMPORARY FIX: Force annotations to be enabled for frontend testing
        allowAnnotation: true, // pdfxElement.dataset.allowAnnotation === 'true',
        currentPage: parseInt(pdfxElement.dataset.currentPage) || 1,
        userId: pdfxElement.dataset.userId || 'anonymous',
        courseId: pdfxElement.dataset.courseId || '',
        handlerUrl: pdfxElement.dataset.handlerUrl || '',
        drawingStrokes: safeJsonParse(pdfxElement.dataset.drawingStrokes, {}),
        highlights: safeJsonParse(pdfxElement.dataset.highlights, {}),
        markerStrokes: safeJsonParse(pdfxElement.dataset.markerStrokes, {}),
        textAnnotations: safeJsonParse(pdfxElement.dataset.textAnnotations, {}),
        shapeAnnotations: safeJsonParse(pdfxElement.dataset.shapeAnnotations, {})
    };

    console.log(`[PdfxXBlockInit] Configuration:`, config);

    // Validate critical configuration
    if (!config.pdfUrl) {
        console.error('[PdfxXBlockInit] No PDF URL found in configuration');
        console.error('[PdfxXBlockInit] Element data attributes:', pdfxElement.dataset);
        console.error('[PdfxXBlockInit] Please check that pdf_url is properly set in the XBlock template');
    }

    // Create viewer instance
    const viewer = new PdfxViewer(blockId, config);

    // Store reference for debugging
    window[`pdfxViewer_${blockId}`] = viewer;

    return viewer;
};

// Global function to restart annotation saving (for debugging/recovery)
window.restartPdfxAnnotationSaving = function(blockId) {
    if (blockId) {
        const viewer = window[`pdfxViewer_${blockId}`];
        if (viewer) {
            viewer.restartAnnotationSaving();
            console.log(`[Global] Restarted annotation saving for block: ${blockId}`);
        } else {
            console.error(`[Global] No viewer found for block: ${blockId}`);
        }
    } else {
        // Find all viewers and restart them
        const viewers = Object.keys(window).filter(key => key.startsWith('pdfxViewer_'));
        console.log(`[Global] Found ${viewers.length} PDF viewers, restarting all...`);

        viewers.forEach(viewerKey => {
            const viewer = window[viewerKey];
            if (viewer && viewer.restartAnnotationSaving) {
                viewer.restartAnnotationSaving();
                console.log(`[Global] Restarted annotation saving for ${viewerKey}`);
            }
        });

        if (viewers.length === 0) {
            console.warn(`[Global] No PDF viewers found to restart`);
        }
    }
};

// Global function to test highlight percentage positioning (for debugging)
window.testHighlightPositioning = function(blockId) {
    if (blockId) {
        const viewer = window[`pdfxViewer_${blockId}`];
        if (viewer && viewer.highlightTool) {
            viewer.highlightTool.testPercentagePositioning();
        } else {
            console.error(`[Global] No viewer or highlight tool found for block: ${blockId}`);
        }
    } else {
        // Find all viewers and test them
        const viewers = Object.keys(window).filter(key => key.startsWith('pdfxViewer_'));
        console.log(`[Global] Found ${viewers.length} PDF viewers, testing all...`);

        viewers.forEach(viewerKey => {
            const viewer = window[viewerKey];
            if (viewer && viewer.highlightTool && viewer.highlightTool.testPercentagePositioning) {
                console.log(`[Global] Testing ${viewerKey}:`);
                viewer.highlightTool.testPercentagePositioning();
            }
        });

        if (viewers.length === 0) {
            console.warn(`[Global] No PDF viewers found to test`);
        }
    }
};

// Global function to manually trigger highlight repositioning (for debugging)
window.repositionHighlights = function(blockId) {
    if (blockId) {
        const viewer = window[`pdfxViewer_${blockId}`];
        if (viewer && viewer.highlightTool) {
            console.log(`[Global] Manually repositioning highlights for block: ${blockId}`);
            viewer.highlightTool.repositionAllHighlights();
        } else {
            console.error(`[Global] No viewer or highlight tool found for block: ${blockId}`);
        }
    } else {
        // Find all viewers and reposition highlights
        const viewers = Object.keys(window).filter(key => key.startsWith('pdfxViewer_'));
        console.log(`[Global] Found ${viewers.length} PDF viewers, repositioning all...`);

        viewers.forEach(viewerKey => {
            const viewer = window[viewerKey];
            if (viewer && viewer.highlightTool && viewer.highlightTool.repositionAllHighlights) {
                console.log(`[Global] Repositioning highlights for ${viewerKey}`);
                viewer.highlightTool.repositionAllHighlights();
            }
        });

        if (viewers.length === 0) {
            console.warn(`[Global] No PDF viewers found to reposition`);
        }
    }
};

// Global function to debug ScribbleTool drawing data (for debugging)
window.debugScribbleData = function(blockId) {
    if (blockId) {
        const viewer = window[`pdfxViewer_${blockId}`];
        if (viewer && viewer.scribbleTool) {
            viewer.scribbleTool.debugDrawingData();
        } else {
            console.error(`[Global] No viewer or scribble tool found for block: ${blockId}`);
        }
    } else {
        // Find all viewers and debug them
        const viewers = Object.keys(window).filter(key => key.startsWith('pdfxViewer_'));
        console.log(`[Global] Found ${viewers.length} PDF viewers, debugging all...`);

        viewers.forEach(viewerKey => {
            const viewer = window[viewerKey];
            if (viewer && viewer.scribbleTool && viewer.scribbleTool.debugDrawingData) {
                console.log(`[Global] Debugging ${viewerKey}:`);
                viewer.scribbleTool.debugDrawingData();
            }
        });

        if (viewers.length === 0) {
            console.warn(`[Global] No PDF viewers found to debug`);
        }
    }
};

// Global function to test context menu behavior (for debugging)
window.testContextMenu = function(blockId) {
    if (blockId) {
        const viewer = window[`pdfxViewer_${blockId}`];
        if (viewer && viewer.highlightTool) {
            const contextMenu = document.getElementById(`highlight-context-menu-${blockId}`);
            console.log(`[Global] Context menu for block ${blockId}:`, contextMenu);
            console.log(`[Global] Context menu classes:`, contextMenu ? contextMenu.className : 'not found');
            console.log(`[Global] Context menu visible:`, contextMenu ? contextMenu.classList.contains('visible') && !contextMenu.classList.contains('hidden') : 'not found');

            const highlights = document.querySelectorAll(`#viewerContainer-${blockId} .highlight-group`);
            console.log(`[Global] Found ${highlights.length} highlights for testing`);

            highlights.forEach((highlight, index) => {
                const id = highlight.getAttribute('data-annotation-id');
                console.log(`[Global] Highlight ${index} (${id}): clickable=${highlight.style.pointerEvents !== 'none'}`);
            });
        } else {
            console.error(`[Global] No viewer or highlight tool found for block: ${blockId}`);
        }
    } else {
        // Find all viewers and test context menus
        const viewers = Object.keys(window).filter(key => key.startsWith('pdfxViewer_'));
        console.log(`[Global] Found ${viewers.length} PDF viewers, testing all context menus...`);

        viewers.forEach(viewerKey => {
            const blockId = viewerKey.replace('pdfxViewer_', '');
            console.log(`[Global] Testing context menu for ${viewerKey}:`);
            window.testContextMenu(blockId);
        });

        if (viewers.length === 0) {
            console.warn(`[Global] No PDF viewers found to test`);
        }
    }
};

// Helper function to safely parse JSON from data attributes
function safeJsonParse(jsonString, defaultValue = null) {
    if (!jsonString || jsonString.trim() === '') {
        return defaultValue;
    }
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.warn('[PdfxXBlockInit] Failed to parse JSON:', jsonString.substring(0, 100), error);
        return defaultValue;
    }
}