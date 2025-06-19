/**
 * AnnotationInterface - Central interface for annotation storage operations
 *
 * Provides a simplified API for tools to save, load, and manage annotations
 * without dealing with storage implementation details.
 */

import { EventEmitter } from '../utils/EventEmitter.js';

export class AnnotationInterface extends EventEmitter {
    constructor(storageManager, options = {}) {
        super();

        this.storageManager = storageManager;
        this.blockId = options.blockId;
        this.userId = options.userId;
        this.courseId = options.courseId;

        console.log(`[AnnotationInterface] Initialized for block: ${this.blockId}, user: ${this.userId}`);

        // Bind methods
        this._bindMethods();

        // Setup storage event forwarding
        this._setupStorageEventForwarding();
    }

    /**
     * Save a single annotation
     */
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

    /**
     * Delete a single annotation
     */
    async deleteAnnotation(annotation) {
        if (!this.storageManager) {
            console.warn('[AnnotationInterface] No storage manager available');
            return false;
        }

        try {
            console.log(`[AnnotationInterface] Deleting annotation:`, annotation.id);

            await this.storageManager.deleteAnnotation(annotation);

            this.emit('annotationDeleted', annotation);
            return true;

        } catch (error) {
            console.error('[AnnotationInterface] Error deleting annotation:', error);
            this.emit('error', error);
            return false;
        }
    }

    /**
     * Save multiple annotations for a specific type and page
     */
    async saveAnnotationsForPage(annotationType, pageNum, annotations) {
        if (!this.storageManager) {
            console.warn('[AnnotationInterface] No storage manager available');
            return false;
        }

        try {
            console.log(`[AnnotationInterface] Saving ${annotations.length} ${annotationType} annotations for page ${pageNum}`);

            // Process each annotation
            for (const annotation of annotations) {
                annotation.type = annotationType;
                annotation.pageNum = pageNum;
                annotation.userId = this.userId;
                annotation.blockId = this.blockId;
                annotation.timestamp = annotation.timestamp || Date.now();

                await this.storageManager.saveAnnotation(annotation);
            }

            this.emit('annotationsSaved', {
                type: annotationType,
                pageNum: pageNum,
                count: annotations.length
            });

            return true;

        } catch (error) {
            console.error('[AnnotationInterface] Error saving annotations for page:', error);
            this.emit('error', error);
            return false;
        }
    }

    /**
     * Load annotations for a specific type
     */
    getAnnotationsByType(annotationType) {
        if (!this.storageManager) {
            console.warn('[AnnotationInterface] No storage manager available');
            return {};
        }

        return this.storageManager.getAnnotationsByType(annotationType);
    }

    /**
     * Load annotations for a specific page
     */
    getAnnotationsForPage(pageNum, annotationType = null) {
        if (!this.storageManager) {
            console.warn('[AnnotationInterface] No storage manager available');
            return [];
        }

        return this.storageManager.getAnnotationsForPage(pageNum, annotationType);
    }

    /**
     * Clear all annotations for a specific type
     */
    async clearAnnotationsByType(annotationType) {
        if (!this.storageManager) {
            console.warn('[AnnotationInterface] No storage manager available');
            return false;
        }

        try {
            const annotations = this.storageManager.getAnnotationsByType(annotationType);

            // Delete each annotation
            for (const pageNum in annotations) {
                const pageAnnotations = annotations[pageNum];
                for (const annotation of pageAnnotations) {
                    await this.storageManager.deleteAnnotation(annotation);
                }
            }

            console.log(`[AnnotationInterface] Cleared all ${annotationType} annotations`);
            this.emit('annotationsCleared', { type: annotationType });

            return true;

        } catch (error) {
            console.error(`[AnnotationInterface] Error clearing ${annotationType} annotations:`, error);
            this.emit('error', error);
            return false;
        }
    }

