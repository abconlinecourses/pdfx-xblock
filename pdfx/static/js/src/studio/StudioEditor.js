/**
 * Studio Editor for PDF XBlock
 *
 * Handles the studio editing interface including:
 * - PDF file uploads
 * - URL configuration
 * - Form validation and submission
 * - Tab switching between upload and URL modes
 */

import { EventEmitter } from '../utils/EventEmitter.js';

export class StudioEditor extends EventEmitter {
    constructor(runtime, element) {
        super();

        this.runtime = runtime;
        // Convert jQuery object to native DOM element if needed
        this.element = this._ensureDOMElement(element);
        // Set container to element for consistency with other classes
        this.container = this.element;
        this.form = null;
        this.currentTab = 'upload';
        this.uploadedFile = null;

        // Bind methods
        this._bindMethods();

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    /**
     * Ensures the element is a native DOM element, converting from jQuery if necessary
     * @param {Element|jQuery} element - The element to convert
     * @returns {Element} Native DOM element
     */
    _ensureDOMElement(element) {
        console.log('[StudioEditor] Element type:', typeof element);
        console.log('[StudioEditor] Element constructor:', element?.constructor?.name);
        console.log('[StudioEditor] Element nodeType:', element?.nodeType);
        console.log('[StudioEditor] Element jquery property:', element?.jquery);
        console.log('[StudioEditor] Element length:', element?.length);

        // If it's already a native DOM element
        if (element && element.nodeType === Node.ELEMENT_NODE) {
            console.log('[StudioEditor] Element is already a native DOM element');
            return element;
        }

        // If it's a jQuery object (check multiple ways)
        if (element && (
            element.jquery ||                    // jQuery object has .jquery property
            (typeof element.get === 'function' && element.length !== undefined) || // jQuery-like object
            (element.constructor && element.constructor.fn && element.constructor.fn.jquery) // jQuery constructor check
        )) {
            console.log('[StudioEditor] Converting jQuery object to DOM element');
            console.log('[StudioEditor] jQuery object details:', {
                length: element.length,
                hasGet: typeof element.get === 'function',
                hasJquery: !!element.jquery,
                element0: element[0],
                element0Type: element[0]?.nodeType
            });

            // Try element[0] first (most common way)
            let domElement = element[0];

            // If that doesn't work, try element.get(0)
            if (!domElement || domElement.nodeType !== Node.ELEMENT_NODE) {
                domElement = element.get(0);
                console.log('[StudioEditor] Got DOM element via element.get(0)');
            } else {
                console.log('[StudioEditor] Got DOM element via element[0]');
            }

            if (domElement && domElement.nodeType === Node.ELEMENT_NODE) {
                console.log('[StudioEditor] Successfully converted jQuery to DOM element:', domElement);
                return domElement;
            }
        }

        // If it's a string selector, try to find the element
        if (typeof element === 'string') {
            console.log('[StudioEditor] Element is a string selector, finding element:', element);
            const foundElement = document.querySelector(element);
            if (foundElement) {
                return foundElement;
            }
        }

        // Last resort: throw an error with helpful information
        console.error('[StudioEditor] Could not convert element to DOM element:', element);
        throw new Error('StudioEditor requires a valid DOM element or jQuery object');
    }

    _bindMethods() {
        this.init = this.init.bind(this);
        this.switchTab = this.switchTab.bind(this);
        this.handleFileUpload = this.handleFileUpload.bind(this);
        this.handleDragOver = this.handleDragOver.bind(this);
        this.handleDragLeave = this.handleDragLeave.bind(this);
        this.handleDrop = this.handleDrop.bind(this);
        this.handleFormSubmit = this.handleFormSubmit.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.processFile = this.processFile.bind(this);
    }

    init() {
        console.log('[StudioEditor] Initializing PDF XBlock Studio Editor');

        try {
            // Ensure we have a proper DOM element first
            const element = this._ensureElement();
            console.log('[StudioEditor] Got DOM element for initialization');

            // Find form and elements
            this.form = element.querySelector('#pdf-form');
            if (!this.form) {
                console.error('[StudioEditor] Form not found');
                console.error('[StudioEditor] Available form elements:',
                    Array.from(element.querySelectorAll('form')).map(f => f.id || f.className));
                return;
            }

            // Detect existing data and set appropriate tab
            this._detectExistingDataAndSetTab();

            // Set up tab switching
            this._setupTabSwitching();

            // Set up file upload
            this._setupFileUpload();

            // Set up form submission
            this._setupFormHandlers();

            console.log('[StudioEditor] Studio Editor initialized successfully');
        } catch (error) {
            console.error('[StudioEditor] Error during initialization:', error);
            throw error;
        }
    }

    /**
     * Detect existing PDF data and set the appropriate tab
     */
    _detectExistingDataAndSetTab() {
        try {
            const element = this._ensureElement();
            const urlInput = element.querySelector('#pdf-url');
            const fileNameInput = element.querySelector('#pdf-file-name') || element.querySelector('input[name="pdf_file_name"]');
            const assetKeyInput = element.querySelector('#pdf-file-asset-key') || element.querySelector('input[name="pdf_file_asset_key"]');
            const fileInfo = element.querySelector('#file-info');

            const existingUrl = urlInput ? urlInput.value.trim() : '';
            const existingFileName = fileNameInput ? fileNameInput.value.trim() : '';
            const existingAssetKey = assetKeyInput ? assetKeyInput.value.trim() : '';

            // Check if file info already shows a filename (from server)
            const fileInfoText = fileInfo ? fileInfo.textContent.trim() : '';
            const hasExistingFileInfo = fileInfoText && !fileInfoText.includes('No file chosen') && !fileInfoText.includes('placeholder');

            console.log('[StudioEditor] Detecting existing data...');
            console.log('[StudioEditor] Existing PDF URL:', existingUrl);
            console.log('[StudioEditor] Existing file name:', existingFileName);
            console.log('[StudioEditor] Existing asset key:', existingAssetKey);
            console.log('[StudioEditor] File info text:', fileInfoText);
            console.log('[StudioEditor] Has existing file info:', hasExistingFileInfo);

            // Priority order (matching Python get_pdf_url method):
            // 1. Asset key (contentstore files)
            // 2. File path (Django storage files)
            // 3. URL (external URLs or data URLs)

            if (existingAssetKey) {
                // We have a contentstore asset
                console.log('[StudioEditor] Found existing contentstore asset, switching to upload tab');
                this.currentTab = 'upload';
                this.switchTab('upload');

                // Show uploaded file state for contentstore asset
                const displayFileName = existingFileName || 'Uploaded PDF';
                this.showUploadedFileState(displayFileName, 'open_edx_contentstore', existingAssetKey);

            } else if (existingFileName || hasExistingFileInfo) {
                // We have an uploaded file (Django storage or data URL)
                console.log('[StudioEditor] Found existing uploaded file, switching to upload tab');
                this.currentTab = 'upload';
                this.switchTab('upload');

                // Determine storage method based on URL content
                let storageMethod = 'server_stored';
                if (existingUrl.startsWith('data:application/pdf')) {
                    storageMethod = 'data_url_fallback';
                } else if (existingUrl) {
                    // If there's both a file name and a URL, it might be Django storage
                    storageMethod = 'django_file_storage';
                }

                // Show uploaded file state
                const displayFileName = existingFileName || fileInfoText || 'Uploaded PDF';
                this.showUploadedFileState(displayFileName, storageMethod);

            } else if (existingUrl) {
                // We have an external URL (not a data URL)
                console.log('[StudioEditor] Found existing PDF URL, switching to URL tab');
                this.currentTab = 'url';
                this.switchTab('url');

            } else {
                // No existing data, default to upload tab
                console.log('[StudioEditor] No existing PDF data, defaulting to upload tab');
                this.currentTab = 'upload';
                this.switchTab('upload');
            }
        } catch (error) {
            console.error('[StudioEditor] Error detecting existing data:', error);
            // Default to upload tab on error
            this.currentTab = 'upload';
            this.switchTab('upload');
        }
    }

    _setupTabSwitching() {
        try {
            const element = this._ensureElement();
            const tabButtons = element.querySelectorAll('[data-tab]');

            tabButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    const tabName = button.getAttribute('data-tab');
                    this.switchTab(tabName);
                });
            });
        } catch (error) {
            console.error('[StudioEditor] Error setting up tab switching:', error);
        }
    }

    switchTab(tabName) {
        console.log(`[StudioEditor] Switching to tab: ${tabName}`);

        try {
            const element = this._ensureElement();

            // Update button states
            const tabButtons = element.querySelectorAll('[data-tab]');
            tabButtons.forEach(button => {
                if (button.getAttribute('data-tab') === tabName) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }
            });

            // Show/hide tab content
            const uploadTab = element.querySelector('#upload-tab');
            const urlTab = element.querySelector('#url-tab');

            if (uploadTab && urlTab) {
                if (tabName === 'upload') {
                    uploadTab.style.display = 'block';
                    urlTab.style.display = 'none';
                } else {
                    uploadTab.style.display = 'none';
                    urlTab.style.display = 'block';
                }
            } else {
                console.warn('[StudioEditor] Tab content elements not found');
                console.warn('[StudioEditor] uploadTab:', uploadTab);
                console.warn('[StudioEditor] urlTab:', urlTab);
            }

            this.currentTab = tabName;
            this.emit('tabChanged', { tab: tabName });
        } catch (error) {
            console.error('[StudioEditor] Error switching tabs:', error);
        }
    }

    _setupFileUpload() {
        try {
            const element = this._ensureElement();
            const fileInput = element.querySelector('#pdf-file');
            const uploadTrigger = element.querySelector('#upload-trigger');
            const dropZone = element.querySelector('#drop-zone');

            if (!fileInput || !uploadTrigger || !dropZone) {
                console.warn('[StudioEditor] Upload elements not found');
                console.warn('[StudioEditor] fileInput:', fileInput);
                console.warn('[StudioEditor] uploadTrigger:', uploadTrigger);
                console.warn('[StudioEditor] dropZone:', dropZone);
                return;
            }

            // File input change
            fileInput.addEventListener('change', this.handleFileUpload);

            // Upload trigger button
            uploadTrigger.addEventListener('click', (e) => {
                e.preventDefault();
                fileInput.click();
            });

            // Drag and drop
            dropZone.addEventListener('dragover', this.handleDragOver);
            dropZone.addEventListener('dragleave', this.handleDragLeave);
            dropZone.addEventListener('drop', this.handleDrop);

            // Prevent default drag behaviors on document
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                document.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });
        } catch (error) {
            console.error('[StudioEditor] Error setting up file upload:', error);
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            // Reset to file selection state first (in case we're changing an uploaded file)
            this.resetToFileSelectionState();

            // Process the new file
            this.processFile(file);
        }
    }

    handleDragOver(event) {
        event.preventDefault();
        const element = this._ensureElement();
        const dropZone = element.querySelector('#drop-zone');
        dropZone.classList.add('drag-over');
    }

    handleDragLeave(event) {
        event.preventDefault();
        const element = this._ensureElement();
        const dropZone = element.querySelector('#drop-zone');
        dropZone.classList.remove('drag-over');
    }

    handleDrop(event) {
        event.preventDefault();
        const element = this._ensureElement();
        const dropZone = element.querySelector('#drop-zone');
        dropZone.classList.remove('drag-over');

        const files = event.dataTransfer.files;
        if (files.length > 0) {
            // Reset to file selection state first (in case we're changing an uploaded file)
            this.resetToFileSelectionState();

            // Process the new file
            this.processFile(files[0]);
        }
    }

    processFile(file) {
        console.log('[StudioEditor] Processing file:', {
            name: file.name,
            size: file.size,
            type: file.type
        });

        // Validate file type
        if (file.type !== 'application/pdf') {
            this.showError('Please select a PDF file.');
            return;
        }

        // Validate file size (100MB limit)
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
            this.showError('File size must be less than 100MB.');
            return;
        }

        // Store the file for form submission
        this.uploadedFile = file;
        console.log('[StudioEditor] File stored for upload');

        // Update UI to show file info
        this.updateFileInfo(file);

        // Switch to upload tab and show file selected state
        this.switchTab('upload');
    }

    updateFileInfo(file) {
        console.log('[StudioEditor] updateFileInfo - Processing file:', file.name);

        try {
            // Use the centralized _ensureElement() method instead of manual conversion
            const element = this._ensureElement();
            console.log('[StudioEditor] updateFileInfo - Got DOM element successfully');

            // **CRITICAL FIX**: Update the hidden field with the new file name
            const hiddenFileNameField = element.querySelector('#pdf-file-name');
            if (hiddenFileNameField) {
                hiddenFileNameField.value = file.name;
                console.log('[StudioEditor] updateFileInfo - Updated hidden field with file name:', file.name);
            } else {
                console.warn('[StudioEditor] updateFileInfo - Hidden pdf-file-name field not found');
            }

            const fileInfo = element.querySelector('#file-info');
            if (fileInfo) {
                const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
                fileInfo.innerHTML = `
                    <span class="filename">${file.name}</span>
                    <span class="filesize">(${sizeInMB} MB)</span>
                    <span class="file-status pending">Ready to upload</span>
                `;
                console.log('[StudioEditor] updateFileInfo - File info updated successfully');
            } else {
                console.warn('[StudioEditor] updateFileInfo - #file-info element not found');
                console.warn('[StudioEditor] updateFileInfo - Available elements in container:',
                    Array.from(element.querySelectorAll('[id]')).map(el => el.id));
            }
        } catch (error) {
            console.error('[StudioEditor] updateFileInfo - Error updating file info:', error);
            console.error('[StudioEditor] updateFileInfo - Element details:', {
                elementType: typeof this.element,
                hasQuerySelector: typeof this.element.querySelector,
                isJQuery: !!this.element.jquery,
                elementConstructor: this.element.constructor?.name
            });
        }
    }

    /**
     * Show the uploaded file state after successful upload
     * @param {string} fileName - Name of the uploaded file
     * @param {string} storageMethod - How the file was stored (open_edx_contentstore, django_file_storage, data_url_fallback)
     * @param {string} storagePath - The path/URL where the file is stored
     */
    showUploadedFileState(fileName, storageMethod = 'unknown', storagePath = null) {
        console.log('[StudioEditor] showUploadedFileState - Showing uploaded file state for:', fileName);
        console.log('[StudioEditor] showUploadedFileState - Storage method:', storageMethod);
        console.log('[StudioEditor] showUploadedFileState - Storage path:', storagePath);

        try {
            const element = this._ensureElement();
            const fileInfo = element.querySelector('#file-info');
            const uploadedFileInfo = element.querySelector('#uploaded-file-info');
            const uploadTrigger = element.querySelector('#upload-trigger');
            const dropZone = element.querySelector('#drop-zone');

            if (fileInfo) {
                // Generate appropriate preview URL based on storage method
                let previewUrl = '';
                let storageDisplay = '';
                let canPreview = true;

                switch (storageMethod) {
                    case 'open_edx_contentstore':
                        // For contentstore assets, use the asset URL directly
                        previewUrl = storagePath || '';
                        storageDisplay = 'Open edX Course Assets';
                        canPreview = !!previewUrl;
                        console.log('[StudioEditor] showUploadedFileState - Using contentstore asset URL:', previewUrl);
                        break;

                    case 'django_file_storage':
                        // For Django file storage, use the serve_pdf_file handler
                        previewUrl = this.runtime.handlerUrl(this.element, 'serve_pdf_file');
                        storageDisplay = 'Django File Storage';
                        canPreview = true;
                        console.log('[StudioEditor] showUploadedFileState - Using Django storage handler URL:', previewUrl);
                        break;

                    case 'data_url_fallback':
                        // For data URLs, we can't really preview in a new tab effectively
                        previewUrl = '#';
                        storageDisplay = 'Embedded Data URL';
                        canPreview = false; // Data URLs are too large for new tab preview
                        console.log('[StudioEditor] showUploadedFileState - Using data URL storage (preview disabled)');
                        break;

                    case 'server_stored':
                        // This is for existing files detected on page load
                        previewUrl = this.runtime.handlerUrl(this.element, 'serve_pdf_file');
                        storageDisplay = 'Server Storage';
                        canPreview = true;
                        console.log('[StudioEditor] showUploadedFileState - Using server storage handler URL:', previewUrl);
                        break;

                    default:
                        // Fallback for unknown storage methods
                        previewUrl = this.runtime.handlerUrl(this.element, 'serve_pdf_file');
                        storageDisplay = 'Unknown Storage';
                        canPreview = true;
                        console.log('[StudioEditor] showUploadedFileState - Using fallback handler URL:', previewUrl);
                        break;
                }

                // Create the preview link HTML
                const previewLinkHtml = canPreview && previewUrl !== '#' ?
                    `<a href="${previewUrl}" target="_blank" style="color: #2e7d32; text-decoration: none;">
                        ${fileName}
                    </a>` :
                    `<span style="color: #2e7d32;">${fileName}</span>`;

                // Create the preview button HTML
                const previewButtonHtml = canPreview && previewUrl !== '#' ?
                    `<a href="${previewUrl}" target="_blank" class="button preview-btn" style="background-color: #4caf50; color: white; padding: 6px 12px; border-radius: 4px; text-decoration: none; font-size: 12px; margin-right: 8px;">
                        <i class="fas fa-eye"></i> Preview PDF
                    </a>` :
                    `<span class="button preview-btn disabled" style="background-color: #ccc; color: #666; padding: 6px 12px; border-radius: 4px; font-size: 12px; margin-right: 8px; cursor: not-allowed;">
                        <i class="fas fa-eye"></i> Preview Embedded
                    </span>`;

                // Update file info to show uploaded state
                fileInfo.innerHTML = `
                    <div class="uploaded-file-info">
                        <span class="filename">
                            <i class="fas fa-file-pdf" style="color: #d32f2f; margin-right: 5px;"></i>
                            ${previewLinkHtml}
                        </span>
                        <span class="file-status uploaded">
                            <i class="fas fa-check-circle" style="color: #4caf50; margin-right: 5px;"></i>
                            Uploaded successfully
                        </span>
                        <span class="storage-info" style="color: #666; font-size: 12px;">Storage: ${storageDisplay}</span>
                        <div class="file-actions" style="margin-top: 10px;">
                            ${previewButtonHtml}
                            <button type="button" class="button change-file-btn" onclick="this.parentNode.parentNode.parentNode.querySelector('#pdf-file').click();">
                                <i class="fas fa-exchange-alt"></i> Change File
                            </button>
                        </div>
                    </div>
                `;
                console.log('[StudioEditor] showUploadedFileState - File info updated to uploaded state');
                console.log('[StudioEditor] showUploadedFileState - Can preview:', canPreview);
                console.log('[StudioEditor] showUploadedFileState - Preview URL:', previewUrl);
            }

            // Update the uploaded-file-info element with detailed information
            if (uploadedFileInfo) {
                let uploadedFileContent = '';

                if (storageMethod === 'open_edx_contentstore' && storagePath) {
                    uploadedFileContent = `
                        <div class="uploaded-file-details">
                            <i class="fas fa-check-circle" style="color: #28a745;"></i>
                            <span class="upload-status">File uploaded successfully</span>
                            <div class="asset-url">
                                <small>Asset URL: <code>${storagePath}</code></small>
                            </div>
                        </div>
                    `;
                } else if (fileName) {
                    uploadedFileContent = `
                        <div class="uploaded-file-details">
                            <i class="fas fa-info-circle" style="color: #17a2b8;"></i>
                            <span class="upload-status">File configured: ${fileName}</span>
                            <div class="storage-method">
                                <small>Storage: ${storageDisplay}</small>
                            </div>
                        </div>
                    `;
                }

                uploadedFileInfo.innerHTML = uploadedFileContent;
                console.log('[StudioEditor] showUploadedFileState - Updated uploaded-file-info element');
            }

            // Update upload trigger button
            if (uploadTrigger) {
                uploadTrigger.innerHTML = '<i class="fas fa-exchange-alt"></i> Change PDF File';
                uploadTrigger.classList.add('change-file');
                console.log('[StudioEditor] showUploadedFileState - Upload trigger updated to change mode');
            }

            // Update drop zone styling
            if (dropZone) {
                dropZone.classList.add('file-uploaded');
                console.log('[StudioEditor] showUploadedFileState - Drop zone marked as uploaded');
            }

            console.log('[StudioEditor] showUploadedFileState - UI state updated successfully');

        } catch (error) {
            console.error('[StudioEditor] showUploadedFileState - Error updating uploaded state:', error);
        }
    }

    /**
     * Reset to file selection state (when changing files)
     */
    resetToFileSelectionState() {
        console.log('[StudioEditor] resetToFileSelectionState - Resetting to file selection state');

        try {
            const element = this._ensureElement();
            const fileInfo = element.querySelector('#file-info');
            const uploadedFileInfo = element.querySelector('#uploaded-file-info');
            const uploadTrigger = element.querySelector('#upload-trigger');
            const dropZone = element.querySelector('#drop-zone');

            // Reset file info
            if (fileInfo) {
                fileInfo.innerHTML = '<span class="placeholder">No file chosen</span>';
            }

            // Reset uploaded file info
            if (uploadedFileInfo) {
                uploadedFileInfo.innerHTML = '';
            }

            // Reset upload trigger
            if (uploadTrigger) {
                uploadTrigger.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Choose PDF File';
                uploadTrigger.classList.remove('change-file');
            }

            // Reset drop zone
            if (dropZone) {
                dropZone.classList.remove('file-uploaded');
            }

            // Clear uploaded file
            this.uploadedFile = null;

            console.log('[StudioEditor] resetToFileSelectionState - Reset completed');

        } catch (error) {
            console.error('[StudioEditor] resetToFileSelectionState - Error resetting state:', error);
        }
    }

    _setupFormHandlers() {
        const element = this._ensureElement();
        const submitButton = element.querySelector('#pdf-submit-options');
        const cancelButton = element.querySelector('.cancel-button');

        if (submitButton) {
            submitButton.addEventListener('click', this.handleFormSubmit);
        }

        if (cancelButton) {
            cancelButton.addEventListener('click', this.handleCancel);
        }

        // Form submission
        this.form.addEventListener('submit', this.handleFormSubmit);
    }

    async handleFormSubmit(event) {
        event.preventDefault();
        console.log('[StudioEditor] Form submission started');

        try {
            this.setLoadingState(true);

            // Collect form data first
            const formData = this.collectFormData();
            console.log('[StudioEditor] Collected form data:', formData);

            // Validate form data
            const validation = this.validateFormData(formData);
            if (!validation.isValid) {
                console.error('[StudioEditor] Form validation failed:', validation.errors);
                this.showError(`Validation failed: ${validation.errors.join(', ')}`);
                return;
            }

            // Create FormData for file upload
            const submitData = new FormData();

            // Add all form fields
            submitData.append('display_name', formData.display_name);
            submitData.append('pdf_file_name', formData.pdf_file_name);
            submitData.append('allow_download', formData.allow_download);
            submitData.append('allow_annotation', formData.allow_annotation);

            // Add URL if provided (URL tab)
            if (formData.pdf_url) {
                submitData.append('pdf_url', formData.pdf_url);
            }

            // **CRITICAL: Add file if uploaded (File tab)**
            const fileInput = this.container.querySelector('#pdf-file');
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                console.log('[StudioEditor] Adding file to FormData:', {
                    name: file.name,
                    size: file.size,
                    type: file.type
                });
                submitData.append('pdf_file', file);
            } else {
                console.log('[StudioEditor] No file found in file input');

                // Check if we have stored file data from drag & drop
                if (this.uploadedFile) {
                    console.log('[StudioEditor] Adding stored file to FormData:', {
                        name: this.uploadedFile.name,
                        size: this.uploadedFile.size,
                        type: this.uploadedFile.type
                    });
                    submitData.append('pdf_file', this.uploadedFile);
                }
            }

            // Log FormData contents for debugging
            console.log('[StudioEditor] FormData contents:');
            for (let [key, value] of submitData.entries()) {
                if (value instanceof File) {
                    console.log(`  ${key}: [File] name="${value.name}", size=${value.size}, type="${value.type}"`);
                } else {
                    console.log(`  ${key}: ${value}`);
                }
            }

            // Submit the data
            const result = await this.submitData(submitData);
            console.log('[StudioEditor] Submit result:', result);

            if (result.result === 'success') {
                this.showSuccess('Settings saved successfully!');

                if (result.file_uploaded) {
                    console.log('[StudioEditor] File upload successful:', {
                        fileName: result.file_name,
                        storageMethod: result.storage_method,
                        storagePath: result.storage_path
                    });

                    // Update UI to show uploaded file state
                    this.showUploadedFileState(
                        result.file_name,
                        result.storage_method || 'unknown',
                        result.storage_path
                    );
                }

                // Auto-close after success (optional)
                setTimeout(() => {
                    this.closeEditor();
                }, 1500);
            } else {
                console.error('[StudioEditor] Submit failed:', result.message);
                this.showError(result.message || 'Failed to save settings');
            }

        } catch (error) {
            console.error('[StudioEditor] Form submission error:', error);
            this.showError(`Error: ${error.message}`);
        } finally {
            this.setLoadingState(false);
        }
    }

    collectFormData() {
        const element = this._ensureElement();
        const data = {};

        // Basic form fields - use correct IDs from HTML template
        data.display_name = element.querySelector('#pdf-display-name')?.value?.trim() || '';
        data.pdf_file_name = element.querySelector('#pdf-file-name')?.value?.trim() || '';

        // Handle boolean fields - they are select elements in the HTML
        const downloadSelect = element.querySelector('#pdf-allow-download');
        const annotationSelect = element.querySelector('#pdf-allow-annotation');

        data.allow_download = downloadSelect?.value === 'true';
        data.allow_annotation = annotationSelect?.value === 'true';

        // Provide default display name if empty
        if (!data.display_name) {
            data.display_name = 'PDF Viewer';
            console.log('[StudioEditor] Using default display name: PDF Viewer');
        }

        // Handle PDF source based on current tab
        if (this.currentTab === 'url') {
            data.pdf_url = element.querySelector('#pdf-url')?.value?.trim() || '';
        } else {
            data.pdf_url = ''; // Clear URL when using file upload
        }

        console.log('[StudioEditor] Collected form data:', {
            display_name: data.display_name,
            pdf_file_name: data.pdf_file_name,
            allow_download: data.allow_download,
            allow_annotation: data.allow_annotation,
            pdf_url: data.pdf_url,
            currentTab: this.currentTab,
            hasUploadedFile: !!this.uploadedFile,
            hasFileInput: !!(element.querySelector('#pdf-file')?.files?.length)
        });

        return data;
    }

    validateFormData(data) {
        const errors = [];

        // Display name is now automatically set to default if empty, so no need to validate
        console.log('[StudioEditor] Validating form data:', data);

        // Check if we have either a URL or a file
        const hasUrl = data.pdf_url && data.pdf_url.trim().length > 0;

        // Check for files in multiple ways:
        // 1. Newly uploaded file (this.uploadedFile)
        // 2. File in file input element
        // 3. Existing uploaded file (pdf_file_name field has value)
        // 4. Existing asset key (check hidden field)
        const element = this._ensureElement();
        const existingAssetKey = element.querySelector('#pdf-file-asset-key')?.value?.trim() || '';
        const existingFilePath = element.querySelector('#pdf-file-path')?.value?.trim() || '';

        const hasFile = this.uploadedFile ||
                       (this.container.querySelector('#pdf-file')?.files?.length > 0) ||
                       (data.pdf_file_name && data.pdf_file_name.trim().length > 0) ||
                       (existingAssetKey.length > 0) ||
                       (existingFilePath.length > 0);

        console.log('[StudioEditor] File validation details:', {
            hasUploadedFile: !!this.uploadedFile,
            hasFileInput: !!(this.container.querySelector('#pdf-file')?.files?.length),
            hasPdfFileName: !!(data.pdf_file_name && data.pdf_file_name.trim().length > 0),
            hasAssetKey: !!(existingAssetKey.length > 0),
            hasFilePath: !!(existingFilePath.length > 0),
            pdfFileName: data.pdf_file_name,
            assetKey: existingAssetKey,
            filePath: existingFilePath
        });

        if (!hasUrl && !hasFile) {
            errors.push('Please provide either a PDF URL or upload a PDF file');
        }

        // Validate URL format if provided
        if (hasUrl) {
            try {
                // Allow data URLs for base64 encoded files
                if (data.pdf_url.startsWith('data:application/pdf')) {
                    // Valid data URL
                    console.log('[StudioEditor] Valid data URL detected');
                } else {
                    new URL(data.pdf_url);
                    console.log('[StudioEditor] Valid external URL detected');
                }
            } catch (e) {
                errors.push('PDF URL is not a valid URL');
            }
        }

        console.log('[StudioEditor] Validation result:', {
            hasUrl,
            hasFile,
            errors,
            isValid: errors.length === 0
        });

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    async submitData(data) {
        try {
            console.log('[StudioEditor] Submitting data to backend...');

            // Get CSRF token
            const csrfToken = this.getCSRFToken();
            console.log('[StudioEditor] CSRF token found:', !!csrfToken);

            // Prepare fetch options
            const fetchOptions = {
                method: 'POST',
                headers: {}
            };

            // Handle different data types
            if (data instanceof FormData) {
                // For FormData (file uploads), don't set Content-Type header
                // Let the browser set it with boundary
                fetchOptions.body = data;
                console.log('[StudioEditor] Using FormData for file upload');

                // Add CSRF token to FormData
                if (csrfToken) {
                    data.append('csrfmiddlewaretoken', csrfToken);
                }
            } else {
                // For regular JSON data
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = JSON.stringify(data);
                console.log('[StudioEditor] Using JSON data');

                // Add CSRF token to headers
                if (csrfToken) {
                    fetchOptions.headers['X-CSRFToken'] = csrfToken;
                }
            }

            console.log('[StudioEditor] Fetch options:', {
                method: fetchOptions.method,
                headers: fetchOptions.headers,
                bodyType: data instanceof FormData ? 'FormData' : 'JSON'
            });

            // Make the request
            const response = await fetch(this.runtime.handlerUrl(this.element, 'studio_submit'), fetchOptions);

            console.log('[StudioEditor] Response status:', response.status);
            console.log('[StudioEditor] Response headers:', Object.fromEntries(response.headers.entries()));

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[StudioEditor] HTTP error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('[StudioEditor] Parsed response:', result);

            return result;

        } catch (error) {
            console.error('[StudioEditor] Submit error:', error);
            throw error;
        }
    }

    getCSRFToken() {
        // Get CSRF token from cookie or meta tag
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
                         document.querySelector('meta[name=csrf-token]')?.content ||
                         this.getCookie('csrftoken');
        return csrfToken;
    }

    getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    handleCancel(event) {
        event.preventDefault();
        console.log('[StudioEditor] Cancel clicked');
        this.closeEditor();
    }

    closeEditor() {
        // Notify the Studio runtime that the user wants to cancel
        console.log('[StudioEditor] Notifying runtime of cancel event');
        this.runtime.notify('cancel');

        // Emit local event for any listeners
        this.emit('cancel');
    }

    setLoadingState(loading) {
        const element = this._ensureElement();
        const submitButton = element.querySelector('#pdf-submit-options');
        const cancelButton = element.querySelector('.cancel-button');

        if (submitButton) {
            submitButton.disabled = loading;
            submitButton.textContent = loading ? 'Saving...' : 'Save';
        }

        if (cancelButton) {
            cancelButton.disabled = loading;
        }
    }

    showError(message) {
        console.error('[StudioEditor] Error:', message);
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        console.log('[StudioEditor] Success:', message);
        this.showMessage(message, 'success');
    }

    showMessage(message, type = 'info') {
        const element = this._ensureElement();

        // Remove existing messages
        const existingMessages = element.querySelectorAll('.studio-message');
        existingMessages.forEach(msg => msg.remove());

        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = `studio-message studio-message-${type}`;
        messageEl.innerHTML = `
            <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        // Insert at top of form
        this.form.insertBefore(messageEl, this.form.firstChild);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.remove();
            }
        }, 5000);
    }

    /**
     * Utility method to ensure we always get a proper DOM element from this.element
     * @returns {Element} Native DOM element
     */
    _ensureElement() {
        console.log('[StudioEditor] _ensureElement - Starting element conversion');
        console.log('[StudioEditor] _ensureElement - Element type:', typeof this.element);
        console.log('[StudioEditor] _ensureElement - Element constructor:', this.element?.constructor?.name);
        console.log('[StudioEditor] _ensureElement - Has querySelector:', typeof this.element?.querySelector);
        console.log('[StudioEditor] _ensureElement - Is jQuery:', !!this.element?.jquery);

        let element = this.element;

        // If this.element is still a jQuery object, convert it
        if (!element.querySelector && element.jquery) {
            console.log('[StudioEditor] _ensureElement - Converting jQuery object to DOM element');
            console.log('[StudioEditor] _ensureElement - jQuery object length:', element.length);
            console.log('[StudioEditor] _ensureElement - jQuery object has get method:', typeof element.get === 'function');

            // Try element[0] first (most common way)
            let domElement = element[0];
            console.log('[StudioEditor] _ensureElement - Trying element[0]:', domElement);

            // If that doesn't work, try element.get(0)
            if (!domElement || domElement.nodeType !== Node.ELEMENT_NODE) {
                domElement = element.get(0);
                console.log('[StudioEditor] _ensureElement - Trying element.get(0):', domElement);
            }

            if (domElement && domElement.nodeType === Node.ELEMENT_NODE) {
                element = domElement;
                console.log('[StudioEditor] _ensureElement - Successfully converted jQuery to DOM element');
            } else {
                console.error('[StudioEditor] _ensureElement - Failed to convert jQuery object to DOM element');
                console.error('[StudioEditor] _ensureElement - domElement:', domElement);
                console.error('[StudioEditor] _ensureElement - domElement nodeType:', domElement?.nodeType);
            }
        }

        // If we still don't have querySelector, try the _ensureDOMElement method again
        if (!element.querySelector) {
            console.log('[StudioEditor] _ensureElement - Element still lacks querySelector, trying _ensureDOMElement');
            try {
                element = this._ensureDOMElement(this.element);
                console.log('[StudioEditor] _ensureElement - _ensureDOMElement successful');
            } catch (error) {
                console.error('[StudioEditor] _ensureElement - _ensureDOMElement failed:', error);
                throw error;
            }
        }

        // Final validation
        if (!element || typeof element.querySelector !== 'function') {
            console.error('[StudioEditor] _ensureElement - Final element is invalid');
            console.error('[StudioEditor] _ensureElement - Final element:', element);
            console.error('[StudioEditor] _ensureElement - Final element type:', typeof element);
            throw new Error('Could not convert element to a valid DOM element with querySelector method');
        }

        console.log('[StudioEditor] _ensureElement - Successfully got DOM element');
        return element;
    }
}

// Global function for XBlock framework compatibility
window.PdfxXBlockEdit = function(runtime, element) {
    return new StudioEditor(runtime, element);
};

export default StudioEditor;