/**
 * PDF XBlock - Modern ES6 Modules Implementation
 *
 * Main entry point that orchestrates all PDF functionality including:
 * - PDF document loading and rendering
 * - Annotation tools (highlight, scribble, text, shape, note)
 * - Storage and persistence
 * - UI management
 */

import { PDFManager } from './core/PDFManager.js';
import { ToolManager } from './tools/ToolManager.js';
import { UIManager } from './ui/UIManager.js';
import { AnnotationStorage } from './storage/AnnotationStorage.js';
import { EventEmitter } from './utils/EventEmitter.js';

export class PdfxXBlock extends EventEmitter {
    constructor(runtime, element, initArgs) {
        super();

        // Store core references
        this.runtime = runtime;
        // Convert jQuery object to native DOM element if needed
        this.element = element.jquery ? element[0] : element;
        this.initArgs = initArgs || {};

        // Extract configuration from initArgs
        this.config = {
            blockId: this.initArgs.blockId || this._generateBlockId(),
            pdfUrl: this.initArgs.pdfUrl,
            allowDownload: this.initArgs.allowDownload !== false,
            allowAnnotation: this.initArgs.allowAnnotation !== false,
            currentPage: this.initArgs.currentPage || 1,
            savedAnnotations: this.initArgs.savedAnnotations || {},
            drawingStrokes: this.initArgs.drawingStrokes || {},
            highlights: this.initArgs.highlights || {},
            userId: this.initArgs.userId || 'anonymous',
            courseId: this.initArgs.courseId || '',
            isStudio: this._isStudioEnvironment()
        };

        // Initialize managers
        this.pdfManager = null;
        this.toolManager = null;
        this.uiManager = null;
        this.storageManager = null;

        // State
        this.isInitialized = false;
        this.isLoading = false;

        // Bind methods to preserve context
        this._bindMethods();
    }

    /**
     * Wait for PDF.js to be ready
     */
    async _waitForPDFJS() {
        return new Promise((resolve, reject) => {
            // Check if PDF.js is already available
            if (typeof window.pdfjsLib !== 'undefined') {
                console.debug('[PdfxXBlock] PDF.js already available');
                resolve();
                return;
            }

            console.debug('[PdfxXBlock] Waiting for PDF.js to load...');

            let attempts = 0;
            const maxAttempts = 100; // 10 seconds max wait (100ms * 100)

            // Set up interval to check for PDF.js
            const checkInterval = setInterval(() => {
                attempts++;

                if (typeof window.pdfjsLib !== 'undefined') {
                    console.debug('[PdfxXBlock] PDF.js loaded successfully');
                    clearInterval(checkInterval);
                    resolve();
                } else if (attempts >= maxAttempts) {
                    console.error('[PdfxXBlock] Timeout waiting for PDF.js to load');
                    clearInterval(checkInterval);
                    reject(new Error('PDF.js failed to load within timeout'));
                }
            }, 100);

            // Also listen for the pdfjsReady event
            const onPDFJSReady = () => {
                if (typeof window.pdfjsLib !== 'undefined') {
                    console.debug('[PdfxXBlock] PDF.js ready via event');
                    clearInterval(checkInterval);
                    document.removeEventListener('pdfjsReady', onPDFJSReady);
                    resolve();
                }
            };

            document.addEventListener('pdfjsReady', onPDFJSReady, { once: true });
        });
    }

