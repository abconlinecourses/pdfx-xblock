/**
 * StampTool - Image stamp functionality for PDF.js integration
 * Integrates with pdfx-init.js PdfxViewer class
 */
window.StampTool = class StampTool {
    constructor(viewer, annotationInterface = null) {
        this.viewer = viewer;
        this.blockId = viewer.blockId;
        this.annotationInterface = annotationInterface;

        // Current state
        this.isActive = false;
        this.placementMode = false;
        this.currentImageData = null;

        // Event handlers and state
        this.pageClickHandlers = [];
        this.escKeyHandler = null;
        this.globalClickHandler = null;

        // Popup state
        this.popupMenu = null;
        this.confirmationModal = null;

        // Instructions element
        this.instructionsElement = null;

        // Drag and resize state
        this.isDragging = false;
        this.isResizing = false;
        this.dragOffset = { x: 0, y: 0 };
        this.resizeHandle = null;

        // Zoom handling
        this.currentScale = 1;
        this.zoomHandler = null;

        // Stamp configuration
        this.supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

        // Active stamps tracking
        this.activeStamps = new Map();
        this.stampCounter = 0;

        // Event handlers storage for cleanup
        this.eventHandlers = new Map();

        // Global event handlers (stored separately for proper cleanup)
        this.globalMouseMoveHandler = null;
        this.globalMouseUpHandler = null;

        // Drag and resize state
        this.dragState = {
            isDragging: false,
            isResizing: false,
            startX: 0,
            startY: 0,
            startLeft: 0,
            startTop: 0,
            startWidth: 0,
            startHeight: 0,
            resizeHandle: null,
            hasMoved: false, // Track if mouse has moved to distinguish click from drag
            currentStamp: null // Track which stamp is being manipulated
        };

        // Popup menu state
        this.activePopup = null;
        this.activeConfirmationModal = null;
        this.clickStartTime = 0;
        this.clickThreshold = 300; // ms to distinguish click from drag start

        // Initialize
        this.init();
    }

    init() {
        console.log(`[StampTool] Initializing for block: ${this.blockId}`);

        // Verify annotation interface is available
        if (this.annotationInterface) {
            console.log(`[StampTool] Annotation interface available for saving/deleting stamps`);
        } else {
            console.warn(`[StampTool] No annotation interface available - stamps will not be saved!`);
        }

        this.setupToolButton();
        this.setupImageUploadButton();
        this.setupGlobalClickHandler();
        this.setupGlobalEventHandlers();
        this.setupZoomHandler();
        this.setupPagesLoadedHandler();
    }

    setupToolButton() {
        const stampBtn = document.getElementById(`stampTool-${this.blockId}`);
        const stampToolbar = document.getElementById(`editorStampParamsToolbar-${this.blockId}`);

        if (stampBtn) {
            stampBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewer.setActiveTool('stamp');
                this.viewer.toggleParameterToolbar(stampBtn, stampToolbar);
            });
        }
    }

    setupImageUploadButton() {
        const uploadBtn = document.getElementById(`editorStampAddImage-${this.blockId}`);

        if (uploadBtn) {
            uploadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openImagePicker();
            });
        }
    }

    setupGlobalClickHandler() {
        // Global click handler to close popup when clicking outside
        document.addEventListener('click', (e) => {
            if (this.activePopup && !e.target.closest('.stamp-popup-menu') && !e.target.closest('.stamp-annotation')) {
                this.hidePopupMenu();
            }
        });
    }

    setupGlobalEventHandlers() {
        // Set up global mouse handlers for drag and resize
        this.globalMouseMoveHandler = (e) => {
            if (this.dragState.isDragging || this.dragState.isResizing) {
                // Mark that mouse has moved for click detection
                if (!this.dragState.hasMoved) {
                    const deltaX = Math.abs(e.clientX - this.dragState.startX);
                    const deltaY = Math.abs(e.clientY - this.dragState.startY);
                    if (deltaX > 3 || deltaY > 3) { // 3px threshold
                        this.dragState.hasMoved = true;
                        this.hidePopupMenu(); // Hide popup if drag starts
                    }
                }

                if (this.dragState.isDragging && this.dragState.currentStamp) {
                    this.handleDrag(e, this.dragState.currentStamp.container);
                } else if (this.dragState.isResizing && this.dragState.currentStamp) {
                    const imgElement = this.dragState.currentStamp.container.querySelector('img');
                    this.handleResize(e, this.dragState.currentStamp.container, imgElement, this.dragState.currentStamp.imageData);
                }
            }
        };

        this.globalMouseUpHandler = () => {
            if (this.dragState.isDragging || this.dragState.isResizing) {
                if (this.dragState.currentStamp) {
                    this.endDragOrResize(this.dragState.currentStamp.container, this.dragState.currentStamp.imageData);
                }
            }
        };

        document.addEventListener('mousemove', this.globalMouseMoveHandler);
        document.addEventListener('mouseup', this.globalMouseUpHandler);
    }

    activate() {
        console.log(`[StampTool] Activating stamp mode for block: ${this.blockId}`);
        this.enableStampMode();
    }

    deactivate() {
        console.log(`[StampTool] Deactivating stamp mode for block: ${this.blockId}`);
        this.disableStampMode();
        this.hidePopupMenu();
    }

    enableStampMode() {
        // Add stamp mode class to viewer
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.classList.add('stamp-mode');
        }
    }

    disableStampMode() {
        // Remove stamp mode class from viewer
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.classList.remove('stamp-mode');
        }
    }

    /**
     * Recreate proper stamp containers for saved stamps (called from pdfx-init.js)
     */
    recreateSavedStamps() {
        console.log(`[StampTool] Recreating saved stamps with proper containers`);

        // Find all saved stamp images without containers
        const savedStampImages = document.querySelectorAll(`#viewerContainer-${this.blockId} .page img[data-annotation-id]`);

        savedStampImages.forEach(img => {
            const annotationId = img.getAttribute('data-annotation-id');
            const page = img.closest('.page');

            if (!page) return;

            // Get current position and size from image
            const currentX = parseFloat(img.style.left) || 0;
            const currentY = parseFloat(img.style.top) || 0;
            const currentWidth = parseFloat(img.style.width) || 100;
            const currentHeight = parseFloat(img.style.height) || 100;

            // Convert to percentages for proper zoom scaling
            const pageRect = page.getBoundingClientRect();
            const percentageData = this.convertPositionToPercentages(
                currentX, currentY, currentWidth, currentHeight, pageRect
            );

            // Create proper stamp container with new structure
            const container = document.createElement('div');
            container.className = 'stamp-container';
            container.style.position = 'absolute';
            container.style.left = `${currentX}px`;
            container.style.top = `${currentY}px`;
            container.style.width = `${currentWidth}px`;
            container.style.height = `${currentHeight}px`;
            container.style.zIndex = '50';
            container.style.cursor = 'pointer';
            container.style.border = '2px solid transparent';
            container.style.borderRadius = '4px';
            container.style.transition = 'border-color 0.2s';
            container.setAttribute('data-stamp-id', annotationId);

            // Store percentage data for zoom handling
            container.setAttribute('data-percentage-position', JSON.stringify(percentageData));

            // Update image styling for container structure
            img.style.position = 'relative';
            img.style.left = '0px';
            img.style.top = '0px';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.display = 'block';
            img.style.objectFit = 'contain';
            img.style.pointerEvents = 'none';
            img.setAttribute('data-stamp-id', annotationId);

            // Remove image from page and add to container
            img.remove();
            container.appendChild(img);

            // Add resize handles
            this.createResizeHandles(container);

            // Create image data for interaction handlers
            const imageData = {
                id: annotationId,
                dataUrl: img.src,
                fileName: 'saved-stamp.png',
                aspectRatio: currentWidth / currentHeight
            };
            const pageIndex = this.getPageIndex(page);

            // Store stamp data
            const stampData = {
                id: annotationId,
                container: container,
                imageData: imageData,
                pageIndex: pageIndex,
                x: currentX,
                y: currentY,
                width: currentWidth,
                height: currentHeight,
                percentageData: percentageData,
                annotationId: annotationId
            };
            this.activeStamps.set(annotationId, stampData);

            // Add interaction handlers
            this.addStampInteractionHandlers(container, imageData, pageIndex);

            // Add container back to page
            page.appendChild(container);

            console.log(`[StampTool] Recreated stamp container for annotation: ${annotationId}`);
        });
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
            this.showError(`Unsupported file type. Please select a valid image file.`);
            return;
        }

        // Validate file size (limit to 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
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

                    const dataUrl = canvas.toDataURL('image/png');

                    const imageData = {
                        id: `stamp-${this.blockId}-${++this.stampCounter}`,
                        file: file,
                        fileName: file.name,
                        canvas: canvas,
                        width: width,
                        height: height,
                        dataUrl: dataUrl,
                        aspectRatio: width / height
                    };

                    console.log(`[StampTool] Created image data:`, {
                        id: imageData.id,
                        dimensions: `${width}x${height}`,
                        dataUrlLength: dataUrl.length,
                        aspectRatio: imageData.aspectRatio
                    });

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
            this.eventHandlers.set(handlerKey, {
                element: page,
                listener: onPageClick
            });
        });
    }

    handleStampPlacement(event, page, pageIndex, imageData) {
        console.log(`[StampTool] Placing stamp on page ${pageIndex} at click position:`, event.offsetX, event.offsetY);

        // Get click position relative to page
        const pageRect = page.getBoundingClientRect();
        const x = event.clientX - pageRect.left;
        const y = event.clientY - pageRect.top;

        console.log(`[StampTool] Page rect:`, {
            width: pageRect.width,
            height: pageRect.height,
            top: pageRect.top,
            left: pageRect.left
        });
        console.log(`[StampTool] Calculated position:`, { x, y });

        // Create stamp element
        const container = this.createStampElement(page, pageIndex, x, y, imageData);

        if (container) {
            console.log(`[StampTool] Successfully created stamp container:`, {
                id: container.getAttribute('data-stamp-id'),
                position: {
                    left: container.style.left,
                    top: container.style.top,
                    width: container.style.width,
                    height: container.style.height
                }
            });
        } else {
            console.error(`[StampTool] Failed to create stamp container!`);
        }

        // Clean up placement mode
        this.cleanupStampPlacement();
    }

    createStampElement(page, pageIndex, x, y, imageData, isSaved = false) {
        const pageRect = page.getBoundingClientRect();

        // Convert coordinates to percentages for storage
        const defaultWidth = Math.min(imageData.width || 100, pageRect.width * 0.3);
        const defaultHeight = Math.min(imageData.height || 100, pageRect.height * 0.3);

        const percentageData = this.convertPositionToPercentages(x, y, defaultWidth, defaultHeight, pageRect);

        // Create stamp container - positioned at the click location
        const container = document.createElement('div');
        container.className = 'stamp-container';
        container.style.position = 'absolute';
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
        container.style.width = `${defaultWidth}px`;
        container.style.height = `${defaultHeight}px`;
        container.style.zIndex = '50';
        container.style.cursor = 'pointer';
        container.style.border = '2px solid transparent';
        container.style.borderRadius = '4px';
        container.style.transition = 'border-color 0.2s';

        // Store percentage data for zoom handling
        container.setAttribute('data-percentage-position', JSON.stringify(percentageData));

        // Create image element - positioned relative to container
        const img = document.createElement('img');
        img.src = imageData.dataUrl;
        img.style.position = 'relative';
        img.style.left = '0px';
        img.style.top = '0px';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.display = 'block';
        img.style.userSelect = 'none';
        img.style.pointerEvents = 'none';
        img.style.objectFit = 'contain'; // Maintain aspect ratio
        img.style.borderRadius = '2px';

        // Generate unique ID for this stamp
        const stampId = `stamp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        container.setAttribute('data-stamp-id', stampId);
        img.setAttribute('data-stamp-id', stampId);

        container.appendChild(img);

        // Add resize handles
        this.createResizeHandles(container);

        // Add interaction handlers
        this.addStampInteractionHandlers(container, imageData, pageIndex);

        // Make page relative positioned if not already
        if (getComputedStyle(page).position === 'static') {
            page.style.position = 'relative';
        }

        page.appendChild(container);

        // Store stamp data for tracking
        const stampData = {
            id: stampId,
            container: container,
            imageData: imageData,
            pageIndex: pageIndex,
            x: x,
            y: y,
            width: defaultWidth,
            height: defaultHeight,
            percentageData: percentageData,
            annotationId: stampId // For annotation system
        };
        this.activeStamps.set(stampId, stampData);

        // Save annotation if not from saved data
        if (!isSaved) {
            this.saveStampAnnotation(stampData);
        }

        console.log(`[StampTool] Created stamp element at (${x}, ${y}) with size ${defaultWidth}x${defaultHeight} on page ${pageIndex + 1}`);

        return container;
    }

    createResizeHandles(container) {
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
            handle.style.opacity = '0';
            handle.style.transition = 'opacity 0.2s';
            handle.style.zIndex = '1';

            // Position handles
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

            handle.dataset.resizeDirection = position;
            container.appendChild(handle);
        });
    }

    addStampInteractionHandlers(container, imageData, pageIndex) {
        const imgElement = container.querySelector('img');
        const handles = container.querySelectorAll('.resize-handle');

        // Show/hide handles on hover
        container.addEventListener('mouseenter', () => {
            container.style.borderColor = '#007acc';
            handles.forEach(handle => handle.style.opacity = '1');
        });

        container.addEventListener('mouseleave', () => {
            if (!this.dragState.isDragging && !this.dragState.isResizing) {
                container.style.borderColor = 'transparent';
                handles.forEach(handle => handle.style.opacity = '0');
            }
        });

        // Mouse down handler for drag, resize, and click detection
        container.addEventListener('mousedown', (e) => {
            this.clickStartTime = Date.now();
            this.dragState.hasMoved = false;

            console.log(`[StampTool] Mouse down on stamp:`, imageData.id, `at time:`, this.clickStartTime);

            // Find the stamp data using the container's stamp ID
            const stampId = container.getAttribute('data-stamp-id');
            const stampData = this.activeStamps.get(stampId);
            this.dragState.currentStamp = stampData;

            if (e.target.classList.contains('resize-handle')) {
                console.log(`[StampTool] Starting resize on handle:`, e.target.dataset.resizeDirection);
                this.startResize(e, container, imageData);
            } else {
                console.log(`[StampTool] Starting drag on stamp`);
                this.startDrag(e, container, imageData);
            }
        });

        // Single click handler for popup menu with improved logic
        container.addEventListener('click', (e) => {
            console.log(`[StampTool] Click event fired for stamp:`, imageData.id);

            // Don't show popup if clicking on resize handle
            if (e.target.classList.contains('resize-handle')) {
                console.log(`[StampTool] Clicked on resize handle, not showing popup`);
                return;
            }

            const clickDuration = Date.now() - this.clickStartTime;
            console.log(`[StampTool] Click duration: ${clickDuration}ms, Has moved: ${this.dragState.hasMoved}`);

            // Show popup for quick clicks without significant movement
            // Increased threshold to 300ms for better user experience
            if (!this.dragState.hasMoved && clickDuration < 300) {
                console.log(`[StampTool] Showing popup menu for stamp:`, imageData.id);
                e.stopPropagation();
                e.preventDefault();
                this.showPopupMenu(container, imageData);
            } else {
                console.log(`[StampTool] Not showing popup - moved: ${this.dragState.hasMoved}, duration: ${clickDuration}ms`);
            }
        });
    }

    showPopupMenu(container, imageData) {
        console.log(`[StampTool] showPopupMenu called for stamp:`, imageData.id);

        // Hide any existing popup
        this.hidePopupMenu();

        // Create popup menu with professional styling
        const popup = document.createElement('div');
        popup.className = `stamp-popup-menu stamp-popup-${this.blockId}`;

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
            <button class="stamp-popup-delete" title="Delete Image" style="
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

        // Position popup relative to stamp
        const containerRect = container.getBoundingClientRect();

        // Position popup to the top-right of the stamp
        const leftPos = containerRect.right + 8;
        const topPos = containerRect.top - 8;

        // Ensure popup stays within viewport
        const popupWidth = 44;
        const popupHeight = 44;

        let finalLeft = leftPos;
        let finalTop = topPos;

        // Adjust if popup would go off right edge
        if (leftPos + popupWidth > window.innerWidth) {
            finalLeft = containerRect.left - popupWidth - 8;
        }

        // Adjust if popup would go off top edge
        if (topPos < 0) {
            finalTop = containerRect.bottom + 8;
        }

        // Adjust if popup would go off bottom edge
        if (finalTop + popupHeight > window.innerHeight) {
            finalTop = containerRect.top - popupHeight - 8;
        }

        popup.style.left = `${finalLeft}px`;
        popup.style.top = `${finalTop}px`;

        // Add popup to document body
        document.body.appendChild(popup);

        // Add delete functionality with custom confirmation
        const deleteBtn = popup.querySelector('.stamp-popup-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                console.log(`[StampTool] Delete button clicked for stamp:`, imageData.id);
                e.stopPropagation();
                this.showConfirmationModal(popup, imageData);
            });
        }

        // Store reference
        this.activePopup = popup;
        console.log(`[StampTool] Popup menu created and displayed`);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (this.activePopup === popup) {
                console.log(`[StampTool] Auto-hiding popup after 5 seconds`);
                this.hidePopupMenu();
            }
        }, 5000);
    }

    hidePopupMenu() {
        if (this.activePopup) {
            console.log(`[StampTool] Hiding popup menu`);
            this.activePopup.remove();
            this.activePopup = null;
        }
        // Also hide any confirmation modal
        this.hideConfirmationModal();
    }

    showConfirmationModal(parentPopup, imageData) {
        console.log(`[StampTool] Showing confirmation modal for stamp:`, imageData.id);

        // Hide any existing confirmation modal
        this.hideConfirmationModal();

        // Create confirmation modal
        const modal = document.createElement('div');
        modal.className = `stamp-confirmation-modal stamp-confirmation-${this.blockId}`;

        // Position the modal horizontally near the delete button
        const parentRect = parentPopup.getBoundingClientRect();

        // Modal styling - positioned to the right of the delete popup
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

        // Add CSS animation if not already added
        if (!document.getElementById('stamp-confirmation-styles')) {
            const style = document.createElement('style');
            style.id = 'stamp-confirmation-styles';
            style.textContent = `
                @keyframes confirmModalSlideIn {
                    from {
                        opacity: 0;
                        transform: translateX(-10px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0) scale(1);
                    }
                }
                .stamp-confirmation-modal {
                    transform-origin: left center;
                }
            `;
            document.head.appendChild(style);
        }

        modal.innerHTML = `
            <div style="
                margin-bottom: 10px;
                color: #333;
                font-weight: 500;
                line-height: 1.3;
            ">Delete this image?</div>
            <div style="
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            ">
                <button class="stamp-confirm-cancel" style="
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
                <button class="stamp-confirm-delete" style="
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
        const cancelBtn = modal.querySelector('.stamp-confirm-cancel');
        const deleteBtn = modal.querySelector('.stamp-confirm-delete');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                console.log(`[StampTool] Confirmation cancelled`);
                e.stopPropagation();
                this.hideConfirmationModal();
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                console.log(`[StampTool] Deletion confirmed for stamp:`, imageData.id);
                e.stopPropagation();
                this.hideConfirmationModal();
                this.hidePopupMenu();
                this.deleteStamp(imageData.id);
            });
        }

        // Store reference
        this.activeConfirmationModal = modal;
        console.log(`[StampTool] Confirmation modal created and displayed`);

        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (this.activeConfirmationModal === modal) {
                console.log(`[StampTool] Auto-hiding confirmation modal after 10 seconds`);
                this.hideConfirmationModal();
            }
        }, 10000);
    }

    hideConfirmationModal() {
        if (this.activeConfirmationModal) {
            console.log(`[StampTool] Hiding confirmation modal`);
            this.activeConfirmationModal.remove();
            this.activeConfirmationModal = null;
        }
    }

    startDrag(e, container, imageData) {
        this.dragState.isDragging = true;
        this.dragState.startX = e.clientX;
        this.dragState.startY = e.clientY;
        this.dragState.startLeft = parseInt(container.style.left) || 0;
        this.dragState.startTop = parseInt(container.style.top) || 0;
        e.preventDefault();
    }

    startResize(e, container, imageData) {
        this.dragState.isResizing = true;
        this.dragState.resizeHandle = e.target.dataset.resizeDirection;
        this.dragState.startX = e.clientX;
        this.dragState.startY = e.clientY;

        this.dragState.startWidth = parseInt(container.style.width) || 100;
        this.dragState.startHeight = parseInt(container.style.height) || 100;
        this.dragState.startLeft = parseInt(container.style.left) || 0;
        this.dragState.startTop = parseInt(container.style.top) || 0;

        e.preventDefault();
        e.stopPropagation();
    }

    handleDrag(e, container) {
        const deltaX = e.clientX - this.dragState.startX;
        const deltaY = e.clientY - this.dragState.startY;

        const newLeft = this.dragState.startLeft + deltaX;
        const newTop = this.dragState.startTop + deltaY;

        container.style.left = `${newLeft}px`;
        container.style.top = `${newTop}px`;
    }

    handleResize(e, container, imgElement, imageData) {
        const deltaX = e.clientX - this.dragState.startX;
        const deltaY = e.clientY - this.dragState.startY;

        let newWidth = this.dragState.startWidth;
        let newHeight = this.dragState.startHeight;

        const direction = this.dragState.resizeHandle;
        const aspectRatio = imageData.aspectRatio || 1;

        // Calculate new dimensions based on resize direction
        switch(direction) {
            case 'se':
                newWidth = this.dragState.startWidth + deltaX;
                newHeight = newWidth / aspectRatio;
                break;
            case 'sw':
                newWidth = this.dragState.startWidth - deltaX;
                newHeight = newWidth / aspectRatio;
                // Adjust position for left side resize
                container.style.left = `${this.dragState.startLeft + deltaX}px`;
                break;
            case 'ne':
                newWidth = this.dragState.startWidth + deltaX;
                newHeight = newWidth / aspectRatio;
                // Adjust position for top side resize
                const heightDelta = newHeight - this.dragState.startHeight;
                container.style.top = `${this.dragState.startTop - heightDelta}px`;
                break;
            case 'nw':
                newWidth = this.dragState.startWidth - deltaX;
                newHeight = newWidth / aspectRatio;
                // Adjust position for both left and top
                container.style.left = `${this.dragState.startLeft + deltaX}px`;
                const heightDeltaNW = newHeight - this.dragState.startHeight;
                container.style.top = `${this.dragState.startTop - heightDeltaNW}px`;
                break;
        }

        // Apply minimum size constraints
        const minSize = 20;
        if (newWidth >= minSize && newHeight >= minSize) {
            container.style.width = `${newWidth}px`;
            container.style.height = `${newHeight}px`;
        }
    }

    endDragOrResize(container, imageData) {
        if (!this.dragState.isDragging && !this.dragState.isResizing) return;

        const wasResizing = this.dragState.isResizing;
        this.dragState.isDragging = false;
        this.dragState.isResizing = false;
        this.dragState.resizeHandle = null;

        // Update cursor
        container.style.cursor = 'pointer';
        document.body.style.cursor = 'default';

        // Get current position and size from container
        const currentX = parseFloat(container.style.left) || 0;
        const currentY = parseFloat(container.style.top) || 0;
        const currentWidth = parseFloat(container.style.width) || 100;
        const currentHeight = parseFloat(container.style.height) || 100;

        // Get page for percentage calculation
        const page = container.closest('.page');
        let percentageData = null;
        if (page) {
            const pageRect = page.getBoundingClientRect();
            percentageData = this.convertPositionToPercentages(
                currentX, currentY, currentWidth, currentHeight, pageRect
            );

            // Update stored percentage data
            container.setAttribute('data-percentage-position', JSON.stringify(percentageData));
        }

        // Save updated position/size
        const stampId = container.getAttribute('data-stamp-id');
        const pageIndex = this.getPageIndex(container);

        if (stampId) {
            // Update stamp data in activeStamps
            if (this.activeStamps.has(stampId)) {
                const stampData = this.activeStamps.get(stampId);
                stampData.x = currentX;
                stampData.y = currentY;
                stampData.width = currentWidth;
                stampData.height = currentHeight;
                stampData.percentageData = percentageData;
                this.activeStamps.set(stampId, stampData);

                this.saveStampAnnotation(stampData);

                const action = wasResizing ? 'resized' : 'moved';
                console.log(`[StampTool] Stamp ${action} to (${currentX}, ${currentY}) with size ${currentWidth}x${currentHeight}`);
            }
        }
    }

    deleteStamp(stampId) {
        console.log(`[StampTool] deleteStamp called for stampId:`, stampId);

        const stampData = this.activeStamps.get(stampId);
        if (!stampData) {
            console.warn(`[StampTool] No stamp data found for stampId:`, stampId);
            return;
        }

        console.log(`[StampTool] Found stamp data for deletion:`, {
            annotationId: stampData.annotationId,
            pageIndex: stampData.pageIndex,
            position: { x: stampData.x, y: stampData.y }
        });

        // Send deletion request to server BEFORE removing from DOM
        // This ensures we have all the data needed for the deletion request
        this.saveStampDeletion(stampData);

        // Remove from DOM
        if (stampData.container && stampData.container.parentNode) {
            stampData.container.remove();
            console.log(`[StampTool] Removed stamp container from DOM`);
        }

        // Remove from active stamps map
        this.activeStamps.delete(stampId);

        console.log(`[StampTool] Successfully deleted stamp:`, stampId, `(annotation ID: ${stampData.annotationId})`);
    }

    /**
     * Save stamp deletion to server
     */
    saveStampDeletion(stampData) {
        const { annotationId, pageIndex } = stampData;

        if (!this.annotationInterface) {
            console.warn(`[StampTool] No annotation interface available - deletion will not be saved!`);
            return;
        }

        // Create deletion annotation that will be processed by the annotation system
        const deletionAnnotation = {
            id: annotationId, // Use same ID to overwrite/delete existing annotation
            type: 'shape_annotations',
            pageNum: pageIndex + 1, // Convert 0-based to 1-based page number
            data: {
                _deleted: true,
                _action: 'delete',
                stampId: stampData.imageData.id,
                timestamp: Date.now()
            },
            config: {
                type: 'stamp_deletion',
                action: 'delete'
            },
            timestamp: Date.now()
        };

        // Save deletion through the annotation interface
        this.annotationInterface.saveAnnotation(deletionAnnotation)
            .then(() => {
                console.log(`[StampTool] Successfully sent deletion request for stamp:`, annotationId);
            })
            .catch((error) => {
                console.error(`[StampTool] Failed to send deletion request for stamp:`, annotationId, error);
            });

        console.log(`[StampTool] Queued deletion request for stamp:`, annotationId, `on page ${pageIndex + 1}`);
    }

    /**
     * Save stamp annotation with current position and size
     */
    saveStampAnnotation(stampData) {
        if (!this.annotationInterface) {
            console.warn(`[StampTool] No annotation interface available - stamp will not be saved!`);
            return;
        }

        const annotation = {
            id: stampData.id,
            type: 'shape_annotations',
            pageNum: stampData.pageIndex + 1, // Convert 0-based to 1-based
            data: {
                type: 'stamp',
                x: stampData.x,
                y: stampData.y,
                width: stampData.width,
                height: stampData.height,
                percentageData: stampData.percentageData, // Store percentage data
                imageDataUrl: stampData.imageData.dataUrl,
                fileName: stampData.imageData.fileName || 'stamp.png',
                fileSize: stampData.imageData.fileSize || 0
            },
            config: {},
            timestamp: Date.now()
        };

        console.log(`[StampTool] Saving stamp annotation:`, annotation.id);
        this.annotationInterface.saveAnnotation(annotation);
    }

    /**
     * Clear all stamps (called by ClearTool)
     */
    clearAllStamps() {
        console.log(`[StampTool] Clearing all stamps`);

        // Remove all stamp containers from DOM
        this.activeStamps.forEach((stampData, stampId) => {
            if (stampData.container && stampData.container.parentNode) {
                stampData.container.remove();
            }
        });

        // Clear the active stamps map
        this.activeStamps.clear();

        // Hide any active popup
        this.hidePopupMenu();

        console.log(`[StampTool] All stamps cleared`);
    }

    /**
     * Clear stamps for specific page (called by ClearTool)
     */
    clearPageStamps(pageNum) {
        console.log(`[StampTool] Clearing stamps for page ${pageNum}`);

        const stampsToRemove = [];

        // Find stamps on the specified page
        this.activeStamps.forEach((stampData, stampId) => {
            if (stampData.pageIndex === pageNum - 1) { // Convert 1-based to 0-based
                if (stampData.container && stampData.container.parentNode) {
                    stampData.container.remove();
                }
                stampsToRemove.push(stampId);
            }
        });

        // Remove from active stamps map
        stampsToRemove.forEach(stampId => {
            this.activeStamps.delete(stampId);
        });

        // Hide popup if it was for a cleared stamp
        this.hidePopupMenu();

        console.log(`[StampTool] Cleared ${stampsToRemove.length} stamps from page ${pageNum}`);
    }

    cleanupStampPlacement() {
        // Restore cursor
        const viewer = document.getElementById(`viewer-${this.blockId}`);
        if (viewer) {
            viewer.style.cursor = '';
        }

        // Remove click listeners
        this.eventHandlers.forEach((handler, key) => {
            if (key.startsWith('stamp-page-')) {
                handler.element.removeEventListener('click', handler.listener);
            }
        });

        // Clear stamp placement handlers
        Array.from(this.eventHandlers.keys()).forEach(key => {
            if (key.startsWith('stamp-page-')) {
                this.eventHandlers.delete(key);
            }
        });

        // Hide instruction message
        this.hidePlacementInstructions();
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

        this.cleanupStampPlacement();
        this.hidePlacementInstructions();
        this.hidePopupMenu();
        this.hideConfirmationModal();

        // Remove all page click handlers
        this.pageClickHandlers.forEach(({ page, handler }) => {
            page.removeEventListener('click', handler);
        });
        this.pageClickHandlers = [];

        // Remove global handlers
        if (this.escKeyHandler) {
            document.removeEventListener('keydown', this.escKeyHandler);
            this.escKeyHandler = null;
        }

        if (this.globalClickHandler) {
            document.removeEventListener('click', this.globalClickHandler);
            this.globalClickHandler = null;
        }

        // Remove all event handlers
        this.eventHandlers.forEach((handler, key) => {
            handler.element.removeEventListener('click', handler.listener);
        });
        this.eventHandlers.clear();

        // Clean up any active stamps
        this.activeStamps.forEach((stampData, stampId) => {
            stampData.container.remove();
        });
        this.activeStamps.clear();

        console.log(`[StampTool] Cleanup completed`);
    }

    /**
     * Setup zoom event handling for stamp repositioning
     */
    setupZoomHandler() {
        if (this.viewer.eventBus) {
            this.zoomHandler = (evt) => {
                const newScale = evt.scale;
                if (newScale !== this.currentScale) {
                    console.log(`[StampTool] Scale changed from ${this.currentScale} to ${newScale}`);
                    this.currentScale = newScale;

                    // Use timeout to ensure PDF.js has finished rendering at new scale
                    setTimeout(() => {
                        this.preserveStampsAfterZoom();
                        this.repositionAllStamps();
                    }, 100);
                }
            };
            this.viewer.eventBus.on('scalechanging', this.zoomHandler);
        }
    }

    /**
     * Setup pages loaded handler to recreate stamps after PDF.js events
     */
    setupPagesLoadedHandler() {
        if (this.viewer.eventBus) {
            this.pagesLoadedHandler = () => {
                console.log(`[StampTool] Pages loaded - ensuring stamps exist`);
                setTimeout(() => {
                    this.ensureStampsAfterPageReload();
                }, 100);
            };
            this.viewer.eventBus.on('pagesloaded', this.pagesLoadedHandler);
        }
    }

    /**
     * Preserve and restore stamps after zoom events
     * This handles cases where PDF.js recreates page containers during zoom
     */
    preserveStampsAfterZoom() {
        console.log(`[StampTool] Preserving stamps after zoom change`);

        // Find all pages and ensure stamp containers are preserved
        const pages = document.querySelectorAll(`#viewerContainer-${this.blockId} .page`);

        pages.forEach((page, index) => {
            const pageNumber = index + 1;

            // Check if stamps exist on this page in our data
            const pageStamps = [];
            this.activeStamps.forEach((stampData, stampId) => {
                if (stampData.pageIndex === index) {
                    pageStamps.push(stampData);
                }
            });

            if (pageStamps.length === 0) {
                console.log(`[StampTool] No stamps to preserve on page ${pageNumber}`);
                return;
            }

            // Check if stamp containers exist in DOM
            const existingContainers = page.querySelectorAll('.stamp-container');
            console.log(`[StampTool] Page ${pageNumber} has ${existingContainers.length} existing containers, expected ${pageStamps.length}`);

            if (existingContainers.length < pageStamps.length) {
                console.log(`[StampTool] Page ${pageNumber} lost ${pageStamps.length - existingContainers.length} stamp containers during zoom, recreating...`);

                // Find missing stamps and recreate them
                pageStamps.forEach(stampData => {
                    const existingContainer = page.querySelector(`[data-stamp-id="${stampData.id}"]`);
                    if (!existingContainer) {
                        console.log(`[StampTool] Recreating missing stamp container: ${stampData.id}`);
                        this.recreateStampContainer(page, stampData);
                    }
                });
            }
        });

        console.log(`[StampTool] Completed stamp preservation after zoom for ${pages.length} pages`);
    }

    /**
     * Ensure stamps exist after page reload events
     */
    ensureStampsAfterPageReload() {
        console.log(`[StampTool] Ensuring stamps after page reload`);

        const pages = document.querySelectorAll(`#viewerContainer-${this.blockId} .page`);
        if (pages.length === 0) {
            console.warn(`[StampTool] No pages found after page reload`);
            return;
        }

        pages.forEach((page, index) => {
            const pageNumber = index + 1;

            // Check if stamps should exist on this page
            const pageStamps = [];
            this.activeStamps.forEach((stampData, stampId) => {
                if (stampData.pageIndex === index) {
                    pageStamps.push(stampData);
                }
            });

            if (pageStamps.length === 0) {
                return; // No stamps expected on this page
            }

            // Check if stamp containers exist
            const existingContainers = page.querySelectorAll('.stamp-container');
            console.log(`[StampTool] Page ${pageNumber} after reload: ${existingContainers.length} existing, ${pageStamps.length} expected`);

            if (existingContainers.length < pageStamps.length) {
                console.log(`[StampTool] Page ${pageNumber} missing ${pageStamps.length - existingContainers.length} stamps after reload, recreating...`);

                // Recreate missing stamps
                pageStamps.forEach(stampData => {
                    const existingContainer = page.querySelector(`[data-stamp-id="${stampData.id}"]`);
                    if (!existingContainer) {
                        console.log(`[StampTool] Recreating missing stamp: ${stampData.id}`);
                        this.recreateStampContainer(page, stampData);
                    }
                });
            }
        });

        console.log(`[StampTool] Completed stamp check after page reload for ${pages.length} pages`);
    }

    /**
     * Recreate a stamp container from stored stamp data
     */
    recreateStampContainer(page, stampData) {
        const { id, imageData, x, y, width, height, percentageData } = stampData;

        // Create stamp container
        const container = document.createElement('div');
        container.className = 'stamp-container';
        container.style.position = 'absolute';
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        container.style.zIndex = '50';
        container.style.cursor = 'pointer';
        container.style.border = '2px solid transparent';
        container.style.borderRadius = '4px';
        container.style.transition = 'border-color 0.2s';
        container.setAttribute('data-stamp-id', id);

        // Store percentage data for zoom handling
        if (percentageData) {
            container.setAttribute('data-percentage-position', JSON.stringify(percentageData));
        }

        // Create image element
        const img = document.createElement('img');
        img.src = imageData.dataUrl;
        img.style.position = 'relative';
        img.style.left = '0px';
        img.style.top = '0px';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.display = 'block';
        img.style.userSelect = 'none';
        img.style.pointerEvents = 'none';
        img.style.objectFit = 'contain';
        img.style.borderRadius = '2px';
        img.setAttribute('data-stamp-id', id);

        container.appendChild(img);

        // Add resize handles
        this.createResizeHandles(container);

        // Add interaction handlers
        this.addStampInteractionHandlers(container, imageData, stampData.pageIndex);

        // Make page relative positioned if not already
        if (getComputedStyle(page).position === 'static') {
            page.style.position = 'relative';
        }

        page.appendChild(container);

        // Update stamp data container reference
        stampData.container = container;
        this.activeStamps.set(id, stampData);

        console.log(`[StampTool] Successfully recreated stamp container: ${id}`);

        return container;
    }

    /**
     * Reposition all stamps when zoom changes
     */
    repositionAllStamps() {
        const stamps = document.querySelectorAll(`#viewerContainer-${this.blockId} .stamp-container`);
        stamps.forEach(stampContainer => {
            const storedData = stampContainer.getAttribute('data-percentage-position');

            if (storedData) {
                try {
                    const percentageData = JSON.parse(storedData);
                    this.updateStampPosition(stampContainer, percentageData);
                } catch (e) {
                    console.warn(`[StampTool] Failed to parse stored position data for stamp`);
                }
            }
        });
    }

    /**
     * Update stamp position based on percentage data
     */
    updateStampPosition(stampContainer, percentageData) {
        const page = stampContainer.closest('.page');
        if (!page) return;

        const pageRect = page.getBoundingClientRect();

        if (percentageData) {
            const newX = (percentageData.xPercent / 100) * pageRect.width;
            const newY = (percentageData.yPercent / 100) * pageRect.height;
            const newWidth = (percentageData.widthPercent / 100) * pageRect.width;
            const newHeight = (percentageData.heightPercent / 100) * pageRect.height;

            // Update container position and size
            stampContainer.style.left = `${newX}px`;
            stampContainer.style.top = `${newY}px`;
            stampContainer.style.width = `${newWidth}px`;
            stampContainer.style.height = `${newHeight}px`;

            // Update stamp data in activeStamps
            const stampId = stampContainer.getAttribute('data-stamp-id');
            if (stampId && this.activeStamps.has(stampId)) {
                const stampData = this.activeStamps.get(stampId);
                stampData.x = newX;
                stampData.y = newY;
                stampData.width = newWidth;
                stampData.height = newHeight;
                this.activeStamps.set(stampId, stampData);
            }

            console.log(`[StampTool] Updated stamp position to (${newX}, ${newY}) with size ${newWidth}x${newHeight}`);
        }
    }

    /**
     * Convert pixel coordinates to percentages relative to page
     */
    convertPositionToPercentages(x, y, width, height, pageRect) {
        return {
            xPercent: (x / pageRect.width) * 100,
            yPercent: (y / pageRect.height) * 100,
            widthPercent: (width / pageRect.width) * 100,
            heightPercent: (height / pageRect.height) * 100
        };
    }

    getPageIndex(container) {
        const page = container.closest('.page');
        if (page) {
            const pageNum = page.getAttribute('data-page-number');
            return parseInt(pageNum) - 1; // Convert 1-based to 0-based
        }
        return null;
    }
};