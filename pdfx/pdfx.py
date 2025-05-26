"""PDF Viewer XBlock - A rich PDF annotation and viewing XBlock for Open edX."""

from importlib.resources import files
import json
import os
import logging
import mimetypes
import uuid
import pkg_resources
from datetime import datetime


from web_fragments.fragment import Fragment
from xblock.core import XBlock
from xblock.fields import Scope, String, Dict, Boolean, Integer, JSONField
from xblockutils.resources import ResourceLoader
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.conf import settings
from webob import Response
from .models import HighlightAnnotation
from django.core.exceptions import PermissionDenied
from django.utils.translation import gettext_lazy as _
from xblock.exceptions import JsonHandlerError

log = logging.getLogger(__name__)

# Use ResourceLoader for reliable resource loading
loader = ResourceLoader(__name__)

# Define custom field with type conversion for handling invalid data.
class SafeDict(Dict):
    """Dict field that safely handles invalid data types by converting to dict."""

    def from_json(self, value):
        """
        Convert stored value to dict, handling non-dict values by converting to empty dict.
        """
        log.debug(f"SafeDict.from_json called with value type: {type(value)}")
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
            except Exception as e:
                log.error(f"Error converting list to dict: {str(e)}")
                return {}
        if isinstance(value, str):
            # Try to deserialize JSON string
            try:
                result = json.loads(value)
                if isinstance(result, dict):
                    return result
            except Exception as e:
                log.error(f"Error deserializing JSON string: {str(e)}")
                pass

        log.warning(f"Invalid data type for Dict field {self.name}: {type(value)}, using empty dict")
        return {}

