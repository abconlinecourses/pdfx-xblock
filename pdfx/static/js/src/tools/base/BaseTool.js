/**
 * BaseTool - Abstract base class for all annotation tools
 *
 * Provides common functionality and interface for all tools
 */

import { EventEmitter } from '../../utils/EventEmitter.js';

export class BaseTool extends EventEmitter {
    constructor(options = {}) {
        super();

        this.name = options.name || 'base';
        this.blockId = options.blockId;
        this.container = options.container;
        this.pdfManager = options.pdfManager;
        this.storageManager = options.storageManager;

        // Tool state
        this.isEnabled = false;
        this.isActive = false;
        this.currentPage = 1;

        // Configuration
        this.config = {
            color: options.color || '#FF0000',
            size: options.size || 5,
            opacity: options.opacity || 1.0,
            ...options.config
        };

        // Annotations for this tool
        this.annotations = new Map();
        this.annotationsByPage = new Map();

        // Event handlers
        this.eventHandlers = new Map();

        // Bind methods
        this._bindMethods();
    }

    /**
     * Initialize the tool
     * Must be implemented by subclasses
     */
    async init() {
        throw new Error('init() must be implemented by subclass');
    }

    /**
     * Enable the tool (make it available but not necessarily active)
     * Must be implemented by subclasses
     */
    enable() {
        throw new Error('enable() must be implemented by subclass');
    }

    /**
     * Disable the tool
     * Must be implemented by subclasses
     */
    disable() {
        throw new Error('disable() must be implemented by subclass');
    }

    /**
     * Activate the tool (make it the active tool)
     * Must be implemented by subclasses
     */
    activate() {
        throw new Error('activate() must be implemented by subclass');
    }

    /**
     * Deactivate the tool
     * Must be implemented by subclasses
     */
    deactivate() {
        throw new Error('deactivate() must be implemented by subclass');
    }

    /**
     * Clean up tool resources
     * Must be implemented by subclasses
     */
    cleanup() {
        throw new Error('cleanup() must be implemented by subclass');
    }

    /**
     * Handle page change
     * Can be overridden by subclasses
     */
    handlePageChange(pageNum) {
        this.currentPage = pageNum;
        this._renderAnnotationsForPage(pageNum);
        this.emit('pageChanged', { pageNum, tool: this.name });
    }

    /**
     * Create a new annotation
     * Can be overridden by subclasses
     */
    createAnnotation(data) {
        const annotation = {
            id: this._generateAnnotationId(),
            type: this.name,
            pageNum: this.currentPage,
            timestamp: Date.now(),
            userId: this.storageManager ? this.storageManager.userId : 'anonymous',
            data: data,
            config: { ...this.config }
        };

        this.annotations.set(annotation.id, annotation);
        this._addAnnotationToPage(annotation);

        this.emit('annotationCreated', annotation);

        return annotation;
    }

    /**
     * Update an existing annotation
     */
    updateAnnotation(annotationId, data) {
        const annotation = this.annotations.get(annotationId);
        if (!annotation) {
            return null;
        }

        annotation.data = { ...annotation.data, ...data };
        annotation.timestamp = Date.now();

        this.emit('annotationUpdated', annotation);

        return annotation;
    }

    /**
     * Delete an annotation
     */
    deleteAnnotation(annotationId) {
        const annotation = this.annotations.get(annotationId);
        if (!annotation) {
            return false;
        }

        this.annotations.delete(annotationId);
        this._removeAnnotationFromPage(annotation);

        this.emit('annotationDeleted', annotation);

        return true;
    }

    /**
     * Get all annotations for the current page
     */
    getAnnotationsForPage(pageNum = this.currentPage) {
        return this.annotationsByPage.get(pageNum) || [];
    }

    /**
     * Get all annotations for this tool
     */
    getAllAnnotations() {
        return Array.from(this.annotations.values());
    }

    /**
     * Load annotations from data
     */
    async loadAnnotations(annotationsData) {
        try {
            console.log('[BaseTool] Loading annotations for tool:', this.name, '- pages:', Object.keys(annotationsData).length);
            console.log('[BaseTool] Raw annotations data:', annotationsData);

            for (const [pageNum, pageAnnotations] of Object.entries(annotationsData)) {
                const page = parseInt(pageNum, 10);
                console.log(`[BaseTool] Processing page ${page}, annotations:`, pageAnnotations);

                if (Array.isArray(pageAnnotations)) {
                    console.log(`[BaseTool] Page ${page} has ${pageAnnotations.length} annotations`);

                    for (const annotationData of pageAnnotations) {
                        console.log('[BaseTool] Processing annotation:', annotationData);

                        const annotation = {
                            id: annotationData.id || this._generateAnnotationId(),
                            type: this.name,
                            pageNum: page,
                            timestamp: annotationData.timestamp || Date.now(),
                            userId: annotationData.userId || 'anonymous',
                            data: annotationData.data || annotationData,
                            config: annotationData.config || this.config
                        };

                        console.log('[BaseTool] Created annotation object:', annotation);

                        this.annotations.set(annotation.id, annotation);
                        this._addAnnotationToPage(annotation);

                        console.log('[BaseTool] Added annotation to collections. Total annotations:', this.annotations.size);
                    }
                } else {
                    console.warn(`[BaseTool] Page ${page} annotations is not an array:`, typeof pageAnnotations, pageAnnotations);
                }
            }

            console.log('[BaseTool] Final state - Total annotations:', this.annotations.size);
            console.log('[BaseTool] Annotations by page:', this.annotationsByPage);

            // Render annotations for current page
            this._renderAnnotationsForPage(this.currentPage);

        } catch (error) {
            console.error('[BaseTool] Error loading annotations:', error);
        }
    }

