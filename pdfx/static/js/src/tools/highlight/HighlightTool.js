/**
 * HighlightTool - Modern text highlighting for PDF.js integration
 * Integrates with pdfx-init.js PdfxViewer class
 */

import { BaseTool } from '../base/BaseTool.js';

export class HighlightTool extends BaseTool {
    constructor(options = {}) {
        super({
            name: 'highlight',
            ...options
        });

        this.viewer = options.viewer; // Backwards compatibility
        this.blockId = options.blockId || (this.viewer && this.viewer.blockId);
        this.currentTool = null;

        // Highlight configuration
        this.config = {
            color: '#FFFF98', // Default yellow
            thickness: 12,
            showAll: true,
            ...this.config
        };

        // Event handlers storage for cleanup
        this.eventHandlers = new Map();
    }

    async init() {
        console.log(`[HighlightTool] Initializing for block: ${this.blockId}`);
        this.setupToolButton();
        this.initHighlightColorPicker();
        this.initHighlightControls();

        // Load existing highlights
        await this.loadExistingHighlights();
    }

    enable() {
        this.isEnabled = true;
        console.log(`[HighlightTool] Tool enabled for block: ${this.blockId}`);
    }

    disable() {
        this.isEnabled = false;
        this.deactivate();
        console.log(`[HighlightTool] Tool disabled for block: ${this.blockId}`);
    }

    activate() {
        if (!this.isEnabled) return;

        this.isActive = true;
        console.log(`[HighlightTool] Activating text highlighting for block: ${this.blockId}`);
        this.enableTextHighlighting();
    }

    deactivate() {
        this.isActive = false;
        console.log(`[HighlightTool] Deactivating text highlighting for block: ${this.blockId}`);
        this.disableTextHighlighting();
    }