    /**
     * Clear all annotations for a specific page
     */
    async clearAnnotationsForPage(pageNum) {
        if (!this.storageManager) {
            console.warn('[AnnotationInterface] No storage manager available');
            return false;
        }

        try {
            const annotations = this.storageManager.getAnnotationsForPage(pageNum);

            // Delete each annotation
            for (const annotation of annotations) {
                await this.storageManager.deleteAnnotation(annotation);
            }

            console.log(`[AnnotationInterface] Cleared all annotations for page ${pageNum}`);
            this.emit('pageCleared', { pageNum: pageNum, count: annotations.length });

            return true;

        } catch (error) {
            console.error(`[AnnotationInterface] Error clearing page ${pageNum} annotations:`, error);
            this.emit('error', error);
            return false;
        }
    }

    /**
     * Clear all annotations
     */
    async clearAllAnnotations() {
        if (!this.storageManager) {
            console.warn('[AnnotationInterface] No storage manager available');
            return false;
        }

        try {
            this.storageManager.clearAllAnnotations();

            console.log(`[AnnotationInterface] Cleared all annotations for user ${this.userId}`);
            this.emit('allCleared');

            return true;

        } catch (error) {
            console.error('[AnnotationInterface] Error clearing all annotations:', error);
            this.emit('error', error);
            return false;
        }
    }

    /**
     * Force save all pending changes
     */
    async forceSave() {
        if (!this.storageManager) {
            console.warn('[AnnotationInterface] No storage manager available');
            return false;
        }

        try {
            await this.storageManager.forceSave();
            console.log(`[AnnotationInterface] Force save completed`);
            return true;

        } catch (error) {
            console.error('[AnnotationInterface] Error during force save:', error);
            this.emit('error', error);
            return false;
        }
    }

    /**
     * Set tool activity status for enhanced saving
     */
    setToolActive(isActive) {
        if (this.storageManager && this.storageManager.setToolActive) {
            this.storageManager.setToolActive(isActive);
        }
    }

    /**
     * Get storage statistics
     */
    getStorageStatistics() {
        if (!this.storageManager) {
            return {
                totalAnnotations: 0,
                annotationsByType: {},
                annotationsByPage: {},
                dirtyPages: [],
                pendingSaves: 0,
                pendingDeletes: 0
            };
        }

        return this.storageManager.getCacheStatistics();
    }

    /**
     * Setup storage event forwarding
     */
    _setupStorageEventForwarding() {
        if (!this.storageManager) {
            return;
        }

        // Forward storage events
        this.storageManager.on('annotationCached', (annotation) => {
            this.emit('annotationCached', annotation);
        });

        this.storageManager.on('annotationDeleted', (annotation) => {
            this.emit('annotationDeleted', annotation);
        });

        this.storageManager.on('annotationsLoaded', (data) => {
            this.emit('annotationsLoaded', data);
        });

        this.storageManager.on('annotationsSaved', (data) => {
            this.emit('annotationsSaved', data);
        });

        this.storageManager.on('error', (error) => {
            this.emit('error', error);
        });

        this.storageManager.on('allAnnotationsCleared', (count) => {
            this.emit('allAnnotationsCleared', count);
        });
    }

    /**
     * Bind methods to this context
     */
    _bindMethods() {
        this.saveAnnotation = this.saveAnnotation.bind(this);
        this.deleteAnnotation = this.deleteAnnotation.bind(this);
        this.saveAnnotationsForPage = this.saveAnnotationsForPage.bind(this);
        this.getAnnotationsByType = this.getAnnotationsByType.bind(this);
        this.getAnnotationsForPage = this.getAnnotationsForPage.bind(this);
        this.clearAnnotationsByType = this.clearAnnotationsByType.bind(this);
        this.clearAnnotationsForPage = this.clearAnnotationsForPage.bind(this);
        this.clearAllAnnotations = this.clearAllAnnotations.bind(this);
        this.forceSave = this.forceSave.bind(this);
        this.setToolActive = this.setToolActive.bind(this);
    }

    /**
     * Cleanup and destroy interface
     */
    destroy() {
        console.log(`[AnnotationInterface] Destroying annotation interface for block: ${this.blockId}`);

        // Remove all listeners
        this.removeAllListeners();

        // Clear references
        this.storageManager = null;
    }
}

export default AnnotationInterface;