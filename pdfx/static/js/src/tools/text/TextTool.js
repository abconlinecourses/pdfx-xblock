/**
 * TextTool - Text annotation functionality for PDF.js integration
 * Integrates with pdfx-init.js PdfxViewer class
 */
window.TextTool = class TextTool {
    constructor(viewer, annotationInterface = null) {
        this.viewer = viewer;
        this.blockId = viewer.blockId;
        this.annotationInterface = annotationInterface;

        // Current state
        this.isActive = false;
        this.activeTextBoxes = new Map();
        this.currentEditingBox = null;

        // Event handlers storage for cleanup
        this.pageClickHandlers = [];
        this.eventHandlers = new Map();

        // Text configuration
        this.textColor = '#0000ff';
        this.textFontSize = 12;

        // Zoom handling
        this.currentScale = 1;
        this.zoomHandler = null;

        // Drag functionality
        this.isDragging = false;
        this.draggedElement = null;
        this.dragOffset = { x: 0, y: 0 };
        this.dragStartPosition = { x: 0, y: 0 };

        // Popup references
        this.activeTextPopup = null;
        this.activeTextConfirmationModal = null;

        // Text annotation storage (similar to ScribbleTool's drawingData)
        this.textAnnotationData = new Map(); // Store text annotations by page

        this.init();
    }

                init() {
        console.log(`[TextTool] Initializing for block: ${this.blockId}`);
        this.setupToolButton();
        this.initTextControls();
        this.setupZoomHandler();
        this.setupGlobalClickHandler();
        this.setupPagesLoadedHandler();

        // Setup text containers for each page (similar to drawing containers)
        this.setupTextContainers();

        // Set up a periodic check for new text annotations that need handlers
        this.setupPeriodicHandlerCheck();
    }

    setupToolButton() {
        const textBtn = document.getElementById(`textTool-${this.blockId}`);
        const textToolbar = document.getElementById(`editorFreeTextParamsToolbar-${this.blockId}`);

        if (textBtn) {
            textBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewer.setActiveTool('text');
                this.viewer.toggleParameterToolbar(textBtn, textToolbar);
            });
        }
    }

        activate() {
        console.log(`[TextTool] Activating text annotation mode for block: ${this.blockId}`);
        this.isActive = true;
        this.enableTextAnnotationMode();

        // Handlers are already setup by default, no need to duplicate
    }

    deactivate() {
        console.log(`[TextTool] Deactivating text annotation mode for block: ${this.blockId}`);
        this.isActive = false;
        this.disableTextAnnotationMode();
    }

    enableTextAnnotationMode() {
        // Add text annotation mode to viewer
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.classList.add('text-annotation-mode');
        }

        // Setup click listeners on PDF pages
        this.setupPageClickListeners();

        console.log(`[TextTool] Text annotation mode enabled`);
    }

    disableTextAnnotationMode() {
        // Remove text annotation mode from viewer
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.classList.remove('text-annotation-mode');
        }

        // Remove page click listeners
        this.removePageClickListeners();

        // Finalize any active text box being edited
        if (this.currentEditingBox) {
            this.finalizeTextBox(this.currentEditingBox);
        }

        console.log(`[TextTool] Text annotation mode disabled`);
    }

    setupPageClickListeners() {
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (!viewer) return;

        // Find all PDF pages
        const pages = viewer.querySelectorAll('.page');

        pages.forEach((page, pageIndex) => {
            const onPageClick = (e) => this.handlePageClick(e, page, pageIndex);

            page.addEventListener('click', onPageClick);

            // Store listener for cleanup
            const handlerKey = `page-${pageIndex}`;
            this.eventHandlers.set(handlerKey, {
                element: page,
                listener: onPageClick
            });
        });

        console.log(`[TextTool] Set up click listeners on ${pages.length} pages`);
    }

    removePageClickListeners() {
        this.eventHandlers.forEach((handler, key) => {
            handler.element.removeEventListener('click', handler.listener);
        });
        this.eventHandlers.clear();
    }

    handlePageClick(event, page, pageIndex) {
        // Don't create text box if clicking on existing text box
        if (event.target.classList.contains('text-annotation-input') ||
            event.target.classList.contains('text-annotation-box')) {
            return;
        }

        // Finalize any currently editing text box
        if (this.currentEditingBox) {
            this.finalizeTextBox(this.currentEditingBox);
        }

        // Get click position relative to page
        const pageRect = page.getBoundingClientRect();
        const x = event.clientX - pageRect.left;
        const y = event.clientY - pageRect.top;

        // Create new text box at click position
        this.createTextBox(page, pageIndex, x, y);
    }

    createTextBox(page, pageIndex, x, y) {
        console.log(`[TextTool] Creating text box at position (${x}, ${y}) on page ${pageIndex}`);

        // Create text box container
        const textBoxContainer = document.createElement('div');
        textBoxContainer.className = 'text-annotation-box';
        textBoxContainer.style.position = 'absolute';
        textBoxContainer.style.left = `${x}px`;
        textBoxContainer.style.top = `${y}px`;
        textBoxContainer.style.zIndex = '30';
        textBoxContainer.style.minWidth = '150px';
        textBoxContainer.style.minHeight = '30px';

        // Create text input element
        const textInput = document.createElement('div');
        textInput.className = 'text-annotation-input';
        textInput.contentEditable = true;
        textInput.style.border = '1px dashed #333';
        textInput.style.padding = '5px';
        textInput.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        textInput.style.color = this.textColor;
        textInput.style.fontSize = `${this.textFontSize}px`;
        textInput.style.fontFamily = 'Arial, sans-serif';
        textInput.style.outline = 'none';
        textInput.style.minWidth = '140px';
        textInput.style.minHeight = '20px';
        textInput.style.cursor = 'text';
        textInput.style.whiteSpace = 'pre-wrap';
        textInput.style.wordWrap = 'break-word';

        // Set placeholder text
        textInput.setAttribute('data-placeholder', 'Type your text here...');
        textInput.innerHTML = '<span style="color: #999;">Type your text here...</span>';

        // Add event listeners to text input
        this.setupTextInputListeners(textInput, textBoxContainer, pageIndex, x, y);

        // Append input to container
        textBoxContainer.appendChild(textInput);

        // Make page relative positioned if not already
        if (getComputedStyle(page).position === 'static') {
            page.style.position = 'relative';
        }

        // Append to page
        page.appendChild(textBoxContainer);

        // Focus the input and select placeholder text
        textInput.focus();
        if (textInput.firstChild && textInput.firstChild.nodeType === Node.TEXT_NODE) {
            const range = document.createRange();
            range.selectNodeContents(textInput);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }

        // Set as currently editing
        this.currentEditingBox = {
            container: textBoxContainer,
            input: textInput,
            pageIndex: pageIndex,
            x: x,
            y: y
        };

        // Store in active text boxes
        const boxId = `textbox-${pageIndex}-${Date.now()}`;
        this.activeTextBoxes.set(boxId, this.currentEditingBox);

        return textBoxContainer;
    }

    setupTextInputListeners(textInput, container, pageIndex, x, y) {
        // Handle focus to clear placeholder
        const onFocus = () => {
            if (textInput.innerHTML === '<span style="color: #999;">Type your text here...</span>') {
                textInput.innerHTML = '';
            }
            textInput.style.border = '2px solid #007acc';
        };

        // Handle blur to restore placeholder if empty
        const onBlur = () => {
            if (textInput.textContent.trim() === '') {
                textInput.innerHTML = '<span style="color: #999;">Type your text here...</span>';
            }
            textInput.style.border = '1px dashed #333';
        };

        // Handle input to update text styling
        const onInput = () => {
            // Update text color and font size for new content
            const content = textInput.textContent;
            if (content.trim() !== '' && !content.includes('Type your text here...')) {
                textInput.style.color = this.textColor;
                textInput.style.fontSize = `${this.textFontSize}px`;
            }
        };

        // Handle key events
        const onKeyDown = (e) => {
            // Escape key to finish editing
            if (e.key === 'Escape') {
                this.finalizeTextBox({
                    container: container,
                    input: textInput,
                    pageIndex: pageIndex,
                    x: x,
                    y: y
                });
                e.preventDefault();
            }
            // Enter key to create new line (allow normal behavior)
            else if (e.key === 'Enter') {
                // Allow normal enter behavior for multi-line text
            }
        };

        // Prevent click events from bubbling to page
        const onContainerClick = (e) => {
            e.stopPropagation();
        };

        // Add event listeners
        textInput.addEventListener('focus', onFocus);
        textInput.addEventListener('blur', onBlur);
        textInput.addEventListener('input', onInput);
        textInput.addEventListener('keydown', onKeyDown);
        container.addEventListener('click', onContainerClick);
    }

    finalizeTextBox(textBoxData) {
        if (!textBoxData || !textBoxData.input) return;

        const { container, input } = textBoxData;
        const content = input.textContent.trim();

        // If text is empty or just placeholder, remove the text box
        if (content === '' || content === 'Type your text here...') {
            container.remove();
            console.log(`[TextTool] Removed empty text box`);
        } else {
            // Convert to final text annotation
            this.convertToFinalAnnotation(textBoxData);
            console.log(`[TextTool] TOOL_ACTION: Finalized text box with content: "${content}"`);

            // Annotation is already saved in convertToFinalAnnotation, no need to save twice
        }

        // Clear current editing reference
        if (this.currentEditingBox === textBoxData) {
            this.currentEditingBox = null;
        }
    }

    convertToFinalAnnotation(textBoxData) {
        const { container, input, pageIndex, x, y } = textBoxData;
        const content = input.textContent.trim();
        const color = this.textColor;
        const fontSize = this.textFontSize;

        // Get page element from container
        const page = container.closest('.page');
        if (!page) {
            console.error(`[TextTool] Could not find page element for text annotation`);
            return;
        }

        // Get page rect for percentage calculations
        const pageRect = page.getBoundingClientRect();
        const percentageData = this.convertPositionToPercentages(x, y, fontSize, pageRect);

        // Remove the temporary text input
        const tempTextBox = textBoxData.container;
        if (tempTextBox && tempTextBox.parentNode) {
            tempTextBox.remove();
        }

        // Create final text box element
        const finalTextBox = document.createElement('div');
        finalTextBox.className = 'text-annotation-final';
        finalTextBox.textContent = content;
        finalTextBox.style.position = 'absolute';
        finalTextBox.style.left = `${x}px`;
        finalTextBox.style.top = `${y}px`;
        finalTextBox.style.color = color;
        finalTextBox.style.fontSize = `${fontSize}px`;
        finalTextBox.style.fontFamily = 'Arial, sans-serif';
        finalTextBox.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        finalTextBox.style.border = '1px solid #ccc';
        finalTextBox.style.borderRadius = '3px';
        finalTextBox.style.padding = '5px';
        finalTextBox.style.zIndex = '30';
        finalTextBox.style.cursor = 'pointer';
        finalTextBox.style.whiteSpace = 'pre-wrap';
        finalTextBox.style.wordWrap = 'break-word';
        finalTextBox.style.minWidth = '140px';
        finalTextBox.style.minHeight = '20px';

        // Generate unique ID
        const annotationId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        finalTextBox.setAttribute('data-annotation-id', annotationId);

        // Store percentage data for zoom handling
        finalTextBox.setAttribute('data-percentage-position', JSON.stringify(percentageData));

        // Add double-click to edit functionality
        finalTextBox.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            // Don't edit if currently dragging
            if (this.isDragging) return;

            console.log(`[TextTool] Double-clicked text annotation for editing:`, annotationId);
            this.editExistingTextBox({
                ...textBoxData,
                content: content,
                annotationId: annotationId,
                finalElement: finalTextBox,
                percentageData: percentageData
            }, finalTextBox);
        });

        // Add drag and click functionality
        const fullTextData = {
            ...textBoxData,
            content: content,
            annotationId: annotationId,
            percentageData: percentageData
        };
        this.setupTextDragHandlers(finalTextBox, fullTextData);
        this.addTextClickHandler(finalTextBox, fullTextData);

        // Find or create text container for this page
        let textContainer = page.querySelector('.text-container');
        if (!textContainer) {
            // Create text container if it doesn't exist
            textContainer = document.createElement('div');
            textContainer.className = 'text-container';
            textContainer.setAttribute('data-page-number', pageIndex + 1);
            textContainer.style.position = 'absolute';
            textContainer.style.top = '0';
            textContainer.style.left = '0';
            textContainer.style.width = '100%';
            textContainer.style.height = '100%';
            textContainer.style.zIndex = '30';
            textContainer.style.pointerEvents = 'none';
            textContainer.style.overflow = 'visible';

            // Make page relative positioned if not already
            if (getComputedStyle(page).position === 'static') {
                page.style.position = 'relative';
            }

            page.appendChild(textContainer);
        }

        // Enable pointer events for this specific text element
        finalTextBox.style.pointerEvents = 'auto';

        textContainer.appendChild(finalTextBox);

        // Store text annotation data for page recreation
        this.storeTextAnnotationData(pageIndex + 1, {
            annotationId: annotationId,
            content: content,
            x: x,
            y: y,
            color: color,
            fontSize: fontSize,
            fontFamily: 'Arial, sans-serif',
            percentageData: percentageData,
            timestamp: Date.now()
        });

        // Save annotation with percentage data
        this.saveTextAnnotation({
            ...textBoxData,
            content: content,
            annotationId: annotationId,
            color: color,
            fontSize: fontSize,
            percentageData: percentageData
        }, content);

        console.log(`[TextTool] Created final text annotation: "${content}" at (${x}, ${y}) on page ${pageIndex + 1}`);

        return finalTextBox;
    }

    editExistingTextBox(textBoxData, finalText) {
        if (this.currentEditingBox) {
            this.finalizeTextBox(this.currentEditingBox);
        }

        const container = finalText.parentElement || finalText.closest('.page');
        const currentContent = finalText.textContent;

        // Create new editable input
        const textInput = document.createElement('div');
        textInput.className = 'text-annotation-input';
        textInput.contentEditable = true;
        textInput.style.border = '2px solid #007acc';
        textInput.style.padding = '5px';
        textInput.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        textInput.style.color = this.textColor;
        textInput.style.fontSize = `${this.textFontSize}px`;
        textInput.style.fontFamily = 'Arial, sans-serif';
        textInput.style.outline = 'none';
        textInput.style.minWidth = '140px';
        textInput.style.minHeight = '20px';
        textInput.style.cursor = 'text';
        textInput.style.whiteSpace = 'pre-wrap';
        textInput.style.wordWrap = 'break-word';
        textInput.textContent = currentContent;

        // Add event listeners
        this.setupTextInputListeners(textInput, container, textBoxData.pageIndex, textBoxData.x, textBoxData.y);

        // Replace final text with editable input
        container.removeChild(finalText);
        container.appendChild(textInput);

        // Focus and select all content
        textInput.focus();
        const range = document.createRange();
        range.selectNodeContents(textInput);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        // Update text box data
        textBoxData.input = textInput;
        textBoxData.isEditable = true;
        this.currentEditingBox = textBoxData;

        console.log(`[TextTool] Re-editing text box with content: "${currentContent}"`);
    }

    initTextControls() {
        const colorPicker = document.getElementById(`editorFreeTextColor-${this.blockId}`);
        const fontSizeSlider = document.getElementById(`editorFreeTextFontSize-${this.blockId}`);

        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.textColor = e.target.value;
                this.updateActiveTextStyles();
                console.log(`[TextTool] Text color changed to: ${this.textColor}`);
            });
            this.textColor = colorPicker.value || '#000000';
        }

        if (fontSizeSlider) {
            fontSizeSlider.addEventListener('input', (e) => {
                this.textFontSize = parseInt(e.target.value);
                this.updateActiveTextStyles();
                console.log(`[TextTool] Text font size changed to: ${this.textFontSize}px`);
            });
            this.textFontSize = parseInt(fontSizeSlider.value) || 16;
        }
    }

    updateActiveTextStyles() {
        // Update currently editing text box if any
        if (this.currentEditingBox && this.currentEditingBox.input) {
            const input = this.currentEditingBox.input;
            if (input.contentEditable === 'true') {
                input.style.color = this.textColor;
                input.style.fontSize = `${this.textFontSize}px`;
            }
        }
    }

    /**
     * Save text annotation
     */
    saveTextAnnotation(textBoxData, content) {
        if (!this.annotationInterface) {
            console.warn(`[TextTool] No annotation interface - text will not be saved!`);
            return;
        }

        const { pageIndex, x, y, color, fontSize, annotationId, percentageData } = textBoxData;

        const annotation = {
            id: annotationId || `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'text_annotations',
            pageNum: pageIndex + 1, // Convert 0-based to 1-based
            data: {
                text: content,
                x: x,
                y: y,
                color: color,
                fontSize: fontSize,
                fontFamily: 'Arial, sans-serif',
                percentageData: percentageData // Store percentage data for zoom scaling
            },
            config: {},
            timestamp: Date.now()
        };

        console.log(`[TextTool] Saving text annotation:`, annotation.id, `with color:`, color);
        console.log(`[TextTool] Full annotation data:`, annotation);
        this.annotationInterface.saveAnnotation(annotation);
    }

    /**
     * Setup text containers for each page (similar to drawing containers)
     */
    setupTextContainers() {
        // Find all page containers
        const pages = document.querySelectorAll(`#viewerContainer-${this.blockId} .page`);

        pages.forEach((page, index) => {
            const pageNumber = index + 1;

            // Check if text container already exists
            let container = page.querySelector('.text-container');

            if (!container) {
                // Create container for text annotations
                container = document.createElement('div');
                container.className = 'text-container';
                container.setAttribute('data-page-number', pageNumber);
                container.style.position = 'absolute';
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.zIndex = '30';
                container.style.pointerEvents = 'none'; // Let clicks pass through to page
                container.style.overflow = 'visible';

                // Make page relative positioned if not already
                if (getComputedStyle(page).position === 'static') {
                    page.style.position = 'relative';
                }

                page.appendChild(container);
                console.log(`[TextTool] Created text container for page ${pageNumber}`);

                // Restore text annotations for this page
                this.restorePageTextAnnotations(container, pageNumber);
            } else {
                // Container exists, check if we need to restore text annotations
                const existingTexts = container.querySelectorAll('.text-annotation-final');
                const expectedTexts = this.textAnnotationData.get(pageNumber)?.length || 0;

                if (existingTexts.length < expectedTexts) {
                    console.log(`[TextTool] Container for page ${pageNumber} missing ${expectedTexts - existingTexts.length} text annotations, restoring...`);
                    this.restorePageTextAnnotations(container, pageNumber);
                }
            }
        });
    }

    /**
     * Setup pages loaded handler to recreate containers after PDF.js events
     */
    setupPagesLoadedHandler() {
        if (this.viewer.eventBus) {
            this.pagesLoadedHandler = () => {
                console.log(`[TextTool] Pages loaded - ensuring text containers exist`);
                setTimeout(() => {
                    this.setupTextContainers();
                    this.repositionAllTextAnnotations();
                }, 100);
            };
            this.viewer.eventBus.on('pagesloaded', this.pagesLoadedHandler);
        }
    }

    /**
     * Setup zoom event handling for text repositioning
     */
    setupZoomHandler() {
        if (this.viewer.eventBus) {
            this.zoomHandler = (evt) => {
                const newScale = evt.scale;
                if (newScale !== this.currentScale) {
                    console.log(`[TextTool] Scale changed from ${this.currentScale} to ${newScale}`);
                    this.currentScale = newScale;

                    // Recreate containers and reposition text after zoom
                    setTimeout(() => {
                        this.setupTextContainers();
                        this.repositionAllTextAnnotations();
                    }, 100);
                }
            };
            this.viewer.eventBus.on('scalechanging', this.zoomHandler);
        }
    }

        /**
     * Reposition all text annotations when zoom changes
     */
    repositionAllTextAnnotations() {
        console.log(`[TextTool] Repositioning all text annotations after zoom`);

        // Find all text containers and their text annotations
        const textContainers = document.querySelectorAll(`#viewerContainer-${this.blockId} .text-container`);

        textContainers.forEach(container => {
            const textAnnotations = container.querySelectorAll('.text-annotation-final');
            console.log(`[TextTool] Found ${textAnnotations.length} text annotations in container`);

            textAnnotations.forEach(textElement => {
                const storedData = textElement.getAttribute('data-percentage-position');

                if (storedData) {
                    try {
                        const percentageData = JSON.parse(storedData);
                        this.updateTextPosition(textElement, percentageData);
                        console.log(`[TextTool] Repositioned text annotation:`, textElement.getAttribute('data-annotation-id'));
                    } catch (e) {
                        console.warn(`[TextTool] Failed to parse stored position data for text annotation`);
                    }
                } else {
                    console.warn(`[TextTool] No percentage position data found for text annotation`);
                }
            });
        });

        // Handlers will be picked up by periodic check, no need to force setup after zoom
    }

        /**
     * Update text position based on percentage data
     */
    updateTextPosition(textElement, percentageData) {
        const container = textElement.closest('.text-container');
        const page = textElement.closest('.page');
        if (!page) {
            console.warn(`[TextTool] Cannot update text position - missing page`);
            return;
        }

        // If text is not in a container yet, position relative to page
        if (!container) {
            const pageRect = page.getBoundingClientRect();
            if (percentageData) {
                const newX = (percentageData.xPercent / 100) * pageRect.width;
                const newY = (percentageData.yPercent / 100) * pageRect.height;
                const scaledFontSize = percentageData.fontSizePercent ?
                    (percentageData.fontSizePercent / 100) * pageRect.height :
                    (parseInt(textElement.style.fontSize) || this.textFontSize);

                textElement.style.left = `${newX}px`;
                textElement.style.top = `${newY}px`;
                textElement.style.fontSize = `${scaledFontSize}px`;

                console.log(`[TextTool] Updated position (no container) to (${newX}, ${newY}) with font size ${scaledFontSize}px`);
            }
            return;
        }

        // Get current page dimensions
        const pageRect = page.getBoundingClientRect();

        if (percentageData) {
            // Calculate new position based on page size (container is same size as page)
            const newX = (percentageData.xPercent / 100) * pageRect.width;
            const newY = (percentageData.yPercent / 100) * pageRect.height;

            // Font size should scale with page height for consistency
            const scaledFontSize = percentageData.fontSizePercent ?
                (percentageData.fontSizePercent / 100) * pageRect.height :
                (parseInt(textElement.style.fontSize) || this.textFontSize);

            textElement.style.left = `${newX}px`;
            textElement.style.top = `${newY}px`;
            textElement.style.fontSize = `${scaledFontSize}px`;

            console.log(`[TextTool] Updated position to (${newX}, ${newY}) with font size ${scaledFontSize}px`);
        }
    }

    /**
     * Convert pixel coordinates to percentages relative to page
     */
    convertPositionToPercentages(x, y, fontSize, pageRect) {
        return {
            xPercent: (x / pageRect.width) * 100,
            yPercent: (y / pageRect.height) * 100,
            fontSizePercent: (fontSize / pageRect.height) * 100
        };
    }

    /**
     * Store text annotation data for page recreation
     */
    storeTextAnnotationData(pageNumber, textData) {
        if (!this.textAnnotationData.has(pageNumber)) {
            this.textAnnotationData.set(pageNumber, []);
            console.log(`[TextTool] Created new page entry in textAnnotationData for page ${pageNumber}`);
        }

        // Check if annotation already exists (avoid duplicates)
        const existingIndex = this.textAnnotationData.get(pageNumber).findIndex(
            annotation => annotation.annotationId === textData.annotationId
        );

        if (existingIndex !== -1) {
            // Update existing annotation
            this.textAnnotationData.get(pageNumber)[existingIndex] = textData;
            console.log(`[TextTool] Updated existing text annotation in storage:`, textData.annotationId);
        } else {
            // Add new annotation
            this.textAnnotationData.get(pageNumber).push(textData);
            console.log(`[TextTool] Stored new text annotation:`, textData.annotationId);
        }

        console.log(`[TextTool] Page ${pageNumber} now has ${this.textAnnotationData.get(pageNumber).length} text annotations in storage`);
    }

    /**
     * Restore text annotations for a specific page from stored data
     */
    restorePageTextAnnotations(container, pageNumber) {
        console.log(`[TextTool] Restoring text annotations for page ${pageNumber}`);

        const pageTextData = this.textAnnotationData.get(pageNumber);
        if (!pageTextData || pageTextData.length === 0) {
            console.log(`[TextTool] No text annotations to restore for page ${pageNumber}`);
            return;
        }

        console.log(`[TextTool] Found ${pageTextData.length} text annotations to restore for page ${pageNumber}`);

        pageTextData.forEach((textData) => {
            // Check if this annotation already exists in the container
            const existingText = container.querySelector(`[data-annotation-id="${textData.annotationId}"]`);
            if (existingText) {
                console.log(`[TextTool] Text annotation ${textData.annotationId} already exists, skipping recreation`);
                return;
            }

            console.log(`[TextTool] Recreating text annotation:`, textData.annotationId);
            this.recreateTextAnnotation(container, textData, pageNumber);
        });

        console.log(`[TextTool] Restored ${pageTextData.length} text annotations for page ${pageNumber}`);
    }

    /**
     * Recreate a text annotation element from stored data
     */
    recreateTextAnnotation(container, textData, pageNumber) {
        const page = container.closest('.page');
        if (!page) {
            console.error(`[TextTool] Cannot recreate text annotation - no page found for container`);
            return;
        }

        // Create final text box element
        const finalTextBox = document.createElement('div');
        finalTextBox.className = 'text-annotation-final';
        finalTextBox.textContent = textData.content;
        finalTextBox.style.position = 'absolute';
        finalTextBox.style.color = textData.color;
        finalTextBox.style.fontSize = `${textData.fontSize}px`;
        finalTextBox.style.fontFamily = textData.fontFamily;
        finalTextBox.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        finalTextBox.style.border = '1px solid #ccc';
        finalTextBox.style.borderRadius = '3px';
        finalTextBox.style.padding = '5px';
        finalTextBox.style.zIndex = '30';
        finalTextBox.style.cursor = 'pointer';
        finalTextBox.style.whiteSpace = 'pre-wrap';
        finalTextBox.style.wordWrap = 'break-word';
        finalTextBox.style.minWidth = '140px';
        finalTextBox.style.minHeight = '20px';
        finalTextBox.style.pointerEvents = 'auto';

        // Set annotation ID
        finalTextBox.setAttribute('data-annotation-id', textData.annotationId);

        // Store percentage data for zoom handling
        finalTextBox.setAttribute('data-percentage-position', JSON.stringify(textData.percentageData));

        // Position the text using percentage data if available, otherwise use pixel coordinates
        if (textData.percentageData) {
            this.updateTextPosition(finalTextBox, textData.percentageData);
        } else {
            finalTextBox.style.left = `${textData.x}px`;
            finalTextBox.style.top = `${textData.y}px`;
        }

        // Add double-click to edit functionality
        finalTextBox.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (this.isDragging) return;

            console.log(`[TextTool] Double-clicked text annotation for editing:`, textData.annotationId);
            this.editExistingTextBox({
                pageIndex: pageNumber - 1, // Convert back to 0-based
                x: textData.x,
                y: textData.y,
                content: textData.content,
                annotationId: textData.annotationId,
                finalElement: finalTextBox,
                percentageData: textData.percentageData
            }, finalTextBox);
        });

        // Add drag and click functionality
        const fullTextData = {
            pageIndex: pageNumber - 1, // Convert back to 0-based
            content: textData.content,
            annotationId: textData.annotationId,
            percentageData: textData.percentageData,
            fontSize: textData.fontSize,
            color: textData.color
        };
        this.setupTextDragHandlers(finalTextBox, fullTextData);
        this.addTextClickHandler(finalTextBox, fullTextData);

        container.appendChild(finalTextBox);

        console.log(`[TextTool] Recreated text annotation: "${textData.content}" with ID: ${textData.annotationId}`);
    }

        /**
     * Remove text annotation from storage
     */
    removeTextFromStorage(annotationId, pageNumber) {
        if (this.textAnnotationData.has(pageNumber)) {
            const pageTexts = this.textAnnotationData.get(pageNumber);
            const textIndex = pageTexts.findIndex(text => text.annotationId === annotationId);

            if (textIndex !== -1) {
                pageTexts.splice(textIndex, 1);
                console.log(`[TextTool] Removed text annotation from storage: ${annotationId}`);
                console.log(`[TextTool] Page ${pageNumber} now has ${pageTexts.length} text annotations in storage`);
            }
        }
    }

    /**
     * Update text annotation position in storage
     */
    updateTextInStorage(annotationId, newX, newY, newPercentageData) {
        // Find the annotation in storage across all pages
        this.textAnnotationData.forEach((pageTexts, pageNumber) => {
            const textIndex = pageTexts.findIndex(text => text.annotationId === annotationId);
            if (textIndex !== -1) {
                // Update position data
                pageTexts[textIndex].x = newX;
                pageTexts[textIndex].y = newY;
                pageTexts[textIndex].percentageData = newPercentageData;

                console.log(`[TextTool] Updated text annotation position in storage: ${annotationId} to (${newX}, ${newY})`);
                return;
            }
        });
    }

        /**
     * Setup drag handlers for existing text annotations
     * Called when annotations are loaded or when tool is activated
     */
    setupExistingTextDragHandlers() {
        // Look for all possible text annotation selectors
        const selectors = [
            `#viewerContainer-${this.blockId} .text-annotation-final`,
            `#pdfx-block-${this.blockId} .text-annotation-final`,
            `[data-annotation-id*="text_"]`
        ];

        let existingTexts = [];
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (!existingTexts.includes(el)) {
                    existingTexts.push(el);
                }
            });
        });

        existingTexts.forEach(textElement => {
            const annotationId = textElement.getAttribute('data-annotation-id');
            const percentageDataStr = textElement.getAttribute('data-percentage-position');

            if (annotationId) {
                // Extract page index from element position
                const page = textElement.closest('.page');
                let pageIndex = 0;
                if (page) {
                    const pageNumber = page.getAttribute('data-page-number');
                    if (pageNumber) {
                        pageIndex = parseInt(pageNumber) - 1;
                    }
                }

                // Capture actual color from the element's computed style
                const computedStyle = window.getComputedStyle(textElement);
                const actualColor = computedStyle.color;

                let textData = {
                    annotationId: annotationId,
                    content: textElement.textContent,
                    fontSize: parseInt(textElement.style.fontSize) || this.textFontSize,
                    color: actualColor || this.textColor, // Use actual color from element
                    pageIndex: pageIndex
                };

                // Parse percentage data if available
                if (percentageDataStr) {
                    try {
                        textData.percentageData = JSON.parse(percentageDataStr);
                    } catch (e) {
                        console.warn(`[TextTool] Failed to parse percentage data for existing text:`, annotationId);
                    }
                }

                // Check if handlers are already setup
                if (!textElement.hasAttribute('data-handlers-setup')) {
                    this.setupTextDragHandlers(textElement, textData);
                    this.addTextClickHandler(textElement, textData);
                    textElement.setAttribute('data-handlers-setup', 'true');
                }
            }
        });

        if (existingTexts.length > 0) {
            console.log(`[TextTool] Setup handlers for ${existingTexts.length} existing text annotations`);
        }
    }

    /**
     * Setup global click handler to close popups
     */
    setupGlobalClickHandler() {
        document.addEventListener('click', (e) => {
            if (this.activeTextPopup &&
                !e.target.closest('.text-popup-menu') &&
                !e.target.closest('.text-annotation-final')) {
                this.hideTextDeletePopup();
            }
        });
    }

        /**
     * Setup periodic check for text annotations that need handlers
     * This approach is less intrusive than immediate setup
     */
    setupPeriodicHandlerCheck() {
        // Only add handlers to elements that are fully loaded and don't have them yet
        const checkForNewTextAnnotations = () => {
            // Skip if currently editing
            if (this.currentEditingBox) {
                return;
            }

            // Look for text annotations that don't have handlers yet and are fully rendered
            const textAnnotations = document.querySelectorAll(`[data-annotation-id*="text_"].text-annotation-final:not([data-handlers-setup])`);

            textAnnotations.forEach(textElement => {
                // Only process if element is fully in DOM and visible
                if (textElement.offsetParent !== null && textElement.textContent.trim() !== '') {
                    const annotationId = textElement.getAttribute('data-annotation-id');

                    if (annotationId) {
                        const page = textElement.closest('.page');
                        let pageIndex = 0;
                        if (page) {
                            const pageNumber = page.getAttribute('data-page-number');
                            if (pageNumber) {
                                pageIndex = parseInt(pageNumber) - 1;
                            }
                        }

                        // Capture actual color from the element's computed style
                        const computedStyle = window.getComputedStyle(textElement);
                        const actualColor = computedStyle.color;

                        const textData = {
                            annotationId: annotationId,
                            content: textElement.textContent,
                            fontSize: parseInt(textElement.style.fontSize) || this.textFontSize,
                            color: actualColor || this.textColor, // Use actual color from element
                            pageIndex: pageIndex
                        };

                        // Parse percentage data if available
                        const percentageDataStr = textElement.getAttribute('data-percentage-position');
                        if (percentageDataStr) {
                            try {
                                textData.percentageData = JSON.parse(percentageDataStr);
                            } catch (e) {
                                console.warn(`[TextTool] Failed to parse percentage data:`, annotationId);
                            }
                        }

                        // Setup handlers
                        this.setupTextDragHandlers(textElement, textData);
                        this.addTextClickHandler(textElement, textData);
                        textElement.setAttribute('data-handlers-setup', 'true');
                    }
                }
            });
        };

        // Initial check after 2 seconds
        setTimeout(checkForNewTextAnnotations, 2000);

        // Periodic check every 3 seconds (less frequent to avoid interference)
        this.handlerCheckInterval = setInterval(checkForNewTextAnnotations, 3000);
    }

    /**
     * Public method to setup handlers for text annotations
     * Can be called when new annotations are loaded
     */
    refreshTextHandlers() {
        this.setupExistingTextDragHandlers();
    }

    cleanup() {
        // Remove zoom handler
        if (this.viewer.eventBus && this.zoomHandler) {
            this.viewer.eventBus.off('scalechanging', this.zoomHandler);
            this.zoomHandler = null;
        }

        // Remove pages loaded handler
        if (this.viewer.eventBus && this.pagesLoadedHandler) {
            this.viewer.eventBus.off('pagesloaded', this.pagesLoadedHandler);
            this.pagesLoadedHandler = null;
        }

        // Clear periodic handler check
        if (this.handlerCheckInterval) {
            clearInterval(this.handlerCheckInterval);
            this.handlerCheckInterval = null;
        }

        // Remove page click listeners
        this.removePageClickListeners();

        // Hide any active popups
        this.hideTextDeletePopup();

        // Clear active text boxes
        this.activeTextBoxes.clear();

        // Clear stored text annotation data
        this.textAnnotationData.clear();

        console.log(`[TextTool] Cleanup completed`);
    }

    /**
     * Setup drag handlers for text annotation
     */
    setupTextDragHandlers(textElement, textData) {
        let dragStartTime = 0;

        const onMouseDown = (e) => {
            // Only handle left mouse button
            if (e.button !== 0) return;

            dragStartTime = Date.now();

            // Prevent text selection during drag
            e.preventDefault();
            e.stopPropagation();

            // Get initial positions
            const textRect = textElement.getBoundingClientRect();
            const page = textElement.closest('.page');
            const pageRect = page.getBoundingClientRect();

            this.dragOffset.x = e.clientX - textRect.left;
            this.dragOffset.y = e.clientY - textRect.top;
            this.dragStartPosition.x = textRect.left - pageRect.left;
            this.dragStartPosition.y = textRect.top - pageRect.top;

            // Setup drag state
            this.isDragging = false; // Will be set to true on first mouse move
            this.draggedElement = textElement;

            // Visual feedback preparation
            textElement.style.cursor = 'grabbing';
            textElement.style.zIndex = '50';

            // Add document-level event listeners for drag and drop
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!this.draggedElement) return;

            // Set dragging flag on first move
            if (!this.isDragging) {
                this.isDragging = true;
                this.draggedElement.style.opacity = '0.7';
                this.draggedElement.style.border = '2px dashed #007acc';

                // Hide any open popup when drag starts
                this.hideTextDeletePopup();
            }

            // Calculate new position
            const page = this.draggedElement.closest('.page');
            const pageRect = page.getBoundingClientRect();

            const newX = e.clientX - pageRect.left - this.dragOffset.x;
            const newY = e.clientY - pageRect.top - this.dragOffset.y;

            // Constrain to page boundaries
            const constrainedX = Math.max(0, Math.min(newX, pageRect.width - this.draggedElement.offsetWidth));
            const constrainedY = Math.max(0, Math.min(newY, pageRect.height - this.draggedElement.offsetHeight));

            // Update position
            this.draggedElement.style.left = `${constrainedX}px`;
            this.draggedElement.style.top = `${constrainedY}px`;
        };

        const onMouseUp = (e) => {
            // Remove document event listeners
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            if (!this.draggedElement) return;

            const dragEndTime = Date.now();
            const dragDuration = dragEndTime - dragStartTime;

            // Reset visual styles
            this.draggedElement.style.cursor = 'pointer';
            this.draggedElement.style.zIndex = '30';
            this.draggedElement.style.opacity = '1';
            this.draggedElement.style.border = '1px solid #ccc';

            // If it was a real drag (not just a click)
            if (this.isDragging && dragDuration > 100) {
                // Get final position
                const page = this.draggedElement.closest('.page');
                const pageRect = page.getBoundingClientRect();
                const finalRect = this.draggedElement.getBoundingClientRect();

                const finalX = finalRect.left - pageRect.left;
                const finalY = finalRect.top - pageRect.top;

                // Check if position actually changed
                const moveThreshold = 5; // pixels
                const deltaX = Math.abs(finalX - this.dragStartPosition.x);
                const deltaY = Math.abs(finalY - this.dragStartPosition.y);

                if (deltaX > moveThreshold || deltaY > moveThreshold) {
                    // Update percentage data for zoom handling
                    const newPercentageData = this.convertPositionToPercentages(finalX, finalY, textData.fontSize || this.textFontSize, pageRect);
                    this.draggedElement.setAttribute('data-percentage-position', JSON.stringify(newPercentageData));

                    // Update stored data with new position
                    this.updateTextInStorage(textData.annotationId, finalX, finalY, newPercentageData);

                    // Save the move
                    this.saveTextMove(textData, finalX, finalY, newPercentageData);

                    console.log(`[TextTool] Text moved from (${this.dragStartPosition.x}, ${this.dragStartPosition.y}) to (${finalX}, ${finalY})`);
                }
            } else if (dragDuration < 200) {
                // Handle as click if it was a quick tap without significant drag
            }

            // Reset drag state
            this.isDragging = false;
            this.draggedElement = null;
        };

        // Add mouse down listener to text element
        textElement.addEventListener('mousedown', onMouseDown);
    }

    /**
     * Add click handler for text annotation (for delete popup)
     */
    addTextClickHandler(textElement, textData) {
        let clickStartTime = 0;

        // Mouse down handler for drag and click detection
        const onMouseDown = (e) => {
            clickStartTime = Date.now();
        };

        // Click handler for delete popup (only if not dragged)
        const onClick = (e) => {
            const clickDuration = Date.now() - clickStartTime;

            // Show popup for quick clicks without significant movement
            if (!this.isDragging && clickDuration < 300) {
                e.stopPropagation();
                e.preventDefault();
                this.showTextDeletePopup(textElement, textData);
            }
        };

        // Only add click handler if it doesn't already exist
        if (!textElement.hasAttribute('data-click-handler')) {
            textElement.addEventListener('mousedown', onMouseDown);
            textElement.addEventListener('click', onClick);
            textElement.setAttribute('data-click-handler', 'true');
        }
    }

    /**
     * Show delete popup for text annotation
     */
    showTextDeletePopup(textElement, textData) {
        console.log(`[TextTool] Showing delete popup for text:`, textData.annotationId);

        // Hide any existing popup
        this.hideTextDeletePopup();

        // Create popup menu
        const popup = document.createElement('div');
        popup.className = `text-popup-menu text-popup-${this.blockId}`;

        // Professional popup styling
        popup.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            padding: 4px;
            z-index: 10000;
            display: block;
            visibility: visible;
            opacity: 1;
            min-width: 36px;
            min-height: 36px;
        `;

        popup.innerHTML = `
            <button class="text-popup-delete" title="Delete Text" style="
                background: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                line-height: 1;
                width: 28px;
                height: 28px;
                transition: background-color 0.2s;
            " onmouseover="this.style.backgroundColor='#c82333'" onmouseout="this.style.backgroundColor='#dc3545'">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                    <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                </svg>
            </button>
        `;

        // Position popup near the text
        const textRect = textElement.getBoundingClientRect();

        // Position popup to the top-right of the text
        const leftPos = textRect.right + 8;
        const topPos = textRect.top - 8;

        // Ensure popup stays within viewport
        const popupWidth = 44;
        const popupHeight = 44;

        let finalLeft = leftPos;
        let finalTop = topPos;

        // Adjust if popup would go off right edge
        if (leftPos + popupWidth > window.innerWidth) {
            finalLeft = textRect.left - popupWidth - 8;
        }

        // Adjust if popup would go off top edge
        if (topPos < 0) {
            finalTop = textRect.bottom + 8;
        }

        // Adjust if popup would go off bottom edge
        if (finalTop + popupHeight > window.innerHeight) {
            finalTop = textRect.top - popupHeight - 8;
        }

        popup.style.left = `${finalLeft}px`;
        popup.style.top = `${finalTop}px`;

        // Add popup to document body
        document.body.appendChild(popup);

        // Add delete functionality
        const deleteBtn = popup.querySelector('.text-popup-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showTextConfirmationModal(popup, textData);
            });
        }

        // Store reference
        this.activeTextPopup = popup;

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (this.activeTextPopup === popup) {
                this.hideTextDeletePopup();
            }
        }, 5000);
    }

    /**
     * Show confirmation modal for text deletion
     */
    showTextConfirmationModal(parentPopup, textData) {
        console.log(`[TextTool] Showing confirmation modal for text:`, textData.annotationId);

        // Hide any existing confirmation modal
        this.hideTextConfirmationModal();

        // Create confirmation modal
        const modal = document.createElement('div');
        modal.className = `text-confirmation-modal text-confirmation-${this.blockId}`;

        // Position the modal horizontally near the delete button
        const parentRect = parentPopup.getBoundingClientRect();

        // Modal styling
        modal.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #ccc;
            border-radius: 6px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            padding: 12px;
            z-index: 10001;
            display: block;
            visibility: visible;
            opacity: 1;
            min-width: 140px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            animation: confirmModalSlideIn 0.2s ease-out;
        `;

        modal.innerHTML = `
            <div style="
                margin-bottom: 10px;
                color: #333;
                font-weight: 500;
                line-height: 1.3;
            ">Delete this text?</div>
            <div style="
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            ">
                <button class="text-confirm-cancel" style="
                    background: #f8f9fa;
                    color: #6c757d;
                    border: 1px solid #dee2e6;
                    border-radius: 4px;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.15s;
                " onmouseover="
                    this.style.backgroundColor='#e9ecef';
                    this.style.borderColor='#adb5bd';
                " onmouseout="
                    this.style.backgroundColor='#f8f9fa';
                    this.style.borderColor='#dee2e6';
                ">Cancel</button>
                <button class="text-confirm-delete" style="
                    background: #dc3545;
                    color: white;
                    border: 1px solid #dc3545;
                    border-radius: 4px;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.15s;
                " onmouseover="
                    this.style.backgroundColor='#c82333';
                    this.style.borderColor='#bd2130';
                " onmouseout="
                    this.style.backgroundColor='#dc3545';
                    this.style.borderColor='#dc3545';
                ">Delete</button>
            </div>
        `;

        // Position modal to the right of the popup, or left if no space
        let modalLeft = parentRect.right + 8;
        const modalTop = parentRect.top;
        const modalWidth = 140;

        // If modal would go off right edge, position it to the left
        if (modalLeft + modalWidth > window.innerWidth) {
            modalLeft = parentRect.left - modalWidth - 8;
        }

        // If still off screen, position it below
        if (modalLeft < 0) {
            modalLeft = parentRect.left;
            modal.style.top = `${parentRect.bottom + 8}px`;
        } else {
            modal.style.top = `${modalTop}px`;
        }

        modal.style.left = `${modalLeft}px`;

        // Add modal to document body
        document.body.appendChild(modal);

        // Add event handlers
        const cancelBtn = modal.querySelector('.text-confirm-cancel');
        const deleteBtn = modal.querySelector('.text-confirm-delete');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideTextConfirmationModal();
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideTextConfirmationModal();
                this.hideTextDeletePopup();
                this.deleteText(textData);
            });
        }

        // Store reference
        this.activeTextConfirmationModal = modal;

        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (this.activeTextConfirmationModal === modal) {
                this.hideTextConfirmationModal();
            }
        }, 10000);
    }

    /**
     * Hide text delete popup
     */
    hideTextDeletePopup() {
        if (this.activeTextPopup) {
            this.activeTextPopup.remove();
            this.activeTextPopup = null;
        }
        // Also hide any confirmation modal
        this.hideTextConfirmationModal();
    }

    /**
     * Hide text confirmation modal
     */
    hideTextConfirmationModal() {
        if (this.activeTextConfirmationModal) {
            this.activeTextConfirmationModal.remove();
            this.activeTextConfirmationModal = null;
        }
    }

    /**
     * Delete a text annotation
     */
    deleteText(textData) {
        console.log(`[TextTool] Deleting text annotation:`, textData.annotationId);

        // Find page number
        let pageNumber = null;

        // Method 1: Get from textData
        if (textData.pageIndex !== undefined) {
            pageNumber = textData.pageIndex + 1; // Convert 0-based to 1-based
        }

        // Method 2: Get from DOM if not found in textData
        if (pageNumber === null) {
            const textElement = document.querySelector(`[data-annotation-id="${textData.annotationId}"]`);
            if (textElement) {
                const page = textElement.closest('.page');
                if (page) {
                    const pageNumberAttr = page.getAttribute('data-page-number');
                    if (pageNumberAttr) {
                        pageNumber = parseInt(pageNumberAttr);
                        console.log(`[TextTool] Found page number from DOM for deletion: ${pageNumber}`);
                    }
                }
            }
        }

        // Remove text element from DOM
        const textElement = document.querySelector(`[data-annotation-id="${textData.annotationId}"]`);
        if (textElement) {
            textElement.remove();
            console.log(`[TextTool] Removed text element from DOM`);
        }

        // Remove from stored data
        this.removeTextFromStorage(textData.annotationId, pageNumber);

        // Save deletion through annotation interface
        if (this.annotationInterface && pageNumber !== null) {
            this.saveTextDeletion(textData, pageNumber);
        } else {
            console.warn(`[TextTool] Cannot save deletion - annotationInterface:`, !!this.annotationInterface, `pageNumber:`, pageNumber);
        }

        console.log(`[TextTool] Successfully deleted text annotation:`, textData.annotationId);
    }

    /**
     * Save text annotation deletion to server
     */
    saveTextDeletion(textData, pageNumber) {
        if (!this.annotationInterface) {
            console.warn(`[TextTool] No annotation interface available - deletion will not be saved!`);
            return;
        }

        // Create deletion annotation that will overwrite the existing one
        const deletionAnnotation = {
            id: textData.annotationId,
            type: 'text_annotations',
            pageNum: pageNumber,
            data: {
                _deleted: true,
                _action: 'delete',
                text: textData.content,
                timestamp: Date.now()
            },
            config: {
                type: 'text_deletion',
                action: 'delete'
            },
            timestamp: Date.now()
        };

        console.log(`[TextTool] Saving text deletion to server:`, textData.annotationId);
        this.annotationInterface.saveAnnotation(deletionAnnotation)
            .then(() => {
                console.log(`[TextTool] Successfully saved text deletion for:`, textData.annotationId);
            })
            .catch((error) => {
                console.error(`[TextTool] Failed to save text deletion for:`, textData.annotationId, error);
            });
    }

    /**
     * Save text annotation move
     */
    saveTextMove(textData, newLeft, newTop, newPercentageData) {
        if (!this.annotationInterface) {
            console.warn(`[TextTool] No annotation interface - text move will not be saved!`);
            return;
        }

        // Find page number
        let pageNumber = null;

        // Method 1: Get from textData
        if (textData.pageIndex !== undefined) {
            pageNumber = textData.pageIndex + 1; // Convert 0-based to 1-based
        }

        // Method 2: Get from DOM if not found in textData
        if (pageNumber === null) {
            const textElement = document.querySelector(`[data-annotation-id="${textData.annotationId}"]`);
            if (textElement) {
                const page = textElement.closest('.page');
                if (page) {
                    const pageNumberAttr = page.getAttribute('data-page-number');
                    if (pageNumberAttr) {
                        pageNumber = parseInt(pageNumberAttr);
                        console.log(`[TextTool] Found page number from DOM for move: ${pageNumber}`);
                    }
                }
            }
        }

        if (pageNumber === null) {
            console.warn(`[TextTool] Could not find page number for moved text - annotation ID:`, textData.annotationId);
            return;
        }

        // Create updated annotation - remove move-specific fields that might cause duplicates
        const annotation = {
            id: textData.annotationId,
            type: 'text_annotations',
            pageNum: pageNumber,
            data: {
                text: textData.content,
                x: newLeft,
                y: newTop,
                color: textData.color || this.textColor,
                fontSize: textData.fontSize || this.textFontSize,
                fontFamily: 'Arial, sans-serif',
                percentageData: newPercentageData
            },
            config: {},
            timestamp: Date.now()
        };

        console.log(`[TextTool] Saving text move to server:`, textData.annotationId);
        this.annotationInterface.saveAnnotation(annotation)
            .then(() => {
                console.log(`[TextTool] Successfully saved text move for:`, textData.annotationId);
            })
            .catch((error) => {
                console.error(`[TextTool] Failed to save text move for:`, textData.annotationId, error);
            });
    }
};