    setupToolButton() {
        const highlightBtn = document.getElementById(`highlightTool-${this.blockId}`);
        const highlightToolbar = document.getElementById(`editorHighlightParamsToolbar-${this.blockId}`);

        if (highlightBtn) {
            highlightBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.viewer && this.viewer.setActiveTool) {
                    this.viewer.setActiveTool('highlight');
                }
                if (this.viewer && this.viewer.toggleParameterToolbar) {
                    this.viewer.toggleParameterToolbar(highlightBtn, highlightToolbar);
                }
            });
        }
    }

    enableTextHighlighting() {
        // Find all text layers for this block (PDF.js creates .textLayer elements)
        const textLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer`);

        if (textLayers.length === 0) {
            console.warn(`[HighlightTool] No text layers found for block: ${this.blockId}`);
            // Fallback: look for alternative selectors
            const fallbackLayers = document.querySelectorAll(`[id^="textLayer-${this.blockId}"], [class*="textLayer"], [class*="text-layer"]`);
            if (fallbackLayers.length === 0) {
                return;
            }
            fallbackLayers.forEach(layer => {
                this.enableTextLayerHighlighting(layer);
            });
            return;
        }

        textLayers.forEach(textLayer => {
            this.enableTextLayerHighlighting(textLayer);
        });

        console.log(`[HighlightTool] Text highlighting enabled on ${textLayers.length} text layers`);
    }

    disableTextHighlighting() {
        const textLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer`);

        textLayers.forEach(textLayer => {
            // Remove the highlighting class
            textLayer.classList.remove('highlighting');

            // Disable text selection
            textLayer.style.pointerEvents = 'none';
            textLayer.style.userSelect = 'none';
            textLayer.style.webkitUserSelect = 'none';
            textLayer.style.MozUserSelect = 'none';
            textLayer.style.msUserSelect = 'none';

            // Remove event listeners
            this.removeTextSelectionListeners(textLayer);
        });
    }

    enableTextLayerHighlighting(textLayer) {
        // Add the highlighting class as per PDF.js example
        textLayer.classList.add('highlighting');

        // Enable text selection
        textLayer.style.pointerEvents = 'auto';
        textLayer.style.userSelect = 'text';
        textLayer.style.webkitUserSelect = 'text';
        textLayer.style.MozUserSelect = 'text';
        textLayer.style.msUserSelect = 'text';

        // Add event listeners for text selection
        this.addTextSelectionListeners(textLayer);
    }

    addTextSelectionListeners(textLayer) {
        // Remove existing listeners first
        this.removeTextSelectionListeners(textLayer);

        const onMouseDown = (e) => this.handleMouseDown(e, textLayer);
        const onMouseUp = (e) => this.handleTextSelection(e, textLayer);
        const onSelectionChange = () => this.handleSelectionChange(textLayer);

        textLayer.addEventListener('mousedown', onMouseDown);
        textLayer.addEventListener('mouseup', onMouseUp);
        document.addEventListener('selectionchange', onSelectionChange);

        // Store listeners for cleanup
        const handlerKey = `textLayer-${textLayer.id || 'unknown'}`;
        this.eventHandlers.set(handlerKey, {
            element: textLayer,
            listeners: {
                mousedown: onMouseDown,
                mouseup: onMouseUp,
                selectionchange: onSelectionChange
            }
        });
    }

    removeTextSelectionListeners(textLayer) {
        const handlerKey = `textLayer-${textLayer.id || 'unknown'}`;
        const handlers = this.eventHandlers.get(handlerKey);

        if (handlers) {
            textLayer.removeEventListener('mousedown', handlers.listeners.mousedown);
            textLayer.removeEventListener('mouseup', handlers.listeners.mouseup);
            document.removeEventListener('selectionchange', handlers.listeners.selectionchange);
            this.eventHandlers.delete(handlerKey);
        }
    }

    handleSelectionChange(textLayer) {
        const selection = window.getSelection();

        if (selection.rangeCount === 0) {
            textLayer.classList.remove('selecting');
            return;
        }

        // Check if selection intersects with this text layer
        let hasSelection = false;
        for (let i = 0; i < selection.rangeCount; i++) {
            const range = selection.getRangeAt(i);
            if (this.rangeIntersectsTextLayer(range, textLayer)) {
                hasSelection = true;
                break;
            }
        }

        if (hasSelection) {
            textLayer.classList.add('selecting');
        } else {
            textLayer.classList.remove('selecting');
        }
    }

    rangeIntersectsTextLayer(range, textLayer) {
        try {
            return textLayer.contains(range.commonAncestorContainer) ||
                   textLayer.contains(range.startContainer) ||
                   textLayer.contains(range.endContainer) ||
                   range.intersectsNode(textLayer);
        } catch (e) {
            return false;
        }
    }

    handleTextSelection(event, textLayer) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);

            // Check if selection is within the text layer
            if (this.rangeIntersectsTextLayer(range, textLayer)) {
                this.createHighlight(range, textLayer);

                // Remove selecting class after highlight is created
                setTimeout(() => {
                    textLayer.classList.remove('selecting');
                }, 100);
            }
        }
    }

    handleMouseDown(event, textLayer) {
        // Add selecting class as per PDF.js example
        textLayer.classList.add('selecting');

        // Clear any existing selection when starting new selection
        window.getSelection().removeAllRanges();
    }

    createHighlight(range, textLayer) {
        // Get the selected text
        const selectedText = range.toString().trim();
        if (!selectedText) return;

        console.log(`[HighlightTool] Creating highlight for text: "${selectedText}"`);

        // Get page number from text layer
        const pageNum = this.getPageNumberFromTextLayer(textLayer);

        // Calculate position from range
        const rects = range.getClientRects();
        if (rects.length === 0) return;

        const textLayerRect = textLayer.getBoundingClientRect();
        const highlightRects = [];

        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            highlightRects.push({
                left: rect.left - textLayerRect.left,
                top: rect.top - textLayerRect.top,
                width: rect.width,
                height: rect.height
            });
        }

        // Create annotation object using BaseTool method
        const annotation = this.createAnnotation({
            text: selectedText,
            rects: highlightRects,
            pageElement: textLayer.closest('.page'),
            color: this.config.color,
            thickness: this.config.thickness
        });

        // Render the highlight immediately
        this.renderHighlight(annotation, textLayer);

        // Save annotation through storage manager
        if (this.storageManager) {
            this.storageManager.saveAnnotation(annotation);
        }

        // Clear selection after highlight is created
        window.getSelection().removeAllRanges();

        console.log(`[HighlightTool] Created highlight annotation:`, annotation);
    }

    renderHighlight(annotation, textLayer) {
        if (!annotation || !annotation.data) return;

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

        // Create a highlight group for this annotation
        const highlightGroup = document.createElement('div');
        highlightGroup.className = 'highlight-group';
        highlightGroup.setAttribute('data-annotation-id', annotation.id);
        highlightGroup.setAttribute('data-text', annotation.data.text);

        // Create highlight rectangles
        annotation.data.rects.forEach(rect => {
            const highlightRect = document.createElement('div');
            highlightRect.className = 'highlight-element';
            highlightRect.style.position = 'absolute';
            highlightRect.style.left = `${rect.left}px`;
            highlightRect.style.top = `${rect.top}px`;
            highlightRect.style.width = `${rect.width}px`;
            highlightRect.style.height = `${rect.height}px`;
            highlightRect.style.backgroundColor = annotation.data.color || this.config.color;
            highlightRect.style.opacity = '0.4';
            highlightRect.style.pointerEvents = 'none';
            highlightRect.style.borderRadius = '2px';

            highlightGroup.appendChild(highlightRect);
        });

        highlightContainer.appendChild(highlightGroup);
        console.log(`[HighlightTool] Rendered highlight with ${annotation.data.rects.length} rectangles`);
    }

    getPageNumberFromTextLayer(textLayer) {
        // Try to find page number from text layer's parent page element
        const pageElement = textLayer.closest('.page');
        if (pageElement) {
            const pageNumber = pageElement.getAttribute('data-page-number');
            if (pageNumber) {
                return parseInt(pageNumber, 10);
            }
        }

        // Fallback to current page from viewer or tool
        if (this.viewer && this.viewer.currentPage) {
            return this.viewer.currentPage;
        }

        return this.currentPage || 1;
    }

    async loadExistingHighlights() {
        console.log(`[HighlightTool] Loading existing highlights for block: ${this.blockId}`);

        // Wait for storage manager to load data
        if (this.storageManager) {
            try {
                const highlightData = await this.storageManager.getAnnotationsByType('highlight');
                if (highlightData && typeof highlightData === 'object') {
                    await this.loadAnnotations(highlightData);
                }
            } catch (error) {
                console.error(`[HighlightTool] Error loading existing highlights:`, error);
            }
        }
    }

    handlePageChange(pageNum) {
        super.handlePageChange(pageNum);

        // Re-render highlights for the new page
        this.renderHighlightsForPage(pageNum);
    }

    renderHighlightsForPage(pageNum) {
        const annotations = this.getAnnotationsForPage(pageNum);

        // Find text layer for this page
        const textLayers = document.querySelectorAll(`#viewerContainer-${this.blockId} .textLayer`);

        annotations.forEach(annotation => {
            // Find the appropriate text layer and render the highlight
            textLayers.forEach(textLayer => {
                const layerPageNum = this.getPageNumberFromTextLayer(textLayer);
                if (layerPageNum === pageNum) {
                    this.renderHighlight(annotation, textLayer);
                }
            });
        });
    }

    initHighlightColorPicker() {
        // Use block-specific selector for color buttons
        const colorButtons = document.querySelectorAll(`#highlightColorPickerButtons-${this.blockId} .colorPickerButton`);

        colorButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove selected state from all buttons in this specific block
                colorButtons.forEach(btn => btn.setAttribute('aria-selected', 'false'));
                // Set selected state on clicked button
                button.setAttribute('aria-selected', 'true');

                // Store selected color
                this.config.color = button.dataset.color;
                console.log(`[HighlightTool-${this.blockId}] Highlight color changed to: ${this.config.color}`);
            });
        });

        // Set default color (yellow button which is already marked as selected in HTML)
        const defaultSelected = document.querySelector(`#highlightColorPickerButtons-${this.blockId} .colorPickerButton[aria-selected="true"]`);
        if (defaultSelected) {
            this.config.color = defaultSelected.dataset.color;
        } else if (colorButtons.length > 0) {
            // Fallback to first button if none selected
            colorButtons[0].setAttribute('aria-selected', 'true');
            this.config.color = colorButtons[0].dataset.color;
        } else {
            this.config.color = '#FFFF98'; // Fallback color
        }
    }

    initHighlightControls() {
        const thicknessSlider = document.getElementById(`editorFreeHighlightThickness-${this.blockId}`);
        const showAllToggle = document.getElementById(`editorHighlightShowAll-${this.blockId}`);

        if (thicknessSlider) {
            thicknessSlider.addEventListener('input', (e) => {
                this.config.thickness = e.target.value;
            });
            this.config.thickness = thicknessSlider.value;
        }

        if (showAllToggle) {
            showAllToggle.addEventListener('click', () => {
                const pressed = showAllToggle.getAttribute('aria-pressed') === 'true';
                showAllToggle.setAttribute('aria-pressed', !pressed);
                this.config.showAll = !pressed;
            });
        }
    }

    cleanup() {
        // Remove all event handlers
        this.eventHandlers.forEach((handler, key) => {
            const { element, listeners } = handler;
            element.removeEventListener('mousedown', listeners.mousedown);
            element.removeEventListener('mouseup', listeners.mouseup);
            document.removeEventListener('selectionchange', listeners.selectionchange);
        });
        this.eventHandlers.clear();

        // Call parent cleanup
        super.cleanup();
    }
}