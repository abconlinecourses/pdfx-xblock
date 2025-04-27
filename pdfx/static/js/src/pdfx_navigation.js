/* PDF Viewer XBlock - Navigation and Display Functions */

/**
 * PDF navigation and view controls
 */
function PdfxNavigation(element, options) {
    'use strict';

    // Private variables
    var _options = options || {};
    var _currentPage = 1;
    var _pageCount = 1;
    var _currentZoom = 1.0;
    var _pdfDoc = null;
    var _isFullscreen = false;

    // Brightness and display variables
    var _currentBrightness = 100;
    var _minBrightness = 50;
    var _maxBrightness = 150;
    var _brightnessStep = 10;
    var _isGrayscale = false;
    var _isInkMode = false;

    // Callback functions
    var _debugCallback = _options.debugCallback || function() {};
    var _renderCallback = _options.renderCallback || function() {};
    var _saveCallback = _options.saveCallback || function() {};

    // Initialize with PDF document
    function init(pdfDoc) {
        _pdfDoc = pdfDoc;
        _pageCount = pdfDoc ? pdfDoc.numPages : 1;
        _debugCallback('Navigation initialized with ' + _pageCount + ' pages');
    }

    // Change page
    function changePage(offset) {
        var newPage = _currentPage + offset;
        if (newPage >= 1 && newPage <= _pageCount) {
            _currentPage = newPage;
            _debugCallback('Changing to page ' + _currentPage);

            // Update UI
            $(element).find('#current-page').text(_currentPage);

            // Trigger render callback
            if (_renderCallback) {
                _renderCallback(_currentPage, _currentZoom);
            }

            // Trigger save callback
            if (_saveCallback) {
                _saveCallback({ currentPage: _currentPage });
            }

            return true;
        }
        return false;
    }

    // Go to specific page
    function goToPage(pageNum) {
        if (pageNum >= 1 && pageNum <= _pageCount) {
            _currentPage = pageNum;
            _debugCallback('Going to page ' + _currentPage);

            // Update UI
            $(element).find('#current-page').text(_currentPage);

            // Trigger render callback
            if (_renderCallback) {
                _renderCallback(_currentPage, _currentZoom);
            }

            // Trigger save callback
            if (_saveCallback) {
                _saveCallback({ currentPage: _currentPage });
            }

            return true;
        }
        return false;
    }

    // Adjust zoom
    function adjustZoom(delta) {
        _currentZoom = Math.max(0.5, Math.min(3.0, _currentZoom + delta));
        _debugCallback('Adjusting zoom to ' + _currentZoom);

        // Update UI
        $(element).find('#zoom-level').text(Math.round(_currentZoom * 100) + '%');

        // Trigger render callback
        if (_renderCallback) {
            _renderCallback(_currentPage, _currentZoom);
        }

        return _currentZoom;
    }

    // Set specific zoom level
    function setZoom(zoomLevel) {
        _currentZoom = Math.max(0.5, Math.min(3.0, zoomLevel));
        _debugCallback('Setting zoom to ' + _currentZoom);

        // Update UI
        $(element).find('#zoom-level').text(Math.round(_currentZoom * 100) + '%');

        // Trigger render callback
        if (_renderCallback) {
            _renderCallback(_currentPage, _currentZoom);
        }

        return _currentZoom;
    }

    // Fit page to viewport
    function fitToPage(originalWidth, originalHeight) {
        var pdfViewer = $(element).find('.pdf-viewer');
        if (!pdfViewer.length) return;

        var viewerWidth = pdfViewer.width() - 40; // Account for padding
        var viewerHeight = pdfViewer.height() - 40;

        // Need original dimensions to calculate scale
        if (!originalWidth || !originalHeight) {
            _debugCallback('Missing dimensions for fit to page');
            return;
        }

        // Calculate scale to fit width and height
        var scaleX = viewerWidth / originalWidth;
        var scaleY = viewerHeight / originalHeight;

        // Use the smaller scale to ensure the entire page fits
        var fitScale = Math.min(scaleX, scaleY);

        // Apply the new zoom
        _currentZoom = fitScale;
        _debugCallback('Fit to page scale: ' + fitScale.toFixed(2));

        // Update UI
        $(element).find('#zoom-level').text(Math.round(_currentZoom * 100) + '%');

        // Trigger render callback
        if (_renderCallback) {
            _renderCallback(_currentPage, _currentZoom);
        }

        return _currentZoom;
    }

    // Toggle fullscreen mode
    function toggleFullscreen() {
        var docElement = document.documentElement;
        var fullscreenBtn = $(element).find('#fullscreen-btn');

        if (!document.fullscreenElement &&
            !document.mozFullScreenElement &&
            !document.webkitFullscreenElement &&
            !document.msFullscreenElement) {
            // Enter fullscreen
            if (docElement.requestFullscreen) {
                docElement.requestFullscreen();
            } else if (docElement.mozRequestFullScreen) { // Firefox
                docElement.mozRequestFullScreen();
            } else if (docElement.webkitRequestFullscreen) { // Chrome, Safari, Opera
                docElement.webkitRequestFullscreen();
            } else if (docElement.msRequestFullscreen) { // IE/Edge
                docElement.msRequestFullscreen();
            }
            fullscreenBtn.html('<i class="fas fa-compress"></i><span>Exit</span>');
            fullscreenBtn.attr('title', 'Exit Fullscreen');
            _isFullscreen = true;
            _debugCallback('Entered fullscreen mode');
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { // Firefox
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { // Chrome, Safari, Opera
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { // IE/Edge
                document.msExitFullscreen();
            }
            fullscreenBtn.html('<i class="fas fa-expand"></i><span>Fullscreen</span>');
            fullscreenBtn.attr('title', 'Fullscreen');
            _isFullscreen = false;
            _debugCallback('Exited fullscreen mode');
        }
    }

    // Update fullscreen button state
    function updateFullscreenButton() {
        var fullscreenBtn = $(element).find('#fullscreen-btn');
        if (fullscreenBtn.length) {
            if (document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement) {
                fullscreenBtn.html('<i class="fas fa-compress"></i><span>Exit</span>');
                fullscreenBtn.attr('title', 'Exit Fullscreen');
                _isFullscreen = true;
            } else {
                fullscreenBtn.html('<i class="fas fa-expand"></i><span>Fullscreen</span>');
                fullscreenBtn.attr('title', 'Fullscreen');
                _isFullscreen = false;
            }
        }
    }

    // Adjust brightness
    function adjustBrightness(delta) {
        var newBrightness = Math.min(_maxBrightness, Math.max(_minBrightness, _currentBrightness + delta));
        if (newBrightness !== _currentBrightness) {
            _currentBrightness = newBrightness;

            // Update filter on PDF container
            var pdfContainer = $(element).find('#pdf-container')[0];
            if (pdfContainer) {
                var filterValue = `brightness(${_currentBrightness / 100})`;

                if (_isGrayscale) {
                    filterValue += ' grayscale(100%)';
                } else if (_isInkMode) {
                    filterValue += ' grayscale(100%) contrast(150%)';
                }

                pdfContainer.style.filter = filterValue;
            }

            // Update UI
            $(element).find('#brightness-level').text(_currentBrightness + '%');
            _debugCallback('Brightness adjusted to ' + _currentBrightness + '%');
        }

        return _currentBrightness;
    }

    // Toggle grayscale
    function toggleGrayscale() {
        var pdfContainer = $(element).find('#pdf-container')[0];
        var button = $(element).find('#grayscale-toggle');

        _isGrayscale = !_isGrayscale;

        if (_isGrayscale) {
            button.addClass('active');
            // Disable ink mode if active
            if (_isInkMode) {
                toggleInkMode();
            }
            if (pdfContainer) {
                pdfContainer.style.filter = `brightness(${_currentBrightness / 100}) grayscale(100%)`;
            }
        } else {
            button.removeClass('active');
            if (pdfContainer) {
                pdfContainer.style.filter = `brightness(${_currentBrightness / 100})`;
            }
        }

        _debugCallback('Grayscale mode: ' + _isGrayscale);
        return _isGrayscale;
    }

    // Toggle ink mode
    function toggleInkMode() {
        var pdfContainer = $(element).find('#pdf-container')[0];
        var button = $(element).find('#ink-mode-toggle');

        _isInkMode = !_isInkMode;

        if (_isInkMode) {
            button.addClass('active');
            // Disable grayscale if active
            if (_isGrayscale) {
                toggleGrayscale();
            }
            if (pdfContainer) {
                pdfContainer.style.filter = `brightness(${_currentBrightness / 100}) grayscale(100%) contrast(150%)`;
            }
        } else {
            button.removeClass('active');
            if (pdfContainer) {
                pdfContainer.style.filter = `brightness(${_currentBrightness / 100})`;
            }
        }

        _debugCallback('E-ink mode: ' + _isInkMode);
        return _isInkMode;
    }

    // Open the page list modal
    async function openPageList() {
        var modal = $(element).find('#page-list-modal');
        var thumbnailsContainer = $(element).find('#page-thumbnails');

        if (!modal.length || !thumbnailsContainer.length || !_pdfDoc) {
            _debugCallback('Modal or thumbnails container not found');
            return;
        }

        _debugCallback('Opening page list');

        // Clear existing thumbnails
        thumbnailsContainer.empty();

        // Show modal while thumbnails are loading
        modal.css('display', 'block');

        try {
            // Create thumbnails for each page
            for (var i = 1; i <= _pageCount; i++) {
                await createThumbnail(i, thumbnailsContainer[0]);
            }

            // Highlight the current page
            var currentThumbnail = thumbnailsContainer.find(`.thumbnail-item[data-page="${_currentPage}"]`);
            if (currentThumbnail.length) {
                currentThumbnail.addClass('active');
                currentThumbnail[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } catch (error) {
            _debugCallback('Error generating thumbnails: ' + error.message);
        }
    }

    // Create a single thumbnail
    async function createThumbnail(pageNum, container) {
        try {
            var page = await _pdfDoc.getPage(pageNum);
            var scale = 0.2; // Small scale for thumbnails
            var viewport = page.getViewport({ scale });

            var thumbnailItem = document.createElement('div');
            thumbnailItem.className = 'thumbnail-item';
            thumbnailItem.setAttribute('data-page', pageNum);
            thumbnailItem.title = `Page ${pageNum}`;

            var canvas = document.createElement('canvas');
            canvas.className = 'thumbnail-canvas';
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            var context = canvas.getContext('2d');

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            var label = document.createElement('div');
            label.className = 'thumbnail-label';
            label.textContent = `Page ${pageNum}`;

            thumbnailItem.appendChild(canvas);
            thumbnailItem.appendChild(label);

            // Add click event to navigate to page
            thumbnailItem.addEventListener('click', function() {
                goToPage(pageNum);
                $(element).find('#page-list-modal').css('display', 'none');
            });

            container.appendChild(thumbnailItem);
        } catch (error) {
            _debugCallback('Error creating thumbnail for page ' + pageNum + ': ' + error.message);
        }
    }

    // Close the page list modal
    function closePageList() {
        $(element).find('#page-list-modal').css('display', 'none');
    }

    // Get current page
    function getCurrentPage() {
        return _currentPage;
    }

    // Get current zoom
    function getCurrentZoom() {
        return _currentZoom;
    }

    // Get page count
    function getPageCount() {
        return _pageCount;
    }

    // Public API
    return {
        init: init,
        changePage: changePage,
        goToPage: goToPage,
        adjustZoom: adjustZoom,
        setZoom: setZoom,
        fitToPage: fitToPage,
        toggleFullscreen: toggleFullscreen,
        updateFullscreenButton: updateFullscreenButton,
        adjustBrightness: adjustBrightness,
        toggleGrayscale: toggleGrayscale,
        toggleInkMode: toggleInkMode,
        openPageList: openPageList,
        closePageList: closePageList,
        getCurrentPage: getCurrentPage,
        getCurrentZoom: getCurrentZoom,
        getPageCount: getPageCount
    };
}