/**
 * TextTool - Text annotation functionality for PDF.js integration
 *
 * Provides text annotation capabilities with inline editing and positioning
 */

import { BaseTool } from '../base/BaseTool.js';

export class TextTool extends BaseTool {
    constructor(options = {}) {
        super({
            name: 'text',
            ...options
        });

        // Text configuration
        this.config = {
            color: '#000000',
            fontSize: 16,
            fontFamily: 'Arial, sans-serif',
            ...this.config
        };

        // Tool state
        this.isAddingText = false;
        this.activeTextEditor = null;

        // Page event handlers
        this.pageHandlers = new Map();

        // Parameter toolbar controls
        this.parameterControls = null;
    }

    /**
     * Initialize the text tool
     */
    async init() {
        try {
            console.log(`[TextTool] Initializing for block: ${this.blockId}`);

            // Setup parameter toolbar controls
            this._setupParameterControls();

        this.isEnabled = true;
            console.log(`[TextTool] Initialized successfully`);

        } catch (error) {
            console.error(`[TextTool] Error during initialization:`, error);
            throw error;
        }
    }

    /**
     * Setup parameter toolbar controls
     */
    _setupParameterControls() {
        this.parameterControls = {
            colorPicker: document.getElementById(`editorFreeTextColor-${this.blockId}`),
            fontSizeSlider: document.getElementById(`editorFreeTextFontSize-${this.blockId}`)
        };

        // Setup color picker
        if (this.parameterControls.colorPicker) {
            this.parameterControls.colorPicker.addEventListener('change', (e) => {
                this.config.color = e.target.value;
                console.log(`[TextTool] Color changed to: ${this.config.color}`);
            });
            this.parameterControls.colorPicker.value = this.config.color;
        }

        // Setup font size slider
        if (this.parameterControls.fontSizeSlider) {
            this.parameterControls.fontSizeSlider.addEventListener('input', (e) => {
                this.config.fontSize = parseInt(e.target.value);
                console.log(`[TextTool] Font size changed to: ${this.config.fontSize}px`);
            });
            this.parameterControls.fontSizeSlider.value = this.config.fontSize;
        }
    }

    /**
     * Enable the tool
     */
    enable() {
        this.isEnabled = true;
        console.log(`[TextTool] Tool enabled`);
    }

    /**
     * Disable the tool
     */
    disable() {
        if (this.isActive) {
            this.deactivate();
        }
        this.isEnabled = false;
        console.log(`[TextTool] Tool disabled`);
    }

    /**
     * Activate the tool
     */
    activate() {
        if (!this.isEnabled) {
            return false;
        }

        console.log(`[TextTool] Activating text tool`);
        this.isActive = true;
        this.isAddingText = true;

        // Setup page click listeners
        this._setupPageClickListeners();

        // Show instructions
        this._showTextInstructions();

        return true;
    }

    /**
     * Deactivate the tool
     */
    deactivate() {
        console.log(`[TextTool] Deactivating text tool`);
        this.isActive = false;
        this.isAddingText = false;

        // Remove page click listeners
        this._removePageClickListeners();

        // Hide any active editors
        if (this.activeTextEditor) {
            this._finishTextEditing();
        }

        // Hide instructions
        this._hideTextInstructions();
    }

    /**
     * Setup page click listeners for text placement
     */
    _setupPageClickListeners() {
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (!viewer) return;

        const pages = viewer.querySelectorAll('.page');

        pages.forEach((page, pageIndex) => {
            const handler = (event) => this._handlePageClick(event, page, pageIndex + 1);
            page.addEventListener('click', handler);
            this.pageHandlers.set(page, handler);
        });
    }

    /**
     * Remove page click listeners
     */
    _removePageClickListeners() {
        this.pageHandlers.forEach((handler, page) => {
            page.removeEventListener('click', handler);
        });
        this.pageHandlers.clear();
    }

    /**
     * Handle page click for text placement
     */
    _handlePageClick(event, page, pageNum) {
        if (!this.isAddingText || this.activeTextEditor) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // Calculate position relative to the page
        const pageRect = page.getBoundingClientRect();
        const x = event.clientX - pageRect.left;
        const y = event.clientY - pageRect.top;

        console.log(`[TextTool] Text placement at page ${pageNum}, position (${x}, ${y})`);

        // Create text editor
        this._createTextEditor(page, pageNum, x, y);
    }

