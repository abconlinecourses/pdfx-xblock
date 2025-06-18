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

        // Context menu state
        this.contextMenu = null;
        this.activeHighlight = null;

        // Zoom handling
        this.currentScale = 1;
        this.zoomHandler = null;

        // Initialize
        this.init();
    }

    init() {
        console.log(`[HighlightTool] Initializing for block: ${this.blockId}`);
        this.setupToolButton();
        this.initHighlightColorPicker();
        this.initHighlightControls();
        this.createContextMenu();
        this.setupGlobalClickHandler();
        this.setupZoomHandler();
    }

    /**
     * Setup zoom event handling for highlight repositioning
     */
    setupZoomHandler() {
        if (this.viewer.eventBus) {
            this.zoomHandler = (evt) => {
                const newScale = evt.scale;
                if (newScale !== this.currentScale) {
                    console.log(`[HighlightTool] Scale changed from ${this.currentScale} to ${newScale}`);
                    this.currentScale = newScale;

                    // Hide context menu during zoom to avoid positioning issues
                    if (this.contextMenu && this.contextMenu.classList.contains('visible')) {
                        console.log(`[HighlightTool] Hiding context menu during zoom`);
                        this.hideContextMenu();
                    }

                    // Use setTimeout to ensure PDF.js has finished rendering at new scale
                    setTimeout(() => {
                        this.repositionAllHighlights();
                    }, 100);
                }
            };
            this.viewer.eventBus.on('scalechanging', this.zoomHandler);
        }
    }

    /**
     * Reposition all highlights when zoom changes
     */
    repositionAllHighlights() {
        const highlights = document.querySelectorAll(`#viewerContainer-${this.blockId} .highlight-group`);
        console.log(`[HighlightTool] Repositioning ${highlights.length} highlights for zoom change`);

        highlights.forEach(highlight => {
            const annotationId = highlight.getAttribute('data-annotation-id');
            const storedData = highlight.getAttribute('data-percentage-rects');

            if (storedData) {
                try {
                    const percentageRects = JSON.parse(storedData);
                    this.updateHighlightPosition(highlight, percentageRects);
                    console.log(`[HighlightTool] Repositioned highlight ${annotationId}`);
                } catch (e) {
                    console.warn(`[HighlightTool] Failed to parse stored rect data for ${annotationId}:`, e);
                }
            } else {
                console.warn(`[HighlightTool] No percentage data found for highlight ${annotationId}`);
            }
        });
    }

    /**
     * Update highlight position based on percentage data
     */
    updateHighlightPosition(highlightGroup, percentageRects) {
        const textLayer = highlightGroup.closest('.textLayer');
        if (!textLayer) {
            console.warn(`[HighlightTool] No textLayer found for highlight group`);
            return;
        }

        // Get current text layer dimensions
        const textLayerRect = textLayer.getBoundingClientRect();
        const highlightElements = highlightGroup.querySelectorAll('.highlight-element');

        console.log(`[HighlightTool] Updating highlight with textLayer size: ${textLayerRect.width}x${textLayerRect.height}`);

        highlightElements.forEach((element, index) => {
            if (percentageRects[index]) {
                const rect = percentageRects[index];
                const newLeft = (rect.leftPercent / 100) * textLayerRect.width;
                const newTop = (rect.topPercent / 100) * textLayerRect.height;
                const newWidth = (rect.widthPercent / 100) * textLayerRect.width;
                const newHeight = (rect.heightPercent / 100) * textLayerRect.height;

                element.style.left = `${newLeft}px`;
                element.style.top = `${newTop}px`;
                element.style.width = `${newWidth}px`;
                element.style.height = `${newHeight}px`;

                console.log(`[HighlightTool] Updated highlight element ${index}: (${newLeft}, ${newTop}) ${newWidth}x${newHeight}`);
            }
        });
    }

    /**
     * Convert pixel coordinates to percentages relative to text layer
     */
    convertRectsToPercentages(rects, textLayerRect) {
        console.log(`[HighlightTool] Converting rects to percentages with textLayer: ${textLayerRect.width}x${textLayerRect.height}`);

        return rects.map((rect, index) => {
            const percentRect = {
                leftPercent: (rect.left / textLayerRect.width) * 100,
                topPercent: (rect.top / textLayerRect.height) * 100,
                widthPercent: (rect.width / textLayerRect.width) * 100,
                heightPercent: (rect.height / textLayerRect.height) * 100
            };
            console.log(`[HighlightTool] Rect ${index}: ${rect.left},${rect.top} ${rect.width}x${rect.height} -> ${percentRect.leftPercent}%,${percentRect.topPercent}% ${percentRect.widthPercent}%x${percentRect.heightPercent}%`);
            return percentRect;
        });
    }

    /**
     * Create the context menu for highlight editing
     */
    createContextMenu() {
        // Remove existing context menu if it exists
        const existingMenu = document.getElementById(`highlight-context-menu-${this.blockId}`);
        if (existingMenu) {
            existingMenu.remove();
        }

        const contextMenu = document.createElement('div');
        contextMenu.id = `highlight-context-menu-${this.blockId}`;
        contextMenu.className = 'highlight-context-menu hidden'; // Start hidden with CSS class

        // Main section with colors and delete button in one row
        const mainSection = document.createElement('div');
        mainSection.className = 'context-menu-section';
        mainSection.style.cssText = 'padding: 8px;';

        const colorLabel = document.createElement('div');
        colorLabel.textContent = 'Highlight Color';
        colorLabel.style.cssText = 'font-weight: 500; margin-bottom: 6px; color: #333; font-size: 12px;';
        mainSection.appendChild(colorLabel);

        const controlsGrid = document.createElement('div');
        controlsGrid.className = 'context-controls-grid';
        controlsGrid.style.cssText = 'display: flex; gap: 4px; align-items: center;';

        // Define color options (same as toolbar)
        const colors = [
            { name: 'Yellow', color: '#FFFF98' },
            { name: 'Green', color: '#53FFBC' },
            { name: 'Blue', color: '#80EBFF' },
            { name: 'Pink', color: '#FFCBE6' },
            { name: 'Red', color: '#FF4F5F' }
        ];

        colors.forEach(colorOption => {
            const colorButton = document.createElement('button');
            colorButton.className = 'context-color-button';
            colorButton.style.cssText = `
                width: 24px;
                height: 24px;
                border: 2px solid #ddd;
                border-radius: 3px;
                background-color: ${colorOption.color};
                cursor: pointer;
                transition: border-color 0.2s, transform 0.1s;
                padding: 0;
                margin: 0;
            `;
            colorButton.title = colorOption.name;
            colorButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.changeHighlightColor(colorOption.color);
            });
            colorButton.addEventListener('mouseenter', () => {
                colorButton.style.borderColor = '#007cba';
                colorButton.style.transform = 'scale(1.1)';
            });
            colorButton.addEventListener('mouseleave', () => {
                colorButton.style.borderColor = '#ddd';
                colorButton.style.transform = 'scale(1)';
            });
            controlsGrid.appendChild(colorButton);
        });

        // Add separator
        const separator = document.createElement('div');
        separator.style.cssText = 'width: 1px; height: 20px; background-color: #ddd; margin: 0 4px;';
        controlsGrid.appendChild(separator);

        // Delete button as icon
        const deleteButton = document.createElement('button');
        deleteButton.className = 'context-delete-button';
        deleteButton.innerHTML = '🗑️'; // Trash icon
        deleteButton.title = 'Delete Highlight';
        deleteButton.style.cssText = `
            width: 24px;
            height: 24px;
            border: 2px solid #dc3545;
            border-radius: 3px;
            background-color: #fff;
            color: #dc3545;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
            padding: 0;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteHighlight();
        });
        deleteButton.addEventListener('mouseenter', () => {
            deleteButton.style.backgroundColor = '#dc3545';
            deleteButton.style.color = 'white';
            deleteButton.style.transform = 'scale(1.1)';
        });
        deleteButton.addEventListener('mouseleave', () => {
            deleteButton.style.backgroundColor = '#fff';
            deleteButton.style.color = '#dc3545';
            deleteButton.style.transform = 'scale(1)';
        });

        controlsGrid.appendChild(deleteButton);
        mainSection.appendChild(controlsGrid);
        contextMenu.appendChild(mainSection);

        // Add to the viewer container instead of document body for better positioning
        const viewerContainer = document.getElementById(`viewerContainer-${this.blockId}`);
        if (viewerContainer) {
            viewerContainer.appendChild(contextMenu);
        } else {
            document.body.appendChild(contextMenu);
        }
        this.contextMenu = contextMenu;
    }

    /**
     * Setup global click handler to close context menu
     */
    setupGlobalClickHandler() {
        // Store the handler for proper cleanup
        this.globalClickHandler = (e) => {
            if (this.contextMenu && !this.contextMenu.contains(e.target)) {
                // Check if the click is on a highlight element (which should show the menu)
                const clickedHighlight = e.target.closest('.highlight-group');
                if (!clickedHighlight) {
                    console.log(`[HighlightTool] Clicked outside context menu and highlights, hiding menu`);
                    this.hideContextMenu();
                }
            }
        };

        document.addEventListener('click', this.globalClickHandler);
        console.log(`[HighlightTool] Global click handler setup for context menu`);
    }

    /**
     * Show context menu positioned relative to the highlight element using percentages
     */
    showContextMenu(x, y, highlightElement) {
        if (!this.contextMenu) {
            console.warn(`[HighlightTool] No context menu available`);
            return;
        }

        console.log(`[HighlightTool] Showing context menu for highlight:`, highlightElement.getAttribute('data-annotation-id'));

        this.activeHighlight = highlightElement;

        // Show the menu using CSS classes
        this.contextMenu.classList.remove('hidden');
        this.contextMenu.classList.add('visible');

        // Get the viewer container as positioning reference
        const viewerContainer = document.getElementById(`viewerContainer-${this.blockId}`);
        if (!viewerContainer) {
            console.error(`[HighlightTool] No viewer container found for block: ${this.blockId}`);
            return;
        }

        // Get positions and dimensions
        const highlightRect = highlightElement.getBoundingClientRect();
        const containerRect = viewerContainer.getBoundingClientRect();

        // Calculate percentage-based position relative to the viewer container
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;

        // Position relative to highlight in percentages
        const highlightCenterX = highlightRect.left - containerRect.left + (highlightRect.width / 2);
        const highlightCenterY = highlightRect.top - containerRect.top + (highlightRect.height / 2);

        // Convert to percentages
        let menuXPercent = (highlightCenterX / containerWidth) * 100;
        let menuYPercent = (highlightCenterY / containerHeight) * 100;

        // Offset the menu to the right and slightly down from the highlight center
        menuXPercent += 5; // 5% offset to the right
        menuYPercent -= 2; // 2% offset up

        // Ensure menu stays within container bounds (with 20% margin)
        menuXPercent = Math.max(2, Math.min(menuXPercent, 75)); // Keep between 2% and 75%
        menuYPercent = Math.max(2, Math.min(menuYPercent, 85)); // Keep between 2% and 85%

        // Apply percentage-based positioning
        this.contextMenu.style.left = menuXPercent + '%';
        this.contextMenu.style.top = menuYPercent + '%';

        console.log(`[HighlightTool] Context menu positioned at ${menuXPercent.toFixed(1)}%, ${menuYPercent.toFixed(1)}% for highlight at (${highlightRect.left}, ${highlightRect.top})`);
        console.log(`[HighlightTool] Container dimensions: ${containerWidth}x${containerHeight}`);
        console.log(`[HighlightTool] Highlight center: (${highlightCenterX}, ${highlightCenterY})`);

        // Store the current positioning for potential repositioning on zoom
        this.contextMenu._percentagePosition = {
            x: menuXPercent,
            y: menuYPercent
        };
    }

    /**
     * Hide context menu
     */
    hideContextMenu() {
        if (this.contextMenu) {
            console.log(`[HighlightTool] Hiding context menu`);
            this.contextMenu.classList.add('hidden');
            this.contextMenu.classList.remove('visible');
            this.activeHighlight = null;
        }
    }

    /**
     * Change color of the active highlight
     */
    changeHighlightColor(newColor) {
        if (!this.activeHighlight) return;

        const annotationId = this.activeHighlight.getAttribute('data-annotation-id');
        if (!annotationId) return;

        console.log(`[HighlightTool] Changing color of highlight ${annotationId} to ${newColor}`);

        // Update visual elements
        const highlightElements = this.activeHighlight.querySelectorAll('.highlight-element');
        highlightElements.forEach(element => {
            element.style.backgroundColor = newColor;
        });

        // Get the annotation data from storage to update it properly
        const pageNum = this.getPageNumberFromHighlight(this.activeHighlight);
        const selectedText = this.activeHighlight.getAttribute('data-text') || '';

        // Create a new annotation with updated color but same ID and data
        const updatedAnnotation = {
            id: annotationId,
            type: 'highlights',
            pageNum: pageNum,
            text: selectedText,
            color: newColor,
            data: {
                selectedText: selectedText,
                color: newColor,
                // Preserve any existing rectangle data if available
                rects: this.extractRectsFromVisualElements(this.activeHighlight)
            },
            config: {
                thickness: this.highlightThickness || 12,
                showAll: this.highlightShowAll !== false
            },
            timestamp: Date.now()
        };

        // Save the updated annotation
        if (this.annotationInterface) {
            this.annotationInterface.saveAnnotation(updatedAnnotation);
        }

        this.hideContextMenu();
    }

    /**
     * Delete the active highlight
     */
    deleteHighlight() {
        if (!this.activeHighlight) return;

        const annotationId = this.activeHighlight.getAttribute('data-annotation-id');
        if (!annotationId) return;

        console.log(`[HighlightTool] Deleting highlight ${annotationId}`);

        // Get page number before removing element
        const pageNum = this.getPageNumberFromHighlight(this.activeHighlight);

        // Remove visual element
        this.activeHighlight.remove();

        // Send deletion request through annotation interface
        if (this.annotationInterface && this.annotationInterface.storageManager) {
            const deletionData = {
                action: 'delete',
                deletions: [{
                    id: annotationId,
                    type: 'highlights',
                    pageNum: pageNum
                }]
            };

            // Use the storage manager's request method to delete
            this.annotationInterface.storageManager._makeRequest('POST',
                this.annotationInterface.storageManager.handlerUrl, deletionData);
        }

        this.hideContextMenu();
    }

    /**
     * Extract rectangle data from visual highlight elements for preservation
     */
    extractRectsFromVisualElements(highlightGroup) {
        const rects = [];
        const highlightElements = highlightGroup.querySelectorAll('.highlight-element');

        highlightElements.forEach(element => {
            const rect = {
                left: parseFloat(element.style.left) || 0,
                top: parseFloat(element.style.top) || 0,
                width: parseFloat(element.style.width) || 0,
                height: parseFloat(element.style.height) || 0
            };
            rects.push(rect);
        });

        return rects;
    }

    /**
     * Get page number from highlight element
     */
    getPageNumberFromHighlight(highlightElement) {
        const textLayer = highlightElement.closest('.textLayer');
        if (textLayer) {
            return this.getPageNumber(textLayer);
        }
        return 1; // fallback
    }

    /**
     * Make highlight elements interactive (for saved highlights)
     */
    makeHighlightInteractive(highlightElement) {
        // Enable pointer events for interaction
        highlightElement.style.pointerEvents = 'auto';
        highlightElement.style.cursor = 'pointer';

        // Also make child highlight elements interactive but prevent them from handling clicks
        const childHighlights = highlightElement.querySelectorAll('.highlight-element');
        childHighlights.forEach(child => {
            child.style.pointerEvents = 'none'; // Let parent handle clicks
            child.style.cursor = 'pointer';
        });

        console.log(`[HighlightTool] Making highlight interactive with ${childHighlights.length} child elements`);

        // Add click handler
        const clickHandler = (e) => {
            e.stopPropagation();
            e.preventDefault();

            console.log(`[HighlightTool] Highlight clicked:`, highlightElement.getAttribute('data-annotation-id'));
            console.log(`[HighlightTool] Current tool:`, this.viewer.currentTool);

            // Always show context menu when clicking on highlights (regardless of current tool)
            this.showContextMenu(e.clientX, e.clientY, highlightElement);
        };

        highlightElement.addEventListener('click', clickHandler);

        // Store the handler for cleanup
        highlightElement._contextClickHandler = clickHandler;

        // Add hover effect
        const mouseEnterHandler = () => {
            if (this.viewer.currentTool !== 'highlight') {
                highlightElement.style.opacity = '0.6';
            }
        };

        const mouseLeaveHandler = () => {
            highlightElement.style.opacity = '0.4';
        };

        highlightElement.addEventListener('mouseenter', mouseEnterHandler);
        highlightElement.addEventListener('mouseleave', mouseLeaveHandler);

        // Store handlers for cleanup
        highlightElement._contextMouseEnterHandler = mouseEnterHandler;
        highlightElement._contextMouseLeaveHandler = mouseLeaveHandler;
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
        // Hide context menu when activating tool
        this.hideContextMenu();
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

        // Calculate position from range
        const rects = range.getClientRects();
        if (rects.length > 0) {
            const textLayerRect = textLayer.getBoundingClientRect();

            // Store rectangle data as pixels for immediate rendering
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

            // Convert to percentages for storage
            const percentageRects = this.convertRectsToPercentages(rectData, textLayerRect);

            // Create annotation object with percentage data
            const annotation = {
                id: `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'highlights',
                pageNum: pageNum,
                text: selectedText,
                color: this.highlightColor,
                data: {
                    selectedText: selectedText,
                    color: this.highlightColor,
                    rects: rectData, // Keep pixel data for compatibility
                    percentageRects: percentageRects // Add percentage data for zoom scaling
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

            // Create a highlight group for this selection
            const highlightGroup = document.createElement('div');
            highlightGroup.className = 'highlight-group';
            highlightGroup.setAttribute('data-text', selectedText);
            highlightGroup.setAttribute('data-annotation-id', annotation.id);
            // Store percentage data as attribute for zoom handling
            highlightGroup.setAttribute('data-percentage-rects', JSON.stringify(percentageRects));

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

            // Make new highlight interactive
            this.makeHighlightInteractive(highlightGroup);

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

    /**
     * Test method to verify percentage positioning works correctly
     */
    testPercentagePositioning() {
        console.log(`[HighlightTool] Testing percentage positioning...`);

        const highlights = document.querySelectorAll(`#viewerContainer-${this.blockId} .highlight-group`);
        console.log(`[HighlightTool] Found ${highlights.length} highlights to test`);

        highlights.forEach((highlight, index) => {
            const annotationId = highlight.getAttribute('data-annotation-id');
            const percentageData = highlight.getAttribute('data-percentage-rects');
            const textLayer = highlight.closest('.textLayer');

            console.log(`[HighlightTool] Highlight ${index} (${annotationId}):`);
            console.log(`  - Has percentage data:`, !!percentageData);
            console.log(`  - Text layer found:`, !!textLayer);

            if (textLayer) {
                const rect = textLayer.getBoundingClientRect();
                console.log(`  - Text layer size: ${rect.width}x${rect.height}`);
            }

            if (percentageData) {
                try {
                    const data = JSON.parse(percentageData);
                    console.log(`  - Percentage data:`, data);
                } catch (e) {
                    console.log(`  - Failed to parse percentage data:`, e);
                }
            }

            const highlightElements = highlight.querySelectorAll('.highlight-element');
            console.log(`  - Highlight elements: ${highlightElements.length}`);
            highlightElements.forEach((el, elIndex) => {
                console.log(`    Element ${elIndex}: (${el.style.left}, ${el.style.top}) ${el.style.width}x${el.style.height}`);
            });
        });
    }

    cleanup() {
        // Remove zoom handler
        if (this.viewer.eventBus && this.zoomHandler) {
            this.viewer.eventBus.off('scalechanging', this.zoomHandler);
            this.zoomHandler = null;
        }

        // Remove global click handler for context menu
        if (this.globalClickHandler) {
            document.removeEventListener('click', this.globalClickHandler);
            this.globalClickHandler = null;
        }

        // Remove context menu
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }

        // Remove all event handlers
        this.eventHandlers.forEach((handler, key) => {
            const { element, listeners } = handler;
            element.removeEventListener('mousedown', listeners.mousedown);
            element.removeEventListener('mouseup', listeners.mouseup);
            document.removeEventListener('selectionchange', listeners.selectionchange);
        });
        this.eventHandlers.clear();

        // Clean up interactive highlights
        const highlights = document.querySelectorAll(`[data-annotation-id]`);
        highlights.forEach(highlight => {
            if (highlight._contextClickHandler) {
                highlight.removeEventListener('click', highlight._contextClickHandler);
            }
            if (highlight._contextMouseEnterHandler) {
                highlight.removeEventListener('mouseenter', highlight._contextMouseEnterHandler);
            }
            if (highlight._contextMouseLeaveHandler) {
                highlight.removeEventListener('mouseleave', highlight._contextMouseLeaveHandler);
            }
        });

        console.log(`[HighlightTool] Cleanup completed`);
    }

        /**
     * Render a single saved highlight on a text layer
     */
    renderSavedHighlight(highlight, textLayer) {
        // Check if this highlight already exists to prevent duplicates
        const existingHighlight = textLayer.querySelector(`[data-annotation-id="${highlight.id}"]`);
        if (existingHighlight) {
            console.log(`[HighlightTool] Highlight ${highlight.id} already exists, skipping render`);
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
        const highlightGroup = document.createElement('div');
        highlightGroup.className = 'highlight-group saved-highlight';
        highlightGroup.setAttribute('data-annotation-id', highlight.id);
        highlightGroup.setAttribute('data-text', highlight.data.selectedText || highlight.text || '');

        // Use percentage data if available, otherwise fallback to pixel data
        let rectsToRender = null;
        let percentageRects = null;

        if (highlight.data.percentageRects && Array.isArray(highlight.data.percentageRects)) {
            percentageRects = highlight.data.percentageRects;
            // Store percentage data for zoom handling
            highlightGroup.setAttribute('data-percentage-rects', JSON.stringify(percentageRects));

            console.log(`[HighlightTool] Rendering saved highlight ${highlight.id} with percentage data:`, percentageRects);

            // Convert percentages to current pixel positions
            const textLayerRect = textLayer.getBoundingClientRect();
            console.log(`[HighlightTool] TextLayer rect for saved highlight:`, textLayerRect.width, 'x', textLayerRect.height);

            rectsToRender = percentageRects.map(rect => ({
                left: (rect.leftPercent / 100) * textLayerRect.width,
                top: (rect.topPercent / 100) * textLayerRect.height,
                width: (rect.widthPercent / 100) * textLayerRect.width,
                height: (rect.heightPercent / 100) * textLayerRect.height
            }));
        } else if (highlight.data.rects && Array.isArray(highlight.data.rects)) {
            // Fallback to pixel data (legacy highlights) - convert to percentages for future zoom support
            rectsToRender = highlight.data.rects;

            // Try to convert legacy pixel data to percentages for zoom support
            const textLayerRect = textLayer.getBoundingClientRect();
            if (textLayerRect.width > 0 && textLayerRect.height > 0) {
                percentageRects = this.convertRectsToPercentages(highlight.data.rects, textLayerRect);
                highlightGroup.setAttribute('data-percentage-rects', JSON.stringify(percentageRects));
                console.log(`[HighlightTool] Converted legacy pixel data to percentages for highlight: ${highlight.id}`);
            } else {
                console.log(`[HighlightTool] Using legacy pixel data for highlight: ${highlight.id}`);
            }
        }

        if (rectsToRender && rectsToRender.length > 0) {
            rectsToRender.forEach((rect, index) => {
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
                console.log(`[HighlightTool] Created highlight rect ${index}: (${rect.left}, ${rect.top}) ${rect.width}x${rect.height}`);
            });

            console.log(`[HighlightTool] Rendered saved highlight with ${rectsToRender.length} rectangles:`, highlight.id);
        } else {
            // Fallback: create a simple highlight marker if we don't have precise rectangle data
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
            console.log(`[HighlightTool] Rendered fallback highlight marker:`, highlight.id);
        }

        highlightContainer.appendChild(highlightGroup);

        // Make saved highlight interactive
        this.makeHighlightInteractive(highlightGroup);
    }
};