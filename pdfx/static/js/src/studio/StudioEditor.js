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
        // If it's already a native DOM element
        if (element && element.nodeType === Node.ELEMENT_NODE) {
            return element;
        }

        // If it's a jQuery object (check multiple ways)
        if (element && (
            element.jquery ||                    // jQuery object has .jquery property
            (typeof element.get === 'function' && element.length !== undefined) || // jQuery-like object
            (element.constructor && element.constructor.fn && element.constructor.fn.jquery) // jQuery constructor check
        )) {
            console.log('jQuery object detected:', {
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
            } else {
                console.log('Using element[0] successfully');
            }

            if (domElement && domElement.nodeType === Node.ELEMENT_NODE) {
                return domElement;
            }
        }

        // If it's a string selector, try to find the element
        if (typeof element === 'string') {
            const foundElement = document.querySelector(element);
            if (foundElement) {
                return foundElement;
            }
        }

        // Last resort: throw an error with helpful information
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
        try {
            // Ensure we have a proper DOM element first
            const element = this._ensureElement();

            // Find form and elements
            this.form = element.querySelector('#pdf-form');
            if (!this.form) {
                console.warn('PDF form not found. Available forms:',
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

        } catch (error) {
            console.error('Error initializing StudioEditor:', error);
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

            // Priority order (matching Python get_pdf_url method):
            // 1. Asset key (contentstore files)
            // 2. File path (Django storage files)
            // 3. URL (external URLs or data URLs)

            if (existingAssetKey) {
                // We have a contentstore asset
                this.currentTab = 'upload';
                this.switchTab('upload');

                // Show uploaded file state for contentstore asset
                const displayFileName = existingFileName || 'Uploaded PDF';
                this.showUploadedFileState(displayFileName, 'open_edx_contentstore', existingAssetKey);

            } else if (existingFileName || hasExistingFileInfo) {
                // We have an uploaded file (Django storage or data URL)
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
                this.currentTab = 'url';
                this.switchTab('url');

            } else {
                // No existing data, default to upload tab
                this.currentTab = 'upload';
                this.switchTab('upload');
            }
        } catch (error) {
            console.error('Error detecting existing data:', error);
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
            console.error('Error setting up tab switching:', error);
        }
    }

    switchTab(tabName) {
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
                console.warn('Tab content elements not found');
            }

            this.currentTab = tabName;
            this.emit('tabChanged', { tab: tabName });
        } catch (error) {
            console.error('Error switching tabs:', error);
        }
    }

    _setupFileUpload() {
        try {
            const element = this._ensureElement();
            const fileInput = element.querySelector('#pdf-file');
            const uploadTrigger = element.querySelector('#upload-trigger');
            const dropZone = element.querySelector('#drop-zone');

            if (!fileInput || !uploadTrigger || !dropZone) {
                console.warn('File upload elements not found');
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
            console.error('Error setting up file upload:', error);
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
        event.dataTransfer.dropEffect = 'copy';
        event.currentTarget.classList.add('drag-over');
    }

    handleDragLeave(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
    }

    handleDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');

        const files = event.dataTransfer.files;
        if (files.length > 0) {
            // Reset to file selection state first
            this.resetToFileSelectionState();

            // Process the first file
            this.processFile(files[0]);
        }
    }

    processFile(file) {
        console.log('Processing file:', {
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

        // Update UI to show file info
        this.updateFileInfo(file);

        // Switch to upload tab and show file selected state
        this.switchTab('upload');
    }

    updateFileInfo(file) {
        try {
            // Use the centralized _ensureElement() method instead of manual conversion
            const element = this._ensureElement();

            // **CRITICAL FIX**: Update the hidden field with the new file name
            const hiddenFileNameField = element.querySelector('#pdf-file-name');
            if (hiddenFileNameField) {
                hiddenFileNameField.value = file.name;
            } else {
                console.warn('Hidden file name field not found');
            }

            const fileInfo = element.querySelector('#file-info');
            if (fileInfo) {
                const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
                fileInfo.innerHTML = `
                    <span class="filename">${file.name}</span>
                    <span class="filesize">(${sizeInMB} MB)</span>
                    <span class="file-status pending">Ready to upload</span>
                `;
            } else {
                console.warn('File info element not found. Available elements:',
                    Array.from(element.querySelectorAll('[id]')).map(el => el.id));
            }
        } catch (error) {
            console.error('Error updating file info:', error, {
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
                        break;

                    case 'django_file_storage':
                        // For Django file storage, use the serve_pdf_file handler
                        previewUrl = this.runtime.handlerUrl(this.element, 'serve_pdf_file');
                        storageDisplay = 'Django File Storage';
                        canPreview = true;
                        break;

                    case 'data_url_fallback':
                        // For data URLs, we can't really preview in a new tab effectively
                        previewUrl = '#';
                        storageDisplay = 'Embedded Data URL';
                        canPreview = false; // Data URLs are too large for new tab preview
                        break;

                    case 'server_stored':
                        // This is for existing files detected on page load
                        previewUrl = this.runtime.handlerUrl(this.element, 'serve_pdf_file');
                        storageDisplay = 'Server Storage';
                        canPreview = true;
                        break;

                    default:
                        // Fallback for unknown storage methods
                        previewUrl = this.runtime.handlerUrl(this.element, 'serve_pdf_file');
                        storageDisplay = 'Unknown Storage';
                        canPreview = true;
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
            }

            // Update upload trigger button
            if (uploadTrigger) {
                uploadTrigger.innerHTML = '<i class="fas fa-exchange-alt"></i> Change PDF File';
                uploadTrigger.classList.add('change-file');
            }

            // Update drop zone styling
            if (dropZone) {
                dropZone.classList.add('file-uploaded');
            }

        } catch (error) {
            console.error('Error showing uploaded file state:', error);
        }
    }

    /**
     * Reset to file selection state (when changing files)
     */
    resetToFileSelectionState() {
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

        } catch (error) {
            console.error('Error resetting to file selection state:', error);
        }
    }

    _setupFormHandlers() {
        try {
            const element = this._ensureElement();

            // Form submission
            if (this.form) {
                this.form.addEventListener('submit', this.handleFormSubmit);
            }

            // Cancel button
            const cancelButton = element.querySelector('.cancel-button');
            if (cancelButton) {
                cancelButton.addEventListener('click', this.handleCancel);
            }

        } catch (error) {
            console.error('Error setting up form handlers:', error);
        }
    }

    async handleFormSubmit(event) {
        event.preventDefault();

        try {
            this.setLoadingState(true);

            // Collect form data
            const formData = this.collectFormData();

            // Validate form data
            const validation = this.validateFormData(formData);
            if (!validation.isValid) {
                this.showError(validation.errors.join(', '));
                return;
            }

            // Create FormData for submission (handles both regular data and file uploads)
            const submitData = new FormData();

            // Add regular form fields
            Object.keys(formData).forEach(key => {
                if (formData[key] !== null && formData[key] !== undefined) {
                    submitData.append(key, formData[key]);
                }
            });

            // **CRITICAL: Add file if uploaded (File tab)**
            const fileInput = this.container.querySelector('#pdf-file');
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                console.log('Adding file from input:', {
                    name: file.name,
                    size: file.size,
                    type: file.type
                });
                submitData.append('pdf_file', file);
            } else {
                // Check if we have stored file data from drag & drop
                if (this.uploadedFile) {
                    console.log('Adding uploaded file:', {
                        name: this.uploadedFile.name,
                        size: this.uploadedFile.size,
                        type: this.uploadedFile.type
                    });
                    submitData.append('pdf_file', this.uploadedFile);
                }
            }

            // Log FormData contents for debugging
            for (let [key, value] of submitData.entries()) {
                if (value instanceof File) {
                    console.log(`FormData[${key}]: File(${value.name}, ${value.size} bytes)`);
                } else {
                    console.log(`FormData[${key}]: ${value}`);
                }
            }

            // Submit the data
            const result = await this.submitData(submitData);

            if (result.result === 'success') {
                this.showSuccess('Settings saved successfully!');

                if (result.file_uploaded) {
                    console.log('File uploaded successfully:', {
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
                this.showError(result.message || 'Failed to save settings');
            }

        } catch (error) {
            console.error('Form submission error:', error);
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
        }

        // Handle PDF source based on current tab
        if (this.currentTab === 'url') {
            data.pdf_url = element.querySelector('#pdf-url')?.value?.trim() || '';
        } else {
            data.pdf_url = ''; // Clear URL when using file upload
        }

        console.log('Collected form data:', {
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

        console.log('File validation check:', {
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
                } else {
                    new URL(data.pdf_url);
                }
            } catch (e) {
                errors.push('PDF URL is not a valid URL');
            }
        }

        console.log('Validation result:', {
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
            // Get CSRF token
            const csrfToken = this.getCSRFToken();

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

                // Add CSRF token to FormData
                if (csrfToken) {
                    data.append('csrfmiddlewaretoken', csrfToken);
                }
            } else {
                // For regular JSON data
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = JSON.stringify(data);

                // Add CSRF token to headers
                if (csrfToken) {
                    fetchOptions.headers['X-CSRFToken'] = csrfToken;
                }
            }

            console.log('Submitting data:', {
                method: fetchOptions.method,
                headers: fetchOptions.headers,
                bodyType: data instanceof FormData ? 'FormData' : 'JSON'
            });

            // Make the request
            const response = await fetch(this.runtime.handlerUrl(this.element, 'studio_submit'), fetchOptions);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('HTTP Error:', response.status, response.statusText, errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Submit result:', result);

            return result;

        } catch (error) {
            console.error('Submit error:', error);
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
        this.closeEditor();
    }

    closeEditor() {
        // Notify the Studio runtime that the user wants to cancel
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
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
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
        let element = this.element;

        // If this.element is still a jQuery object, convert it
        if (!element.querySelector && element.jquery) {
            console.log('Converting jQuery element to DOM element');

            // Try element[0] first (most common way)
            let domElement = element[0];

            // If that doesn't work, try element.get(0)
            if (!domElement || domElement.nodeType !== Node.ELEMENT_NODE) {
                domElement = element.get(0);
            }

            if (domElement && domElement.nodeType === Node.ELEMENT_NODE) {
                element = domElement;
            } else {
                console.error('Failed to convert jQuery element to DOM element');
            }
        }

        // If we still don't have querySelector, try the _ensureDOMElement method again
        if (!element.querySelector) {
            try {
                element = this._ensureDOMElement(this.element);
            } catch (error) {
                console.error('Failed to ensure DOM element:', error);
                throw error;
            }
        }

        // Final validation
        if (!element || typeof element.querySelector !== 'function') {
            throw new Error('Could not convert element to a valid DOM element with querySelector method');
        }

        return element;
    }
}

// Global function for XBlock framework compatibility
window.PdfxXBlockEdit = function(runtime, element) {
    return new StudioEditor(runtime, element);
};

export default StudioEditor;