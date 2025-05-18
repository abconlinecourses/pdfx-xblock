/* Javascript for PdfxXBlock. */
function PdfxXBlock(runtime, element) {

    console.debug('[PdfX Debug] Initializing main PdfxXBlock module');

    function updateCount(result) {
        $('.count', element).text(result.count);
    }

    var handlerUrl = runtime.handlerUrl(element, 'increment_count');

    $('p', element).click(function(eventObject) {
        $.ajax({
            type: "POST",
            url: handlerUrl,
            data: JSON.stringify({"hello": "world"}),
            success: updateCount
        });
    });

    // Function to check if the data element contains valid information
    function logDataElementContents() {
        // Try to find data element for this block
        var blockId = '';

        // First try to get block ID from element
        if (element && element.id) {
            // Remove prefix if present
            blockId = element.id.replace('pdfx-block-', '');
        }

        // Also try to get from the nearest pdfx_block element
        if (!blockId) {
            var pdfxBlock = element.querySelector('.pdfx_block');
            if (pdfxBlock && pdfxBlock.id) {
                blockId = pdfxBlock.id.replace('pdfx-block-', '');
            }
        }

        if (!blockId) {
            console.warn('[PdfX Debug] Could not determine block ID for diagnostics');
            return;
        }

        console.debug(`[PdfX Debug] Checking data element for block ${blockId}`);

        // Find the data element
        var dataElement = document.getElementById(`pdfx-data-${blockId}`);
        if (!dataElement) {
            console.warn(`[PdfX Debug] Data element not found for block ${blockId}`);
            return;
        }

        // Log all dataset attributes
        console.debug(`[PdfX Debug] Data element attributes for block ${blockId}:`, dataElement.dataset);

        // Check specifically for marker strokes
        if (dataElement.dataset.markerStrokes) {
            try {
                var markerData = JSON.parse(dataElement.dataset.markerStrokes);
                console.debug(`[PdfX Debug] Marker strokes data found:`, Object.keys(markerData));

                // Count total strokes
                var totalStrokes = 0;
                var pageCount = 0;

                Object.keys(markerData).forEach(function(key) {
                    if (key !== '_last_saved' && key !== 'strokeCount' && key !== '_lastSynced') {
                        pageCount++;
                        if (Array.isArray(markerData[key])) {
                            totalStrokes += markerData[key].length;
                        }
                    }
                });

                console.debug(`[PdfX Debug] Total marker strokes: ${totalStrokes} across ${pageCount} pages`);
            } catch (e) {
                console.error(`[PdfX Debug] Error parsing marker strokes data: ${e.message}`);
            }
        } else {
            console.warn(`[PdfX Debug] No marker strokes data found in data element`);
        }
    }

    // Set up global error handlers to catch any initialization issues
    window.addEventListener('error', function(event) {
        console.error(`[PdfX Debug] Global error caught: ${event.message} at ${event.filename}:${event.lineno}`);
    });

    // Run diagnostics when DOM is ready
    $(function () {
        console.debug('[PdfX Debug] DOM ready, running diagnostics');
        logDataElementContents();

        // Verify fabric.js is loaded
        if (typeof fabric === 'undefined') {
            console.error('[PdfX Debug] fabric.js is not loaded');
        } else {
            console.debug('[PdfX Debug] fabric.js is loaded, version:', fabric.version);
        }

        // Verify PDF.js is loaded
        if (typeof pdfjsLib === 'undefined') {
            console.error('[PdfX Debug] PDF.js is not loaded');
        } else {
            console.debug('[PdfX Debug] PDF.js is loaded, version:', pdfjsLib.version);
        }
    });
}
