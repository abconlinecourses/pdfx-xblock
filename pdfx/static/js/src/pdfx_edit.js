/* PDF Viewer XBlock - Studio Edit View */
function PdfxXBlockEdit(runtime, element) {
    'use strict';

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

    // Set upload as the default active tab
    $tabButtons.filter('[data-tab="upload"]').addClass('active');
    $element.find('#upload-tab').show();
    $element.find('#url-tab').hide();

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

    // Handle form submission
    $form.on('submit', function(e) {
        e.preventDefault();
        saveSettings();
    });

    // Handle save button click
    $element.find('#pdf-submit-options').on('click', function(e) {
        e.preventDefault();
        saveSettings();
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