    /**
     * Create text editor at specified position
     */
    _createTextEditor(page, pageNum, x, y) {
        // Hide instructions
        this._hideTextInstructions();

        // Create editor container
        const editor = document.createElement('div');
        editor.className = 'text-annotation-editor';
        editor.style.position = 'absolute';
        editor.style.left = `${x}px`;
        editor.style.top = `${y}px`;
        editor.style.zIndex = '1000';
        editor.style.minWidth = '200px';
        editor.style.backgroundColor = 'white';
        editor.style.border = '2px solid #007acc';
        editor.style.borderRadius = '4px';
        editor.style.padding = '8px';
        editor.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';

        // Create text input
        const textInput = document.createElement('textarea');
        textInput.placeholder = 'Enter text...';
        textInput.style.width = '100%';
        textInput.style.border = 'none';
        textInput.style.outline = 'none';
        textInput.style.resize = 'both';
        textInput.style.minHeight = '40px';
        textInput.style.fontFamily = this.config.fontFamily;
        textInput.style.fontSize = `${this.config.fontSize}px`;
        textInput.style.color = this.config.color;
        textInput.style.backgroundColor = 'transparent';

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginTop = '8px';

        // Create save button
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.style.padding = '4px 12px';
        saveButton.style.backgroundColor = '#007acc';
        saveButton.style.color = 'white';
        saveButton.style.border = 'none';
        saveButton.style.borderRadius = '4px';
        saveButton.style.cursor = 'pointer';

        // Create cancel button
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.padding = '4px 12px';
        cancelButton.style.backgroundColor = '#6c757d';
        cancelButton.style.color = 'white';
        cancelButton.style.border = 'none';
        cancelButton.style.borderRadius = '4px';
        cancelButton.style.cursor = 'pointer';

        // Assemble editor
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(saveButton);
        editor.appendChild(textInput);
        editor.appendChild(buttonContainer);

        // Add to page
        page.appendChild(editor);

        // Setup event handlers
        const saveHandler = () => {
            const text = textInput.value.trim();
            if (text) {
                this._saveTextAnnotation(page, pageNum, x, y, text, editor);
            } else {
                this._cancelTextEditing(editor);
            }
        };

        const cancelHandler = () => {
            this._cancelTextEditing(editor);
        };

        const keyHandler = (event) => {
            if (event.key === 'Escape') {
                cancelHandler();
            } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                saveHandler();
            }
        };

        saveButton.addEventListener('click', saveHandler);
        cancelButton.addEventListener('click', cancelHandler);
        textInput.addEventListener('keydown', keyHandler);

        // Focus the input
        textInput.focus();

