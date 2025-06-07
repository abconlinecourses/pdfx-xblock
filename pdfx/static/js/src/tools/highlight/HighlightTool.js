/**
 * HighlightTool - Text highlighting functionality
 *
 * Provides text selection and highlighting capabilities
 */

import { BaseTool } from '../base/BaseTool.js';

export class HighlightTool extends BaseTool {
    constructor(options = {}) {
        super({
            name: 'highlight',
            ...options
        });

        // Text selection state
        this.isSelecting = false;
        this.selectionTimeout = null;

        // Configuration
        this.config = {
            color: '#FFFF0080', // Yellow with transparency
            opacity: 0.5,
            borderRadius: '2px',
            ...this.config
        };

        // Highlight elements
        this.highlightElements = new Map();
        this.highlightContainer = null;
    }

    /**
     * Initialize the highlight tool
     */
    async init() {
        try {
            console.debug('[HighlightTool] Initializing highlight tool');

            // Set up highlight container
            await this._setupHighlightContainer();

            this.isEnabled = true;

            console.debug('[HighlightTool] Highlight tool initialized successfully');

        } catch (error) {
            console.error('[HighlightTool] Initialization error:', error);
            throw error;
        }
    }

    /**
     * Set up highlight container
     */
    async _setupHighlightContainer() {
        // Find or create highlight container
        let highlightContainer = this.container.querySelector(`#highlight-container-${this.blockId}`);
        if (!highlightContainer) {
            highlightContainer = document.createElement('div');
            highlightContainer.id = `highlight-container-${this.blockId}`;
            highlightContainer.className = 'highlight-container';
            highlightContainer.style.position = 'absolute';
            highlightContainer.style.top = '0';
            highlightContainer.style.left = '0';
            highlightContainer.style.pointerEvents = 'none';
            highlightContainer.style.zIndex = '5';

            // BULLETPROOF FIX: Hide highlight container by default to prevent yellow overlay
            highlightContainer.style.display = 'none';
            highlightContainer.style.visibility = 'hidden';
            highlightContainer.style.opacity = '0';
            highlightContainer.style.backgroundColor = 'transparent';
            highlightContainer.style.background = 'none';

            console.debug('[HighlightTool] ✅ BULLETPROOF FIX: Highlight container hidden by default');

            const pdfContainer = this.container.querySelector(`#pdf-container-${this.blockId}`);
            if (pdfContainer) {
                pdfContainer.appendChild(highlightContainer);
            }
        } else {
            // BULLETPROOF FIX: Ensure existing highlight container is also hidden
            highlightContainer.style.display = 'none';
            highlightContainer.style.visibility = 'hidden';
            highlightContainer.style.opacity = '0';
            highlightContainer.style.backgroundColor = 'transparent';
            highlightContainer.style.background = 'none';

            console.debug('[HighlightTool] ✅ BULLETPROOF FIX: Existing highlight container hidden');
        }

        this.highlightContainer = highlightContainer;
    }

    /**
     * Enable the tool
     */
    enable() {
        this.isEnabled = true;
        console.debug('[HighlightTool] Highlight tool enabled');
    }

    /**
     * Disable the tool
     */
    disable() {
        if (this.isActive) {
            this.deactivate();
        }
        this.isEnabled = false;
        console.debug('[HighlightTool] Highlight tool disabled');
    }

    /**
     * Activate the tool
     */
    activate() {
        if (!this.isEnabled) {
            console.warn('[HighlightTool] Cannot activate disabled tool');
            return false;
        }

        try {
            // Enable text highlighting
            this._enableTextHighlighting();

            this.isActive = true;

            console.debug('[HighlightTool] Highlight tool activated');

            return true;

        } catch (error) {
            console.error('[HighlightTool] Error activating tool:', error);
            return false;
        }
    }

    /**
     * Deactivate the tool
     */
    deactivate() {
        try {
            // Disable text highlighting
            this._disableTextHighlighting();

            // Clear any active selection
            this._clearSelection();

            this.isActive = false;

            console.debug('[HighlightTool] Highlight tool deactivated');

        } catch (error) {
            console.error('[HighlightTool] Error deactivating tool:', error);
        }
    }

