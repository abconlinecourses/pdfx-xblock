/**
 * DownloadTool - Download functionality for PDF.js integration
 * Provides options to download PDF with or without annotations
 */
class DownloadTool {
    constructor(viewer, annotationInterface = null) {
        this.viewer = viewer;
        this.blockId = viewer.blockId;
        this.annotationInterface = annotationInterface;

        // Initialize
        this.init();
    }

    init() {
        console.log(`[DownloadTool] Initializing for block: ${this.blockId}`);
        this.setupToolButton();
        this.setupDownloadOptions();
    }

    setupToolButton() {
        const downloadBtn = document.getElementById(`download-${this.blockId}`);
        const downloadToolbar = document.getElementById(`editorDownloadParamsToolbar-${this.blockId}`);

        console.log(`[DownloadTool] Setting up download button - button found: ${!!downloadBtn}, toolbar found: ${!!downloadToolbar}`);

        if (downloadBtn && downloadToolbar) {
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log(`[DownloadTool] Download button clicked`);
                this.toggleDownloadToolbar(downloadBtn, downloadToolbar);
            });
        } else {
            console.error(`[DownloadTool] Missing elements - button: ${!!downloadBtn}, toolbar: ${!!downloadToolbar}`);
        }
    }

    toggleDownloadToolbar(button, toolbar) {
        console.log(`[DownloadTool] toggleDownloadToolbar called with:`, {
            button: button,
            toolbar: toolbar,
            buttonId: button?.id,
            toolbarId: toolbar?.id
        });

        if (!toolbar) {
            console.log(`[DownloadTool] No toolbar provided, returning`);
            return;
        }

        const isHidden = toolbar.classList.contains('hidden');
        const isCurrentlyActive = button.getAttribute('aria-expanded') === 'true';

        console.log(`[DownloadTool] Current state - isHidden: ${isHidden}, isCurrentlyActive: ${isCurrentlyActive}`);

        // If clicking the same button that's already active, just close it
        if (isCurrentlyActive && !isHidden) {
            console.log(`[DownloadTool] Closing active toolbar ${toolbar.id}`);
            this.hideDownloadToolbar(toolbar, button);
            return;
        }

        // Show the toolbar
        if (isHidden) {
            console.log(`[DownloadTool] Showing toolbar ${toolbar.id}`);
            this.showDownloadToolbar(toolbar, button);
        }
    }

        showDownloadToolbar(toolbar, button) {
        // Clear any inline positioning styles to let CSS handle positioning
        toolbar.style.position = '';
        toolbar.style.left = '';
        toolbar.style.top = '';
        toolbar.style.transform = '';

        // Show the toolbar and let CSS handle positioning
        toolbar.classList.remove('hidden');
        button.setAttribute('aria-expanded', 'true');

        console.log(`[DownloadTool] Showed toolbar ${toolbar.id} using CSS positioning`);
    }

    hideDownloadToolbar(toolbar, button) {
        toolbar.classList.add('hidden');
        button.setAttribute('aria-expanded', 'false');

        console.log(`[DownloadTool] Hidden toolbar ${toolbar.id}`);
    }



    setupDownloadOptions() {
        const downloadWithAnnotationsBtn = document.getElementById(`downloadWithAnnotations-${this.blockId}`);
        const downloadWithoutAnnotationsBtn = document.getElementById(`downloadWithoutAnnotations-${this.blockId}`);

        console.log(`[DownloadTool] Setting up download options - withAnnotations button: ${!!downloadWithAnnotationsBtn}, withoutAnnotations button: ${!!downloadWithoutAnnotationsBtn}`);

        if (downloadWithAnnotationsBtn) {
            downloadWithAnnotationsBtn.addEventListener('click', (e) => {
                console.log(`[DownloadTool] Download with annotations clicked`);
                e.stopPropagation();
                this.downloadWithAnnotations();
                this.closeDownloadToolbar();
            });
        }

        if (downloadWithoutAnnotationsBtn) {
            downloadWithoutAnnotationsBtn.addEventListener('click', (e) => {
                console.log(`[DownloadTool] Download without annotations clicked`);
                e.stopPropagation();
                this.downloadWithoutAnnotations();
                this.closeDownloadToolbar();
            });
        }
    }

    /**
     * Download the original PDF without annotations
     */
    downloadWithoutAnnotations() {
        console.log(`[DownloadTool] Downloading original PDF without annotations`);

        if (!this.viewer.config.pdfUrl) {
            this.showError('No PDF URL available for download');
            return;
        }

        try {
            const link = document.createElement('a');
            link.href = this.viewer.config.pdfUrl;
            link.download = this.getFileName('original');
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            this.showSuccess('Original PDF downloaded successfully');
        } catch (error) {
            console.error(`[DownloadTool] Error downloading original PDF:`, error);
            this.showError('Failed to download original PDF');
        }
    }

    /**
     * Download PDF with annotations merged
     */
    async downloadWithAnnotations() {
        console.log(`[DownloadTool] Downloading PDF with annotations`);

        if (!this.viewer.pdfDocument) {
            this.showError('No PDF document available');
            return;
        }

        try {
            this.showLoadingState('Preparing download with annotations...');

            // Check if PDF.js has annotation storage with data
            if (this.viewer.pdfDocument.annotationStorage && this.viewer.pdfDocument.annotationStorage.size > 0) {
                console.log(`[DownloadTool] Found PDF.js annotations, trying saveDocument...`);

                try {
                    // Try PDF.js save functionality for PDF.js annotations
                    const pdfDocWithAnnotations = await this.viewer.pdfDocument.saveDocument();

                    // Create blob and download
                    const blob = new Blob([pdfDocWithAnnotations], { type: 'application/pdf' });
                    const url = URL.createObjectURL(blob);

                    const link = document.createElement('a');
                    link.href = url;
                    link.download = this.getFileName('with-annotations');
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    // Clean up blob URL
                    URL.revokeObjectURL(url);

                    this.hideLoadingState();
                    this.showSuccess('PDF with annotations downloaded successfully');
                    return;
                } catch (error) {
                    console.warn(`[DownloadTool] PDF.js saveDocument failed:`, error);
                    // Continue to fallback method
                }
            }

            // Check if we have custom annotations to render
            const hasCustomAnnotations = this.hasCustomAnnotations();

            if (!hasCustomAnnotations) {
                console.log(`[DownloadTool] No annotations found, downloading original PDF`);
                this.hideLoadingState();
                this.downloadWithoutAnnotations();
                return;
            }

            console.log(`[DownloadTool] Found custom annotations, using canvas-based approach`);

            // Fallback to canvas-based rendering approach for custom annotations
            await this.downloadWithAnnotationsFallback();

        } catch (error) {
            console.error(`[DownloadTool] Error downloading PDF with annotations:`, error);
            this.hideLoadingState();
            this.showError('Failed to create PDF with annotations. Try downloading the original PDF instead.');
        }
    }

    /**
     * Check if there are any custom annotations to render
     */
    hasCustomAnnotations() {
        // Check for highlights
        const highlights = document.querySelectorAll(`#pdfx-block-${this.blockId} .highlight-group`);
        if (highlights.length > 0) {
            console.log(`[DownloadTool] Found ${highlights.length} highlight annotations`);
            return true;
        }

        // Check for drawings/scribbles
        const drawings = document.querySelectorAll(`#pdfx-block-${this.blockId} .stroke-svg`);
        if (drawings.length > 0) {
            console.log(`[DownloadTool] Found ${drawings.length} drawing annotations`);
            return true;
        }

        // Check for text annotations
        const textAnnotations = document.querySelectorAll(`#pdfx-block-${this.blockId} .text-annotation-final`);
        if (textAnnotations.length > 0) {
            console.log(`[DownloadTool] Found ${textAnnotations.length} text annotations`);
            return true;
        }

        // Check for stamps
        const stamps = document.querySelectorAll(`#pdfx-block-${this.blockId} .stamp-annotation`);
        if (stamps.length > 0) {
            console.log(`[DownloadTool] Found ${stamps.length} stamp annotations`);
            return true;
        }

        console.log(`[DownloadTool] No custom annotations found`);
        return false;
    }

    /**
     * Fallback method to create PDF with annotations using canvas rendering
     */
    async downloadWithAnnotationsFallback() {
        console.log(`[DownloadTool] Using fallback method to create PDF with annotations`);

        try {
            this.showLoadingState('Creating PDF with annotations (this may take a moment)...');

            // We'll use a library like jsPDF to create a new PDF with rendered pages
            if (typeof window.jspdf === 'undefined') {
                // Try to load jsPDF dynamically if not available
                await this.loadJsPDF();
            }

            const pdf = new window.jspdf.jsPDF();
            const totalPages = this.viewer.pdfDocument.numPages;

            // Remove the first blank page that jsPDF creates
            let isFirstPage = true;

            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                const canvas = await this.renderPageWithAnnotations(pageNum);

                if (canvas) {
                    const imgData = canvas.toDataURL('image/jpeg', 0.95);

                    if (!isFirstPage) {
                        pdf.addPage();
                    }
                    isFirstPage = false;

                    // Calculate dimensions to fit page
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();
                    const canvasAspectRatio = canvas.width / canvas.height;
                    const pdfAspectRatio = pdfWidth / pdfHeight;

                    let width, height, x, y;

                    if (canvasAspectRatio > pdfAspectRatio) {
                        // Canvas is wider, fit to width
                        width = pdfWidth;
                        height = pdfWidth / canvasAspectRatio;
                        x = 0;
                        y = (pdfHeight - height) / 2;
                    } else {
                        // Canvas is taller, fit to height
                        height = pdfHeight;
                        width = pdfHeight * canvasAspectRatio;
                        x = (pdfWidth - width) / 2;
                        y = 0;
                    }

                    pdf.addImage(imgData, 'JPEG', x, y, width, height);
                }

                // Update progress
                this.updateLoadingProgress(pageNum, totalPages);
            }

            // Save the PDF
            pdf.save(this.getFileName('with-annotations'));

            this.hideLoadingState();
            this.showSuccess('PDF with annotations created successfully');

        } catch (error) {
            console.error(`[DownloadTool] Error in fallback method:`, error);
            this.hideLoadingState();
            this.showError('Failed to create PDF with annotations. Try downloading the original PDF instead.');
        }
    }

    /**
     * Load jsPDF library dynamically
     */
    async loadJsPDF() {
        return new Promise((resolve, reject) => {
            if (typeof window.jspdf !== 'undefined') {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => {
                if (typeof window.jspdf !== 'undefined') {
                    resolve();
                } else {
                    reject(new Error('jsPDF failed to load'));
                }
            };
            script.onerror = () => reject(new Error('Failed to load jsPDF'));
            document.head.appendChild(script);
        });
    }

    /**
     * Render a page with annotations to canvas
     */
    async renderPageWithAnnotations(pageNum) {
        try {
            console.log(`[DownloadTool] Rendering page ${pageNum} with annotations`);

            // Get the page from PDF.js
            const page = await this.viewer.pdfDocument.getPage(pageNum);

            // Create canvas for rendering
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            // Set high resolution for better quality
            const scale = 2.0;
            const viewport = page.getViewport({ scale });

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            console.log(`[DownloadTool] Canvas size for page ${pageNum}: ${canvas.width}x${canvas.height} (scale: ${scale})`);

            // Render PDF page
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            console.log(`[DownloadTool] PDF page ${pageNum} rendered, now overlaying annotations`);

            // Now overlay annotations from the visible page
            const pageContainer = document.querySelector(`#pdfx-block-${this.blockId} .page[data-page-number="${pageNum}"]`);
            if (pageContainer) {
                await this.renderAnnotationsOnCanvas(context, pageContainer, viewport);
                console.log(`[DownloadTool] Annotations overlaid on page ${pageNum}`);
            } else {
                console.warn(`[DownloadTool] No page container found for page ${pageNum}`);
            }

            return canvas;

        } catch (error) {
            console.error(`[DownloadTool] Error rendering page ${pageNum}:`, error);
            return null;
        }
    }

    /**
     * Render annotations from DOM onto canvas
     */
    async renderAnnotationsOnCanvas(context, pageContainer, viewport) {
        // This is a comprehensive approach to render all annotation types

        try {
            // Save current canvas state
            context.save();

            // Get page container dimensions
            const containerRect = pageContainer.getBoundingClientRect();
            const scaleX = viewport.width / containerRect.width;
            const scaleY = viewport.height / containerRect.height;

            console.log(`[DownloadTool] Rendering annotations - viewport: ${viewport.width}x${viewport.height}, container: ${containerRect.width}x${containerRect.height}, scale: ${scaleX}x${scaleY}`);

            // Render highlights
            const highlights = pageContainer.querySelectorAll('.highlight-group');
            console.log(`[DownloadTool] Found ${highlights.length} highlights to render`);
            highlights.forEach(highlight => {
                this.renderHighlightOnCanvas(context, highlight, scaleX, scaleY);
            });

            // Render drawings/scribbles (SVG paths)
            const drawings = pageContainer.querySelectorAll('.stroke-svg, .drawing-svg');
            console.log(`[DownloadTool] Found ${drawings.length} drawings to render`);
            drawings.forEach(drawing => {
                this.renderDrawingOnCanvas(context, drawing, scaleX, scaleY);
            });

            // Render text annotations
            const textAnnotations = pageContainer.querySelectorAll('.text-annotation-final, .text-annotation');
            console.log(`[DownloadTool] Found ${textAnnotations.length} text annotations to render`);
            textAnnotations.forEach(textAnnotation => {
                this.renderTextAnnotationOnCanvas(context, textAnnotation, scaleX, scaleY);
            });

            // Render stamps/images
            const stamps = pageContainer.querySelectorAll('.stamp-annotation, .image-stamp');
            console.log(`[DownloadTool] Found ${stamps.length} stamps to render`);
            stamps.forEach(stamp => {
                this.renderStampOnCanvas(context, stamp, scaleX, scaleY);
            });

            // Restore canvas state
            context.restore();

        } catch (error) {
            console.error(`[DownloadTool] Error rendering annotations on canvas:`, error);
        }
    }

    /**
     * Render highlight annotation on canvas
     */
    renderHighlightOnCanvas(context, highlight, scaleX, scaleY) {
        try {
            const rects = highlight.querySelectorAll('.highlight-element, .highlight-rect');
            console.log(`[DownloadTool] Rendering ${rects.length} highlight rectangles`);

            rects.forEach((rect, index) => {
                const style = window.getComputedStyle(rect);
                const bounds = rect.getBoundingClientRect();
                const containerBounds = highlight.closest('.page').getBoundingClientRect();

                const x = (bounds.left - containerBounds.left) * scaleX;
                const y = (bounds.top - containerBounds.top) * scaleY;
                const width = bounds.width * scaleX;
                const height = bounds.height * scaleY;

                // Get highlight color and opacity
                const backgroundColor = style.backgroundColor || '#FFFF98'; // Default yellow
                const opacity = parseFloat(style.opacity) || 0.4;

                context.save();
                context.fillStyle = backgroundColor;
                context.globalAlpha = opacity;
                context.fillRect(x, y, width, height);
                context.restore();

                console.log(`[DownloadTool] Rendered highlight ${index} at (${x}, ${y}) with size ${width}x${height}, color: ${backgroundColor}, opacity: ${opacity}`);
            });
        } catch (error) {
            console.error(`[DownloadTool] Error rendering highlight:`, error);
        }
    }

    /**
     * Render drawing/scribble on canvas
     */
    renderDrawingOnCanvas(context, drawing, scaleX, scaleY) {
        try {
            const paths = drawing.querySelectorAll('path');
            console.log(`[DownloadTool] Rendering ${paths.length} paths in drawing`);

            paths.forEach((path, index) => {
                const pathData = path.getAttribute('d');
                const stroke = path.getAttribute('stroke') || '#FF0000';
                const strokeWidth = parseFloat(path.getAttribute('stroke-width')) || 1;
                const strokeOpacity = parseFloat(path.getAttribute('stroke-opacity')) || 1;

                if (!pathData) {
                    console.warn(`[DownloadTool] Path ${index} has no path data, skipping`);
                    return;
                }

                // Set drawing properties
                context.save();
                context.strokeStyle = stroke;
                context.lineWidth = strokeWidth * Math.min(scaleX, scaleY);
                context.lineCap = 'round';
                context.lineJoin = 'round';
                context.globalAlpha = strokeOpacity;

                try {
                    // Parse and draw the path
                    const path2D = new Path2D(pathData);
                    context.stroke(path2D);
                    console.log(`[DownloadTool] Rendered path ${index} with stroke ${stroke}, width ${strokeWidth * Math.min(scaleX, scaleY)}`);
                } catch (pathError) {
                    console.error(`[DownloadTool] Error rendering path ${index}:`, pathError);
                }

                context.restore();
            });
        } catch (error) {
            console.error(`[DownloadTool] Error rendering drawing:`, error);
        }
    }

    /**
     * Render text annotation on canvas
     */
    renderTextAnnotationOnCanvas(context, textAnnotation, scaleX, scaleY) {
        try {
            const style = window.getComputedStyle(textAnnotation);
            const bounds = textAnnotation.getBoundingClientRect();
            const containerBounds = textAnnotation.closest('.page').getBoundingClientRect();

            const x = (bounds.left - containerBounds.left) * scaleX;
            const y = (bounds.top - containerBounds.top) * scaleY;
            const fontSize = parseFloat(style.fontSize) * Math.min(scaleX, scaleY);

            context.fillStyle = style.color || '#000000';
            context.font = `${fontSize}px ${style.fontFamily || 'Arial, sans-serif'}`;
            context.fillText(textAnnotation.textContent, x, y + fontSize);

            console.log(`[DownloadTool] Rendered text annotation at (${x}, ${y}) with fontSize ${fontSize}`);
        } catch (error) {
            console.error(`[DownloadTool] Error rendering text annotation:`, error);
        }
    }

    /**
     * Render stamp/image annotation on canvas
     */
    renderStampOnCanvas(context, stamp, scaleX, scaleY) {
        try {
            const img = stamp.querySelector('img');
            if (!img) {
                console.warn(`[DownloadTool] No image found in stamp element`);
                return;
            }

            const bounds = stamp.getBoundingClientRect();
            const containerBounds = stamp.closest('.page').getBoundingClientRect();

            const x = (bounds.left - containerBounds.left) * scaleX;
            const y = (bounds.top - containerBounds.top) * scaleY;
            const width = bounds.width * scaleX;
            const height = bounds.height * scaleY;

            // Draw the image onto the canvas
            context.drawImage(img, x, y, width, height);

            console.log(`[DownloadTool] Rendered stamp at (${x}, ${y}) with size ${width}x${height}`);
        } catch (error) {
            console.error(`[DownloadTool] Error rendering stamp:`, error);
        }
    }

    /**
     * Generate filename based on download type
     */
    getFileName(type = 'original') {
        let baseName = 'document';

        // First, try to get the original filename from config
        if (this.viewer.config.pdfFileName) {
            console.log(`[DownloadTool] Using original filename: ${this.viewer.config.pdfFileName}`);
            baseName = this.viewer.config.pdfFileName.replace(/\.[^/.]+$/, ''); // Remove extension
        } else {
            // Fallback: try to extract from URL
            const baseUrl = this.viewer.config.pdfUrl || '';
            if (baseUrl) {
                const urlParts = baseUrl.split('/');
                const fileName = urlParts[urlParts.length - 1];
                if (fileName && fileName.includes('.')) {
                    baseName = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
                    console.log(`[DownloadTool] Using filename from URL: ${fileName}`);
                } else {
                    console.log(`[DownloadTool] Using default filename: document`);
                }
            } else {
                console.log(`[DownloadTool] No PDF URL available, using default filename: document`);
            }
        }

        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

        switch (type) {
            case 'with-annotations':
                return `${baseName}-with-annotations-${timestamp}.pdf`;
            case 'original':
            default:
                return `${baseName}.pdf`;
        }
    }

    /**
     * Close the download toolbar
     */
    closeDownloadToolbar() {
        const downloadToolbar = document.getElementById(`editorDownloadParamsToolbar-${this.blockId}`);
        const downloadBtn = document.getElementById(`download-${this.blockId}`);

        if (downloadToolbar && downloadBtn) {
            this.hideDownloadToolbar(downloadToolbar, downloadBtn);
        }
    }

    /**
     * Show loading state
     */
    showLoadingState(message = 'Processing...') {
        // Create or update loading indicator
        let loadingIndicator = document.getElementById(`downloadLoading-${this.blockId}`);
        if (!loadingIndicator) {
            loadingIndicator = document.createElement('div');
            loadingIndicator.id = `downloadLoading-${this.blockId}`;
            loadingIndicator.className = 'download-loading-indicator';
            loadingIndicator.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 20px;
                border-radius: 8px;
                z-index: 10000;
                text-align: center;
                font-family: Arial, sans-serif;
            `;
            document.body.appendChild(loadingIndicator);
        }

        loadingIndicator.innerHTML = `
            <div class="spinner" style="
                border: 3px solid #f3f3f3;
                border-top: 3px solid #3498db;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                animation: spin 1s linear infinite;
                margin: 0 auto 10px;
            "></div>
            <div>${message}</div>
        `;

        // Add CSS animation if not already present
        if (!document.getElementById('downloadSpinnerCSS')) {
            const style = document.createElement('style');
            style.id = 'downloadSpinnerCSS';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Update loading progress
     */
    updateLoadingProgress(current, total) {
        const loadingIndicator = document.getElementById(`downloadLoading-${this.blockId}`);
        if (loadingIndicator) {
            const progressPercent = Math.round((current / total) * 100);
            loadingIndicator.innerHTML = `
                <div class="spinner" style="
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid #3498db;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 10px;
                "></div>
                <div>Processing page ${current} of ${total} (${progressPercent}%)</div>
            `;
        }
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        const loadingIndicator = document.getElementById(`downloadLoading-${this.blockId}`);
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showNotification(message, 'error');
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `download-notification download-notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-family: Arial, sans-serif;
            font-size: 14px;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            ${type === 'success' ? 'background: #28a745;' : ''}
            ${type === 'error' ? 'background: #dc3545;' : ''}
            ${type === 'info' ? 'background: #17a2b8;' : ''}
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    /**
     * Cleanup
     */
    cleanup() {
        this.hideLoadingState();

        // Remove any notifications
        const notifications = document.querySelectorAll('.download-notification');
        notifications.forEach(notification => notification.remove());
    }
}

// Make DownloadTool available globally for pdfx-init.js
window.DownloadTool = DownloadTool;