        // Store reference
        this.activeTextEditor = {
            element: editor,
            textInput: textInput,
            page: page,
            pageNum: pageNum,
            handlers: { saveHandler, cancelHandler, keyHandler }
        };
    }

    /**
     * Save text annotation
     */
    _saveTextAnnotation(page, pageNum, x, y, text, editorElement) {
        console.log(`[TextTool] Saving text annotation: "${text}" at (${x}, ${y}) on page ${pageNum}`);

        // Create annotation data
        const annotationData = {
            text: text,
            x: x,
            y: y,
            width: editorElement.offsetWidth,
            height: editorElement.offsetHeight,
            fontSize: this.config.fontSize,
            color: this.config.color,
            fontFamily: this.config.fontFamily
        };

        // Set current page for annotation
        this.currentPage = pageNum;

        // Create annotation
        const annotation = this.createAnnotation(annotationData);

        // Create permanent text element
        this._createTextElement(page, annotation);

        // Finish editing
        this._finishTextEditing();

        // Save to storage if available
        // Save through annotation interface
        if (this.annotationInterface) {
            this.annotationInterface.saveAnnotation(annotation);
        } else if (this.storageManager) {
            this.storageManager.saveAnnotation(annotation);
        }
    }

    /**
     * Create permanent text element
     */
    _createTextElement(page, annotation) {
        const textElement = document.createElement('div');
        textElement.className = 'text-annotation';
        textElement.dataset.annotationId = annotation.id;
        textElement.style.position = 'absolute';
        textElement.style.left = `${annotation.data.x}px`;
        textElement.style.top = `${annotation.data.y}px`;
        textElement.style.fontSize = `${annotation.data.fontSize}px`;
        textElement.style.color = annotation.data.color;
        textElement.style.fontFamily = annotation.data.fontFamily;
        textElement.style.cursor = 'pointer';
        textElement.style.padding = '4px';
        textElement.style.border = '1px solid transparent';
        textElement.style.borderRadius = '2px';
        textElement.style.userSelect = 'none';
        textElement.style.pointerEvents = 'auto';
        textElement.style.zIndex = '100';
        textElement.textContent = annotation.data.text;

        // Add hover effect
        textElement.addEventListener('mouseenter', () => {
            textElement.style.backgroundColor = 'rgba(0, 122, 204, 0.1)';
            textElement.style.borderColor = '#007acc';
        });

        textElement.addEventListener('mouseleave', () => {
            textElement.style.backgroundColor = 'transparent';
            textElement.style.borderColor = 'transparent';
        });

        // Add click handler for editing
        textElement.addEventListener('click', (event) => {
            event.stopPropagation();
            if (this.isActive) {
                this._editTextAnnotation(annotation, textElement);
            }
        });

        page.appendChild(textElement);

        // Store reference in annotation
        annotation.element = textElement;
    }

    /**
     * Edit existing text annotation
     */
    _editTextAnnotation(annotation, textElement) {
        if (this.activeTextEditor) return;

        console.log(`[TextTool] Editing text annotation: ${annotation.id}`);

        const page = textElement.parentElement;
        const rect = textElement.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        const x = rect.left - pageRect.left;
        const y = rect.top - pageRect.top;

        // Hide the original element
        textElement.style.display = 'none';

        // Create editor with existing text
        this._createTextEditor(page, annotation.pageNum, x, y);
        this.activeTextEditor.textInput.value = annotation.data.text;
        this.activeTextEditor.editingAnnotation = annotation;
        this.activeTextEditor.originalElement = textElement;
    }

    /**
     * Cancel text editing
     */
    _cancelTextEditing(editorElement) {
        console.log(`[TextTool] Cancelling text editing`);

        if (this.activeTextEditor && this.activeTextEditor.originalElement) {
            // Show the original element if we were editing
            this.activeTextEditor.originalElement.style.display = 'block';
        }

        this._finishTextEditing();
    }

    /**
     * Finish text editing
     */
    _finishTextEditing() {
        if (this.activeTextEditor) {
            // Remove editor element
            this.activeTextEditor.element.remove();
            this.activeTextEditor = null;
        }

        // Show instructions again
        if (this.isActive) {
            this._showTextInstructions();
        }
    }

    /**
     * Show text tool instructions
     */
    _showTextInstructions() {
        // Don't show if editor is active
        if (this.activeTextEditor) return;

        const existing = document.getElementById(`text-instructions-${this.blockId}`);
        if (existing) return;

        const instructions = document.createElement('div');
        instructions.id = `text-instructions-${this.blockId}`;
        instructions.className = 'text-instructions';
        instructions.style.position = 'fixed';
        instructions.style.top = '50%';
        instructions.style.left = '50%';
        instructions.style.transform = 'translate(-50%, -50%)';
        instructions.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        instructions.style.color = 'white';
        instructions.style.padding = '20px';
        instructions.style.borderRadius = '8px';
        instructions.style.zIndex = '10000';
        instructions.style.textAlign = 'center';
        instructions.style.fontFamily = 'Arial, sans-serif';
        instructions.style.fontSize = '16px';
        instructions.innerHTML = `
            <div style="font-weight: 500; margin-bottom: 10px;">Text Tool Active</div>
            <div style="font-size: 0.9em; opacity: 0.8;">Click anywhere on the PDF to add text</div>
        `;

        document.body.appendChild(instructions);

        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (instructions.parentElement) {
                instructions.remove();
            }
        }, 3000);
    }

    /**
     * Hide text tool instructions
     */
    _hideTextInstructions() {
        const instructions = document.getElementById(`text-instructions-${this.blockId}`);
        if (instructions) {
            instructions.remove();
        }
    }

    /**
     * Handle page change
     */
    handlePageChange(pageNum) {
        super.handlePageChange(pageNum);

        // Cancel any active editing when page changes
        if (this.activeTextEditor) {
            this._finishTextEditing();
        }
    }

    /**
     * Load annotations from data
     */
    async loadAnnotations(annotationsData) {
        console.log(`[TextTool] Loading text annotations:`, annotationsData);

        // Use parent class method
        await super.loadAnnotations(annotationsData);

        // Render all loaded annotations
        this._renderAllAnnotations();
    }

    /**
     * Render all annotations on their respective pages
     */
    _renderAllAnnotations() {
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (!viewer) return;

        this.annotations.forEach(annotation => {
            const page = viewer.querySelector(`.page:nth-child(${annotation.pageNum})`);
            if (page) {
                this._createTextElement(page, annotation);
            }
        });
    }

    /**
     * Delete annotation
     */
    deleteAnnotation(annotationId) {
        const annotation = this.annotations.get(annotationId);
        if (annotation && annotation.element) {
            annotation.element.remove();
        }

        return super.deleteAnnotation(annotationId);
    }

    /**
     * Clean up tool resources
     */
    async cleanup() {
        console.log(`[TextTool] Cleaning up text tool`);

        // Cancel any active editing
        if (this.activeTextEditor) {
            this._finishTextEditing();
        }

        // Remove page handlers
        this._removePageClickListeners();

        // Hide instructions
        this._hideTextInstructions();

        // Remove all text elements
        this.annotations.forEach(annotation => {
            if (annotation.element) {
                annotation.element.remove();
            }
        });

        this.isEnabled = false;
        this.isActive = false;
    }
}

export default TextTool;