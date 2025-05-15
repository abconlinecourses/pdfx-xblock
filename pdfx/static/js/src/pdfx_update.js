/**
 * PDF XBlock - Update Helper
 *
 * This script helps migrate from the old marker-based implementation
 * with workarounds to the new clean scribble implementation.
 */
(function() {
    'use strict';

    console.log('PDF XBlock: Update helper loaded at ' + new Date().toISOString());

    /**
     * Initialize the update process for all PDF XBlocks on the page
     */
    function initUpdate() {
        // Find all PDF XBlocks
        var pdfxBlocks = document.querySelectorAll('.pdfx_block');

        if (pdfxBlocks.length === 0) {
            console.log('No PDF XBlocks found on this page');
            return;
        }

        console.log('Found ' + pdfxBlocks.length + ' PDF XBlocks - updating each one');

        // Update each block
        pdfxBlocks.forEach(function(block) {
            var blockId = block.id.replace('pdfx-block-', '');
            updateBlock(blockId);
        });
    }

    /**
     * Update a specific PDF XBlock
     * @param {string} blockId - The block ID to update
     */
    function updateBlock(blockId) {
        console.log(`Updating PDF XBlock ${blockId}...`);

        // Rename button elements from marker to scribble
        updateButtonElements(blockId);

        // Update data attributes
        updateDataAttributes(blockId);

        // Clean up legacy global objects
        cleanupGlobalObjects(blockId);

        console.log(`PDF XBlock ${blockId} updated successfully`);
    }

    /**
     * Update button elements from marker to scribble
     * @param {string} blockId - The block ID to update
     */
    function updateButtonElements(blockId) {
        // Find the marker button
        var markerBtn = document.getElementById(`marker-tool-${blockId}`);

        if (markerBtn) {
            // Clone the button to keep all event listeners
            var scribbleBtn = markerBtn.cloneNode(true);
            scribbleBtn.id = `scribble-tool-${blockId}`;

            // Update any text or tooltips
            if (scribbleBtn.title && scribbleBtn.title.includes('marker')) {
                scribbleBtn.title = scribbleBtn.title.replace('marker', 'scribble');
            }

            if (scribbleBtn.getAttribute('aria-label') && scribbleBtn.getAttribute('aria-label').includes('marker')) {
                scribbleBtn.setAttribute('aria-label', scribbleBtn.getAttribute('aria-label').replace('marker', 'scribble'));
            }

            // Replace the button
            if (markerBtn.parentNode) {
                markerBtn.parentNode.replaceChild(scribbleBtn, markerBtn);
                console.log(`Replaced marker button with scribble button for block ${blockId}`);
            }

            // Add click handler for new button
            scribbleBtn.addEventListener('click', function() {
                if (typeof window.initScribbleTool === 'function') {
                    window.initScribbleTool(blockId);
                }
            });
        }
    }

    /**
     * Update data attributes from marker to scribble
     * @param {string} blockId - The block ID to update
     */
    function updateDataAttributes(blockId) {
        // Find the draw container
        var drawContainer = document.getElementById(`draw-container-${blockId}`);

        if (drawContainer) {
            // Update the current tool attribute
            if (drawContainer.dataset.currentTool === 'marker') {
                drawContainer.dataset.currentTool = 'scribble';
                console.log(`Updated currentTool attribute for block ${blockId}`);
            }
        }

        // Find any canvas elements
        var canvas = document.getElementById(`drawing-canvas-${blockId}`);

        if (canvas) {
            // Check for fabric canvas
            var fabricCanvas = window[`fabricCanvas_${blockId}`];

            if (fabricCanvas && fabricCanvas.freeDrawingBrush) {
                // Update brush mode
                if (fabricCanvas.freeDrawingBrush.markerMode) {
                    fabricCanvas.freeDrawingBrush.markerMode = false;
                    fabricCanvas.freeDrawingBrush.scribbleMode = true;
                    console.log(`Updated drawing brush mode for block ${blockId}`);
                }
            }
        }
    }

    /**
     * Clean up legacy global objects
     * @param {string} blockId - The block ID to update
     */
    function cleanupGlobalObjects(blockId) {
        // Remove legacy functions
        if (window[`fixMarkerTool_${blockId}`]) {
            delete window[`fixMarkerTool_${blockId}`];
        }

        if (window.marker_debug) {
            delete window.marker_debug;
        }

        if (window.forcePdfxInit) {
            delete window.forcePdfxInit;
        }

        if (window.checkPdfxTools) {
            delete window.checkPdfxTools;
        }

        console.log(`Cleaned up legacy global objects for block ${blockId}`);
    }

    // Run the update when the DOM is fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUpdate);
    } else {
        initUpdate();
    }

    // Export the update function for manual use
    window.updatePdfxBlock = updateBlock;
})();