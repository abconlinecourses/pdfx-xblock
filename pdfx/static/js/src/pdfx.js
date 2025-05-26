/**
 * Main JavaScript for PDF XBlock
 *
 * This is the main entry point for the PDF XBlock functionality.
 * It provides a module-based architecture for PDF viewing and annotations.
 */

// Ensure the PDFX namespace exists
window.PDFX = window.PDFX || {};

// Store instances for easy access
PDFX.instances = {};

/**
 * Initialize a new PDF XBlock instance
 * @param {string} blockId - The block ID
 * @param {object} options - Configuration options
 * @returns {object} The initialized instance with all modules
 */
PDFX.initInstance = function(blockId, options) {
    console.debug(`[PDFX] Initializing instance for block ${blockId}`);

    if (PDFX.instances[blockId]) {
        console.debug(`[PDFX] Instance for block ${blockId} already exists, returning existing instance`);
        return PDFX.instances[blockId];
    }

    // Create a new instance with all modules
    const instance = {
        blockId: blockId,
        options: options || {},
        core: null,
        tools: null,
        ui: null,
        canvas: null,
        storage: null,
        scribble: null,
        rendering: null,
        debug: options.debugMode || false
    };

    // Initialize core module
    if (PDFX.Core) {
        instance.core = Object.create(PDFX.Core);
        instance.core.init(blockId, options);
    }

    // Initialize tools module
    if (PDFX.Tools) {
        instance.tools = Object.create(PDFX.Tools);
        instance.tools.init(blockId, options);
    }

    // Initialize UI module
    if (PDFX.UI) {
        instance.ui = Object.create(PDFX.UI);
        instance.ui.init(blockId, options);
    }

    // Initialize canvas module if available
    if (PDFX.Canvas) {
        instance.canvas = Object.create(PDFX.Canvas);
        instance.canvas.init(blockId, options);
    }

    // Initialize storage module if available
    if (PDFX.Storage) {
        instance.storage = Object.create(PDFX.Storage);
        instance.storage.init(blockId, options);
    }

    // Initialize scribble module if available
    if (PDFX.Scribble) {
        instance.scribble = Object.create(PDFX.Scribble);
        instance.scribble.init(blockId, options);
    }

    // Initialize rendering module if available
    if (PDFX.Rendering) {
        instance.rendering = Object.create(PDFX.Rendering);
        instance.rendering.init(blockId, options);
    }

    // Store instance for later access
    PDFX.instances[blockId] = instance;

    // Also store in legacy format for backward compatibility
    window[`pdfxInstance_${blockId}`] = instance;

    return instance;
};

/**
 * Get an existing instance by block ID
 * @param {string} blockId - The block ID
 * @returns {object} The instance or null if not found
 */
PDFX.getInstance = function(blockId) {
    return PDFX.instances[blockId] || null;
};

/**
 * Entry point for PDF XBlock
 * This is called by the Open edX runtime
 */
function PdfxXBlock(runtime, element) {
    console.debug('[PDFX] Initializing PdfxXBlock module');

    // Extract block ID from element ID
    const blockId = element.id.replace('pdfx-block-', '');

    // Get options from data element
    const dataElement = document.getElementById(`pdfx-data-${blockId}`);
    const options = {
        runtime: runtime,
        handlerUrl: runtime.handlerUrl(element, 'save_annotations'),
        debugMode: false
    };

    // Parse additional options from data element if available
    if (dataElement && dataElement.dataset) {
        // Add PDF URL if available
        if (dataElement.dataset.pdfUrl) {
            options.pdfUrl = dataElement.dataset.pdfUrl;
        }

        // Add current page if available
        if (dataElement.dataset.currentPage) {
            options.currentPage = parseInt(dataElement.dataset.currentPage, 10) || 1;
        }

        // Add debug mode if enabled
        if (dataElement.dataset.debugMode === 'true') {
            options.debugMode = true;
        }
    }

    // Initialize the PDF XBlock instance
    const instance = PDFX.initInstance(blockId, options);

    // Log successful initialization
    console.debug(`[PDFX] PDF XBlock initialized for block ${blockId}`);

    return instance;
}
