/**
 * AnnotationStorage - Manages annotation data persistence
 *
 * Handles saving, loading, and caching of annotations
 */

import { EventEmitter } from '../utils/EventEmitter.js';

export class AnnotationStorage extends EventEmitter {
    constructor(options = {}) {
        super();

        this.blockId = options.blockId;
        this.userId = options.userId || 'anonymous';
        this.courseId = options.courseId || '';
        this.handlerUrl = options.handlerUrl;

        // Storage configuration
        this.config = {
            autoSave: true,
            saveInterval: 10000, // 10 seconds
            cacheExpiry: 3600000, // 1 hour
            ...options.config
        };

        // Cache
        this.annotationCache = new Map();
        this.dirtyPages = new Set();

        // Save state
        this.isSaving = false;
        this.saveQueue = [];
        this.autoSaveTimer = null;

        // Bind methods
        this._bindMethods();

        // Start auto-save if enabled
        if (this.config.autoSave) {
            this._startAutoSave();
        }
    }

    /**
     * Save annotation
     */
    async saveAnnotation(annotation) {
        try {
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

            this.emit('annotationCached', annotation);

            // Save immediately if not auto-saving
            if (!this.config.autoSave) {
                await this._processSaveQueue();
            }

        } catch (error) {
            console.error('[AnnotationStorage] Error saving annotation:', error);
            this.emit('error', error);
        }
    }

    /**
     * Delete annotation
     */
    async deleteAnnotation(annotation) {
        try {
            // Remove from cache
            this.annotationCache.delete(annotation.id);

            // Mark page as dirty
            this.dirtyPages.add(annotation.pageNum);

            // Add to save queue
            this.saveQueue.push({
                type: 'delete',
                annotation: annotation,
                timestamp: Date.now()
            });

            this.emit('annotationDeleted', annotation);

            // Save immediately if not auto-saving
            if (!this.config.autoSave) {
                await this._processSaveQueue();
            }

        } catch (error) {
            console.error('[AnnotationStorage] Error deleting annotation:', error);
            this.emit('error', error);
        }
    }

    /**
     * Load annotations from server
     */
    async loadAnnotations(existingData = {}) {
        try {
            console.debug('[AnnotationStorage] Loading annotations from server');

            if (!this.handlerUrl) {
                console.warn('[AnnotationStorage] No handler URL provided, using existing data only');
                return existingData;
            }

            // Try to load from server
            const response = await this._makeRequest('GET', this.handlerUrl + '?action=load');

            if (response.success && response.data) {
                // Merge with existing data
                const mergedData = { ...existingData, ...response.data };

                // Cache loaded annotations
                this._cacheAnnotations(mergedData);

                console.debug('[AnnotationStorage] Annotations loaded successfully');

                this.emit('annotationsLoaded', mergedData);

                return mergedData;
            } else {
                console.warn('[AnnotationStorage] Failed to load from server, using existing data');
                return existingData;
            }

        } catch (error) {
            console.error('[AnnotationStorage] Error loading annotations:', error);
            this.emit('error', error);
            return existingData;
        }
    }

    /**
     * Process save queue
     */
    async _processSaveQueue() {
        if (this.isSaving || this.saveQueue.length === 0) {
            return;
        }

        this.isSaving = true;

        try {
            // Prepare data to save
            const saveData = this._prepareSaveData();

            if (!saveData || Object.keys(saveData).length === 0) {
                this.isSaving = false;
                return;
            }

            console.debug('[AnnotationStorage] Saving annotations to server');

            // Save to server
            if (this.handlerUrl) {
                const response = await this._makeRequest('POST', this.handlerUrl, {
                    action: 'save',
                    data: saveData,
                    userId: this.userId,
                    courseId: this.courseId,
                    blockId: this.blockId
                });

                if (response.success) {
                    // Clear save queue and dirty pages
                    this.saveQueue = [];
                    this.dirtyPages.clear();

                    console.debug('[AnnotationStorage] Annotations saved successfully');

                    this.emit('annotationsSaved', saveData);
                } else {
                    console.error('[AnnotationStorage] Server save failed:', response.error);
                    this.emit('error', new Error(response.error || 'Save failed'));
                }
            }

        } catch (error) {
            console.error('[AnnotationStorage] Error processing save queue:', error);
            this.emit('error', error);
        } finally {
            this.isSaving = false;
        }
    }

