/**
 * HighlightTool - Modern text highlighting for PDF.js integration
 * Integrates with pdfx-init.js PdfxViewer class
 */
window.HighlightTool = class HighlightTool {
    constructor(viewer, annotationInterface = null) {
        this.viewer = viewer;
        this.blockId = viewer.blockId;
        this.annotationInterface = annotationInterface;
        this.currentTool = null;

        // Highlight configuration
        this.highlightColor = '#FFFF98'; // Default yellow
        this.highlightThickness = 12;
        this.highlightShowAll = true;

        // Event handlers storage for cleanup
        this.eventHandlers = new Map();

        // Initialize
        this.init();
    }

    init() {
        console.log(`[HighlightTool] Initializing for block: ${this.blockId}`);
        this.setupToolButton();
        this.initHighlightColorPicker();
        this.initHighlightControls();
    }

    setupToolButton() {
        const highlightBtn = document.getElementById(`highlightTool-${this.blockId}`);
        const highlightToolbar = document.getElementById(`editorHighlightParamsToolbar-${this.blockId}`);

        if (highlightBtn) {
            highlightBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewer.setActiveTool('highlight');
                this.viewer.toggleParameterToolbar(highlightBtn, highlightToolbar);
            });
        }
    }

    activate() {
        console.log(`[HighlightTool] Activating text highlighting for block: ${this.blockId}`);
        this.enableTextHighlighting();
    }

    deactivate() {
        console.log(`[HighlightTool] Deactivating text highlighting for block: ${this.blockId}`);
        this.disableTextHighlighting();
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

        console.log(`[HighlightTool] TOOL_ACTION: Creating highlight for text: "${selectedText}"`);

        // Get page number from text layer
        const pageNum = this.getPageNumber(textLayer);

        // Create annotation object
        const annotation = {
            id: `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'highlights',
            pageNum: pageNum,
            text: selectedText,
            color: this.highlightColor,
            data: {
                selectedText: selectedText,
                color: this.highlightColor
            },
            config: {
                thickness: this.highlightThickness || 12,
                showAll: this.highlightShowAll !== false
            }
        };

        // Save annotation through interface
        if (this.annotationInterface) {
            console.log(`[HighlightTool] ANNOTATION_SAVE: Saving highlight annotation:`, annotation.id);
            this.annotationInterface.saveAnnotation(annotation);
        } else {
            console.warn(`[HighlightTool] ANNOTATION_MISSING: No annotation interface - highlight will not be saved!`);
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

        // Calculate position from range
        const rects = range.getClientRects();
        if (rects.length > 0) {
            const textLayerRect = textLayer.getBoundingClientRect();

            // Store rectangle data for later rendering
            const rectData = [];
            for (let i = 0; i < rects.length; i++) {
                const rect = rects[i];
                rectData.push({
                    left: rect.left - textLayerRect.left,
                    top: rect.top - textLayerRect.top,
                    width: rect.width,
                    height: rect.height
                });
            }

            // Update annotation with rectangle data for saving
            annotation.data.rects = rectData;

            // Create a highlight group for this selection
            const highlightGroup = document.createElement('div');
            highlightGroup.className = 'highlight-group';
            highlightGroup.setAttribute('data-text', selectedText);
            highlightGroup.setAttribute('data-annotation-id', annotation.id);

            for (let i = 0; i < rects.length; i++) {
                const rect = rects[i];
                const highlightRect = document.createElement('div');
                highlightRect.className = 'highlight-element';
                highlightRect.style.position = 'absolute';
                highlightRect.style.left = `${rect.left - textLayerRect.left}px`;
                highlightRect.style.top = `${rect.top - textLayerRect.top}px`;
                highlightRect.style.width = `${rect.width}px`;
                highlightRect.style.height = `${rect.height}px`;
                highlightRect.style.backgroundColor = this.highlightColor;
                highlightRect.style.opacity = '0.4';
                highlightRect.style.pointerEvents = 'none';
                highlightRect.style.borderRadius = '2px';

                highlightGroup.appendChild(highlightRect);
            }

            highlightContainer.appendChild(highlightGroup);
            console.log(`[HighlightTool] Created highlight UI with ${rects.length} rectangles for annotation: ${annotation.id}`);
        }

        // Clear selection after highlight is created
        window.getSelection().removeAllRanges();
    }

    /**
     * Get page number from text layer element
     */
    getPageNumber(textLayer) {
        // Try to find page number from page element
        let pageElement = textLayer.closest('.page');
        if (pageElement) {
            const pageId = pageElement.id;
            const match = pageId.match(/pageContainer(\d+)/);
            if (match) {
                return parseInt(match[1]);
            }
        }

        // Fallback: try to find from data attributes
        const pageNum = textLayer.getAttribute('data-page-number') ||
                       textLayer.closest('[data-page-number]')?.getAttribute('data-page-number');

        return pageNum ? parseInt(pageNum) : 1;
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
                this.highlightColor = button.dataset.color;
                console.log(`[HighlightTool-${this.blockId}] Highlight color changed to: ${this.highlightColor}`);
            });
        });

        // Set default color (yellow button which is already marked as selected in HTML)
        const defaultSelected = document.querySelector(`#highlightColorPickerButtons-${this.blockId} .colorPickerButton[aria-selected="true"]`);
        if (defaultSelected) {
            this.highlightColor = defaultSelected.dataset.color;
        } else if (colorButtons.length > 0) {
            // Fallback to first button if none selected
            colorButtons[0].setAttribute('aria-selected', 'true');
            this.highlightColor = colorButtons[0].dataset.color;
        } else {
            this.highlightColor = '#FFFF98'; // Fallback color
        }
    }

    initHighlightControls() {
        const thicknessSlider = document.getElementById(`editorFreeHighlightThickness-${this.blockId}`);
        const showAllToggle = document.getElementById(`editorHighlightShowAll-${this.blockId}`);

        if (thicknessSlider) {
            thicknessSlider.addEventListener('input', (e) => {
                this.highlightThickness = e.target.value;
            });
            this.highlightThickness = thicknessSlider.value;
        }

        if (showAllToggle) {
            showAllToggle.addEventListener('click', () => {
                const pressed = showAllToggle.getAttribute('aria-pressed') === 'true';
                showAllToggle.setAttribute('aria-pressed', !pressed);
                this.highlightShowAll = !pressed;
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
    }
};