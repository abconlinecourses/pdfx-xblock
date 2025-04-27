"""PDF Viewer XBlock - A rich PDF annotation and viewing XBlock for Open edX."""

from importlib.resources import files
import json
import os
import logging
import mimetypes
import uuid
import pkg_resources

from web_fragments.fragment import Fragment
from xblock.core import XBlock
from xblock.fields import Scope, String, Dict, Boolean, Integer, JSONField
from xblockutils.resources import ResourceLoader
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.conf import settings
from webob import Response

log = logging.getLogger(__name__)

# Use ResourceLoader for reliable resource loading
loader = ResourceLoader(__name__)

# Define custom field with type conversion for handling invalid data
class SafeDict(Dict):
    """Dict field that safely handles invalid data types by converting to dict."""

    def from_json(self, value):
        """
        Convert stored value to dict, handling non-dict values by converting to empty dict.
        """
        if value is None:
            return {}
        if isinstance(value, dict):
            return value
        if isinstance(value, list):
            log.warning(f"Converting list to dict for field {self.name}")
            # Try to convert list to dict if possible
            try:
                if len(value) > 0 and all(isinstance(item, list) and len(item) == 2 for item in value):
                    return dict(value)
                return {}
            except Exception:
                return {}
        if isinstance(value, str):
            # Try to deserialize JSON string
            try:
                result = json.loads(value)
                if isinstance(result, dict):
                    return result
            except Exception:
                pass

        log.warning(f"Invalid data type for Dict field {self.name}: {type(value)}, using empty dict")
        return {}

