/**
 * PDF XBlock Debug Utilities
 *
 * This file contains debugging utilities for the PDF XBlock.
 * These functions are only used for development and troubleshooting.
 *
 * In production, these functions will do nothing as all console
 * logging functionality has been removed.
 */

// Create a global pdfxDebug object with empty implementations
window.pdfxDebug = {
    // Empty implementations that do nothing
    checkTools: function(blockId) {
        return Promise.resolve();
    },

    initScribble: function(blockId) {
        return Promise.resolve();
    },

    fixCanvas: function(blockId) {
        return Promise.resolve();
    },

    checkStorage: function(blockId) {
        return Promise.resolve();
    },

    clearStorage: function() {
        return Promise.resolve();
    },

    clearCurrentPdf: function(blockId) {
        return Promise.resolve();
    },

    refreshPdf: function(blockId) {
        return Promise.resolve();
    }
};