    /**
     * Initialize the PDF XBlock
     */
    async init() {
        if (this.isInitialized) {
            console.warn('[PdfxXBlock] Already initialized');
            return this;
        }

        if (this.isLoading) {
            console.warn('[PdfxXBlock] Already loading');
            return this;
        }

        this.isLoading = true;

        try {
            console.debug(`[PdfxXBlock] Initializing for block ${this.config.blockId}`);

            // Wait for PDF.js to be ready first
            await this._waitForPDFJS();

            // Initialize storage first
            this.storageManager = new AnnotationStorage({
                blockId: this.config.blockId,
                userId: this.config.userId,
                courseId: this.config.courseId,
                handlerUrl: this.runtime.handlerUrl(this.element, 'save_annotations')
            });

            // Initialize PDF manager (now PDF.js is guaranteed to be ready)
            this.pdfManager = new PDFManager({
                blockId: this.config.blockId,
                container: this.element,
                pdfUrl: this.config.pdfUrl,
                currentPage: this.config.currentPage
            });

            // Initialize UI manager
            this.uiManager = new UIManager({
                blockId: this.config.blockId,
                container: this.element,
                allowDownload: this.config.allowDownload,
                isStudio: this.config.isStudio
            });

            // Initialize tool manager
            this.toolManager = new ToolManager({
                blockId: this.config.blockId,
                container: this.element,
                pdfManager: this.pdfManager,
                storageManager: this.storageManager,
                allowAnnotation: this.config.allowAnnotation
            });

            // Set up event listeners between managers
            this._setupEventListeners();

            // Load the PDF document
            await this.pdfManager.loadDocument(this.config.pdfUrl);

            // Initialize UI components
            await this.uiManager.init();

            // Initialize tools if annotation is allowed
            if (this.config.allowAnnotation) {
                await this.toolManager.init();

                // Load existing annotations
                await this._loadExistingAnnotations();
            }

            // Navigate to the current page
            await this.pdfManager.navigateToPage(this.config.currentPage);

            this.isInitialized = true;
            this.isLoading = false;

            // Emit initialization complete event
            this.emit('initialized', {
                blockId: this.config.blockId,
                pdfManager: this.pdfManager,
                toolManager: this.toolManager,
                uiManager: this.uiManager
            });

            console.debug(`[PdfxXBlock] Initialization complete for block ${this.config.blockId}`);

            return this;

        } catch (error) {
            console.error('[PdfxXBlock] Initialization error:', error);
            this.isLoading = false;
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Load existing annotations from storage
     */
    async _loadExistingAnnotations() {
        try {
            // Load highlights
            if (this.config.highlights && Object.keys(this.config.highlights).length > 0) {
                const highlightTool = this.toolManager.getTool('highlight');
                if (highlightTool) {
                    await highlightTool.loadAnnotations(this.config.highlights);
                }
            }

            // Load drawing strokes
            if (this.config.drawingStrokes && Object.keys(this.config.drawingStrokes).length > 0) {
                const scribbleTool = this.toolManager.getTool('scribble');
                if (scribbleTool) {
                    await scribbleTool.loadAnnotations(this.config.drawingStrokes);
                }
            }

            // Load other saved annotations
            if (this.config.savedAnnotations && Object.keys(this.config.savedAnnotations).length > 0) {
                await this.storageManager.loadAnnotations(this.config.savedAnnotations);
            }

        } catch (error) {
            console.error('[PdfxXBlock] Error loading existing annotations:', error);
        }
    }

    /**
     * Set up event listeners between managers
     */
    _setupEventListeners() {
        // PDF Manager events
        this.pdfManager.on('documentLoaded', (data) => {
            this.emit('documentLoaded', data);
            this.uiManager.updateDocumentInfo(data);
            this.uiManager.setLoading(false);
            console.debug('[PdfxXBlock] ✅ BULLETPROOF FIX: Loading indicator hidden via setLoading(false)');
        });

        this.pdfManager.on('pageChanged', (data) => {
            this.emit('pageChanged', data);
            this.uiManager.updateCurrentPage(data.pageNum, data.totalPages);
            if (this.toolManager) {
                this.toolManager.handlePageChange(data.pageNum);
            }
        });

        this.pdfManager.on('error', (error) => {
            this.emit('error', error);
            this.uiManager.showError(error.message);
        });

        // Tool Manager events
        if (this.toolManager) {
            this.toolManager.on('toolActivated', (data) => {
                this.emit('toolActivated', data);
                this.uiManager.updateToolState(data.toolName, true);
            });

            this.toolManager.on('toolDeactivated', (data) => {
                this.emit('toolDeactivated', data);
                this.uiManager.updateToolState(data.toolName, false);
            });

            this.toolManager.on('annotationCreated', (data) => {
                this.emit('annotationCreated', data);
                this.storageManager.saveAnnotation(data);
            });

            this.toolManager.on('annotationDeleted', (data) => {
                this.emit('annotationDeleted', data);
                this.storageManager.deleteAnnotation(data);
            });
        }

        // UI Manager events
        this.uiManager.on('toolRequested', (data) => {
            if (this.toolManager) {
                this.toolManager.activateTool(data.toolName);
            }
        });

        this.uiManager.on('pageNavigationRequested', (data) => {
            console.debug(`[PdfxXBlock] 🔍 DEBUG: Received pageNavigationRequested event with data:`, data);
            console.debug(`[PdfxXBlock] 🚀 NAVIGATION TEST: Attempting to navigate to page ${data.pageNum}`);
            this.pdfManager.navigateToPage(data.pageNum);
        });

        this.uiManager.on('zoomRequested', (data) => {
            this.pdfManager.setZoom(data.zoom);
        });

        this.uiManager.on('downloadRequested', () => {
            if (this.config.allowDownload) {
                this._downloadPDF();
            }
        });
    }

    /**
     * Download the PDF
     */
    _downloadPDF() {
        if (!this.config.pdfUrl) {
            console.warn('[PdfxXBlock] No PDF URL available for download');
            return;
        }

        const link = document.createElement('a');
        link.href = this.config.pdfUrl;
        link.download = this._getFileName();
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Get filename from PDF URL
     */
    _getFileName() {
        if (!this.config.pdfUrl) return 'document.pdf';
        const parts = this.config.pdfUrl.split('/');
        const filename = parts[parts.length - 1];
        return filename.includes('.pdf') ? filename : 'document.pdf';
    }

    /**
     * Generate a unique block ID if not provided
     */
    _generateBlockId() {
        return 'pdfx-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Check if we're in Studio environment
     */
    _isStudioEnvironment() {
        return (window.location.href.indexOf('studio') !== -1) ||
               (window.location.href.indexOf('/cms/') !== -1);
    }

    /**
     * Bind methods to preserve context
     */
    _bindMethods() {
        this.init = this.init.bind(this);
        this._loadExistingAnnotations = this._loadExistingAnnotations.bind(this);
        this._setupEventListeners = this._setupEventListeners.bind(this);
        this._downloadPDF = this._downloadPDF.bind(this);
    }

    /**
     * Get the current state of the XBlock
     */
    getState() {
        return {
            blockId: this.config.blockId,
            isInitialized: this.isInitialized,
            isLoading: this.isLoading,
            currentPage: this.pdfManager ? this.pdfManager.getCurrentPage() : this.config.currentPage,
            totalPages: this.pdfManager ? this.pdfManager.getTotalPages() : 0,
            activeTool: this.toolManager ? this.toolManager.getActiveTool() : null,
            documentLoaded: this.pdfManager ? this.pdfManager.isDocumentLoaded() : false
        };
    }

    /**
     * Clean up resources
     */
    destroy() {
        console.debug(`[PdfxXBlock] Destroying instance for block ${this.config.blockId}`);

        // Clean up managers
        if (this.toolManager) {
            this.toolManager.destroy();
        }

        if (this.uiManager) {
            this.uiManager.destroy();
        }

        if (this.pdfManager) {
            this.pdfManager.destroy();
        }

        if (this.storageManager) {
            this.storageManager.destroy();
        }

        // Remove all event listeners
        this.removeAllListeners();

        // Clear references
        this.pdfManager = null;
        this.toolManager = null;
        this.uiManager = null;
        this.storageManager = null;

        this.isInitialized = false;

        this.emit('destroyed', { blockId: this.config.blockId });
    }
}

// Global function for Open edX XBlock framework compatibility
window.PdfxXBlock = function(runtime, element, initArgs) {
    const instance = new PdfxXBlock(runtime, element, initArgs);

    // Initialize the instance
    instance.init().catch(error => {
        console.error('[PdfxXBlock] Failed to initialize:', error);
    });

    return instance;
};

// Store instances globally for debugging and legacy compatibility
window.PdfxInstances = window.PdfxInstances || {};

// Global debug function for testing navigation
window.testPdfNavigation = function(blockId, action) {
    console.debug(`[DEBUG] Testing navigation: ${action} for block ${blockId}`);

    // Find the navigation element
    const navigation = document.querySelector(`#navigation-${blockId}`);
    if (!navigation) {
        console.error(`[DEBUG] Navigation element not found for block ${blockId}`);
        return;
    }

    // Find the button for the action
    const button = navigation.querySelector(`[data-nav="${action}"]`);
    if (!button) {
        console.error(`[DEBUG] Navigation button not found for action: ${action}`);
        return;
    }

    console.debug(`[DEBUG] Found button:`, button);
    console.debug(`[DEBUG] Simulating click...`);

    // Simulate click
    button.click();
};

// Global debug function for testing zoom
window.testPdfZoom = function(blockId, action) {
    console.debug(`[DEBUG] Testing zoom: ${action} for block ${blockId}`);

    // Find the navigation element
    const navigation = document.querySelector(`#navigation-${blockId}`);
    if (!navigation) {
        console.error(`[DEBUG] Navigation element not found for block ${blockId}`);
        return;
    }

    // Find the button for the action
    const button = navigation.querySelector(`[data-zoom="${action}"]`);
    if (!button) {
        console.error(`[DEBUG] Zoom button not found for action: ${action}`);
        return;
    }

    console.debug(`[DEBUG] Found zoom button:`, button);
    console.debug(`[DEBUG] Simulating click...`);

    // Simulate click
    button.click();
};

export default PdfxXBlock;