    /**
     * Prepare data for saving
     */
    _prepareSaveData() {
        const saveData = {};

        // Group annotations by type and page
        for (const annotation of this.annotationCache.values()) {
            const type = annotation.type;
            const pageNum = annotation.pageNum;

            if (!saveData[type]) {
                saveData[type] = {};
            }

            if (!saveData[type][pageNum]) {
                saveData[type][pageNum] = [];
            }

            saveData[type][pageNum].push({
                id: annotation.id,
                timestamp: annotation.timestamp,
                userId: annotation.userId,
                data: annotation.data,
                config: annotation.config
            });
        }

        return saveData;
    }

    /**
     * Cache annotations from loaded data
     */
    _cacheAnnotations(annotationsData) {
        for (const [type, typeData] of Object.entries(annotationsData)) {
            for (const [pageNum, pageAnnotations] of Object.entries(typeData)) {
                const page = parseInt(pageNum, 10);

                if (Array.isArray(pageAnnotations)) {
                    for (const annotationData of pageAnnotations) {
                        const annotation = {
                            id: annotationData.id,
                            type: type,
                            pageNum: page,
                            timestamp: annotationData.timestamp || Date.now(),
                            userId: annotationData.userId || this.userId,
                            data: annotationData.data || annotationData,
                            config: annotationData.config || {}
                        };

                        this.annotationCache.set(annotation.id, annotation);
                    }
                }
            }
        }
    }

    /**
     * Make HTTP request
     */
    async _makeRequest(method, url, data = null) {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        // Add CSRF token if available
        const csrfToken = document.querySelector('meta[name="csrf-token"]');
        if (csrfToken) {
            options.headers['X-CSRFToken'] = csrfToken.getAttribute('content');
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Start auto-save timer
     */
    _startAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        this.autoSaveTimer = setInterval(() => {
            this._processSaveQueue();
        }, this.config.saveInterval);

        console.debug(`[AnnotationStorage] Auto-save started with ${this.config.saveInterval}ms interval`);
    }

    /**
     * Stop auto-save timer
     */
    _stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    /**
     * Force save all pending changes
     */
    async forceSave() {
        await this._processSaveQueue();
    }

    /**
     * Get annotations for a specific page
     */
    getAnnotationsForPage(pageNum, type = null) {
        const annotations = [];

        for (const annotation of this.annotationCache.values()) {
            if (annotation.pageNum === pageNum) {
                if (!type || annotation.type === type) {
                    annotations.push(annotation);
                }
            }
        }

        return annotations;
    }

    /**
     * Get all annotations
     */
    getAllAnnotations() {
        return Array.from(this.annotationCache.values());
    }

    /**
     * Get annotations by type
     */
    getAnnotationsByType(type) {
        const annotations = [];

        for (const annotation of this.annotationCache.values()) {
            if (annotation.type === type) {
                annotations.push(annotation);
            }
        }

        return annotations;
    }

    /**
     * Clear all annotations
     */
    clearAllAnnotations() {
        this.annotationCache.clear();
        this.dirtyPages.clear();
        this.saveQueue = [];

        this.emit('allAnnotationsCleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStatistics() {
        const stats = {
            totalAnnotations: this.annotationCache.size,
            dirtyPages: Array.from(this.dirtyPages),
            pendingSaves: this.saveQueue.length,
            autoSaveEnabled: this.config.autoSave,
            isSaving: this.isSaving
        };

        // Count by type
        stats.byType = {};
        for (const annotation of this.annotationCache.values()) {
            if (!stats.byType[annotation.type]) {
                stats.byType[annotation.type] = 0;
            }
            stats.byType[annotation.type]++;
        }

        return stats;
    }

    /**
     * Bind methods to preserve context
     */
    _bindMethods() {
        this.saveAnnotation = this.saveAnnotation.bind(this);
        this.deleteAnnotation = this.deleteAnnotation.bind(this);
        this.loadAnnotations = this.loadAnnotations.bind(this);
        this._processSaveQueue = this._processSaveQueue.bind(this);
    }

    /**
     * Destroy the storage manager
     */
    destroy() {
        console.debug('[AnnotationStorage] Destroying annotation storage');

        // Stop auto-save
        this._stopAutoSave();

        // Force save pending changes
        this._processSaveQueue().catch(error => {
            console.error('[AnnotationStorage] Error in final save:', error);
        });

        // Clear cache
        this.annotationCache.clear();
        this.dirtyPages.clear();
        this.saveQueue = [];

        // Remove all event listeners
        this.removeAllListeners();
    }
}

export default AnnotationStorage;