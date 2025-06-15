/**
 * StampTool - Image stamp functionality for PDF.js integration
 * Integrates with pdfx-init.js PdfxViewer class
 * Based on Mozilla's PDF.js StampEditor implementation
 */

import { BaseTool } from '../base/BaseTool.js';

export class StampTool extends BaseTool {
    constructor(options = {}) {
        super({
            name: 'stamp',
            ...options
        });

        // Stamp configuration
        this.supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

        // Active stamps tracking
        this.activeStamps = new Map();
        this.stampCounter = 0;

        // State
        this.isInStampMode = false;
        this.currentImageData = null;

        // Event handlers storage for cleanup
        this.pageHandlers = new Map();
        this.escapeHandler = null;

        // Parameter toolbar controls
        this.parameterControls = null;
    }

    /**
     * Initialize the stamp tool
     */
    async init() {
        try {
            console.log(`[StampTool] Initializing for block: ${this.blockId}`);

            // Setup parameter toolbar controls
            this._setupParameterControls();

            this.isEnabled = true;
            console.log(`[StampTool] Initialized successfully`);

        } catch (error) {
            console.error(`[StampTool] Error during initialization:`, error);
            throw error;
        }
    }

    /**
     * Setup parameter toolbar controls
     */
    _setupParameterControls() {
        this.parameterControls = {
            addImageButton: document.getElementById(`editorStampAddImage-${this.blockId}`)
        };

        // Setup add image button
        if (this.parameterControls.addImageButton) {
            this.parameterControls.addImageButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openImagePicker();
            });
        }
    }

    /**
     * Enable the tool
     */
    enable() {
        this.isEnabled = true;
        console.log(`[StampTool] Tool enabled`);
    }

    /**
     * Disable the tool
     */
    disable() {
        if (this.isActive) {
            this.deactivate();
        }
        this.isEnabled = false;
        console.log(`[StampTool] Tool disabled`);
    }

    /**
     * Activate the tool
     */
    activate() {
        if (!this.isEnabled) {
            return false;
        }

        console.log(`[StampTool] Activating stamp tool`);
        this.isActive = true;
        this.enableStampMode();
        return true;
    }

    /**
     * Deactivate the tool
     */
    deactivate() {
        console.log(`[StampTool] Deactivating stamp tool`);
        this.isActive = false;
        this.disableStampMode();
    }

    enableStampMode() {
        // Add stamp mode class to viewer
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.classList.add('stamp-mode');
        }

        this.isInStampMode = true;
        console.log(`[StampTool] Stamp mode enabled`);
    }

    disableStampMode() {
        // Remove stamp mode class from viewer
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.classList.remove('stamp-mode');
        }

        // Clean up any active stamp placement
        this.cleanupStampPlacement();

        this.isInStampMode = false;
        console.log(`[StampTool] Stamp mode disabled`);
    }

    openImagePicker() {
        console.log(`[StampTool] Opening image picker`);

        // Create file input element
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = this.supportedImageTypes.join(',');
        input.style.display = 'none';

        // Handle file selection
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleImageFile(file);
            }
            // Clean up the input element
            document.body.removeChild(input);
        });

        // Handle cancel (when user closes dialog without selecting)
        input.addEventListener('cancel', () => {
            console.log(`[StampTool] Image picker cancelled`);
            document.body.removeChild(input);
        });

        // Add to DOM and trigger click
        document.body.appendChild(input);
        input.click();
    }

    async handleImageFile(file) {
        console.log(`[StampTool] Processing image file:`, file.name);

        // Validate file type
        if (!this.supportedImageTypes.includes(file.type)) {
            console.error(`[StampTool] Unsupported file type: ${file.type}`);
            this.showError(`Unsupported file type. Please select a valid image file.`);
            return;
        }

        // Validate file size (limit to 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            console.error(`[StampTool] File too large: ${file.size} bytes`);
            this.showError(`File too large. Please select an image smaller than 10MB.`);
            return;
        }

        try {
            // Create image data
            const imageData = await this.createImageData(file);

            // Setup click listeners to place the stamp
            this.setupStampPlacement(imageData);

        } catch (error) {
            console.error(`[StampTool] Error processing image:`, error);
            this.showError(`Error processing image: ${error.message}`);
        }
    }

    async createImageData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();

                img.onload = () => {
                    // Create canvas to get image data
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Set canvas size to image size (with max dimensions)
                    const maxDimension = 400; // Max width or height
                    let { width, height } = img;

                    if (width > maxDimension || height > maxDimension) {
                        const ratio = Math.min(maxDimension / width, maxDimension / height);
                        width *= ratio;
                        height *= ratio;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    // Draw image to canvas
                    ctx.drawImage(img, 0, 0, width, height);

                    const imageData = {
                        id: `stamp-${this.blockId}-${++this.stampCounter}`,
                        file: file,
                        canvas: canvas,
                        width: width,
                        height: height,
                        dataUrl: canvas.toDataURL('image/png')
                    };

                    console.log(`[StampTool] Created image data:`, imageData.id, `${width}x${height}`);
                    resolve(imageData);
                };

                img.onerror = () => {
                    reject(new Error('Failed to load image'));
                };

                img.src = e.target.result;
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsDataURL(file);
        });
    }

    setupStampPlacement(imageData) {
        console.log(`[StampTool] Setting up stamp placement for:`, imageData.id);

        // Change cursor to indicate stamp placement mode
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.style.cursor = 'crosshair';
        }

        // Setup click listeners on PDF pages
        this.setupPageClickListeners(imageData);

        // Show instruction message
        this.showPlacementInstructions();
    }

    setupPageClickListeners(imageData) {
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (!viewer) return;

        // Find all PDF pages
        const pages = viewer.querySelectorAll('.page');

        pages.forEach((page, pageIndex) => {
            const onPageClick = (e) => this.handleStampPlacement(e, page, pageIndex, imageData);

            page.addEventListener('click', onPageClick, { once: true });

            // Store listener for cleanup
            const handlerKey = `stamp-page-${pageIndex}`;
            this.pageHandlers.set(handlerKey, {
                element: page,
                listener: onPageClick
            });
        });

        console.log(`[StampTool] Set up click listeners on ${pages.length} pages for stamp placement`);
    }

    async handleStampPlacement(event, page, pageIndex, imageData) {
        console.log(`[StampTool] Placing stamp on page ${pageIndex} at position:`, event.offsetX, event.offsetY);

        // Get click position relative to page
        const pageRect = page.getBoundingClientRect();
        const x = event.clientX - pageRect.left;
        const y = event.clientY - pageRect.top;

        // Create stamp element
        await this.createStampElement(page, pageIndex, x, y, imageData);

        // Clean up placement mode
        this.cleanupStampPlacement();
    }

    async createStampElement(page, pageIndex, x, y, imageData) {
        console.log(`[StampTool] Creating stamp element at (${x}, ${y}) on page ${pageIndex + 1}`);

        // Create annotation data
        const annotationData = {
            imageUrl: imageData.dataUrl,
            fileName: imageData.file.name,
            x: x,
            y: y,
            width: imageData.width,
            height: imageData.height,
            originalWidth: imageData.width,
            originalHeight: imageData.height
        };

        // Set current page for annotation
        this.currentPage = pageIndex + 1;

        // Create annotation through BaseTool
        const annotation = this.createAnnotation(annotationData);

        // Create stamp container
        const stampContainer = document.createElement('div');
        stampContainer.className = 'stamp-annotation';
        stampContainer.id = imageData.id;
        stampContainer.dataset.annotationId = annotation.id;
        stampContainer.style.position = 'absolute';
        stampContainer.style.left = `${x}px`;
        stampContainer.style.top = `${y}px`;
        stampContainer.style.zIndex = '30';
        stampContainer.style.cursor = 'move';
        stampContainer.style.border = '2px solid transparent';
        stampContainer.style.borderRadius = '4px';

        // Create image element
        const imgElement = document.createElement('img');
        imgElement.src = imageData.dataUrl;
        imgElement.style.width = `${imageData.width}px`;
        imgElement.style.height = `${imageData.height}px`;
        imgElement.style.display = 'block';
        imgElement.style.userSelect = 'none';
        imgElement.style.pointerEvents = 'none';
        imgElement.draggable = false;

        // Add resize handles
        this.addResizeHandles(stampContainer);

        // Add interaction handlers
        this.addStampInteractionHandlers(stampContainer, annotation);

        // Append image to container
        stampContainer.appendChild(imgElement);

        // Make page relative positioned if not already
        if (getComputedStyle(page).position === 'static') {
            page.style.position = 'relative';
        }

        // Append to page
        page.appendChild(stampContainer);

        // Store stamp data with annotation reference
        this.activeStamps.set(imageData.id, {
            container: stampContainer,
            imageData: imageData,
            annotation: annotation,
            pageIndex: pageIndex,
            x: x,
            y: y
        });

        // Store element reference in annotation
        annotation.element = stampContainer;

        console.log(`[StampTool] Created stamp element and annotation:`, annotation.id);

        // Save to storage if available
        // Save annotation through annotation interface
        if (this.annotationInterface) {
            await this.annotationInterface.saveAnnotation(annotation);
        } else if (this.storageManager) {
            await this.storageManager.saveAnnotation(annotation);
        }

        return annotation;
    }

    addResizeHandles(container) {
        // Add resize handles at corners
        const handles = ['nw', 'ne', 'sw', 'se'];

        handles.forEach(position => {
            const handle = document.createElement('div');
            handle.className = `resize-handle resize-${position}`;
            handle.style.position = 'absolute';
            handle.style.width = '8px';
            handle.style.height = '8px';
            handle.style.backgroundColor = '#007acc';
            handle.style.border = '1px solid white';
            handle.style.borderRadius = '50%';
            handle.style.cursor = `${position}-resize`;
            handle.style.display = 'none'; // Hidden by default

            // Position the handle
            switch(position) {
                case 'nw':
                    handle.style.top = '-4px';
                    handle.style.left = '-4px';
                    break;
                case 'ne':
                    handle.style.top = '-4px';
                    handle.style.right = '-4px';
                    break;
                case 'sw':
                    handle.style.bottom = '-4px';
                    handle.style.left = '-4px';
                    break;
                case 'se':
                    handle.style.bottom = '-4px';
                    handle.style.right = '-4px';
                    break;
            }

            container.appendChild(handle);
        });
    }

    addStampInteractionHandlers(container, annotation) {
        let isDragging = false;
        let isResizing = false;
        let startX, startY, startLeft, startTop;

        // Mouse enter/leave for showing handles
        container.addEventListener('mouseenter', () => {
            container.style.border = '2px solid #007acc';
            container.querySelectorAll('.resize-handle').forEach(handle => {
                handle.style.display = 'block';
            });
        });

        container.addEventListener('mouseleave', () => {
            if (!isDragging && !isResizing) {
                container.style.border = '2px solid transparent';
                container.querySelectorAll('.resize-handle').forEach(handle => {
                    handle.style.display = 'none';
                });
            }
        });

        // Drag functionality
        container.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('resize-handle')) {
                isResizing = true;
                // TODO: Implement resize functionality
                return;
            }

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(container.style.left);
            startTop = parseInt(container.style.top);

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            container.style.left = `${startLeft + deltaX}px`;
            container.style.top = `${startTop + deltaY}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                // Update annotation position
                if (annotation) {
                    annotation.data.x = parseInt(container.style.left);
                    annotation.data.y = parseInt(container.style.top);

                    // Save to storage if available
                    if (this.annotationInterface) {
                        this.annotationInterface.saveAnnotation(annotation);
                    } else if (this.storageManager) {
                        this.storageManager.saveAnnotation(annotation);
                    }
                }
            }
            isResizing = false;
        });

        // Double-click to delete
        container.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (confirm('Delete this stamp?')) {
                this.deleteAnnotation(annotation.id);
            }
        });
    }

    deleteStamp(stampId) {
        const stampData = this.activeStamps.get(stampId);
        if (stampData) {
            stampData.container.remove();
            this.activeStamps.delete(stampId);
            console.log(`[StampTool] Deleted stamp:`, stampId);
        }
    }

    cleanupStampPlacement() {
        // Restore cursor
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.style.cursor = '';
        }

        // Remove click listeners
        this.pageHandlers.forEach((handler, key) => {
            if (key.startsWith('stamp-page-')) {
                handler.element.removeEventListener('click', handler.listener);
            }
        });

        // Clear stamp placement handlers
        Array.from(this.pageHandlers.keys()).forEach(key => {
            if (key.startsWith('stamp-page-')) {
                this.pageHandlers.delete(key);
            }
        });

        // Hide instruction message
        this.hidePlacementInstructions();

        console.log(`[StampTool] Cleaned up stamp placement mode`);
    }

    showPlacementInstructions() {
        // Create or show instruction overlay
        let instructions = document.getElementById(`stamp-instructions-${this.blockId}`);
        if (!instructions) {
            instructions = document.createElement('div');
            instructions.id = `stamp-instructions-${this.blockId}`;
            instructions.className = 'stamp-instructions';
            instructions.style.position = 'fixed';
            instructions.style.top = '50%';
            instructions.style.left = '50%';
            instructions.style.transform = 'translate(-50%, -50%)';
            instructions.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            instructions.style.color = 'white';
            instructions.style.padding = '20px';
            instructions.style.borderRadius = '8px';
            instructions.style.zIndex = '1000';
            instructions.style.textAlign = 'center';
            instructions.innerHTML = `
                <div>Click on the PDF to place your image</div>
                <div style="margin-top: 10px; font-size: 0.9em; opacity: 0.8;">Press ESC to cancel</div>
            `;

            document.body.appendChild(instructions);

            // Auto-hide after 3 seconds
            setTimeout(() => {
                if (instructions.parentNode) {
                    instructions.style.opacity = '0';
                    setTimeout(() => {
                        if (instructions.parentNode) {
                            instructions.remove();
                        }
                    }, 300);
                }
            }, 3000);
        }

        // ESC key to cancel
        const onEscKey = (e) => {
            if (e.key === 'Escape') {
                this.cleanupStampPlacement();
                document.removeEventListener('keydown', onEscKey);
            }
        };
        document.addEventListener('keydown', onEscKey);
    }

    hidePlacementInstructions() {
        const instructions = document.getElementById(`stamp-instructions-${this.blockId}`);
        if (instructions) {
            instructions.remove();
        }
    }

    showError(message) {
        console.error(`[StampTool] ${message}`);

        // Create error notification
        const errorDiv = document.createElement('div');
        errorDiv.className = 'stamp-error-notification';
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '20px';
        errorDiv.style.right = '20px';
        errorDiv.style.backgroundColor = '#ff4444';
        errorDiv.style.color = 'white';
        errorDiv.style.padding = '12px 20px';
        errorDiv.style.borderRadius = '4px';
        errorDiv.style.zIndex = '1001';
        errorDiv.style.maxWidth = '300px';
        errorDiv.textContent = message;

        document.body.appendChild(errorDiv);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    /**
     * Handle page change
     */
    handlePageChange(pageNum) {
        super.handlePageChange(pageNum);

        // Cancel any active stamp placement when page changes
        if (this.isInStampMode && this.currentImageData) {
            this.cleanupStampPlacement();
        }
    }

    /**
     * Load annotations from data
     */
    async loadAnnotations(annotationsData) {
        console.log(`[StampTool] Loading stamp annotations:`, annotationsData);

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
                this._createStampElementFromAnnotation(page, annotation);
            }
        });
    }

    /**
     * Create stamp element from existing annotation data
     */
    _createStampElementFromAnnotation(page, annotation) {
        const data = annotation.data;

        // Create stamp container
        const stampContainer = document.createElement('div');
        stampContainer.className = 'stamp-annotation';
        stampContainer.dataset.annotationId = annotation.id;
        stampContainer.style.position = 'absolute';
        stampContainer.style.left = `${data.x}px`;
        stampContainer.style.top = `${data.y}px`;
        stampContainer.style.zIndex = '30';
        stampContainer.style.cursor = 'move';
        stampContainer.style.border = '2px solid transparent';
        stampContainer.style.borderRadius = '4px';

        // Create image element
        const imgElement = document.createElement('img');
        imgElement.src = data.imageUrl;
        imgElement.style.width = `${data.width}px`;
        imgElement.style.height = `${data.height}px`;
        imgElement.style.display = 'block';
        imgElement.style.userSelect = 'none';
        imgElement.style.pointerEvents = 'none';
        imgElement.draggable = false;

        // Add resize handles
        this.addResizeHandles(stampContainer);

        // Add interaction handlers
        this.addStampInteractionHandlers(stampContainer, annotation);

        // Append image to container
        stampContainer.appendChild(imgElement);

        // Make page relative positioned if not already
        if (getComputedStyle(page).position === 'static') {
            page.style.position = 'relative';
        }

        // Append to page
        page.appendChild(stampContainer);

        // Store element reference in annotation
        annotation.element = stampContainer;

        console.log(`[StampTool] Rendered stamp annotation:`, annotation.id);
    }

    /**
     * Delete annotation
     */
    deleteAnnotation(annotationId) {
        const annotation = this.annotations.get(annotationId);
        if (annotation && annotation.element) {
            annotation.element.remove();
        }

        // Remove from active stamps if present
        for (const [stampId, stampData] of this.activeStamps) {
            if (stampData.annotation && stampData.annotation.id === annotationId) {
                this.activeStamps.delete(stampId);
                break;
            }
        }

        return super.deleteAnnotation(annotationId);
    }

    /**
     * Clean up tool resources
     */
    async cleanup() {
        console.log(`[StampTool] Cleaning up stamp tool`);

        // Deactivate if active
        if (this.isActive) {
            this.deactivate();
        }

        // Remove all event handlers
        this.pageHandlers.forEach((handler, key) => {
            handler.element.removeEventListener('click', handler.listener);
        });
        this.pageHandlers.clear();

        // Clean up any active stamps
        this.activeStamps.forEach((stampData, stampId) => {
            if (stampData.container && stampData.container.parentElement) {
                stampData.container.remove();
            }
        });
        this.activeStamps.clear();

        // Remove all stamp elements
        this.annotations.forEach(annotation => {
            if (annotation.element) {
                annotation.element.remove();
            }
        });

        // Clean up placement mode
        this.cleanupStampPlacement();

        this.isEnabled = false;
        this.isActive = false;

        console.log(`[StampTool] Cleanup completed`);
    }
}