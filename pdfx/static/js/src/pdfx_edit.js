/* PDF Viewer XBlock - Studio Edit View */
function PdfxXBlockEdit(runtime, element) {
    'use strict';

    // Create pdfjsLib stub early to prevent errors
    // We don't actually need PDF.js in the edit view
    if (typeof pdfjsLib === 'undefined') {
        window.pdfjsLib = {
            version: 'stub',
            GlobalWorkerOptions: {
                workerSrc: ''
            }
        };
    }

    var $element = $(element);

    // Find form elements
    var $form = $element.find('#pdf-form');
    var $displayName = $element.find('#pdf-display-name');
    var $pdfUrl = $element.find('#pdf-url');
    var $allowDownload = $element.find('#pdf-allow-download');
    var $allowAnnotation = $element.find('#pdf-allow-annotation');
    var $uploadTrigger = $element.find('#upload-trigger');
    var $fileInput = $element.find('#pdf-file');
    var $fileInfo = $element.find('#file-info');
    var $tabButtons = $element.find('[data-tab]');
    var $tabContents = $element.find('.tab-content');
    var $dropZone = $element.find('#drop-zone');
    var $editorWrapper = $element.find('.editor-with-buttons');
    var $xblockActions = $element.find('.xblock-actions');
    var $modalWindow = $(element).closest('.modal-window');
    var $modalContent = $modalWindow.find('.modal-content');

    // Adjust modal sizing
    function adjustModalSizing() {
        // Get the window dimensions
        var windowHeight = $(window).height();
        var windowWidth = $(window).width();

        // Calculate appropriate modal size
        var modalHeight = Math.min(windowHeight * 0.9, 800);
        var modalWidth = Math.min(windowWidth * 0.8, 1000);

        // Apply to modal
        if ($modalWindow.length) {
            $modalWindow.css({
                'max-height': modalHeight + 'px',
                'height': modalHeight + 'px',
                'max-width': modalWidth + 'px',
                'width': modalWidth + 'px'
            });

            $modalContent.css({
                'max-height': (modalHeight - 50) + 'px !important', // Account for header
                'overflow': 'auto'
            });
        }

        // Fix editor wrapper
        $editorWrapper.css({
            'max-height': 'none',
            'padding-bottom': '80px' // Space for fixed buttons
        });

        // Fix the xblock-actions container to stay within bounds
        $xblockActions.css({
            'position': 'fixed',
            'bottom': '0',
            'left': '0',
            'right': '0',
            'background-color': '#fff',
            'z-index': '10000',
            'margin': '0',
            'padding': '15px 20px',
            'box-shadow': '0 -2px 10px rgba(0,0,0,0.1)'
        });
    }

    // Enhance upload area visual feedback
    function enhanceUploadArea() {
        // Make the upload area more visually appealing
        var $fileUploadWrapper = $element.find('.file-upload-wrapper');

        // Add visual cues
        $fileUploadWrapper.append('<div class="upload-icon"><i class="fas fa-cloud-upload-alt"></i></div>');

        // Add Font Awesome if it doesn't exist
        if ($('link[href*="font-awesome"]').length === 0) {
            $('head').append('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">');
        }

        // Style the upload icon
        $('<style>', {
            text: `
                .upload-icon {
                    font-size: 48px;
                    color: #0075b4;
                    margin-bottom: 15px;
                }
                .filename {
                    word-break: break-all;
                }
            `
        }).appendTo('head');
    }

    // Initialize the form
    function initializeForm() {
        // Call adjustments
        adjustModalSizing();
        enhanceUploadArea();

        // Call on resize event
        $(window).on('resize', adjustModalSizing);

        // Set upload as the default active tab
        $tabButtons.filter('[data-tab="upload"]').addClass('active');
        $element.find('#upload-tab').show();
        $element.find('#url-tab').hide();
    }

    // Call initialization
    initializeForm();

    // Handle tab switching
    $tabButtons.on('click', function(e) {
        e.preventDefault();
        var targetTab = $(this).data('tab');

        // Update active states
        $tabButtons.removeClass('active');
        $(this).addClass('active');

        // Show/hide content
        $tabContents.hide();
        $element.find('#' + targetTab + '-tab').show();
    });

    // Handle file upload button click
    $uploadTrigger.on('click', function(e) {
        e.preventDefault();
        $fileInput.click();
    });

    // Prevent default behavior for drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function(eventName) {
        $dropZone.on(eventName, function(e) {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    // Add visual feedback for drag events
    ['dragenter', 'dragover'].forEach(function(eventName) {
        $dropZone.on(eventName, function() {
            $dropZone.addClass('highlight');
        });
    });

    ['dragleave', 'drop'].forEach(function(eventName) {
        $dropZone.on(eventName, function() {
            $dropZone.removeClass('highlight');
        });
    });

    // Handle file drop
    $dropZone.on('drop', function(e) {
        var files = e.originalEvent.dataTransfer.files;
        if (files.length) {
            $fileInput[0].files = files;
            $fileInput.trigger('change');
        }
    });

    // Handle file selection
    $fileInput.on('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;

        // Verify file type
        if (file.type !== 'application/pdf') {
            runtime.notify('error', {msg: 'Only PDF files are allowed'});
            return;
        }

        // Show loading state
        $uploadTrigger.addClass('loading');
        $fileInfo.find('.placeholder, .filename').hide();
        $fileInfo.append('<span class="upload-status">Uploading...</span>');

        // Create form data
        var formData = new FormData();
        formData.append('file', file);

        // Get the upload URL
        var uploadUrl = runtime.handlerUrl(element, 'upload_pdf');

        // Upload the file
        $.ajax({
            url: uploadUrl,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                if (response.result === 'success') {
                    // Update UI
                    $fileInfo.find('.upload-status').remove();
                    $fileInfo.find('.placeholder').hide();

                    if ($fileInfo.find('.filename').length) {
                        $fileInfo.find('.filename').text(response.filename).show();
                    } else {
                        $fileInfo.append('<span class="filename">' + response.filename + '</span>');
                    }

                    // Show success message
                    runtime.notify('success', {
                        title: 'Upload successful',
                        message: 'PDF file uploaded successfully.'
                    });

                    $pdfUrl.val('');  // Clear URL field
                } else {
                    runtime.notify('error', {msg: response.message || 'Upload failed'});
                }
            },
            error: function() {
                runtime.notify('error', {msg: 'Failed to upload file'});
            },
            complete: function() {
                $uploadTrigger.removeClass('loading');
                $fileInfo.find('.upload-status').remove();
            }
        });
    });

    // Validate form before submission
    function validateForm() {
        var valid = true;
        var errorMessage = '';

        // Check if at least one source is provided
        var hasPdfFile = $fileInfo.find('.filename').length > 0 && $fileInfo.find('.filename').is(':visible');
        var hasPdfUrl = $pdfUrl.val().trim() !== '';

        if (!hasPdfFile && !hasPdfUrl) {
            errorMessage = 'Please upload a PDF file or enter a PDF URL.';
            valid = false;
        }

        if (!valid) {
            runtime.notify('error', {msg: errorMessage});
        }

        return valid;
    }

    // Handle form submission
    $form.on('submit', function(e) {
        e.preventDefault();

        if (validateForm()) {
            saveSettings();
        }
    });

    // Handle save button click
    $element.find('#pdf-submit-options').on('click', function(e) {
        e.preventDefault();

        if (validateForm()) {
            saveSettings();
        }
    });

    // Handle cancel button click
    $element.find('.cancel-button').on('click', function(e) {
        e.preventDefault();
        runtime.notify('cancel', {});
    });

    // Save settings to server
    function saveSettings() {
        var data = {
            display_name: $displayName.val(),
            pdf_url: $pdfUrl.val(),
            allow_download: $allowDownload.val() === 'true',
            allow_annotation: $allowAnnotation.val() === 'true'
        };

        var handlerUrl = runtime.handlerUrl(element, 'studio_submit');

        runtime.notify('save', {state: 'start'});

        $.post(handlerUrl, JSON.stringify(data)).done(function(response) {
            if (response.result === 'success') {
                runtime.notify('save', {state: 'end'});
            } else {
                runtime.notify('error', {msg: response.message || 'Error saving settings'});
            }
        }).fail(function() {
            runtime.notify('error', {msg: 'Error saving settings'});
        });
    }
}