    /**
     * Export annotations data
     */
    exportAnnotations() {
        const data = {};

        for (const [pageNum, annotations] of this.annotationsByPage) {
            data[pageNum] = annotations.map(annotation => ({
                id: annotation.id,
                type: annotation.type,
                timestamp: annotation.timestamp,
                userId: annotation.userId,
                data: annotation.data,
                config: annotation.config
            }));
        }

        return data;
    }

    /**
     * Set tool configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
        this.emit('configChanged', { config: this.config, tool: this.name });
    }

    /**
     * Get tool configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Check if tool is enabled
     */
    isToolEnabled() {
        return this.isEnabled;
    }

    /**
     * Check if tool is active
     */
    isToolActive() {
        return this.isActive;
    }

    /**
     * Add event listener with automatic cleanup
     */
    addEventHandler(element, event, handler, options = {}) {
        if (!element || typeof handler !== 'function') {
            return;
        }

        const handlerKey = `${element.id || 'element'}_${event}`;

        // Remove existing handler if present
        this.removeEventHandler(handlerKey);

        // Add event listener
        element.addEventListener(event, handler, options);

        // Store for cleanup
        this.eventHandlers.set(handlerKey, {
            element,
            event,
            handler,
            options
        });
    }

    /**
     * Remove event handler
     */
    removeEventHandler(handlerKey) {
        const handlerData = this.eventHandlers.get(handlerKey);
        if (handlerData) {
            handlerData.element.removeEventListener(
                handlerData.event,
                handlerData.handler,
                handlerData.options
            );
            this.eventHandlers.delete(handlerKey);
        }
    }

    /**
     * Remove all event handlers
     */
    removeAllEventHandlers() {
        for (const [key] of this.eventHandlers) {
            this.removeEventHandler(key);
        }
    }

    /**
     * Add annotation to page index
     */
    _addAnnotationToPage(annotation) {
        if (!this.annotationsByPage.has(annotation.pageNum)) {
            this.annotationsByPage.set(annotation.pageNum, []);
        }

        const pageAnnotations = this.annotationsByPage.get(annotation.pageNum);
        const existingIndex = pageAnnotations.findIndex(a => a.id === annotation.id);

        if (existingIndex !== -1) {
            pageAnnotations[existingIndex] = annotation;
        } else {
            pageAnnotations.push(annotation);
        }
    }

    /**
     * Remove annotation from page index
     */
    _removeAnnotationFromPage(annotation) {
        const pageAnnotations = this.annotationsByPage.get(annotation.pageNum);
        if (pageAnnotations) {
            const index = pageAnnotations.findIndex(a => a.id === annotation.id);
            if (index !== -1) {
                pageAnnotations.splice(index, 1);

                // Clean up empty page arrays
                if (pageAnnotations.length === 0) {
                    this.annotationsByPage.delete(annotation.pageNum);
                }
            }
        }
    }

    /**
     * Render annotations for a specific page
     * Should be overridden by subclasses
     */
    _renderAnnotationsForPage(pageNum) {
        // Default implementation - subclasses should override
        const annotations = this.getAnnotationsForPage(pageNum);
    }

    /**
     * Generate unique annotation ID
     */
    _generateAnnotationId() {
        return `${this.name}_${this.blockId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Bind methods to preserve context
     */
    _bindMethods() {
        this.handlePageChange = this.handlePageChange.bind(this);
        this.createAnnotation = this.createAnnotation.bind(this);
        this.updateAnnotation = this.updateAnnotation.bind(this);
        this.deleteAnnotation = this.deleteAnnotation.bind(this);
    }

    /**
     * Destroy the tool
     */
    async destroy() {
        // Cleanup tool-specific resources
        await this.cleanup();

        // Disable and deactivate
        if (this.isActive) {
            this.deactivate();
        }

        if (this.isEnabled) {
            this.disable();
        }

        // Remove all event handlers
        this.removeAllEventHandlers();

        // Remove all event listeners
        this.removeAllListeners();

        // Clear annotations
        this.annotations.clear();
        this.annotationsByPage.clear();

        // Clear references
        this.container = null;
        this.pdfManager = null;
        this.storageManager = null;
    }
}

export default BaseTool;