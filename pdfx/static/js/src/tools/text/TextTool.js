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

        this.init();
    }

    init() {
        console.log(`[TextTool] Initializing for block: ${this.blockId}`);
        this.setupToolButton();
        this.initTextControls();
        this.setupZoomHandler();
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

            // Save text annotation
            this.saveTextAnnotation(textBoxData, content);
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
            console.log(`[TextTool] Double-clicked text annotation for editing:`, annotationId);
            this.editExistingTextBox({
                ...textBoxData,
                content: content,
                annotationId: annotationId,
                finalElement: finalTextBox,
                percentageData: percentageData
            }, finalTextBox);
        });

        // Make page relative positioned if not already
        if (getComputedStyle(page).position === 'static') {
            page.style.position = 'relative';
        }

        page.appendChild(finalTextBox);

        // Save annotation with percentage data
        this.saveTextAnnotation({
            ...textBoxData,
            content: content,
            annotationId: annotationId,
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

        console.log(`[TextTool] Saving text annotation:`, annotation.id);
        this.annotationInterface.saveAnnotation(annotation);
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
                    this.repositionAllTextAnnotations();
                }
            };
            this.viewer.eventBus.on('scalechanging', this.zoomHandler);
        }
    }

    /**
     * Reposition all text annotations when zoom changes
     */
    repositionAllTextAnnotations() {
        const textAnnotations = document.querySelectorAll(`#viewerContainer-${this.blockId} .text-annotation-final`);
        textAnnotations.forEach(textElement => {
            const storedData = textElement.getAttribute('data-percentage-position');

            if (storedData) {
                try {
                    const percentageData = JSON.parse(storedData);
                    this.updateTextPosition(textElement, percentageData);
                } catch (e) {
                    console.warn(`[TextTool] Failed to parse stored position data for text annotation`);
                }
            }
        });
    }

    /**
     * Update text position based on percentage data
     */
    updateTextPosition(textElement, percentageData) {
        const page = textElement.closest('.page');
        if (!page) return;

        const pageRect = page.getBoundingClientRect();

        if (percentageData) {
            const newX = (percentageData.xPercent / 100) * pageRect.width;
            const newY = (percentageData.yPercent / 100) * pageRect.height;
            const newFontSize = (percentageData.fontSizePercent / 100) * pageRect.height;

            textElement.style.left = `${newX}px`;
            textElement.style.top = `${newY}px`;
            textElement.style.fontSize = `${newFontSize}px`;
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

    cleanup() {
        // Remove zoom handler
        if (this.viewer.eventBus && this.zoomHandler) {
            this.viewer.eventBus.off('scalechanging', this.zoomHandler);
            this.zoomHandler = null;
        }

        // Remove page click listeners
        this.removePageClickListeners();

        // Clear active text boxes
        this.activeTextBoxes.clear();

        console.log(`[TextTool] Cleanup completed`);
    }
};