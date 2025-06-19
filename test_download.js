// Test download functionality
console.log('=== TESTING DOWNLOAD FUNCTIONALITY ===');

// Find the first viewer
const viewers = Object.keys(window).filter(key => key.startsWith('pdfxViewer_'));
if (viewers.length === 0) {
    console.error('No PDF viewers found');
} else {
    const viewer = window[viewers[0]];
    const blockId = viewers[0].replace('pdfxViewer_', '');

    console.log(`Testing with viewer: ${blockId}`);
    console.log('Viewer config:', viewer.config);
    console.log('Download tool available:', !!viewer.downloadTool);

    // Test download button click
    const downloadBtn = document.getElementById(`download-${blockId}`);
    const downloadWithoutBtn = document.getElementById(`downloadWithoutAnnotations-${blockId}`);
    const downloadWithBtn = document.getElementById(`downloadWithAnnotations-${blockId}`);

    console.log('Download button:', !!downloadBtn);
    console.log('Download without annotations button:', !!downloadWithoutBtn);
    console.log('Download with annotations button:', !!downloadWithBtn);

    // Test clicking download without annotations
    if (downloadWithoutBtn) {
        console.log('Clicking download without annotations...');
        downloadWithoutBtn.click();
    } else {
        console.error('Download without annotations button not found');
    }
}

console.log('=== END TEST ===');