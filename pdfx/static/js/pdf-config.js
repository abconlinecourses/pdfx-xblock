// PDF.js configuration for XBlock
window.PDFJS_CONFIG = {
    workerSrc: '/xblock/resource/pdfx-xblock/pdfx/static/js/pdf.worker.mjs',
    sandboxBundleSrc: '/xblock/resource/pdfx-xblock/pdfx/static/js/pdf.sandbox.mjs',
    wasmPath: '/xblock/resource/pdfx-xblock/pdfx/static/wasm/',

    // WASM settings for performance optimization
    enableWasm: true,
    wasmBinaryFile: '/xblock/resource/pdfx-xblock/pdfx/static/wasm/pdf.wasm',

    // Performance settings
    maxImageSize: 16777216, // 4096x4096
    enableWebGL: true,
    enableScripting: false, // Disable for security in educational environment

    // Annotation settings
    renderAnnotations: true,
    renderForms: true,
    enableAnnotationStorage: true,

    // Text layer for highlighting support
    enableTextLayer: true,

    // OpenJPEG WASM for JPEG 2000 support
    openjpegWasm: '/xblock/resource/pdfx-xblock/pdfx/static/wasm/openjpeg.wasm',

    // QCMS WASM for color management
    qcmsWasm: '/xblock/resource/pdfx-xblock/pdfx/static/wasm/qcms_bg.wasm'
};

// Apply configuration to PDF.js when it loads
document.addEventListener('DOMContentLoaded', function() {
    if (typeof pdfjsLib !== 'undefined') {
        applyPdfJsConfig();
    } else {
        // Wait for PDF.js to load
        const checkPdfJs = setInterval(() => {
            if (typeof pdfjsLib !== 'undefined') {
                clearInterval(checkPdfJs);
                applyPdfJsConfig();
            }
        }, 100);
    }
});

function applyPdfJsConfig() {
    const config = window.PDFJS_CONFIG;

    // Configure worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = config.workerSrc;

    // Configure WASM paths if available
    if (typeof pdfjsLib.wasmSettings !== 'undefined') {
        pdfjsLib.wasmSettings.basePath = config.wasmPath;
    }

    // Configure sandbox
    if (typeof pdfjsLib.sandboxBundleSrc !== 'undefined') {
        pdfjsLib.sandboxBundleSrc = config.sandboxBundleSrc;
    }

    console.log('[PDF.js Config] Configuration applied successfully');
}