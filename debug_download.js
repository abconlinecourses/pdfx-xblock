// Debug script to test download functionality
console.log('=== DOWNLOAD DEBUG SCRIPT ===');

// Find all viewers
const viewers = Object.keys(window).filter(key => key.startsWith('pdfxViewer_'));
console.log(`Found ${viewers.length} PDF viewers:`, viewers);

viewers.forEach(viewerKey => {
    const viewer = window[viewerKey];
    const blockId = viewerKey.replace('pdfxViewer_', '');
    console.log(`\n--- Viewer ${blockId} ---`);
    console.log('Viewer object:', !!viewer);
    console.log('allowDownload config:', viewer?.config?.allowDownload);
    console.log('downloadTool initialized:', !!viewer?.downloadTool);

    // Check if download button exists
    const downloadBtn = document.getElementById(`download-${blockId}`);
    console.log('Download button found:', !!downloadBtn);

    // Check if download toolbar exists
    const downloadToolbar = document.getElementById(`editorDownloadParamsToolbar-${blockId}`);
    console.log('Download toolbar found:', !!downloadToolbar);
    console.log('Download toolbar classes:', downloadToolbar?.className);

    // Check if DownloadTool class is available globally
    console.log('DownloadTool class available globally:', typeof DownloadTool);

    // Check download option buttons
    const downloadWithBtn = document.getElementById(`downloadWithAnnotations-${blockId}`);
    const downloadWithoutBtn = document.getElementById(`downloadWithoutAnnotations-${blockId}`);
    console.log('Download with annotations button:', !!downloadWithBtn);
    console.log('Download without annotations button:', !!downloadWithoutBtn);

    // Test manual DownloadTool creation
    if (typeof DownloadTool !== 'undefined' && viewer) {
        try {
            console.log('Testing manual DownloadTool creation...');
            const testTool = new DownloadTool(viewer);
            console.log('Manual DownloadTool creation successful:', !!testTool);
        } catch (error) {
            console.error('Manual DownloadTool creation failed:', error);
        }
    }

    if (downloadBtn) {
        // Manual click test
        console.log('Testing manual click...');
        downloadBtn.click();
    }
});

console.log('=== END DOWNLOAD DEBUG ===');