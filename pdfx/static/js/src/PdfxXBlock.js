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

        // Pending tool configuration (applied when tools become active)
        this._pendingToolConfig = {};

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
                resolve();
                return;
            }

            let attempts = 0;
            const maxAttempts = 100; // 10 seconds max wait (100ms * 100)

            // Set up interval to check for PDF.js
            const checkInterval = setInterval(() => {
                attempts++;

                if (typeof window.pdfjsLib !== 'undefined') {
                    clearInterval(checkInterval);
                    resolve();
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    reject(new Error('PDF.js failed to load within timeout'));
                }
            }, 100);

            // Also listen for the pdfjsReady event
            const onPDFJSReady = () => {
                if (typeof window.pdfjsLib !== 'undefined') {
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
            return this;
        }

        if (this.isLoading) {
            return this;
        }
        this.isLoading = true;

        try {
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

            // Initialize UI components FIRST (before PDF loading)
            try {
                await this.uiManager.init();
            } catch (uiError) {
                console.warn('[PdfxXBlock] UI initialization error (continuing anyway):', uiError);
            }

            // Set up event listeners between managers
            this._setupEventListeners();

            // Load the PDF document
            try {
                await this.pdfManager.loadDocument(this.config.pdfUrl);
            } catch (pdfError) {
                if (pdfError.name === 'RenderingCancelledException') {
                    console.warn('[PdfxXBlock] PDF rendering was cancelled, but continuing with initialization...');
                } else {
                    console.error('[PdfxXBlock] PDF loading error:', pdfError);
                    throw pdfError; // Re-throw non-rendering errors
                }
            }

            // Initialize tools if annotation is allowed
            if (this.config.allowAnnotation) {
                try {
                    await this.toolManager.init();

                    // Load existing Annotations
                    await this._loadExistingAnnotations();
                } catch (error) {
                    console.error('[PdfxXBlock] Error during tool initialization or annotation loading for block:', this.config.blockId, error);
                }
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

            return this;

        } catch (error) {
            // Don't treat RenderingCancelledException as an error - it's expected when cancelling tasks
            console.log('[PdfxXBlock] Error during initialization:', error);
            if (error.name === 'RenderingCancelledException') {
                // Don't emit error or set loading to false for cancelled renders
                throw error; // Re-throw to maintain the cancellation flow
            } else {
                this.isLoading = false;
                this.emit('error', error);
                throw error;
            }
        }
    }

    /**
     * Load existing annotations from storage
     */
    async _loadExistingAnnotations() {
        try {
            // Load drawing strokes (scribble annotations)
            if (this.config.drawingStrokes && Object.keys(this.config.drawingStrokes).length > 0) {
                const scribbleTool = this.toolManager.getTool('scribble');
                if (scribbleTool) {
                    console.log('[PdfxXBlock] Loading', Object.keys(this.config.drawingStrokes).length, 'drawing stroke pages for block:', this.config.blockId);
                    await scribbleTool.loadAnnotations(this.config.drawingStrokes);
                } else {
                    console.warn('[PdfxXBlock] Scribble tool not available');
                }
            }

            // Load highlights
            if (this.config.highlights && Object.keys(this.config.highlights).length > 0) {
                console.log('[PdfxXBlock] Loading highlights for', Object.keys(this.config.highlights).length, 'pages');
                const highlightTool = this.toolManager.getTool('highlight');
                if (highlightTool) {
                    await highlightTool.loadAnnotations(this.config.highlights);
                } else {
                    console.warn('[PdfxXBlock] Highlight tool not available');
                }
            }

            // Load text annotations
            if (this.config.textAnnotations && Object.keys(this.config.textAnnotations).length > 0) {
                console.log('[PdfxXBlock] Loading text annotations for', Object.keys(this.config.textAnnotations).length, 'pages');
                const textTool = this.toolManager.getTool('text');
                if (textTool) {
                    await textTool.loadAnnotations(this.config.textAnnotations);
                } else {
                    console.warn('[PdfxXBlock] Text tool not available');
                }
            }

            // Load shape annotations
            if (this.config.shapeAnnotations && Object.keys(this.config.shapeAnnotations).length > 0) {
                console.log('[PdfxXBlock] Loading shape annotations for', Object.keys(this.config.shapeAnnotations).length, 'pages');
                const shapeTool = this.toolManager.getTool('shape');
                if (shapeTool) {
                    await shapeTool.loadAnnotations(this.config.shapeAnnotations);
                } else {
                    console.warn('[PdfxXBlock] Shape tool not available');
                }
            }

            // Load note annotations
            if (this.config.noteAnnotations && Object.keys(this.config.noteAnnotations).length > 0) {
                console.log('[PdfxXBlock] Loading note annotations for', Object.keys(this.config.noteAnnotations).length, 'pages');
                const noteTool = this.toolManager.getTool('note');
                if (noteTool) {
                    await noteTool.loadAnnotations(this.config.noteAnnotations);
                } else {
                    console.warn('[PdfxXBlock] Note tool not available');
                }
            }

            // Load other saved annotations
            if (this.config.savedAnnotations && Object.keys(this.config.savedAnnotations).length > 0) {
                console.log('[PdfxXBlock] Loading saved annotations...');
                await this.storageManager.loadAnnotations(this.config.savedAnnotations);
            }

            console.log('[PdfxXBlock] Finished loading existing annotations');

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

        this.pdfManager.on('scaleChanged', (data) => {
            this.emit('scaleChanged', data);
            this.uiManager.updateZoomState(data.mode, data.scale);
        });

        // Tool Manager events
        if (this.toolManager) {
            this.toolManager.on('toolActivated', (data) => {
                this.emit('toolActivated', data);
                this.uiManager.updateToolState(data.toolName, true);

                // Apply any pending tool configuration
                if (Object.keys(this._pendingToolConfig).length > 0) {
                    const tool = this.toolManager.getTool(data.toolName);
                    if (tool) {
                        tool.setConfig(this._pendingToolConfig);
                    }
                }
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
                // EMERGENCY FIX: If ToolManager is not initialized, force initialization
                if (!this.toolManager.isInitialized) {
                    this.toolManager.init().then(() => {
                        this.toolManager.activateTool(data.toolName);
                    }).catch(error => {
                        // Handle initialization error silently
                    });
                } else {
                    this.toolManager.activateTool(data.toolName);
                }
            }
        });

        this.uiManager.on('pageNavigationRequested', (data) => {
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

        // Handle clear requests
        this.uiManager.on('clearRequested', () => {
            if (this.toolManager) {
                // Clear current page annotations (more user-friendly than clearing everything)
                this.toolManager.clearCurrentPageAnnotations();
            }
        });

        // Handle undo requests
        this.uiManager.on('undoRequested', () => {
            if (this.toolManager) {
                this._handleUndo();
            }
        });

        // Handle color changes
        this.uiManager.on('colorChanged', (data) => {
            if (this.toolManager) {
                this._updateActiveToolConfig({ color: data.color });
            }
        });

        // Handle size changes
        this.uiManager.on('sizeChanged', (data) => {
            if (this.toolManager) {
                this._updateActiveToolConfig({ size: data.size });
            }
        });
    }

    /**
     * Handle undo action
     */
    _handleUndo() {
        if (!this.toolManager) {
            return;
        }

        const activeTool = this.toolManager.getActiveTool();
        if (!activeTool) {
            return;
        }

        // Check if the active tool has an undo method
        if (typeof activeTool.undoLastStroke === 'function') {
            activeTool.undoLastStroke();
        } else if (typeof activeTool.undo === 'function') {
            activeTool.undo();
        } else {
            // General fallback: remove the last annotation for this tool on current page
            const annotations = activeTool.getAnnotationsForPage(this.pdfManager.getCurrentPage());
            if (annotations.length > 0) {
                const lastAnnotation = annotations[annotations.length - 1];
                activeTool.deleteAnnotation(lastAnnotation.id);
            }
        }
    }

    /**
     * Update active tool configuration
     */
    _updateActiveToolConfig(config) {
        if (!this.toolManager) {
            return;
        }

        const activeTool = this.toolManager.getActiveTool();
        if (activeTool) {
            activeTool.setConfig(config);
        } else {
            // Store the config for when a tool becomes active
            this._pendingToolConfig = { ...this._pendingToolConfig, ...config };
        }
    }

    /**
     * Download the PDF
     */
    _downloadPDF() {
        if (!this.config.pdfUrl) {
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
        this._handleUndo = this._handleUndo.bind(this);
        this._updateActiveToolConfig = this._updateActiveToolConfig.bind(this);
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
     * Destroy the XBlock instance
     */
    async destroy() {
        try {
            // Destroy all managers
            if (this.toolManager) {
                await this.toolManager.destroy();
            }

            if (this.uiManager) {
                await this.uiManager.destroy();
            }

            if (this.pdfManager) {
                await this.pdfManager.destroy();
            }

            if (this.storageManager) {
                await this.storageManager.destroy();
            }

            // Clear references
            this.toolManager = null;
            this.uiManager = null;
            this.pdfManager = null;
            this.storageManager = null;

            // Remove all event listeners
            this.removeAllListeners();

            this.isInitialized = false;

            this.emit('destroyed', { blockId: this.config.blockId });

        } catch (error) {
            this.emit('error', error);
        }
    }
}

// Global function for Open edX XBlock framework compatibility
window.PdfxXBlock = function(runtime, element, initArgs) {
    const instance = new PdfxXBlock(runtime, element, initArgs);

    // Store instance immediately for debugging, even before init
    window.PdfxInstances = window.PdfxInstances || {};
    window.PdfxInstances[initArgs?.blockId] = instance;

    // Initialize the instance
    instance.init().then(() => {
        // Initialization completed successfully
    }).catch(error => {
        // Don't treat RenderingCancelledException as an error - it's expected when cancelling tasks
        if (error.name !== 'RenderingCancelledException') {
            // Handle initialization error silently
        }
    });

    return instance;
};

// Store instances globally for debugging and legacy compatibility
window.PdfxInstances = window.PdfxInstances || {};

// Global debug functions for testing tool activation
window.testToolActivation = function(blockId, toolName) {
    // Find the tool button
    const toolButton = document.querySelector(`#toolbar-${blockId} .tool-button[data-tool="${toolName}"]`);
    if (!toolButton) {
        return;
    }

    // Simulate click
    toolButton.click();
};

// Global debug function to check current state
window.debugPdfxState = function(blockId) {
    const instance = window.PdfxInstances[blockId];
    if (!instance) {
        return;
    }

    return {
        instance: instance,
        initialized: instance.isInitialized,
        allowAnnotation: instance.config.allowAnnotation,
        toolManager: instance.toolManager,
        toolManagerInitialized: instance.toolManager ? instance.toolManager.isInitialized : false,
        availableTools: instance.toolManager ? Array.from(instance.toolManager.tools.keys()) : [],
        activeTool: instance.toolManager && instance.toolManager.activeTool ? instance.toolManager.activeTool.name : 'none'
    };
};

// Global debug function for testing navigation
window.testPdfNavigation = function(blockId, action) {
    // Find the navigation element
    const navigation = document.querySelector(`#navigation-${blockId}`);
    if (!navigation) {
        return;
    }

    // Find the button for the action
    const button = navigation.querySelector(`[data-nav="${action}"]`);
    if (!button) {
        return;
    }

    // Simulate click
    button.click();
};

// Global debug function for testing zoom
window.testPdfZoom = function(blockId, action) {
    // Find the navigation element
    const navigation = document.querySelector(`#navigation-${blockId}`);
    if (!navigation) {
        return;
    }

    // Find the button for the action
    const button = navigation.querySelector(`[data-zoom="${action}"]`);
    if (!button) {
        return;
    }

    // Simulate click
    button.click();
};

export default PdfxXBlock;