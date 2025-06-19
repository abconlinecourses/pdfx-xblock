/**
 * ClearTool - Clear annotations functionality for PDF.js integration
 * Integrates with pdfx-init.js PdfxViewer class
 */
class ClearTool {
    constructor(viewer, annotationInterface = null) {
        this.viewer = viewer;
        this.blockId = viewer.blockId;
        this.annotationInterface = annotationInterface;

        // Initialize
        this.init();
    }

    init() {
        console.log(`[ClearTool] Initializing for block: ${this.blockId}`);
        this.setupToolButton();
        this.setupClearOptions();
    }

    setupToolButton() {
        const clearBtn = document.getElementById(`clearAnnotations-${this.blockId}`);
        const clearToolbar = document.getElementById(`editorClearParamsToolbar-${this.blockId}`);

        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewer.setActiveTool('clear');
                this.viewer.toggleParameterToolbar(clearBtn, clearToolbar);
            });
        }
    }

    setupClearOptions() {
        const clearCurrentPageBtn = document.getElementById(`clearCurrentPage-${this.blockId}`);
        const clearEntirePdfBtn = document.getElementById(`clearEntirePdf-${this.blockId}`);

        if (clearCurrentPageBtn) {
            clearCurrentPageBtn.addEventListener('click', () => {
                this.clearCurrentPageAnnotations();
            });
        }

        if (clearEntirePdfBtn) {
            clearEntirePdfBtn.addEventListener('click', () => {
                this.clearAllAnnotations();
            });
        }
    }

    activate() {
        console.log(`[ClearTool] Activating clear mode for block: ${this.blockId}`);
        // No specific activation needed - just show the toolbar
    }

    deactivate() {
        console.log(`[ClearTool] Deactivating clear mode for block: ${this.blockId}`);
        // No specific deactivation needed
    }

    clearCurrentPageAnnotations() {
        const currentPage = this.viewer.pdfViewer ? this.viewer.pdfViewer.currentPageNumber : 1;

        this.showConfirmModal('current_page', currentPage, () => {
            console.log(`[ClearTool] TOOL_ACTION: Clearing annotations for page ${currentPage}`);

            // Clear visual annotations for current page
            this.clearPageVisualAnnotations(currentPage);

            // Save deletion to server
            const clearData = {
                action: 'clear_page',
                pageNum: currentPage,
                _deletionOnly: true,
                _clearPage: currentPage
            };

            this.sendClearRequest(clearData, 'current_page');

            // Close the toolbar after action
            this.closeClearToolbar();
        });
    }

    clearAllAnnotations() {
        this.showConfirmModal('entire_pdf', null, () => {
            console.log(`[ClearTool] TOOL_ACTION: Clearing all annotations in PDF`);

            // Clear all visual annotations
            this.clearAllVisualAnnotations();

            // Save deletion to server
            const clearData = {
                action: 'clear_all',
                _deletionOnly: true,
                _clearAll: true
            };

            this.sendClearRequest(clearData, 'entire_pdf');

            // Close the toolbar after action
            this.closeClearToolbar();
        });
    }

    showConfirmModal(action, pageNum, onConfirm) {
        const titles = {
            'current_page': 'Clear Current Page',
            'entire_pdf': 'Clear Entire PDF'
        };

        const messages = {
            'current_page': `Do you really want to delete all annotations on page ${pageNum}? This process cannot be undone.`,
            'entire_pdf': 'Do you really want to delete all annotations in the entire PDF? This process cannot be undone.'
        };

        this.createModal(titles[action], messages[action], onConfirm);
    }

    createModal(title, message, onConfirm) {
        // Remove any existing modal
        this.removeModal();

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'pdfx-clear-modal-overlay';
        overlay.id = `clearModalOverlay-${this.blockId}`;

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'pdfx-clear-modal';

        modal.innerHTML = `
            <button class="pdfx-clear-modal-close" id="clearModalClose-${this.blockId}">×</button>
            <div class="pdfx-clear-modal-header">
                <div class="pdfx-clear-modal-icon"></div>
            </div>
            <div class="pdfx-clear-modal-title">${title}</div>
            <div class="pdfx-clear-modal-message">${message}</div>
            <div class="pdfx-clear-modal-buttons">
                <button class="pdfx-clear-modal-button pdfx-clear-modal-cancel" id="clearModalCancel-${this.blockId}">Cancel</button>
                <button class="pdfx-clear-modal-button pdfx-clear-modal-confirm" id="clearModalConfirm-${this.blockId}">Delete</button>
            </div>
        `;

        overlay.appendChild(modal);

        // Append to the content area instead of document.body
        const contentArea = document.getElementById(`contentArea-${this.blockId}`);
        if (contentArea) {
            contentArea.appendChild(overlay);
        } else {
            // Fallback to document.body if contentArea not found
            document.body.appendChild(overlay);
        }

        // Add event listeners
        const closeBtn = document.getElementById(`clearModalClose-${this.blockId}`);
        const cancelBtn = document.getElementById(`clearModalCancel-${this.blockId}`);
        const confirmBtn = document.getElementById(`clearModalConfirm-${this.blockId}`);

        const closeModal = () => this.removeModal();

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        confirmBtn.addEventListener('click', () => {
            // Don't close modal, transition to loading state
            this.transitionModalToLoading(modal);
            onConfirm();
        });

        // Handle ESC key
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        // Focus on confirm button
        setTimeout(() => confirmBtn.focus(), 100);
    }

    removeModal() {
        const modal = document.getElementById(`clearModalOverlay-${this.blockId}`);
        if (modal) {
            modal.remove();
        }
    }

    transitionModalToLoading(modalElement) {
        // Update modal content to show loading state
        modalElement.innerHTML = `
            <div class="pdfx-clear-modal-header">
                <div class="pdfx-loading-spinner"></div>
            </div>
            <div class="pdfx-clear-modal-title">Processing...</div>
            <div class="pdfx-clear-modal-message">Please wait while we clear the annotations.</div>
        `;
    }

    transitionModalToSuccess(modalElement, message) {
        // Update modal content to show success state
        modalElement.innerHTML = `
            <div class="pdfx-clear-modal-header">
                <div class="pdfx-clear-modal-success-icon"></div>
            </div>
            <div class="pdfx-clear-modal-title">Success!</div>
            <div class="pdfx-clear-modal-message">${message}</div>
        `;

        // Auto-close after 2 seconds
        setTimeout(() => {
            this.removeModal();
        }, 2000);
    }

    transitionModalToError(modalElement, error) {
        // Update modal content to show error state
        modalElement.innerHTML = `
            <button class="pdfx-clear-modal-close" onclick="document.getElementById('clearModalOverlay-${this.blockId}').remove()">×</button>
            <div class="pdfx-clear-modal-header">
                <div class="pdfx-clear-modal-error-icon"></div>
            </div>
            <div class="pdfx-clear-modal-title">Error</div>
            <div class="pdfx-clear-modal-message">Failed to clear annotations: ${error.message || 'Unknown error'}</div>
            <div class="pdfx-clear-modal-buttons">
                <button class="pdfx-clear-modal-button pdfx-clear-modal-cancel" onclick="document.getElementById('clearModalOverlay-${this.blockId}').remove()">Close</button>
            </div>
        `;
    }

    showLoadingState() {
        // Remove any existing loading overlay
        this.hideLoadingState();

        // Create loading overlay
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'pdfx-loading-overlay';
        loadingOverlay.id = `clearLoadingOverlay-${this.blockId}`;

        loadingOverlay.innerHTML = `
            <div class="pdfx-loading-spinner"></div>
        `;

        // Append to the content area instead of document.body
        const contentArea = document.getElementById(`contentArea-${this.blockId}`);
        if (contentArea) {
            contentArea.appendChild(loadingOverlay);
        } else {
            // Fallback to document.body if contentArea not found
            document.body.appendChild(loadingOverlay);
        }
    }

    hideLoadingState() {
        const loadingOverlay = document.getElementById(`clearLoadingOverlay-${this.blockId}`);
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
    }

    showSuccessMessage(message) {
        // Hide loading state
        this.hideLoadingState();

        // Create success notification
        const notification = document.createElement('div');
        notification.className = 'pdfx-success-notification';
        notification.id = `clearSuccessNotification-${this.blockId}`;
        notification.textContent = message;

        // Append to the content area instead of document.body
        const contentArea = document.getElementById(`contentArea-${this.blockId}`);
        if (contentArea) {
            contentArea.appendChild(notification);
        } else {
            // Fallback to document.body if contentArea not found
            document.body.appendChild(notification);
        }

        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    clearPageVisualAnnotations(pageNum) {
        // Clear highlights for the page
        const highlights = document.querySelectorAll(`#viewerContainer-${this.blockId} .highlight-group`);
        highlights.forEach(highlight => {
            const pageContainer = highlight.closest('.page');
            if (pageContainer && this.getPageNumberFromContainer(pageContainer) === pageNum) {
                highlight.remove();
            }
        });

        // Clear drawing canvases for the page
        const drawingCanvases = document.querySelectorAll(`#pdfx-block-${this.blockId} .drawing-canvas`);
        drawingCanvases.forEach(canvas => {
            if (this.getPageNumberFromCanvas(canvas) === pageNum) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        });

        // Clear text annotations for the page
        const textAnnotations = document.querySelectorAll(`#pdfx-block-${this.blockId} .text-annotation-final, #pdfx-block-${this.blockId} .text-annotation-box`);
        textAnnotations.forEach(textAnnotation => {
            const pageContainer = textAnnotation.closest('.page');
            if (pageContainer && this.getPageNumberFromContainer(pageContainer) === pageNum) {
                textAnnotation.remove();
            }
        });

        // Clear stamps for the page using StampTool integration
        if (this.viewer.stampTool) {
            this.viewer.stampTool.clearPageStamps(pageNum);
        } else {
            // Fallback: clear stamps manually
            const stamps = document.querySelectorAll(`#pdfx-block-${this.blockId} .stamp-annotation`);
            stamps.forEach(stamp => {
                const pageContainer = stamp.closest('.page');
                if (pageContainer && this.getPageNumberFromContainer(pageContainer) === pageNum) {
                    stamp.remove();
                }
            });
        }

        // Clear scribble strokes for the page using ScribbleTool integration
        if (this.viewer.scribbleTool) {
            this.viewer.scribbleTool.clearPageStrokes(pageNum);
        } else {
            // Fallback: clear stroke SVGs manually
            const strokes = document.querySelectorAll(`#pdfx-block-${this.blockId} .stroke-svg`);
            strokes.forEach(stroke => {
                const pageContainer = stroke.closest('.page');
                if (pageContainer && this.getPageNumberFromContainer(pageContainer) === pageNum) {
                    stroke.remove();
                }
            });
        }

        console.log(`[ClearTool] Cleared visual annotations for page ${pageNum}`);
    }

    clearAllVisualAnnotations() {
        // Clear all highlights
        const highlights = document.querySelectorAll(`#viewerContainer-${this.blockId} .highlight-group`);
        highlights.forEach(highlight => highlight.remove());

        // Clear all drawing canvases
        const drawingCanvases = document.querySelectorAll(`#pdfx-block-${this.blockId} .drawing-canvas`);
        drawingCanvases.forEach(canvas => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });

        // Clear all text annotations
        const textAnnotations = document.querySelectorAll(`#pdfx-block-${this.blockId} .text-annotation-final, #pdfx-block-${this.blockId} .text-annotation-box`);
        textAnnotations.forEach(textAnnotation => textAnnotation.remove());

        // Clear all stamps using StampTool integration
        if (this.viewer.stampTool) {
            this.viewer.stampTool.clearAllStamps();
        } else {
            // Fallback: clear stamps manually
            const stamps = document.querySelectorAll(`#pdfx-block-${this.blockId} .stamp-annotation`);
            stamps.forEach(stamp => stamp.remove());
        }

        // Clear all scribble strokes using ScribbleTool integration
        if (this.viewer.scribbleTool) {
            this.viewer.scribbleTool.clearAllStrokes();
        } else {
            // Fallback: clear stroke SVGs manually
            const strokes = document.querySelectorAll(`#pdfx-block-${this.blockId} .stroke-svg`);
            strokes.forEach(stroke => stroke.remove());
        }

        console.log(`[ClearTool] Cleared all visual annotations`);
    }

    sendClearRequest(clearData, actionType) {
        // Use the existing annotation storage system to send clear request
        if (this.viewer.annotationStorage) {
            // Create a special clear annotation
            const clearAnnotation = {
                id: `clear_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'clear_action',
                pageNum: clearData.pageNum || 0,
                data: clearData,
                timestamp: Date.now()
            };

            // Listen for the save completion
            const handleSaveCompletion = (savedData) => {
                // Check if our clear annotation was processed
                if (savedData && savedData.clear_action) {
                    this.handleClearSuccess(actionType, clearData);
                    // Remove the listener
                    this.viewer.annotationStorage.removeListener('annotationsSaved', handleSaveCompletion);
                }
            };

            // Listen for save errors
            const handleSaveError = (error) => {
                this.handleClearError(actionType, error);
                this.viewer.annotationStorage.removeListener('saveError', handleSaveError);
            };

            // Add listeners
            this.viewer.annotationStorage.on('annotationsSaved', handleSaveCompletion);
            this.viewer.annotationStorage.on('saveError', handleSaveError);

            // Send the annotation
            this.viewer.annotationStorage.saveAnnotation(clearAnnotation);

            // Fallback timeout in case events don't fire
            setTimeout(() => {
                if (document.getElementById(`clearLoadingOverlay-${this.blockId}`)) {
                    this.handleClearSuccess(actionType, clearData);
                    this.viewer.annotationStorage.removeListener('annotationsSaved', handleSaveCompletion);
                    this.viewer.annotationStorage.removeListener('saveError', handleSaveError);
                }
            }, 5000);
        } else {
            console.warn(`[ClearTool] No annotation storage available for clear request`);
            this.hideLoadingState();
        }
    }

    handleClearSuccess(actionType, clearData) {
        let message;
        if (actionType === 'current_page') {
            message = `Page ${clearData.pageNum} annotations cleared successfully`;
        } else {
            message = 'All annotations cleared successfully';
        }

        // Find the modal and transition to success
        const modalOverlay = document.getElementById(`clearModalOverlay-${this.blockId}`);
        if (modalOverlay) {
            const modal = modalOverlay.querySelector('.pdfx-clear-modal');
            if (modal) {
                this.transitionModalToSuccess(modal, message);
            }
        } else {
            // Fallback to separate success message if modal not found
            this.showSuccessMessage(message);
        }

        console.log(`[ClearTool] Clear request completed successfully: ${actionType}`);
    }

    handleClearError(actionType, error) {
        // Find the modal and show error state
        const modalOverlay = document.getElementById(`clearModalOverlay-${this.blockId}`);
        if (modalOverlay) {
            const modal = modalOverlay.querySelector('.pdfx-clear-modal');
            if (modal) {
                this.transitionModalToError(modal, error);
            }
        }

        console.error(`[ClearTool] Clear request failed:`, error);
    }

    getPageNumberFromCanvas(canvas) {
        const canvasId = canvas.id;
        const match = canvasId.match(/drawing-canvas-\w+-(\d+)/);
        return match ? parseInt(match[1]) + 1 : 1; // Canvas index is 0-based, page is 1-based
    }

    getPageNumberFromContainer(pageContainer) {
        // Try to get page number from data attribute
        const pageNum = pageContainer.getAttribute('data-page-number');
        if (pageNum) {
            return parseInt(pageNum);
        }

        // Try to get from page container ID
        const pageId = pageContainer.id;
        const match = pageId.match(/pageContainer(\d+)/);
        return match ? parseInt(match[1]) : 1;
    }

    closeClearToolbar() {
        const clearToolbar = document.getElementById(`editorClearParamsToolbar-${this.blockId}`);
        const clearBtn = document.getElementById(`clearAnnotations-${this.blockId}`);

        if (clearToolbar && clearBtn) {
            this.viewer.hideParameterToolbar(clearToolbar, clearBtn);
        }
    }

    cleanup() {
        // Clean up modals and overlays
        this.removeModal();
        this.hideLoadingState();

        // Remove any success notifications
        const notification = document.getElementById(`clearSuccessNotification-${this.blockId}`);
        if (notification) {
            notification.remove();
        }

        console.log(`[ClearTool] Cleanup completed`);
    }
}