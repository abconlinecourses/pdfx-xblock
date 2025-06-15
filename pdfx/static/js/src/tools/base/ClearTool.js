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

    activate() {
        console.log(`[ClearTool] Activating clear mode for block: ${this.blockId}`);
        // No specific activation needed - just show the toolbar
    }

    deactivate() {
        console.log(`[ClearTool] Deactivating clear mode for block: ${this.blockId}`);
        // No specific deactivation needed
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

    clearCurrentPageAnnotations() {
        const currentPage = this.viewer.pdfViewer ? this.viewer.pdfViewer.currentPageNumber : 1;

        if (confirm(`Are you sure you want to clear all annotations on page ${currentPage}?`)) {
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

            if (this.annotationInterface) {
                this.sendClearRequest(clearData);
            } else {
                console.warn(`[ClearTool] No annotation interface available - page clear will not be saved!`);
            }

            // Close the toolbar after action
            this.closeClearToolbar();
        }
    }

    clearAllAnnotations() {
        if (confirm('Are you sure you want to clear all annotations in the entire PDF?')) {
            console.log(`[ClearTool] TOOL_ACTION: Clearing all annotations in PDF`);

            // Clear all visual annotations
            this.clearAllVisualAnnotations();

            // Save deletion to server
            const clearData = {
                action: 'clear_all',
                _deletionOnly: true,
                _clearAll: true
            };

            if (this.annotationInterface) {
                this.sendClearRequest(clearData);
            } else {
                console.warn(`[ClearTool] No annotation interface available - clear all will not be saved!`);
            }

            // Close the toolbar after action
            this.closeClearToolbar();
        }
    }

    clearPageVisualAnnotations(pageNum) {
        // Clear highlights for the page
        const highlights = document.querySelectorAll(`#viewerContainer-${this.blockId} .highlight-group[data-page="${pageNum}"]`);
        highlights.forEach(highlight => highlight.remove());

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

        // Clear stamps for the page
        const stamps = document.querySelectorAll(`#pdfx-block-${this.blockId} .stamp-annotation`);
        stamps.forEach(stamp => {
            const pageContainer = stamp.closest('.page');
            if (pageContainer && this.getPageNumberFromContainer(pageContainer) === pageNum) {
                stamp.remove();
            }
        });

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

        // Clear all stamps
        const stamps = document.querySelectorAll(`#pdfx-block-${this.blockId} .stamp-annotation`);
        stamps.forEach(stamp => stamp.remove());

        console.log(`[ClearTool] Cleared all visual annotations`);
    }

    sendClearRequest(clearData) {
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

            this.viewer.annotationStorage.saveAnnotation(clearAnnotation);
        } else {
            console.warn(`[ClearTool] No annotation storage available for clear request`);
        }
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
        // Clean up event listeners if needed
        console.log(`[ClearTool] Cleanup completed`);
    }
}