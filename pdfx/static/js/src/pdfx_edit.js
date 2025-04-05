/* PDF Viewer XBlock - Studio Edit View */
function PdfxXBlockEdit(runtime, element) {
    var $element = $(element);

    // Find form elements
    var $form = $element.find('.editor-with-buttons');
    var $displayName = $element.find('#display_name');
    var $pdfUrl = $element.find('#pdf_url');
    var $allowDownload = $element.find('#allow_download');
    var $allowAnnotation = $element.find('#allow_annotation');

    // Handle form submission
    $form.on('submit', function(e) {
        e.preventDefault();
        saveSettings();
    });

    // Handle save button click
    $element.find('.save-button').on('click', function(e) {
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