    /**
     * Enable text highlighting
     */
    _enableTextHighlighting() {
        const textLayer = this.container.querySelector(`#text-layer-${this.blockId}`);
        if (!textLayer) {
            console.warn('[HighlightTool] Text layer not found');
            return;
        }

        // Make text layer interactive
        textLayer.style.pointerEvents = 'auto';
        textLayer.style.userSelect = 'text';
        textLayer.style.webkitUserSelect = 'text';
        textLayer.style.MozUserSelect = 'text';
        textLayer.style.msUserSelect = 'text';

        // Add visual feedback class
        textLayer.classList.add('highlight-tool-active');

        // Add event listeners
        this.addEventHandler(textLayer, 'mouseup', this._handleTextSelection.bind(this));
        this.addEventHandler(textLayer, 'mousedown', this._handleMouseDown.bind(this));

        // Style text spans
        this._styleTextSpans(textLayer);
    }

    /**
     * Disable text highlighting
     */
    _disableTextHighlighting() {
        const textLayer = this.container.querySelector(`#text-layer-${this.blockId}`);
        if (!textLayer) {
            return;
        }

        // Remove interactive properties
        textLayer.style.pointerEvents = 'none';
        textLayer.style.userSelect = 'none';
        textLayer.style.webkitUserSelect = 'none';
        textLayer.style.MozUserSelect = 'none';
        textLayer.style.msUserSelect = 'none';

        // Remove visual feedback class
        textLayer.classList.remove('highlight-tool-active');

        // Remove hover effects from spans
        this._removeTextSpanStyles(textLayer);
    }

    /**
     * Style text spans for highlighting
     */
    _styleTextSpans(textLayer) {
        const spans = textLayer.querySelectorAll('span');

        // Use efficient styling for large documents
        if (spans.length > 2000) {
            // Add CSS rule for hover effect
            const styleId = `highlight-hover-${this.blockId}`;
            let style = document.getElementById(styleId);

            if (!style) {
                style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
                    #text-layer-${this.blockId}.highlight-tool-active span:hover {
                        background-color: rgba(255, 255, 0, 0.2) !important;
                        border-radius: 2px;
                        transition: background-color 0.2s ease;
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            // Style individual spans for smaller documents
            spans.forEach(span => {
                span.style.cursor = 'text';
                span.style.transition = 'background-color 0.2s ease';
                span.style.borderRadius = '2px';
                span.classList.add('highlight-selectable');
            });
        }
    }

    /**
     * Remove text span styles
     */
    _removeTextSpanStyles(textLayer) {
        const spans = textLayer.querySelectorAll('span.highlight-selectable');
        spans.forEach(span => {
            span.classList.remove('highlight-selectable');
            span.style.cursor = '';
            span.style.transition = '';
            span.style.borderRadius = '';
        });

        // Remove CSS rule
        const styleId = `highlight-hover-${this.blockId}`;
        const style = document.getElementById(styleId);
        if (style) {
            style.remove();
        }
    }

    /**
     * Handle mouse down event
     */
    _handleMouseDown(event) {
        // Clear any existing timeout
        if (this.selectionTimeout) {
            clearTimeout(this.selectionTimeout);
            this.selectionTimeout = null;
        }

        this.isSelecting = true;
    }

    /**
     * Handle text selection
     */
    _handleTextSelection(event) {
        if (!this.isSelecting) {
            return;
        }

        // Use debounce to prevent excessive processing
        if (this.selectionTimeout) {
            clearTimeout(this.selectionTimeout);
        }

        this.selectionTimeout = setTimeout(() => {
            this._processTextSelection();
            this.isSelecting = false;
        }, 300);
    }

    /**
     * Process the current text selection
     */
    _processTextSelection() {
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0) {
            return;
        }

        const range = selection.getRangeAt(0);

        if (range.collapsed || !range.toString().trim()) {
            return;
        }

        try {
            // Get selection bounds
            const selectionData = this._getSelectionData(range);

            if (selectionData) {
                // Create highlight annotation
                const annotation = this.createAnnotation(selectionData);

                // Render the highlight
                this._renderHighlight(annotation);

                console.debug('[HighlightTool] Created highlight:', annotation.id);
            }

        } catch (error) {
            console.error('[HighlightTool] Error processing text selection:', error);
        } finally {
            // Clear the selection
            this._clearSelection();
        }
    }

    /**
     * Get selection data from range
     */
    _getSelectionData(range) {
        const textLayer = this.container.querySelector(`#text-layer-${this.blockId}`);
        if (!textLayer) {
            return null;
        }

        const rects = range.getClientRects();
        if (rects.length === 0) {
            return null;
        }

        const textLayerRect = textLayer.getBoundingClientRect();
        const highlights = [];

        // Convert each rect to relative coordinates
        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];