class PdfxXBlock(XBlock):
    """
    XBlock providing a rich PDF viewing and annotation experience.
    Allows students to view PDFs with features like drawing, highlighting,
    commenting, and more.
    """

    # XBlock fields
    display_name = String(
        display_name="Display Name",
        help="Name of the component in the edxplatform",
        scope=Scope.settings,
        default="PDF Viewer"
    )

    pdf_url = String(
        display_name="PDF URL",
        help="URL or path to the PDF file to display",
        scope=Scope.settings,
        default=""
    )

    pdf_file_name = String(
        display_name="PDF File Name",
        help="Name of the uploaded PDF file",
        scope=Scope.settings,
        default=""
    )

    pdf_file_asset_key = String(
        display_name="PDF File Asset Key",
        help="Asset key for the uploaded PDF file in course assets",
        scope=Scope.settings,
        default=""
    )

    allow_download = Boolean(
        display_name="Allow Download",
        help="Allow students to download the annotated PDF",
        scope=Scope.settings,
        default=True
    )

    allow_annotation = Boolean(
        display_name="Allow Annotation",
        help="Allow students to annotate the PDF",
        scope=Scope.settings,
        default=True
    )

    # Store student's annotations - use SafeDict to handle type mismatches
    annotations = SafeDict(
        help="Student's annotations on the PDF",
        scope=Scope.user_state,
        default={}
    )

    # Store student's current page
    current_page = Integer(
        help="Current page number in the PDF",
        scope=Scope.user_state,
        default=1
    )

    # Store drawing strokes - use SafeDict to handle type mismatches
    drawing_strokes = SafeDict(
        help="Student's drawing strokes on the PDF",
        scope=Scope.user_state,
        default={}
    )

    # Store highlights - use SafeDict to handle type mismatches
    highlights = SafeDict(
        help="Student's text highlights on the PDF",
        scope=Scope.user_state,
        default={}
    )

    def resource_string(self, path):
        """Handy helper for getting resources from our kit."""
        try:
            # First try ResourceLoader from xblockutils
            return loader.load_unicode(path)
        except IOError:
            # Fall back to pkg_resources
            data = pkg_resources.resource_string(__name__, path)
            return data.decode("utf8")
        except Exception as e:
            log.error(f"Error loading resource {path}: {str(e)}")
            return ""

    def student_view(self, context=None):
        """
        The primary view of the PdfxXBlock, shown to students
        when viewing courses.
        """
        html = self.resource_string("static/html/pdfx.html")

        # Create a Template object with the Mako engine
        from mako.template import Template
        template = Template(html)

        # Render the template with the XBlock instance as context
        rendered_html = template.render(block=self)

        frag = Fragment(rendered_html)

        # Add CSS
        frag.add_css(self.resource_string("static/css/pdfx.css"))
        frag.add_css_url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css')

        # Get the actual PDF URL first to pass it to the template
        pdf_url = self.get_pdf_url()
        log.info(f"PDF URL for rendering: {pdf_url}")

        # Add direct PDF embed as fallback - hidden by default
        pdf_embed = f"""
        <div class="pdf-fallback" style="display:none;">
            <p>If the PDF viewer doesn't load properly, you can <a href="{pdf_url}" target="_blank">open the PDF directly</a>.</p>
            <iframe src="{pdf_url}" width="100%" height="500px" style="border:none;"></iframe>
        </div>
        """
        frag.add_resource(pdf_embed, mimetype='text/html')

        # Load JavaScript libraries in the correct order with proper loading checks
        # First add jQuery if not already available (it should be in Open edX, but just to be safe)
        frag.add_javascript("""
            if (typeof jQuery === 'undefined') {
                console.log('jQuery not found, loading it');
                var script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js';
                document.head.appendChild(script);
            }
        """)

        # Add PDF.js library with a loading check
        frag.add_javascript("""
            // Check if PDF.js is already loaded
            if (typeof pdfjsLib === 'undefined') {
                console.log('Loading PDF.js from CDN');
                var script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.min.js';
                script.onload = function() {
                    console.log('PDF.js loaded successfully');
                    // Configure worker
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

                    // Initialize our viewer after library is loaded
                    if (typeof PdfxXBlockInitializer !== 'undefined') {
                        console.log('Initializing PDF viewer after PDF.js loaded');
                        PdfxXBlockInitializer.init();
                    }
                };
                document.head.appendChild(script);
            } else {
                console.log('PDF.js already loaded');
                // Configure worker
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
            }
        """)

        # Add Fabric.js for annotations
        frag.add_javascript_url('https://cdnjs.cloudflare.com/ajax/libs/fabric.js/4.5.0/fabric.min.js')

        # Only add essential JS files to reduce complexity
        try:
            # Main XBlock JavaScript file
            frag.add_javascript(self.resource_string("static/js/src/pdfx_view.js"))
            log.info("Successfully loaded pdfx_view.js")
        except Exception as e:
            log.error(f"Error loading JavaScript: {str(e)}")

        # Safely get the annotations - handle potential type errors
        try:
            annotations = self.annotations
            if not isinstance(annotations, dict):
                log.warning(f"Annotations has incorrect type: {type(annotations)}, using empty dict")
                annotations = {}
        except Exception as e:
            log.error(f"Error accessing annotations: {str(e)}")
            annotations = {}

        # Safely get current page
        try:
            current_page = self.current_page
            if not isinstance(current_page, int):
                log.warning(f"Current page has incorrect type: {type(current_page)}, using default 1")
                current_page = 1
        except Exception as e:
            log.error(f"Error accessing current_page: {str(e)}")
            current_page = 1

        # Safely get drawing strokes
        try:
            drawing_strokes = self.drawing_strokes
            if not isinstance(drawing_strokes, dict):
                log.warning(f"Drawing strokes has incorrect type: {type(drawing_strokes)}, using empty dict")
                drawing_strokes = {}
        except Exception as e:
            log.error(f"Error accessing drawing_strokes: {str(e)}")
            drawing_strokes = {}

        # Safely get highlights
        try:
            highlights = self.highlights
            if not isinstance(highlights, dict):
                log.warning(f"Highlights has incorrect type: {type(highlights)}, using empty dict")
                highlights = {}
        except Exception as e:
            log.error(f"Error accessing highlights: {str(e)}")
            highlights = {}

        # Add the initialization code to the fragment with improved loading logic
        frag.add_javascript("""
            // Initializer object to ensure we only initialize once PDF.js is loaded
            var PdfxXBlockInitializer = {
                runtime: null,
                element: null,
                config: null,

                // Setup function to store parameters
                setup: function(runtime, element, config) {
                    this.runtime = runtime;
                    this.element = element;
                    this.config = config;

                    console.log('PDF XBlock setup complete, waiting for libraries to load');

                    // Check if PDF.js is already loaded and initialize if it is
                    if (typeof pdfjsLib !== 'undefined') {
                        console.log('PDF.js already loaded during setup, initializing immediately');
                        this.init();
                    } else {
                        console.log('PDF.js not loaded yet, will initialize when ready');
                        // Show fallback after 5 seconds if PDF.js doesn't load
                        setTimeout(function() {
                            if (typeof pdfjsLib === 'undefined') {
                                console.log('PDF.js failed to load after timeout, showing fallback');
                                $('.pdf-fallback', element).show();
                            }
                        }, 5000);
                    }
                },

                // Initialization function called when PDF.js is ready
                init: function() {
                    if (!this.runtime || !this.element || !this.config) {
                        console.error('Cannot initialize, setup not complete');
                        return;
                    }

                    var runtime = this.runtime;
                    var element = this.element;
                    var config = this.config;

                    console.log('PDF XBlock: Initializing PDF viewer');

                    var pdfUrl = config.pdfUrl;
                    if (!pdfUrl) {
                        console.error('PDF XBlock: No PDF URL provided');
                        $('.pdf-fallback', element).show();
                        return;
                    }

                    console.log('PDF XBlock: Loading PDF from URL: ' + pdfUrl);

                    // Configure PDF.js worker
                    if (typeof pdfjsLib !== 'undefined') {
                        console.log('Setting PDF.js worker source in initializer');
                        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
                    }

                    // Initialize PDF viewer
                    var viewer = new PdfViewer(runtime, element, config);
                    viewer.load();
                }
            };

            // PDF Viewer implementation
            function PdfViewer(runtime, element, config) {
                this.runtime = runtime;
                this.element = element;
                this.config = config;
                this.pdfDoc = null;
                this.currentPage = config.currentPage || 1;
                this.zoom = 1.0;
                this.originalViewport = null;
                this.fitMode = 'auto'; // 'auto', 'width', 'page'
                this.resizeTimer = null;

                this.load = function() {
                    var self = this;
                    var canvas = $('#pdf-canvas', element)[0];

                    if (!canvas) {
                        console.error('PDF XBlock: Canvas element not found');
                        $('.pdf-fallback', element).show();
                        return;
                    }

                    try {
                        var loadingTask = pdfjsLib.getDocument({
                            url: config.pdfUrl,
                            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.10.377/cmaps/',
                            cMapPacked: true
                        });

                        loadingTask.onProgress = function(progress) {
                            var percent = Math.round(progress.loaded / Math.max(progress.total, 1) * 100);
                            $('.loading-indicator', element).text('Loading PDF... ' + percent + '%');
                        };

                        loadingTask.promise.then(function(pdf) {
                            self.pdfDoc = pdf;
                            console.log('PDF XBlock: PDF loaded with ' + pdf.numPages + ' pages');
                            $('#page-count', element).text(pdf.numPages);

                            // Render the first page
                            self.renderPage(self.currentPage);

                            // Set up navigation controls
                            self.setupControls();

                        }).catch(function(error) {
                            console.error('PDF XBlock: Error loading PDF: ' + error);
                            $('.loading-indicator', element).hide();
                            $('.pdf-error', element).show().find('.error-message').text('Failed to load PDF: ' + error.message);

                            // Show fallback
                            $('.pdf-fallback', element).show();
                        });
                    } catch (error) {
                        console.error('PDF XBlock: Error initializing PDF: ' + error);
                        $('.loading-indicator', element).hide();
                        $('.pdf-error', element).show().find('.error-message').text('Error initializing PDF: ' + error.message);

                        // Show fallback
                        $('.pdf-fallback', element).show();
                    }
                };

                this.renderPage = function(pageNum) {
                    var self = this;
                    if (!this.pdfDoc) return;

                    // Ensure valid page number
                    pageNum = Math.max(1, Math.min(pageNum, this.pdfDoc.numPages));
                    this.currentPage = pageNum;

                    // Update UI
                    $('#page-num', element).text(pageNum);

                    // Get page
                    this.pdfDoc.getPage(pageNum).then(function(page) {
                        var canvas = $('#pdf-canvas', element)[0];
                        var ctx = canvas.getContext('2d');
                        var container = $(canvas).parent();

                        // Get the original viewport dimensions to determine orientation
                        var originalViewport = page.getViewport({ scale: 1.0 });
                        self.originalViewport = originalViewport; // Store for later use

                        var isLandscape = originalViewport.width > originalViewport.height;

                        // Update debug info if available
                        $('#page-orientation', element).text(isLandscape ? 'Landscape' : 'Portrait');

                        // Calculate container dimensions
                        var containerWidth = container.width();
                        var containerHeight = container.height();

                        // Calculate scale based on fit mode
                        var scale;
                        if (self.fitMode === 'width') {
                            scale = containerWidth / originalViewport.width;
                        } else if (self.fitMode === 'page') {
                            scale = Math.min(
                                containerWidth / originalViewport.width,
                                containerHeight / originalViewport.height
                            );
                        } else { // auto
                            var scaleX = containerWidth / originalViewport.width;
                            var scaleY = containerHeight / originalViewport.height;
                            scale = Math.min(scaleX, scaleY);
                        }

                        // Apply zoom factor
                        scale *= self.zoom;

                        // Create viewport with calculated scale
                        var viewport = page.getViewport({ scale: scale });

                        // Set canvas dimensions
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;

                        // If we have an annotation canvas, update it as well
                        if (typeof fabric !== 'undefined' && $('#drawing-canvas', element).length) {
                            self.updateDrawingCanvas(viewport.width, viewport.height);
                        }

                        // Add orientation class to container for CSS adjustments
                        container.removeClass('landscape portrait').addClass(isLandscape ? 'landscape' : 'portrait');

                        // Update zoom display
                        $('#zoom-level', element).text(Math.round(scale * 100) + '%');

                        // Render PDF page
                        var renderContext = {
                            canvasContext: ctx,
                            viewport: viewport
                        };

                        page.render(renderContext).promise.then(function() {
                            console.log('PDF XBlock: Page ' + pageNum + ' rendered with orientation: ' + (isLandscape ? 'landscape' : 'portrait'));
                            $('.loading-indicator', element).hide();
                        }).catch(function(error) {
                            console.error('PDF XBlock: Error rendering page: ' + error);
                        });
                    });
                };

                this.updateDrawingCanvas = function(width, height) {
                    // If Fabric.js is loaded and we have a drawing canvas
                    if (typeof fabric !== 'undefined' && $('#drawing-canvas', element).length) {
                        var drawingCanvas = $('#drawing-canvas', element)[0];
                        if (drawingCanvas && drawingCanvas.fabric) {
                            drawingCanvas.fabric.setDimensions({
                                width: width,
                                height: height
                            });
                        }
                    }
                };

                this.setupControls = function() {
                    var self = this;

                    // Page navigation
                    $('#prev-page', element).click(function() {
                        if (self.currentPage > 1) {
                            self.renderPage(self.currentPage - 1);
                        }
                    });

                    $('#next-page', element).click(function() {
                        if (self.currentPage < self.pdfDoc.numPages) {
                            self.renderPage(self.currentPage + 1);
                        }
                    });

                    // Zoom controls
                    $('#zoom-in', element).click(function() {
                        self.zoom += 0.1;
                        self.renderPage(self.currentPage);
                    });

                    $('#zoom-out', element).click(function() {
                        self.zoom = Math.max(0.1, self.zoom - 0.1);
                        self.renderPage(self.currentPage);
                    });

                    // Fit controls
                    $('#fit-to-width', element).click(function() {
                        self.fitMode = 'width';
                        self.zoom = 1.0; // Reset zoom
                        self.renderPage(self.currentPage);
                    });

                    $('#fit-to-page', element).click(function() {
                        self.fitMode = 'page';
                        self.zoom = 1.0; // Reset zoom
                        self.renderPage(self.currentPage);
                    });

                    // Fullscreen control
                    $('#fullscreen-btn', element).click(function() {
                        self.toggleFullScreen();
                    });

                    // Add window resize handler for responsiveness
                    $(window).on('resize', function() {
                        // Debounce the resize event to prevent excessive rendering
                        clearTimeout(self.resizeTimer);
                        self.resizeTimer = setTimeout(function() {
                            self.renderPage(self.currentPage);
                        }, 250);
                    });

                    // Keyboard navigation
                    $(element).on('keydown', function(e) {
                        if (e.keyCode === 37) { // Left arrow
                            if (self.currentPage > 1) {
                                self.renderPage(self.currentPage - 1);
                            }
                        } else if (e.keyCode === 39) { // Right arrow
                            if (self.currentPage < self.pdfDoc.numPages) {
                                self.renderPage(self.currentPage + 1);
                            }
                        } else if (e.keyCode === 27 && $('.pdfx_block', element).hasClass('fullscreen')) { // ESC key exits fullscreen
                            self.toggleFullScreen();
                        }
                    });

                    // Handle fullscreen change events
                    $(document).on('fullscreenchange webkitfullscreenchange mozfullscreenchange MSFullscreenChange', function() {
                        if (!document.fullscreenElement &&
                            !document.webkitFullscreenElement &&
                            !document.mozFullScreenElement &&
                            !document.msFullscreenElement) {
                            // Exit fullscreen detected
                            if ($('.pdfx_block', element).hasClass('fullscreen')) {
                                $('.pdfx_block', element).removeClass('fullscreen');
                                $('#fullscreen-btn', element).removeClass('active');
                                // Re-render to adjust to new size
                                self.renderPage(self.currentPage);
                            }
                        }
                    });
                };

                // Toggle fullscreen mode
                this.toggleFullScreen = function() {
                    var pdfBlock = $('.pdfx_block', element);
                    var fullscreenBtn = $('#fullscreen-btn', element);

                    if (pdfBlock.hasClass('fullscreen')) {
                        // Exit fullscreen
                        pdfBlock.removeClass('fullscreen');
                        fullscreenBtn.removeClass('active');

                        // Exit browser fullscreen if active
                        if (document.exitFullscreen) {
                            document.exitFullscreen();
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen();
                        } else if (document.mozCancelFullScreen) {
                            document.mozCancelFullScreen();
                        } else if (document.msExitFullscreen) {
                            document.msExitFullscreen();
                        }
                    } else {
                        // Enter fullscreen
                        pdfBlock.addClass('fullscreen');
                        fullscreenBtn.addClass('active');

                        // Try to request browser fullscreen on the containing element or iframe
                        var container = window.frameElement || pdfBlock[0];

                        try {
                            // Try to use the browser's fullscreen API
                            if (container.requestFullscreen) {
                                container.requestFullscreen();
                            } else if (container.mozRequestFullScreen) {
                                container.mozRequestFullScreen();
                            } else if (container.webkitRequestFullscreen) {
                                container.webkitRequestFullscreen();
                            } else if (container.msRequestFullscreen) {
                                container.msRequestFullscreen();
                            } else {
                                // If browser fullscreen API fails, use our CSS-based fullscreen as fallback
                                console.log('Browser fullscreen API not supported, using CSS fullscreen fallback');
                            }
                        } catch (e) {
                            console.log('Error requesting fullscreen:', e);
                            // Continue with CSS-based fullscreen as fallback
                        }
                    }

                    // Re-render to adjust to new size after a short delay
                    var self = this;
                    setTimeout(function() {
                        self.renderPage(self.currentPage);
                    }, 100);
                };
            }

            // XBlock initialization function
            function PdfxXBlock(runtime, element, initArgs) {
                // Setup the initializer with our parameters
                PdfxXBlockInitializer.setup(runtime, element, initArgs);

                // Return empty object as required by XBlock pattern
                return {};
            }
        """)

        # Initialize with only the function name and arguments (proper XBlock pattern)
        # Using safely retrieved values from above
        frag.initialize_js('PdfxXBlock', {
            'pdfUrl': pdf_url,
            'allowDownload': self.allow_download,
            'allowAnnotation': False,  # Temporarily disable annotations
            'savedAnnotations': annotations,
            'currentPage': current_page,
            'drawingStrokes': drawing_strokes,
            'highlights': highlights
        })

        return frag

    def studio_view(self, context=None):
        """
        Create a fragment used to display the edit view in the Studio.
        """
        html = self.resource_string("static/html/pdfx_edit.html")

        # Create a Template object with the Mako engine
        from mako.template import Template
        template = Template(html)

        # Render the template with the XBlock instance as context
        rendered_html = template.render(block=self)

        frag = Fragment(rendered_html)

        # Add CSS
        frag.add_css(self.resource_string("static/css/pdfx.css"))
        frag.add_css(self.resource_string("static/css/pdfx_edit.css"))

        # Add JS
        frag.add_javascript(self.resource_string("static/js/src/pdfx_edit.js"))

        # Initialize the XBlock
        frag.initialize_js('PdfxXBlockEdit')

        return frag

    def get_pdf_url(self):
        """
        Get the URL for the PDF file, either from pdf_url field or from uploaded file.
        """
        try:
            # Get the LMS base URL for constructing full URLs
            from django.conf import settings

            # Check if we have an asset key from an uploaded file
            if self.pdf_file_asset_key:
                # The PDF was uploaded and stored in Open edX's asset storage
                pdf_path = self.pdf_file_asset_key

                # If it's a relative URL, make it absolute
                if pdf_path.startswith('/'):
                    # Check if we have LMS_BASE in settings
                    lms_base = getattr(settings, 'LMS_BASE', None)
                    if lms_base:
                        if not (pdf_path.startswith('http://') or pdf_path.startswith('https://')):
                            protocol = 'https' if getattr(settings, 'HTTPS', 'on') == 'on' else 'http'
                            return f"{protocol}://{lms_base}{pdf_path}"

                return pdf_path

            # If we have an external URL
            if self.pdf_url:
                # If it's already a full URL, return it directly
                if self.pdf_url.startswith('http://') or self.pdf_url.startswith('https://'):
                    return self.pdf_url

                # If it's a relative URL, make it absolute
                if self.pdf_url.startswith('/'):
                    lms_base = getattr(settings, 'LMS_BASE', None)
                    if lms_base:
                        protocol = 'https' if getattr(settings, 'HTTPS', 'on') == 'on' else 'http'
                        return f"{protocol}://{lms_base}{self.pdf_url}"

            # Return the URL as is if we couldn't convert it
            return self.pdf_url or self.pdf_file_asset_key

        except Exception as e:
            log.error(f"Error generating full PDF URL: {str(e)}")
            # Return the original URL as fallback
            return self.pdf_url or self.pdf_file_asset_key

    @XBlock.json_handler
    def studio_submit(self, data, suffix=''):
        """
        Handle the Studio save.
        """
        self.display_name = data.get('display_name', self.display_name)
        self.pdf_url = data.get('pdf_url', self.pdf_url)
        self.allow_download = data.get('allow_download', self.allow_download)
        self.allow_annotation = data.get('allow_annotation', self.allow_annotation)

        return {'result': 'success'}

    @XBlock.handler
    def upload_pdf(self, request, suffix=''):
        """
        Handle PDF file upload.
        """
        response_data = {}
        status_code = 200

        try:
            upload = request.params['file'].file
            filename = request.params['file'].filename

            if not filename.endswith('.pdf'):
                response_data = {'result': 'error', 'message': 'Only PDF files are allowed'}
                status_code = 400
            else:
                # Generate a unique filename
                safe_filename = filename.replace(' ', '_')
                unique_id = str(uuid.uuid4())[:8]
                unique_filename = f"{unique_id}_{safe_filename}"

                # Get the course key from the XBlock's location
                course_key = self.location.course_key
                log.info(f"Generated course_key from location: {course_key}, type: {type(course_key)}")

                # Import ContentStore and StaticContent here to avoid import errors
                from xmodule.contentstore.django import contentstore
                from xmodule.contentstore.content import StaticContent
                from opaque_keys.edx.keys import AssetKey

                # Get content store
                content_store = contentstore()

                # Create asset key - use a simpler name pattern
                asset_path = f"pdfs_{unique_id}_{safe_filename}"
                asset_key = StaticContent.compute_location(course_key, asset_path)

                # Read the file content
                file_content = upload.read()

                # Create the static content
                content = StaticContent(
                    asset_key,
                    filename,  # Use original filename for display
                    'application/pdf',
                    file_content,
                    length=len(file_content)
                )

                # Save the content
                try:
                    log.info(f"About to save content to content store. Asset key: {asset_key}")
                    content_store.save(content)
                    log.info(f"Successfully saved content to store with key: {asset_key}")
                except Exception as e:
                    log.error(f"Failed to save content to content store: {str(e)}")
                    raise

                # The URL should be in format: /asset-v1:{course_key}+type@asset+block@{asset_path}
                # This is the format expected by Studio and LMS
                try:
                    # Get the standard format URL from StaticContent
                    log.info(f"Generating asset URL from key: {asset_key}")
                    asset_url = StaticContent.serialize_asset_key_with_slash(asset_key)
                    log.info(f"Generated asset URL using serialize_asset_key_with_slash: {asset_url}")

                    # If this doesn't work, try constructing it manually
                    if not asset_url:
                        log.warning(f"serialize_asset_key_with_slash returned empty URL, falling back to manual construction")
                        asset_url = f"/asset-v1:{str(course_key)}+type@asset+block@{asset_path}"
                        log.info(f"Manually constructed asset URL: {asset_url}")

                    log.info(f"Final asset URL: {asset_url}")
                except Exception as e:
                    log.error(f"Error generating asset URL: {str(e)}, falling back to basic URL")
                    # Fallback to basic URL format
                    asset_url = f"/asset-v1:{str(course_key)}+type@asset+block@{asset_path}"

                # Update XBlock fields
                self.pdf_file_name = filename
                self.pdf_file_asset_key = asset_url
                self.pdf_url = ""  # Clear the URL field since we're using an uploaded file

                # Log success
                log.info(f"PDF file uploaded successfully: {filename}, saved as {asset_url}")

                response_data = {
                    'result': 'success',
                    'filename': filename,
                    'asset_url': asset_url
                }
        except Exception as e:
            log.error(f"Error uploading file: {str(e)}")
            response_data = {'result': 'error', 'message': str(e)}
            status_code = 500

        # Return appropriate response
        response = Response(json.dumps(response_data))
        response.content_type = 'application/json'
        response.status_code = status_code
        return response

    @XBlock.json_handler
    def save_annotations(self, data, suffix=''):
        """
        Save the annotations made by the student.
        This includes drawings, highlights, and the current page.
        """
        if not self.allow_annotation:
            return {'result': 'error', 'message': 'Annotations are not allowed'}

        try:
            # Update current page
            if 'currentPage' in data and isinstance(data['currentPage'], int):
                self.current_page = data['currentPage']

            # Update drawings - ensure it's a dict
            if 'drawings' in data:
                if isinstance(data['drawings'], dict):
                    self.drawing_strokes = data['drawings']
                else:
                    log.warning(f"Received invalid drawings type: {type(data['drawings'])}")
                    # Convert to dict if possible
                    if hasattr(data['drawings'], '__dict__'):
                        self.drawing_strokes = data['drawings'].__dict__
                    else:
                        self.drawing_strokes = {}

            # Update highlights - ensure it's a dict
            if 'highlights' in data:
                if isinstance(data['highlights'], dict):
                    self.highlights = data['highlights']
                else:
                    log.warning(f"Received invalid highlights type: {type(data['highlights'])}")
                    # Convert to dict if possible
                    if hasattr(data['highlights'], '__dict__'):
                        self.highlights = data['highlights'].__dict__
                    else:
                        self.highlights = {}

            # Update general annotations - ensure it's a dict
            if 'annotations' in data:
                if isinstance(data['annotations'], dict):
                    self.annotations = data['annotations']
                else:
                    log.warning(f"Received invalid annotations type: {type(data['annotations'])}")
                    # Convert to dict if possible
                    if hasattr(data['annotations'], '__dict__'):
                        self.annotations = data['annotations'].__dict__
                    else:
                        self.annotations = {}

            return {'result': 'success'}
        except Exception as e:
            log.error(f"Error saving annotations: {str(e)}")
            return {'result': 'error', 'message': str(e)}

    @XBlock.handler
    def get_pdf_worker(self, request, suffix=''):
        """
        Serve the PDF.js worker file from local storage.
        """
        try:
            # Get the worker file content
            worker_content = self.resource_string("static/vendor/pdf.worker.min.js")

            # Create response with proper content type and cache headers
            response = Response(worker_content)
            response.content_type = 'application/javascript'

            # Add cache headers to improve performance
            response.cache_control.max_age = 86400  # 24 hours
            response.cache_control.public = True

            log.info(f"Serving local PDF.js worker file")
            return response
        except Exception as e:
            log.error(f"Error serving local PDF.js worker, redirecting to CDN: {str(e)}")

            # Fallback to CDN if local file can't be served
            worker_url = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js'
            response = Response(status=302, location=worker_url)

            # Add cache headers to improve performance
            response.cache_control.max_age = 86400  # 24 hours
            response.cache_control.public = True

            return response

    @XBlock.handler
    def get_pdf_thumbnail(self, request, suffix=''):
        """
        Generate and serve a thumbnail for a PDF page.
        """
        # This would typically be implemented using a library like PyPDF2 or pdf2image
        # But for now, we'll just return a placeholder or redirect to the PDF itself

        # Extract page number from request
        try:
            page = int(request.GET.get('page', 1))
        except ValueError:
            page = 1

        response_data = {
            'result': 'error',
            'message': 'PDF thumbnail generation not implemented yet'
        }

        response = Response(json.dumps(response_data))
        response.content_type = 'application/json'
        return response

    @staticmethod
    def workbench_scenarios():
        """A canned scenario for display in the workbench."""
        return [
            ("PDF Viewer XBlock",
             """<pdfx/>
             """),
        ]
