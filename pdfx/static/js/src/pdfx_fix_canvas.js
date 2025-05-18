/**
 * PDF Viewer XBlock - Canvas Fixing Utilities
 *
 * This module provides utilities to fix canvas sizing issues,
 * ensuring that the drawing canvas properly matches the PDF dimensions.
 */

// Global utility to fix canvas container dimensions
window.emergencyFixCanvasContainer = function(blockId) {
    console.debug(`[PdfX Debug] Running emergency canvas fix for block ${blockId}`);

    // Get the PDF container to get the correct dimensions
    const pdfContainer = document.getElementById(`pdf-container-${blockId}`);
    if (!pdfContainer) {
        console.warn(`[PdfX Debug] PDF container not found for block ${blockId}`);
        return false;
    }

    // Get dimensions
    const width = pdfContainer.offsetWidth;
    const height = pdfContainer.offsetHeight;

    console.debug(`[PdfX Debug] PDF Container dimensions: ${width}x${height}`);

    // Check if dimensions are valid
    if (width <= 300 || height <= 150) {
        // Try to get dimensions from pdfViewer container
        const pdfViewer = document.querySelector('.pdfViewer');
        if (pdfViewer) {
            const viewerWidth = pdfViewer.offsetWidth;
            const viewerHeight = pdfViewer.offsetHeight;

            // If viewer has valid dimensions, use those
            if (viewerWidth > 300 && viewerHeight > 150) {
                console.debug(`[PdfX Debug] Using pdfViewer dimensions: ${viewerWidth}x${viewerHeight}`);
                fixCanvasWithDimensions(blockId, viewerWidth, viewerHeight);
                return true;
            }
        }

        // Try to get dimensions from the first page
        const firstPage = document.querySelector('.pdfViewer .page');
        if (firstPage) {
            const pageWidth = firstPage.offsetWidth;
            const pageHeight = firstPage.offsetHeight;

            // If page has valid dimensions, use those
            if (pageWidth > 300 && pageHeight > 150) {
                console.debug(`[PdfX Debug] Using page dimensions: ${pageWidth}x${pageHeight}`);
                fixCanvasWithDimensions(blockId, pageWidth, pageHeight);
                return true;
            }
        }

        // Fallback to standard dimensions if we couldn't find better ones
        console.debug(`[PdfX Debug] Using fallback dimensions`);
        fixCanvasWithDimensions(blockId, 800, 1100);
        return true;
    }

    // Use the dimensions we found
    console.debug(`[PdfX Debug] Container dimensions: ${width}x${height}`);
    fixCanvasWithDimensions(blockId, width, height);
    return true;
};

// Helper function to fix canvas with specific dimensions
function fixCanvasWithDimensions(blockId, width, height) {
    // Get the draw container
    const drawContainer = document.getElementById(`draw-container-${blockId}`);
    if (!drawContainer) {
        console.warn(`[PdfX Debug] Draw container not found for block ${blockId}`);
        return false;
    }

    // Fix draw container dimensions
    drawContainer.style.width = width + 'px';
    drawContainer.style.height = height + 'px';

    // Fix canvas container dimensions
    const canvasContainer = drawContainer.querySelector('.canvas-container');
    if (canvasContainer) {
        canvasContainer.style.width = width + 'px';
        canvasContainer.style.height = height + 'px';
        canvasContainer.style.minWidth = width + 'px';
        canvasContainer.style.minHeight = height + 'px';
        canvasContainer.style.maxWidth = width + 'px';
        canvasContainer.style.maxHeight = height + 'px';
    }

    // Fix lower canvas dimensions
    const lowerCanvas = drawContainer.querySelector('.lower-canvas');
    if (lowerCanvas) {
        lowerCanvas.width = width;
        lowerCanvas.height = height;
        lowerCanvas.style.width = width + 'px';
        lowerCanvas.style.height = height + 'px';
    }

    // Fix upper canvas dimensions
    const upperCanvas = drawContainer.querySelector('.upper-canvas');
    if (upperCanvas) {
        upperCanvas.width = width;
        upperCanvas.height = height;
        upperCanvas.style.width = width + 'px';
        upperCanvas.style.height = height + 'px';
    }

    // Force fabricCanvas resize if available from instance
    if (window.pdfxScribbleInstances && window.pdfxScribbleInstances[blockId]) {
        const scribbleInstance = window.pdfxScribbleInstances[blockId];
        if (scribbleInstance.fabricCanvas) {
            scribbleInstance.fabricCanvas.setWidth(width);
            scribbleInstance.fabricCanvas.setHeight(height);
            scribbleInstance.fabricCanvas.renderAll();

            // Rerender current page to ensure strokes are displayed
            if (typeof scribbleInstance.renderPage === 'function' &&
                scribbleInstance.currentPage) {
                scribbleInstance.renderPage(scribbleInstance.currentPage);
            }
        }
    }

    return true;
}

// Add event listener for PDF loaded events
document.addEventListener('DOMContentLoaded', function() {
    // Store scribble instances globally for easier access
    window.pdfxScribbleInstances = {};

    // Listen for PDF loaded event
    document.addEventListener('pdfViewer:loaded', function(event) {
        if (event.detail && event.detail.blockId) {
            console.debug(`[PdfX Debug] PDF loaded for block ${event.detail.blockId}, fixing canvas`);
            setTimeout(function() {
                window.emergencyFixCanvasContainer(event.detail.blockId);

                // Re-render strokes if instance is available
                if (window.pdfxScribbleInstances &&
                    window.pdfxScribbleInstances[event.detail.blockId]) {
                    const instance = window.pdfxScribbleInstances[event.detail.blockId];
                    if (instance.renderPage && instance.currentPage) {
                        instance.renderPage(instance.currentPage);
                    }
                }
            }, 1000); // Give the PDF time to fully render
        }
    });

    // Also handle page change events
    document.addEventListener('pdfx:pagechanged', function(event) {
        if (event.detail && event.detail.blockId) {
            console.debug(`[PdfX Debug] Page changed for block ${event.detail.blockId}, fixing canvas`);
            setTimeout(function() {
                window.emergencyFixCanvasContainer(event.detail.blockId);
            }, 100);
        }
    });
});

// Add a utility to store scribble instances globally when created
window.registerPdfxScribbleInstance = function(blockId, instance) {
    if (!window.pdfxScribbleInstances) {
        window.pdfxScribbleInstances = {};
    }
    window.pdfxScribbleInstances[blockId] = instance;
    console.debug(`[PdfX Debug] Registered scribble instance for block ${blockId}`);
};