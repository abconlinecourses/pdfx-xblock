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
            color: '#FFFF00', // Yellow color
            opacity: 0.3,
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

            // Set up highlight container
            await this._setupHighlightContainer();

            this.isEnabled = true;


        } catch (error) {
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

            // Show highlight container for actual highlight rendering
            highlightContainer.style.display = 'block';
            highlightContainer.style.visibility = 'visible';
            highlightContainer.style.opacity = '1';
            highlightContainer.style.backgroundColor = 'transparent';
            highlightContainer.style.background = 'none';


            const pdfContainer = this.container.querySelector(`#pdf-container-${this.blockId}`);
            if (pdfContainer) {
                pdfContainer.appendChild(highlightContainer);
            }
        } else {
            // Ensure existing highlight container is properly visible
            highlightContainer.style.display = 'block';
            highlightContainer.style.visibility = 'visible';
            highlightContainer.style.opacity = '1';
            highlightContainer.style.backgroundColor = 'transparent';
            highlightContainer.style.background = 'none';
        }

        this.highlightContainer = highlightContainer;
    }

    /**
     * Enable the tool
     */
    enable() {
        this.isEnabled = true;
    }

    /**
     * Disable the tool
     */
    disable() {
        if (this.isActive) {
            this.deactivate();
        }
        this.isEnabled = false;
    }

    /**
     * Activate the tool
     */
    activate() {
        if (!this.isEnabled) {
            console.warn('[HighlightTool] Tool not enabled, cannot activate');
            return false;
        }

        try {
            console.log('[HighlightTool] Activating highlight tool for block:', this.blockId);

            // Set the tool attribute on draw container for CSS targeting
            const drawContainer = this.container.querySelector(`#draw-container-${this.blockId}`);
            if (drawContainer) {
                drawContainer.setAttribute('data-current-tool', 'highlight');
                console.log('[HighlightTool] Set data-current-tool="highlight" on draw container');
            }

            // Enable text highlighting
            this._enableTextHighlighting();

            this.isActive = true;

            console.log('[HighlightTool] Highlight tool activated successfully');
            return true;

        } catch (error) {
            console.error('[HighlightTool] Error activating highlight tool:', error);
            return false;
        }
    }

    /**
     * Deactivate the tool
     */
    deactivate() {
        try {
            console.log('[HighlightTool] Deactivating highlight tool for block:', this.blockId);

            // Remove the tool attribute from draw container
            const drawContainer = this.container.querySelector(`#draw-container-${this.blockId}`);
            if (drawContainer) {
                drawContainer.removeAttribute('data-current-tool');
                console.log('[HighlightTool] Removed data-current-tool attribute from draw container');
            }

            // Disable text highlighting
            this._disableTextHighlighting();

            // Clear any active selection
            this._clearSelection();

            this.isActive = false;

            console.log('[HighlightTool] Highlight tool deactivated successfully');

        } catch (error) {
            console.error('[HighlightTool] Error deactivating highlight tool:', error);
        }
    }

    /**
     * Enable text highlighting
     */
    _enableTextHighlighting() {
        const textLayer = this.container.querySelector(`#text-layer-${this.blockId}`);
        if (!textLayer) {
            console.warn('[HighlightTool] Text layer not found for block:', this.blockId);
            return;
        }

        console.log('[HighlightTool] Enabling text highlighting on text layer:', textLayer.id);
        console.log('[HighlightTool] Text layer content:', textLayer.innerHTML.substring(0, 200) + '...');

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

        // Check for text spans
        const spans = textLayer.querySelectorAll('span');
        console.log('[HighlightTool] Found spans:', spans.length);

        if (spans.length === 0) {
            console.log('[HighlightTool] No spans found, checking for other text elements...');
            const allChildren = textLayer.children;
            console.log('[HighlightTool] Text layer children:', allChildren.length);
            for (let i = 0; i < Math.min(5, allChildren.length); i++) {
                console.log('[HighlightTool] Child', i, ':', allChildren[i].tagName, allChildren[i].className);
            }
        }

        // Style text spans
        this._styleTextSpans(textLayer);

        console.log('[HighlightTool] Text highlighting enabled, spans found:', spans.length);
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
        // Look for all text elements: spans, divs, and text-items
        let textElements = textLayer.querySelectorAll('span, div, .text-item');

        // Filter to only elements with actual text content
        textElements = Array.from(textElements).filter(element =>
            element.textContent && element.textContent.trim().length > 0
        );

        console.log(`[HighlightTool-${this.blockId}] Found ${textElements.length} text elements for styling`);

        if (textElements.length === 0) {
            console.warn(`[HighlightTool-${this.blockId}] No text elements found in text layer`);
            return;
        }

        // Always use CSS-based styling for better performance and isolation
        const styleId = `highlight-hover-${this.blockId}`;
        let style = document.getElementById(styleId);

        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                /* Highlight tool specific styles for block ${this.blockId} */
                #text-layer-${this.blockId}.highlight-tool-active span,
                #text-layer-${this.blockId}.highlight-tool-active div,
                #text-layer-${this.blockId}.highlight-tool-active .text-item {
                    cursor: text !important;
                    pointer-events: auto !important;
                    user-select: text !important;
                    -webkit-user-select: text !important;
                    -moz-user-select: text !important;
                    -ms-user-select: text !important;
                    transition: background-color 0.2s ease !important;
                }

                #text-layer-${this.blockId}.highlight-tool-active span:hover,
                #text-layer-${this.blockId}.highlight-tool-active div:hover,
                #text-layer-${this.blockId}.highlight-tool-active .text-item:hover {
                    background-color: rgba(255, 255, 0, 0.2) !important;
                    border-radius: 2px !important;
                }

                /* Ensure text layer is above drawing layer when highlight tool is active */
                #text-layer-${this.blockId}.highlight-tool-active {
                    z-index: 100 !important;
                    pointer-events: auto !important;
                }
            `;
            document.head.appendChild(style);
            console.log(`[HighlightTool-${this.blockId}] Added CSS-based text styling`);
        }

        // Add highlight-selectable class for identification
        textElements.forEach((element, index) => {
            element.classList.add('highlight-selectable');

            // Add debugging info for first few elements
            if (index < 3) {
                console.log(`[HighlightTool-${this.blockId}] Text element ${index}:`, {
                    tagName: element.tagName,
                    className: element.className,
                    text: element.textContent.substring(0, 50),
                    position: {
                        left: element.style.left,
                        top: element.style.top
                    }
                });
            }
        });
    }

    /**
     * Remove text span styles
     */
    _removeTextSpanStyles(textLayer) {
        const selectableElements = textLayer.querySelectorAll('.highlight-selectable');
        selectableElements.forEach(element => {
            element.classList.remove('highlight-selectable');
            element.style.cursor = '';
            element.style.transition = '';
            element.style.borderRadius = '';
            element.style.userSelect = '';
            element.style.webkitUserSelect = '';
            element.style.MozUserSelect = '';
            element.style.msUserSelect = '';
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
        console.log('[HighlightTool] Mouse down on text layer');

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
        console.log('[HighlightTool] Mouse up on text layer, isSelecting:', this.isSelecting);

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
        console.log('[HighlightTool] Processing text selection...');

        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0) {
            console.log('[HighlightTool] No selection found');
            return;
        }

        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();

        console.log('[HighlightTool] Selected text:', selectedText);

        if (range.collapsed || !selectedText) {
            console.log('[HighlightTool] Selection is collapsed or empty');
            return;
        }

        // Validate that selection is within text layer
        const textLayer = this.container.querySelector(`#text-layer-${this.blockId}`);
        if (!textLayer) {
            console.warn('[HighlightTool] Text layer not found during selection processing');
            return;
        }

        // Check if selection is within text layer
        if (!this._isSelectionInTextLayer(range, textLayer)) {
            console.log('[HighlightTool] Selection is not within text layer');
            this._clearSelection();
            return;
        }

        console.log('[HighlightTool] Selection is valid, creating highlight...');

        try {
            // Get selection bounds
            const selectionData = this._getSelectionData(range);

            if (selectionData) {
                console.log('[HighlightTool] Selection data:', selectionData);

                // Create highlight annotation
                const annotation = this.createAnnotation(selectionData);

                // Render the highlight
                this._renderHighlight(annotation);

                console.log('[HighlightTool] Highlight created successfully:', annotation);
            } else {
                console.warn('[HighlightTool] Failed to get selection data');
            }

        } catch (error) {
            console.error('[HighlightTool] Error processing text selection:', error);
        } finally {
            // Clear the selection
            this._clearSelection();
        }
    }

    /**
     * Check if selection is within text layer
     */
    _isSelectionInTextLayer(range, textLayer) {
        const commonAncestor = range.commonAncestorContainer;

        // Check if the common ancestor is the text layer or its child
        if (textLayer.contains(commonAncestor)) {
            return true;
        }

        // Check if both start and end containers are within text layer
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;

        return textLayer.contains(startContainer) && textLayer.contains(endContainer);
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
        console.log('[HighlightTool] Rendering highlight:', annotation);

        const data = annotation.data;

        if (!data.highlights || data.highlights.length === 0) {
            console.warn('[HighlightTool] No highlight data to render');
            return;
        }

        if (!this.highlightContainer) {
            console.error('[HighlightTool] Highlight container not found');
            return;
        }

        console.log('[HighlightTool] Creating', data.highlights.length, 'highlight elements');

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
            element.style.zIndex = '5';
            element.dataset.annotationId = annotation.id;
            element.dataset.highlightIndex = index;

            console.log('[HighlightTool] Created highlight element:', {
                left: highlight.left,
                top: highlight.top,
                width: highlight.width,
                height: highlight.height,
                color: this.config.color,
                opacity: this.config.opacity
            });

            this.highlightContainer.appendChild(element);
            highlightElements.push(element);
        });

        // Store elements for later removal
        this.highlightElements.set(annotation.id, highlightElements);

        console.log('[HighlightTool] Highlight rendered successfully, total elements in container:', this.highlightContainer.children.length);
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