@XBlock.needs('i18n')
@XBlock.needs('user')
class PdfxXBlock(XBlock):
    """
    XBlock providing a rich PDF viewing and annotation experience.
    Allows students to view PDFs with features like drawing, highlighting,
    commenting, and more.
    """

    # XBlock fields
    display_name = String(
        display_name=_("Display Name"),
        help=_("Name of the component in the edxplatform"),
        scope=Scope.settings,
        default="PDFXpert XBlock"
    )

    # Unique block ID - generated on creation
    block_id = String(
        display_name="Block ID",
        help="Unique identifier for this block instance",
        scope=Scope.settings,
        default=None
    )

    pdf_url = String(
        display_name=_("PDF URL"),
        help=_("URL or path to the PDF file to display"),
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

    # Store user highlight data - separate from drawing highlights
    user_highlights = SafeDict(
        help="Student's user-specific text highlights by page",
        scope=Scope.user_state,
        default={}
    )

    # Store staff-created highlights (instructor/author highlights)
    staff_highlights = SafeDict(
        help="Staff-created highlights for all users",
        scope=Scope.content,
        default={}
    )

    # Store all highlights data with user scope
    all_highlights = SafeDict(
        help="All highlights for this document, keyed by user_id",
        scope=Scope.user_state_summary,
        default={}
    )

    # Store brightness setting
    brightness = Integer(
        help="PDF brightness setting (50-150)",
        scope=Scope.user_state,
        default=100
    )

    # Store grayscale state
    is_grayscale = Boolean(
        help="Whether grayscale mode is enabled",
        scope=Scope.user_state,
        default=False
    )

    # Add marker_strokes field to the XBlock class after the drawing_strokes field
    marker_strokes = SafeDict(
        help="Student's marker strokes on the PDF",
        scope=Scope.user_state,
        default={}
    )

    # Add fields for text annotations
    text_annotations = SafeDict(
        help="Student's text annotations on the PDF",
        scope=Scope.user_state,
        default={}
    )

    # Add fields for shape annotations
    shape_annotations = SafeDict(
        help="Student's shape annotations on the PDF",
        scope=Scope.user_state,
        default={}
    )

    # Add fields for note annotations
    note_annotations = SafeDict(
        help="Student's note annotations on the PDF",
        scope=Scope.user_state,
        default={}
    )

    def __init__(self, *args, **kwargs):
        """Initialize the block with a unique ID if none exists."""
        super(PdfxXBlock, self).__init__(*args, **kwargs)

        # Generate a unique block ID if not already set
        if not self.block_id:
            self.block_id = f"pdfx_{uuid.uuid4().hex[:8]}"
            log.info(f"Generated new block_id: {self.block_id}")

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

    def get_user_info(self):
        """
        Get current user information from Open edX.

        Returns:
            dict: User information including id, username, email, etc.
        """
        user_info = {
            'id': self.scope_ids.user_id,  # Always available
            'username': None,
            'email': None,
            'full_name': None
        }

        # Try to get additional user information from Open edX services
        try:
            # First try using the user service provided by Open edX
            if hasattr(self, 'runtime') and hasattr(self.runtime, 'service'):
                user_service = self.runtime.service(self, 'user')
                if user_service:
                    current_user = user_service.get_current_user()
                    if current_user:
                        user_info['username'] = current_user.opt_attrs.get('edx-platform.username')
                        user_info['email'] = current_user.opt_attrs.get('edx-platform.email')
                        user_info['full_name'] = current_user.opt_attrs.get('edx-platform.full_name')
                        log.info(f"Retrieved user info from user service: {user_info}")
                        return user_info
        except Exception as e:
            log.warning(f"Error retrieving user info from user service: {str(e)}")

        # Fallback: try to get user from Django user model
        try:
            from django.contrib.auth.models import User
            user = User.objects.get(id=self.scope_ids.user_id)
            user_info['username'] = user.username
            user_info['email'] = user.email
            user_info['full_name'] = f"{user.first_name} {user.last_name}".strip()
            log.info(f"Retrieved user info from Django model: {user_info}")
        except Exception as e:
            log.warning(f"Error retrieving user info from Django: {str(e)}")

        return user_info

    def get_course_info(self):
        """
        Get current course information.

        Returns:
            dict: Course information including id, name, etc.
        """
        course_info = {
            'id': None,
            'name': None
        }

        try:
            # Try to get course key from XBlock
            if hasattr(self, 'runtime') and hasattr(self.runtime, 'course_id'):
                course_info['id'] = str(self.runtime.course_id)
            elif hasattr(self, 'location') and hasattr(self.location, 'course_key'):
                course_info['id'] = str(self.location.course_key)

            # Try to get course name
            if hasattr(self, 'runtime') and hasattr(self.runtime, 'modulestore'):
                course_key = self.runtime.course_id
                course = self.runtime.modulestore.get_course(course_key)
                if course:
                    course_info['name'] = course.display_name
        except Exception as e:
            log.warning(f"Error retrieving course info: {str(e)}")

        return course_info

    def is_staff_user(self):
        """
        Check if the current user is staff for this course.

        Returns:
            bool: True if the user is staff, False otherwise
        """
        try:
            # Check if we have access to the user_is_staff method from runtime
            if hasattr(self.runtime, 'user_is_staff'):
                return self.runtime.user_is_staff

            # Alternatively, try the has_permission method
            if hasattr(self, 'runtime') and hasattr(self.runtime, 'service'):
                user_service = self.runtime.service(self, 'user')
                if user_service:
                    return user_service.get_current_user().opt_attrs.get('edx-platform.user_is_staff', False)

            return False
        except Exception as e:
            log.warning(f"Error checking staff status: {str(e)}")
            return False

    def student_view(self, context):
        """
        The primary view of the PdfxXBlock, shown to students when viewing courses.
        """
        # Generate a unique block ID if not already set
        if not self.block_id:
            self.block_id = str(uuid.uuid4())[:8]

        # Using Mako templates through the Template object
        html = self.resource_string("static/html/pdfx.html")

        # Import Template from Mako
        from mako.template import Template
        template = Template(html)

        # Prepare context for template
        user_info = self.get_user_info()
        course_info = self.get_course_info()
        pdf_url = self.get_pdf_url()
        is_staff = self.is_staff_user()

        # Get PDF file name - if uploaded, use that, otherwise try to extract from URL
        if self.pdf_file_name:
            pdf_file_name = self.pdf_file_name
        elif pdf_url:
            # Extract filename from URL if possible
            try:
                from urllib.parse import urlparse
                parsed_url = urlparse(pdf_url)
                pdf_file_name = os.path.basename(parsed_url.path) or "document.pdf"
                if not pdf_file_name.lower().endswith('.pdf'):
                    pdf_file_name += '.pdf'
            except:
                pdf_file_name = "document.pdf"
        else:
            pdf_file_name = "document.pdf"

        # Document info
        document_info = {
            'title': self.pdf_file_name or 'PDF Document',
            'url': pdf_url
        }

        # Get correct highlights based on user type
        if is_staff:
            # Staff can see all highlights
            highlights_to_display = self.get_all_user_highlights()
        else:
            # Regular students only see their own highlights and staff-created highlights
            highlights_to_display = self.retrieve_user_highlights(user_info['id'])

            # Add staff highlights if any
            if self.staff_highlights:
                for page, page_highlights in self.staff_highlights.items():
                    if page not in highlights_to_display:
                        highlights_to_display[page] = []
                    highlights_to_display[page].extend(page_highlights)

        # Prepare marker strokes data
        marker_strokes_data = self.marker_strokes

        # If marker_strokes is empty or invalid, initialize it as an empty dict
        if not marker_strokes_data or not isinstance(marker_strokes_data, dict):
            marker_strokes_data = {}

        # Get text annotation data
        text_annotations_data = self.text_annotations
        if not text_annotations_data or not isinstance(text_annotations_data, dict):
            text_annotations_data = {}

        # Get shape annotation data
        shape_annotations_data = self.shape_annotations
        if not shape_annotations_data or not isinstance(shape_annotations_data, dict):
            shape_annotations_data = {}

        # Get note annotation data
        note_annotations_data = self.note_annotations
        if not note_annotations_data or not isinstance(note_annotations_data, dict):
            note_annotations_data = {}

        # Get the handler URL for saving annotations
        save_url = self.runtime.handler_url(self, 'save_annotations')

        # Render template with context
        template_context = {
            'block': self,
            'block_id': self.block_id,
            'pdf_url': pdf_url,
            'pdf_file_name': pdf_file_name,
            'allow_download': self.allow_download,
            'allow_annotation': self.allow_annotation,
            'user_id': user_info.get('id', 'anonymous'),
            'username': user_info.get('username', ''),
            'email': user_info.get('email', ''),
            'current_page': self.current_page or 1,
            'brightness': self.brightness or 100,
            'is_grayscale': self.is_grayscale or False,
            'is_staff': is_staff,
            'course_id': course_info.get('id', ''),
            'handler_url': save_url,
        }

        rendered_html = template.render(**template_context)
        frag = Fragment(rendered_html)

        # Add CSS
        frag.add_css(self.resource_string("static/css/pdf_viewer.min.css"))
        frag.add_css(self.resource_string("static/css/pdfx.css"))
        frag.add_css_url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css')
        # Add PDF.js viewer CSS
        frag.add_css_url('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf_viewer.min.css')

        # Add direct PDF embed as fallback - hidden by default
        pdf_embed = f"""
        <div class="pdf-fallback" style="display:none;">
            <p>If the PDF viewer doesn't load properly, you can <a href="{pdf_url}" target="_blank">open the PDF directly</a>.</p>
            <iframe src="{pdf_url}" width="100%" height="500px" style="border:none;"></iframe>
        </div>
        """
        frag.add_resource(pdf_embed, mimetype='text/html')

        # Add JS - instead of directly adding the MJS file, create a script element with type="module"
        log.info(f"Setting up PDF.js as a module in the student view fragment")
        frag.add_javascript("""
            // Create a script element for loading PDF.js as a module
            var pdfJsScript = document.createElement('script');
            pdfJsScript.type = 'module';
            pdfJsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.min.mjs';
            pdfJsScript.onload = function() {
                // Set up worker with matching version
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs';
                }
            };
            document.head.appendChild(pdfJsScript);

            // Create a stub for PDF.js to prevent errors while loading
            if (typeof pdfjsLib === 'undefined') {
                window.pdfjsLib = {
                    version: 'stub',
                    GlobalWorkerOptions: {
                        workerSrc: ''
                    }
                };

            }
        """)

        # Add other necessary JS files
        frag.add_javascript(self.resource_string("static/vendor/fabric.min.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_highlight.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_scribble.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_tools_common.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_storage.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_drawing.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_navigation.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_debug_utils.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_text.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_shape.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_note.js"))

        # Add our new canvas fixing utility
        frag.add_javascript(self.resource_string("static/js/src/pdfx_fix_canvas.js"))

        # PDF.js base scripts
        frag.add_javascript(self.resource_string("static/js/src/pdfx_modules.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_init.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_view.js"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_scribble_init.js"))

        # Add debugging script
        frag.add_javascript("""
            // Enable debug mode for stroke functionality
            window.PDFX_DEBUG = true;

            // Add event listener to automatically fix canvas when marker tool is activated
            document.addEventListener('DOMContentLoaded', function() {
                document.addEventListener('pdfx:toolactivated', function(event) {
                    if (event.detail && event.detail.toolName === 'marker') {
                        if (typeof window.emergencyFixCanvasContainer === 'function') {
                            window.emergencyFixCanvasContainer(event.detail.blockId);
                        }
                    }
                });
            });
        """)

        # Add a data element with the same data to the DOM for direct access by JavaScript
        data_html = f"""
        <div id="pdfx-data-{self.block_id}"
            data-block-id="{self.block_id}"
            data-user-id="{user_info['id']}"
            data-course-id="{course_info['id']}"
            data-handler-url="{save_url}"
            data-marker-strokes='{json.dumps(marker_strokes_data)}'
            data-text-annotations='{json.dumps(text_annotations_data)}'
            data-shape-annotations='{json.dumps(shape_annotations_data)}'
            data-note-annotations='{json.dumps(note_annotations_data)}'
            data-document-info='{json.dumps(document_info)}'
            style="display:none;">
        </div>
        """
        frag.add_resource(data_html, mimetype='text/html')

        # Initialize JS with context
        frag.initialize_js('PdfxXBlock', {
            'pdfUrl': pdf_url,
            'blockId': self.block_id,
            'allowDownload': self.allow_download,
            'allowAnnotation': self.allow_annotation,
            'savedAnnotations': self.annotations,
            'drawingStrokes': self.drawing_strokes,
            'highlights': self.highlights,
            'userHighlights': highlights_to_display,
            'markerStrokes': marker_strokes_data,
            'textAnnotations': text_annotations_data,
            'shapeAnnotations': shape_annotations_data,
            'noteAnnotations': note_annotations_data,
            'userId': user_info.get('id', 'anonymous'),
            'username': user_info.get('username', ''),
            'email': user_info.get('email', ''),
            'currentPage': self.current_page or 1,
            'brightness': self.brightness or 100,
            'isGrayscale': self.is_grayscale or False,
            'courseId': course_info.get('id', ''),
            'documentInfo': document_info,
            'isStaff': is_staff,
            'handlerUrl': save_url
        })

        return frag

    def studio_view(self, context):
        log.info(f"Studio view called--------------------------------->")
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
        frag.add_css(self.resource_string("static/css/pdf_viewer.min.css"))
        frag.add_css(self.resource_string("static/css/pdfx.css"))
        frag.add_css(self.resource_string("static/css/pdfx_edit.css"))
        # Add PDF.js viewer CSS
        frag.add_css_url('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf_viewer.min.css')

        # Add JS - instead of directly adding the MJS file, create a script element with type="module"
        log.info(f"Setting up PDF.js as a module in the fragment")
        frag.add_javascript("""
            // Create a script element for loading PDF.js as a module
            var pdfJsScript = document.createElement('script');
            pdfJsScript.type = 'module';
            pdfJsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.min.mjs';
            pdfJsScript.onload = function() {
                // Set up worker with matching version
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs';
                }
            };
            document.head.appendChild(pdfJsScript);

            // Create a stub for PDF.js to prevent errors in edit view
            if (typeof pdfjsLib === 'undefined') {
                window.pdfjsLib = {
                    version: 'stub',
                    GlobalWorkerOptions: {
                        workerSrc: ''
                    }
                };
            }
        """)

        frag.add_javascript(self.resource_string("static/vendor/fabric.min.js"))

        # Add the edit JS
        frag.add_javascript(self.resource_string("static/js/src/pdfx_edit.js"))

        # Initialize the XBlock
        frag.initialize_js('PdfxXBlock')

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

    def get_all_user_highlights(self):
        """
        Get all user highlights for this document.
        Used in staff/instructor view.

        Returns:
            dict: Dictionary of highlights by page with user info
        """
        return self.all_highlights

    def retrieve_user_highlights(self, user_id):
        """
        Get highlights for a specific user.

        Args:
            user_id (str): The user ID to get highlights for

        Returns:
            dict: Dictionary of highlights by page
        """
        if user_id in self.all_highlights:
            return self.all_highlights[user_id]
        return {}

    def save_highlight(self, user_id, highlight_data):
        """
        Save a highlight in the XBlock storage.

        Args:
            user_id (str): The user ID who created the highlight
            highlight_data (dict): The highlight data

        Returns:
            str: Highlight ID
        """
        try:
            log.debug(f"Saving highlight for user {user_id}, data: {highlight_data}")
            # Generate a highlight ID if not provided
            highlight_id = highlight_data.get('highlightId', f"highlight-{uuid.uuid4().hex}")
            highlight_data['highlightId'] = highlight_id

            # Add timestamp if not present
            if 'timestamp' not in highlight_data:
                highlight_data['timestamp'] = datetime.utcnow().isoformat()

            # Get page number as string
            page_num = str(highlight_data.get('page', 1))

            # Initialize user's highlights if not existing
            if user_id not in self.all_highlights:
                log.debug(f"Initializing highlights for user {user_id}")
                self.all_highlights[user_id] = {}

            if page_num not in self.all_highlights[user_id]:
                self.all_highlights[user_id][page_num] = []

            # Add the highlight
            self.all_highlights[user_id][page_num].append(highlight_data)
            log.debug(f"Added highlight {highlight_id} to all_highlights for user {user_id} on page {page_num}")

            # Also save to user_highlights for this user if it's the current user
            if user_id == str(self.scope_ids.user_id):
                if page_num not in self.user_highlights:
                    self.user_highlights[page_num] = []
                self.user_highlights[page_num].append(highlight_data)
                log.debug(f"Added highlight {highlight_id} to user_highlights for current user")

            # If staff user, also save to staff_highlights
            if self.is_staff_user():
                if page_num not in self.staff_highlights:
                    self.staff_highlights[page_num] = []

                # Add staff info
                staff_data = dict(highlight_data)
                staff_data['isStaffHighlight'] = True
                self.staff_highlights[page_num].append(staff_data)
                log.debug(f"Added highlight {highlight_id} to staff_highlights")

            log.info(f"Successfully saved highlight {highlight_id} for user {user_id} on page {page_num}")
            return highlight_id

        except Exception as e:
            log.error(f"Error saving highlight: {str(e)}", exc_info=True)
            return None

    def delete_highlight(self, user_id, highlight_id):
        """
        Delete a highlight from XBlock storage.

        Args:
            user_id (str): The user ID who owns the highlight
            highlight_id (str): The highlight ID to delete

        Returns:
            bool: True if successful, False otherwise
        """
        try:
            log.debug(f"Attempting to delete highlight {highlight_id} for user {user_id}")
            # Check if user exists in highlights
            if user_id not in self.all_highlights:
                log.warning(f"User {user_id} not found in all_highlights")
                return False

            # Find and remove the highlight
            highlight_found = False
            for page_num, highlights in self.all_highlights[user_id].items():
                for i, highlight in enumerate(highlights):
                    if highlight.get('highlightId') == highlight_id:
                        # Remove the highlight
                        self.all_highlights[user_id][page_num].pop(i)
                        highlight_found = True
                        log.debug(f"Removed highlight {highlight_id} from all_highlights on page {page_num}")

                        # Also remove from user_highlights if it's the current user
                        if user_id == str(self.scope_ids.user_id) and page_num in self.user_highlights:
                            for i, h in enumerate(self.user_highlights[page_num]):
                                if h.get('highlightId') == highlight_id:
                                    self.user_highlights[page_num].pop(i)
                                    log.debug(f"Removed highlight {highlight_id} from user_highlights")
                                    break

                        # If staff user, also remove from staff_highlights
                        if self.is_staff_user():
                            for page, staff_highlights in self.staff_highlights.items():
                                for i, h in enumerate(staff_highlights):
                                    if h.get('highlightId') == highlight_id:
                                        self.staff_highlights[page].pop(i)
                                        log.debug(f"Removed highlight {highlight_id} from staff_highlights")
                                        break

                        log.info(f"Successfully deleted highlight {highlight_id} for user {user_id}")
                        return True

            if not highlight_found:
                log.warning(f"Highlight {highlight_id} not found for user {user_id}")
            return highlight_found
        except Exception as e:
            log.error(f"Error deleting highlight: {str(e)}", exc_info=True)
            return False

    @XBlock.json_handler
    def save_annotations(self, data, suffix=''):
        """Save user annotations to the XBlock."""
        try:
            log.info(f"[PDFX DEBUG] save_annotations called for block {self.block_id}, user {self.scope_ids.user_id}")

            # Log request data size statistics
            data_stats = {
                'has_marker_strokes': 'markerStrokes' in data,
                'data_keys': list(data.keys()),
                'request_size': len(json.dumps(data))
            }
            log.info(f"[PDFX DEBUG] save_annotations request data: {json.dumps(data_stats)}")

            # Update current page
            if 'currentPage' in data:
                self.current_page = int(data['currentPage'])
                log.debug(f"Updated current_page to {self.current_page}")

            # Update annotations
            if 'annotations' in data:
                self.annotations = data['annotations']
                log.debug(f"Updated annotations, size: {len(json.dumps(self.annotations))}")

            # Update drawing strokes
            if 'drawingStrokes' in data:
                self.drawing_strokes = data['drawingStrokes']
                log.debug(f"Updated drawing_strokes, size: {len(json.dumps(self.drawing_strokes))}")

            # Update brightness setting
            if 'brightness' in data:
                self.brightness = int(data['brightness'])
                log.debug(f"Updated brightness to {self.brightness}")

            # Update grayscale setting
            if 'isGrayscale' in data:
                self.is_grayscale = bool(data['isGrayscale'])
                log.debug(f"Updated isGrayscale to {self.is_grayscale}")

            # Update marker strokes (scribble strokes) - ensure it's a dict
            if 'markerStrokes' in data:
                marker_stats = {
                    'is_dict': isinstance(data['markerStrokes'], dict),
                    'type': str(type(data['markerStrokes'])),
                }

                log.info(f"[PDFX DEBUG] Received marker strokes data: {json.dumps(marker_stats)}")

                if marker_stats['is_dict']:
                    # Count total strokes
                    stroke_count = 0
                    page_count = 0

                    for page, strokes in data['markerStrokes'].items():
                        if isinstance(strokes, list):
                            stroke_count += len(strokes)
                            page_count += 1

                    marker_stats['page_count'] = page_count
                    marker_stats['stroke_count'] = stroke_count
                    marker_stats['pages'] = list(data['markerStrokes'].keys())

                    log.info(f"[PDFX DEBUG] Marker strokes details: {json.dumps(marker_stats)}")

                    # Save the marker strokes
                    self.marker_strokes = data['markerStrokes']
                    log.info(f"[PDFX SCRIBBLE] Updated marker strokes: {json.dumps(marker_stats)}")

                    # Add timestamp for tracking
                    self.marker_strokes['_last_saved'] = datetime.utcnow().isoformat()

                    # Attempt to save to MongoDB (this happens automatically with the XBlock field system)
                    log.info(f"[PDFX SCRIBBLE] Saved marker_strokes to MongoDB for user {self.scope_ids.user_id}")
                else:
                    log.warning(f"[PDFX DEBUG] Received invalid markerStrokes: {json.dumps(marker_stats)}")

                    # Attempt conversion
                    try:
                        if hasattr(data['markerStrokes'], '__dict__'):
                            self.marker_strokes = data['markerStrokes'].__dict__
                            self.marker_strokes['_last_saved'] = datetime.utcnow().isoformat()
                            log.info(f"[PDFX DEBUG] Converted markerStrokes from object to dictionary")
                        else:
                            # Try string conversion if it's a JSON string
                            if isinstance(data['markerStrokes'], str):
                                try:
                                    parsed = json.loads(data['markerStrokes'])
                                    if isinstance(parsed, dict):
                                        self.marker_strokes = parsed
                                        self.marker_strokes['_last_saved'] = datetime.utcnow().isoformat()
                                        log.info(f"[PDFX DEBUG] Converted markerStrokes from JSON string to dictionary")
                                    else:
                                        self.marker_strokes = {}
                                        log.warning(f"[PDFX DEBUG] markerStrokes JSON string did not contain a dictionary")
                                except json.JSONDecodeError:
                                    self.marker_strokes = {}
                                    log.warning(f"[PDFX DEBUG] markerStrokes string was not valid JSON")
                            else:
                                self.marker_strokes = {}
                                log.warning(f"[PDFX DEBUG] Could not convert markerStrokes to dictionary. Type: {type(data['markerStrokes'])}")
                    except Exception as conversion_error:
                        self.marker_strokes = {}
                        log.error(f"[PDFX DEBUG] Error converting markerStrokes: {str(conversion_error)}", exc_info=True)

            # Update text annotations
            if 'textAnnotations' in data:
                text_stats = {
                    'is_dict': isinstance(data['textAnnotations'], dict),
                    'type': str(type(data['textAnnotations'])),
                }

                log.info(f"[PDFX DEBUG] Received text annotations data: {json.dumps(text_stats)}")

                if text_stats['is_dict']:
                    # Save the text annotations
                    self.text_annotations = data['textAnnotations']
                    log.info(f"[PDFX TEXT] Updated text annotations")

                    # Add timestamp for tracking
                    self.text_annotations['_last_saved'] = datetime.utcnow().isoformat()
                else:
                    log.warning(f"[PDFX DEBUG] Received invalid textAnnotations: {json.dumps(text_stats)}")

            # Update shape annotations
            if 'shapeAnnotations' in data:
                shape_stats = {
                    'is_dict': isinstance(data['shapeAnnotations'], dict),
                    'type': str(type(data['shapeAnnotations'])),
                }

                log.info(f"[PDFX DEBUG] Received shape annotations data: {json.dumps(shape_stats)}")

                if shape_stats['is_dict']:
                    # Save the shape annotations
                    self.shape_annotations = data['shapeAnnotations']
                    log.info(f"[PDFX SHAPE] Updated shape annotations")

                    # Add timestamp for tracking
                    self.shape_annotations['_last_saved'] = datetime.utcnow().isoformat()
                else:
                    log.warning(f"[PDFX DEBUG] Received invalid shapeAnnotations: {json.dumps(shape_stats)}")

            # Update note annotations
            if 'noteAnnotations' in data:
                note_stats = {
                    'is_dict': isinstance(data['noteAnnotations'], dict),
                    'type': str(type(data['noteAnnotations'])),
                }

                log.info(f"[PDFX DEBUG] Received note annotations data: {json.dumps(note_stats)}")

                if note_stats['is_dict']:
                    # Save the note annotations
                    self.note_annotations = data['noteAnnotations']
                    log.info(f"[PDFX NOTE] Updated note annotations")

                    # Add timestamp for tracking
                    self.note_annotations['_last_saved'] = datetime.utcnow().isoformat()
                else:
                    log.warning(f"[PDFX DEBUG] Received invalid noteAnnotations: {json.dumps(note_stats)}")

            log.info(f"[PDFX DEBUG] Successfully saved all annotations for block {self.block_id}, user {self.scope_ids.user_id}")
            return {'result': 'success', 'saved_at': datetime.utcnow().isoformat()}
        except Exception as e:
            log.error(f"[PDFX DEBUG] Error saving annotations: {str(e)}", exc_info=True)
            return {'result': 'error', 'message': str(e)}

    @XBlock.json_handler
    def get_user_highlights(self, data, suffix=''):
        """
        Retrieve user highlights and annotations from XBlock storage.
        """
        try:
            # Get user ID
            user_id = str(self.scope_ids.user_id)
            log.debug(f"Getting highlights and annotations for user {user_id}")

            # Get user highlights
            highlights = self.retrieve_user_highlights(user_id)
            log.debug(f"Found {sum(len(page_highlights) for page_highlights in highlights.values() if isinstance(page_highlights, list))} highlights for user {user_id}")

            # Get marker strokes
            marker_strokes = self.marker_strokes if hasattr(self, 'marker_strokes') else {}

            # Get text annotations
            text_annotations = self.text_annotations if hasattr(self, 'text_annotations') else {}

            # Get shape annotations
            shape_annotations = self.shape_annotations if hasattr(self, 'shape_annotations') else {}

            # Get note annotations
            note_annotations = self.note_annotations if hasattr(self, 'note_annotations') else {}

            # If staff, also add staff highlights
            if self.is_staff_user() and data.get('includeAll'):
                log.debug("User is staff, including all highlights")
                all_highlights = self.get_all_user_highlights()
                return {
                    'result': 'success',
                    'highlights': highlights,
                    'allHighlights': all_highlights,
                    'markerStrokes': marker_strokes,
                    'textAnnotations': text_annotations,
                    'shapeAnnotations': shape_annotations,
                    'noteAnnotations': note_annotations
                }

            return {
                'result': 'success',
                'highlights': highlights,
                'markerStrokes': marker_strokes,
                'textAnnotations': text_annotations,
                'shapeAnnotations': shape_annotations,
                'noteAnnotations': note_annotations
            }
        except Exception as e:
            log.error(f"Error retrieving user highlights and annotations: {str(e)}", exc_info=True)
            return {
                'result': 'error',
                'message': str(e),
                'highlights': self.user_highlights,  # Fallback to user state
                'markerStrokes': self.marker_strokes if hasattr(self, 'marker_strokes') else {},
                'textAnnotations': self.text_annotations if hasattr(self, 'text_annotations') else {},
                'shapeAnnotations': self.shape_annotations if hasattr(self, 'shape_annotations') else {},
                'noteAnnotations': self.note_annotations if hasattr(self, 'note_annotations') else {}
            }

    @XBlock.json_handler
    def delete_highlight(self, data, suffix=''):
        """
        Delete a highlight from storage.
        """
        if not data or 'highlightId' not in data:
            log.warning("Delete highlight attempt with no highlightId provided")
            return {'result': 'error', 'message': 'No highlight ID provided'}

        try:
            highlight_id = data['highlightId']
            user_id = str(self.scope_ids.user_id)
            log.debug(f"Deleting highlight {highlight_id} for user {user_id}")

            # Delete from storage
            success = self.delete_highlight(user_id, highlight_id)

            if success:
                log.info(f"Successfully deleted highlight {highlight_id}")
                return {'result': 'success'}
            else:
                log.warning(f"Failed to delete highlight {highlight_id}")
                return {'result': 'error', 'message': 'Failed to delete highlight'}
        except Exception as e:
            log.error(f"Error deleting highlight: {str(e)}", exc_info=True)
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
            worker_url = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs'
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

    def get_javascript_files(self):
        """Return the JavaScript files needed for our XBlock."""
        javascript_files = [
            'js/vendor/jquery-3.5.1.min.js',
            'js/vendor/pdf.js',
            'js/vendor/pdf.worker.js',
            'js/vendor/fabric.min.js',
            'js/src/pdfx_fix_canvas.js',  # Add our new canvas fix script early
            'js/src/pdfx_modules.js',
            'js/src/pdfx_init.js',
            'js/src/pdfx_tools_common.js',
            'js/src/pdfx_highlight.js',
            'js/src/pdfx_scribble.js',
            'js/src/pdfx_scribble_init.js',
            'js/src/pdfx_text.js',
            'js/src/pdfx_shape.js',
            'js/src/pdfx_note.js',
            'js/src/pdfx_drawing.js',
            'js/src/pdfx_storage.js',
            'js/src/pdfx_debug_utils.js',
        ]
        return javascript_files
