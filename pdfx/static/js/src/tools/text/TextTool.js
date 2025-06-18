/**
 * TextTool - Text annotation functionality for PDF.js integration
 * Integrates with pdfx-init.js PdfxViewer class
 */
window.TextTool = class TextTool {
    constructor(viewer, annotationInterface = null) {
        this.viewer = viewer;
        this.blockId = viewer.blockId;
        this.annotationInterface = annotationInterface;

        // Text configuration
        this.textColor = '#000000'; // Default black
        this.textFontSize = 16; // Default font size

        // Active text boxes tracking
        this.activeTextBoxes = new Map();
        this.currentEditingBox = null;

        // Event handlers storage for cleanup
        this.eventHandlers = new Map();

        // Initialize
        this.init();
    }

    init() {
        console.log(`[TextTool] Initializing for block: ${this.blockId}`);
        this.setupToolButton();
        this.initTextControls();
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
        this.enableTextAnnotationMode();
    }

    deactivate() {
        console.log(`[TextTool] Deactivating text annotation mode for block: ${this.blockId}`);
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
        const { container, input } = textBoxData;
        const content = input.textContent.trim();

        // Replace editable input with static text display
        const finalText = document.createElement('div');
        finalText.className = 'text-annotation-final';
        finalText.textContent = content;
        finalText.style.color = this.textColor;
        finalText.style.fontSize = `${this.textFontSize}px`;
        finalText.style.fontFamily = 'Arial, sans-serif';
        finalText.style.padding = '5px';
        finalText.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        finalText.style.border = '1px solid #ccc';
        finalText.style.borderRadius = '3px';
        finalText.style.cursor = 'pointer';
        finalText.style.whiteSpace = 'pre-wrap';
        finalText.style.wordWrap = 'break-word';
        finalText.style.minWidth = '140px';
        finalText.style.minHeight = '20px';

        // Add double-click to edit functionality
        finalText.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.editExistingTextBox(textBoxData, finalText);
        });

        // Replace input with final text
        container.removeChild(input);
        container.appendChild(finalText);

        // Update the text box data
        textBoxData.input = finalText;
        textBoxData.isEditable = false;
    }

    editExistingTextBox(textBoxData, finalText) {
        if (this.currentEditingBox) {
            this.finalizeTextBox(this.currentEditingBox);
        }

        const { container } = textBoxData;
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
        const { pageIndex, x, y } = textBoxData;

        // Create annotation object
        const annotation = {
            id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'text_annotations',
            pageNum: pageIndex + 1, // pageIndex is 0-based, pageNum is 1-based
            data: {
                text: content,
                x: x,
                y: y,
                color: this.textColor,
                fontSize: this.textFontSize,
                fontFamily: 'Arial, sans-serif'
            },
            config: {
                color: this.textColor,
                fontSize: this.textFontSize,
                position: { x, y }
            }
        };

        // Save annotation through interface
        if (this.annotationInterface) {
            console.log(`[TextTool] ANNOTATION_SAVE: Saving text annotation:`, annotation.id);
            this.annotationInterface.saveAnnotation(annotation);
        } else {
            console.warn(`[TextTool] ANNOTATION_MISSING: No annotation interface - text will not be saved!`);
        }
    }

    cleanup() {
        // Remove all event handlers
        this.removePageClickListeners();

        // Finalize any active text box
        if (this.currentEditingBox) {
            this.finalizeTextBox(this.currentEditingBox);
        }

        // Clear text boxes
        this.activeTextBoxes.clear();
    }
};