            highlights.push({
                left: rect.left - textLayerRect.left,
                top: rect.top - textLayerRect.top,
                width: rect.width,
                height: rect.height
            });
        }

        return {
            text: range.toString().trim(),
            highlights: highlights,
            startOffset: range.startOffset,
            endOffset: range.endOffset,
            containerInfo: this._getContainerInfo(range)
        };
    }

    /**
     * Get container information for the range
     */
    _getContainerInfo(range) {
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;

        return {
            startContainer: startContainer.nodeType === Node.TEXT_NODE ?
                startContainer.parentElement?.id || '' : startContainer.id || '',
            endContainer: endContainer.nodeType === Node.TEXT_NODE ?
                endContainer.parentElement?.id || '' : endContainer.id || '',
            startOffset: range.startOffset,
            endOffset: range.endOffset
        };
    }

    /**
     * Render highlight from annotation
     */
    _renderHighlight(annotation) {
        const data = annotation.data;

        if (!data.highlights || data.highlights.length === 0) {
            return;
        }

        const highlightElements = [];

        // Create highlight elements for each rect
        data.highlights.forEach((highlight, index) => {
            const element = document.createElement('div');
            element.className = 'highlight-element';
            element.style.position = 'absolute';
            element.style.left = highlight.left + 'px';
            element.style.top = highlight.top + 'px';
            element.style.width = highlight.width + 'px';
            element.style.height = highlight.height + 'px';
            element.style.backgroundColor = this.config.color;
            element.style.opacity = this.config.opacity;
            element.style.borderRadius = this.config.borderRadius;
            element.style.pointerEvents = 'none';
            element.dataset.annotationId = annotation.id;
            element.dataset.highlightIndex = index;

            this.highlightContainer.appendChild(element);
            highlightElements.push(element);
        });

        // Store elements for later removal
        this.highlightElements.set(annotation.id, highlightElements);
    }

    /**
     * Clear current selection
     */
    _clearSelection() {
        if (window.getSelection) {
            window.getSelection().removeAllRanges();
        }
    }

    /**
     * Handle page change
     */
    handlePageChange(pageNum) {
        super.handlePageChange(pageNum);

        // Clear current highlights
        this._clearAllHighlightElements();

        // Render highlights for new page
        this._renderHighlightsForPage(pageNum);
    }

    /**
     * Clear all highlight elements
     */
    _clearAllHighlightElements() {
        if (this.highlightContainer) {
            this.highlightContainer.innerHTML = '';
        }
        this.highlightElements.clear();
    }

    /**
     * Render highlights for a specific page
     */
    _renderHighlightsForPage(pageNum) {
        const annotations = this.getAnnotationsForPage(pageNum);

        for (const annotation of annotations) {
            this._renderHighlight(annotation);
        }

        console.debug(`[HighlightTool] Rendered ${annotations.length} highlights for page ${pageNum}`);
    }

    /**
     * Delete annotation and remove highlight elements
     */
    deleteAnnotation(annotationId) {
        // Remove highlight elements
        const elements = this.highlightElements.get(annotationId);
        if (elements) {
            elements.forEach(element => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            });
            this.highlightElements.delete(annotationId);
        }

        // Call parent delete method
        return super.deleteAnnotation(annotationId);
    }

    /**
     * Set tool configuration
     */
    setConfig(config) {
        super.setConfig(config);

        // Update existing highlights if color changed
        if (config.color || config.opacity) {
            this._updateExistingHighlights();
        }
    }

    /**
     * Update existing highlight elements with new styling
     */
    _updateExistingHighlights() {
        for (const elements of this.highlightElements.values()) {
            elements.forEach(element => {
                element.style.backgroundColor = this.config.color;
                element.style.opacity = this.config.opacity;
            });
        }
    }

    /**
     * Load annotations for this tool
     */
    async loadAnnotations(annotationsData) {
        await super.loadAnnotations(annotationsData);

        // Re-render current page after loading
        this._renderHighlightsForPage(this.currentPage);
    }

    /**
     * Clean up tool resources
     */
    async cleanup() {
        console.debug('[HighlightTool] Cleaning up highlight tool');

        // Clear timeout
        if (this.selectionTimeout) {
            clearTimeout(this.selectionTimeout);
            this.selectionTimeout = null;
        }

        // Clear highlights
        this._clearAllHighlightElements();

        // Remove hover style
        const styleId = `highlight-hover-${this.blockId}`;
        const style = document.getElementById(styleId);
        if (style) {
            style.remove();
        }

        // Clear references
        this.highlightContainer = null;
    }
}

export default HighlightTool;