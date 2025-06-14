"""PDF Viewer XBlock - ES6 Implementation"""

import json
import logging
import uuid
from importlib.resources import files
from web_fragments.fragment import Fragment
from xblock.core import XBlock
from xblock.fields import Scope, String, Dict, Boolean, Integer

log = logging.getLogger(__name__)


@XBlock.needs("user")
@XBlock.needs("i18n")
class PdfxXBlock(XBlock):
    """
    ES6 implementation of the PDF XBlock using the new ES6 modules architecture.
    Provides an advanced PDF reader with features such as scribbling, highlighting,
    drawing shapes, and clearing annotations.
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
        help="Name of the PDF file for display purposes",
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

    # Store student's annotations
    annotations = Dict(
        help="Student's annotations on the PDF",
        scope=Scope.user_state,
        default={}
    )

    # Store student's drawing strokes
    drawing_strokes = Dict(
        help="Student's drawing strokes on the PDF",
        scope=Scope.user_state,
        default={}
    )

    # Store student's highlights
    highlights = Dict(
        help="Student's highlights on the PDF",
        scope=Scope.user_state,
        default={}
    )

    # Store marker strokes
    marker_strokes = Dict(
        help="Marker strokes data",
        scope=Scope.user_state,
        default={}
    )

    # Store text annotations
    text_annotations = Dict(
        help="Text annotations data",
        scope=Scope.user_state,
        default={}
    )

    # Store shape annotations
    shape_annotations = Dict(
        help="Shape annotations data",
        scope=Scope.user_state,
        default={}
    )

    # Store note annotations
    note_annotations = Dict(
        help="Note annotations data",
        scope=Scope.user_state,
        default={}
    )

    # Store staff highlights (visible to all students)
    staff_highlights = Dict(
        help="Staff highlights visible to all students",
        scope=Scope.content,
        default={}
    )

    # Store student's current page
    current_page = Integer(
        help="Current page number in the PDF",
        scope=Scope.user_state,
        default=1
    )

    # Store display settings
    brightness = Integer(
        help="PDF brightness setting",
        scope=Scope.user_state,
        default=100
    )

    is_grayscale = Boolean(
        help="Whether PDF is in grayscale mode",
        scope=Scope.user_state,
        default=False
    )

    # Block ID for unique identification
    block_id = String(
        help="Unique block identifier",
        scope=Scope.settings,
        default=""
    )

    # Store the file path for uploaded PDF files
    pdf_file_path = String(
        help="Storage path for uploaded PDF files",
        scope=Scope.settings,
        default=""
    )

    # Store the asset key for uploaded PDF files (Open edX contentstore)
    pdf_file_asset_key = String(
        display_name="PDF File Asset Key",
        help="Asset key for the uploaded PDF file in course assets",
        scope=Scope.settings,
        default=""
    )

    # Non-editable metadata fields - fields that Studio should not show in editor
    non_editable_metadata_fields = (
        'annotations', 'drawing_strokes', 'highlights', 'marker_strokes',
        'text_annotations', 'shape_annotations', 'note_annotations',
        'staff_highlights', 'current_page', 'brightness', 'is_grayscale',
        'block_id'
    )

    def resource_string(self, path):
        """Handy helper for getting resources from our kit."""
        return files(__package__).joinpath(path).read_text(encoding="utf-8")

    def get_user_info(self):
        """Get current user information using proper Open edX user service"""
        try:
            # Use the user service to get current user
            user_service = self.runtime.service(self, 'user')
            if user_service:
                current_user = user_service.get_current_user()
                if current_user and hasattr(current_user, 'opt_attrs'):
                    # Extract user information from user service
                    user_id = current_user.opt_attrs.get('edx-platform.user_id')
                    username = current_user.opt_attrs.get('edx-platform.username', '')
                    is_authenticated = current_user.opt_attrs.get('edx-platform.is_authenticated', False)

                    if user_id and is_authenticated:
                        log.info(f"[PdfxXBlock] get_user_info - Found authenticated user: {username} (ID: {user_id})")
                        # Try to get email from user service or Django user
                        email = ''
                        try:
                            # Try to get the real Django user object for email
                            if hasattr(user_service, 'get_user_by_anonymous_id'):
                                anonymous_id = current_user.opt_attrs.get('edx-platform.anonymous_user_id')
                                if anonymous_id:
                                    django_user = user_service.get_user_by_anonymous_id(anonymous_id)
                                    if django_user and hasattr(django_user, 'email'):
                                        email = django_user.email
                        except Exception as e:
                            log.warning(f"[PdfxXBlock] get_user_info - Could not get email: {e}")

                        return {
                            'id': str(user_id),
                            'username': username,
                            'email': email
                        }
                    else:
                        log.info(f"[PdfxXBlock] get_user_info - User not authenticated or no user ID")

            # Fallback: try to get user from runtime directly
            if hasattr(self.runtime, 'user') and self.runtime.user:
                user = self.runtime.user
                if hasattr(user, 'id') and user.id and user.is_authenticated:
                    log.info(f"[PdfxXBlock] get_user_info - Found user from runtime: {getattr(user, 'username', '')} (ID: {user.id})")
                    return {
                        'id': str(user.id),
                        'username': getattr(user, 'username', ''),
                        'email': getattr(user, 'email', '')
                    }

        except Exception as e:
            log.error(f"[PdfxXBlock] get_user_info - Error getting user info: {e}")

        log.warning(f"[PdfxXBlock] get_user_info - Falling back to anonymous user")
        return {
            'id': 'anonymous',
            'username': '',
            'email': ''
        }

    def get_course_info(self):
        """Get current course information"""
        try:
            course_id = getattr(self.runtime, 'course_id', None)
            if course_id:
                return {'id': str(course_id)}
        except:
            pass

        return {'id': ''}

    def get_pdf_url(self):
        """Get the PDF URL, handling both direct URLs and file uploads"""
        log.info(f"[PdfxXBlock] get_pdf_url - START")
        log.info(f"[PdfxXBlock] get_pdf_url - pdf_file_asset_key: '{getattr(self, 'pdf_file_asset_key', 'N/A')}'")
        log.info(f"[PdfxXBlock] get_pdf_url - pdf_url field: '{self.pdf_url}'")
        log.info(f"[PdfxXBlock] get_pdf_url - pdf_file_path: '{getattr(self, 'pdf_file_path', 'N/A')}'")
        log.info(f"[PdfxXBlock] get_pdf_url - pdf_file_name: '{self.pdf_file_name}'")

        # **PRIORITY 1: Check for Open edX asset key (uploaded files)**
        if hasattr(self, 'pdf_file_asset_key') and self.pdf_file_asset_key:
            log.info(f"[PdfxXBlock] get_pdf_url - Using asset key: {self.pdf_file_asset_key}")

            # The asset key should already be in the correct format from upload
            asset_url = self.pdf_file_asset_key

            # If it's a relative URL, make it absolute
            if asset_url.startswith('/'):
                try:
                    # Try to get LMS base URL from Django settings
                    from django.conf import settings
                    lms_base = getattr(settings, 'LMS_BASE', None)
                    if lms_base:
                        protocol = 'https' if getattr(settings, 'HTTPS', 'on') == 'on' else 'http'
                        asset_url = f"{protocol}://{lms_base}{asset_url}"
                        log.info(f"[PdfxXBlock] get_pdf_url - Made asset URL absolute: {asset_url}")
                except Exception as e:
                    log.warning(f"[PdfxXBlock] get_pdf_url - Could not make asset URL absolute: {e}")

            log.info(f"[PdfxXBlock] get_pdf_url - Returning asset URL: {asset_url}")
            return asset_url

        log.info(f"[PdfxXBlock] get_pdf_url - No asset key, checking pdf_url field")

        # **PRIORITY 2: Check for direct URL or data URL**
        if not self.pdf_url:
            log.warning(f"[PdfxXBlock] get_pdf_url - pdf_url field is empty/None")
            return ""

        url = self.pdf_url.strip()
        if not url:
            log.warning(f"[PdfxXBlock] get_pdf_url - pdf_url field is empty after strip")
            return ""

        log.info(f"[PdfxXBlock] get_pdf_url - Processing URL: {url}")

        # Handle data URLs (base64 encoded files from uploads)
        if url.startswith('data:application/pdf;base64,'):
            log.info(f"[PdfxXBlock] get_pdf_url - Returning data URL (length: {len(url)})")
            return url

        # Handle Open edX asset URLs (asset-v1:...)
        if 'asset-v1' in url:
            # If it's already an absolute URL, return as is
            if url.startswith(('http://', 'https://')):
                return url
            # If it's a relative URL, make it absolute
            if url.startswith('/'):
                try:
                    # Try to get the current request to build absolute URL
                    request = getattr(self.runtime, 'request', None)
                    if request:
                        base_url = f"{request.scheme}://{request.get_host()}"
                        return base_url + url
                    else:
                        # Fallback - assume HTTPS
                        return f"https://{self.runtime.hostname if hasattr(self.runtime, 'hostname') else 'localhost'}{url}"
                except:
                    # If we can't get request info, return the relative URL as is
                    return url
            return url

        # Handle relative URLs (starting with /)
        if url.startswith('/'):
            try:
                request = getattr(self.runtime, 'request', None)
                if request:
                    base_url = f"{request.scheme}://{request.get_host()}"
                    return base_url + url
                else:
                    # Fallback
                    return f"https://localhost{url}"
            except:
                return url

        # Handle URLs without protocol
        if not url.startswith(('http://', 'https://', 'ftp://', 'data:')):
            return f"https://{url}"

        # Return as is if it's already a complete URL
        log.info(f"[PdfxXBlock] get_pdf_url - Returning complete URL: {url}")
        return url

    def is_staff_user(self):
        """Check if current user is staff"""
        try:
            # First try to get from user service
            user_service = self.runtime.service(self, 'user')
            if user_service:
                current_user = user_service.get_current_user()
                if current_user and hasattr(current_user, 'opt_attrs'):
                    is_staff = current_user.opt_attrs.get('edx-platform.user_is_staff', False)
                    is_global_staff = current_user.opt_attrs.get('edx-platform.user_is_global_staff', False)
                    user_role = current_user.opt_attrs.get('edx-platform.user_role', '')

                    # User is staff if they have staff flag, global staff flag, or instructor/staff role
                    staff_status = is_staff or is_global_staff or user_role in ('staff', 'instructor')
                    log.info(f"[PdfxXBlock] is_staff_user - Staff status: {staff_status} (is_staff: {is_staff}, is_global_staff: {is_global_staff}, role: {user_role})")
                    return staff_status

            # Fallback to runtime attribute
            if hasattr(self.runtime, 'user_is_staff'):
                staff_status = getattr(self.runtime, 'user_is_staff', False)
                log.info(f"[PdfxXBlock] is_staff_user - Staff status from runtime: {staff_status}")
                return staff_status

            log.warning(f"[PdfxXBlock] is_staff_user - Could not determine staff status, defaulting to False")
            return False
        except Exception as e:
            log.error(f"[PdfxXBlock] is_staff_user - Error checking staff status: {e}")
            return False

    def retrieve_user_highlights(self, user_id):
        """Retrieve highlights for a specific user"""
        return self.highlights.get(user_id, {}) if isinstance(self.highlights, dict) else {}

    def get_all_user_highlights(self):
        """Get highlights from all users (staff view)"""
        if isinstance(self.highlights, dict):
            all_highlights = {}
            for user_id, user_highlights in self.highlights.items():
                for page, page_highlights in user_highlights.items():
                    if page not in all_highlights:
                        all_highlights[page] = []
                    all_highlights[page].extend(page_highlights)
            return all_highlights
        return {}

    def student_view(self, context=None):
        """
        The primary view using ES6 modules implementation.
        """
        import json  # Move json import to the top to avoid UnboundLocalError

        log.info(f"[PdfxXBlock] STUDENT_VIEW START - Block: {getattr(self, 'location', 'unknown')}")
        log.info(f"[PdfxXBlock] STUDENT_VIEW - Context: {context}")
        log.info(f"[PdfxXBlock] STUDENT_VIEW - Current block_id field: '{self.block_id}'")

        # Track initial field state
        initial_fields = {
            'block_id': self.block_id,
            'pdf_url': self.pdf_url,
            'display_name': self.display_name
        }
        log.info(f"[PdfxXBlock] STUDENT_VIEW - Initial field values: {initial_fields}")

        # Generate a working block ID for JavaScript - only save to field if it's truly empty
        working_block_id = self.block_id
        if not working_block_id:
            # Generate a deterministic ID based on location for consistency across page loads
            import hashlib
            location_str = str(getattr(self, 'location', 'unknown'))
            temp_id = hashlib.md5(location_str.encode()).hexdigest()[:8]
            log.info(f"[PdfxXBlock] STUDENT_VIEW - Generated deterministic temp_id: {temp_id} from location: {location_str}")

            # Only save to field if we're in a normal context (not Studio preview)
            try:
                # Check if we can safely set fields before attempting
                runtime_type = type(self.runtime).__name__
                is_studio_context = 'Studio' in runtime_type or 'Caching' in runtime_type

                if not is_studio_context and hasattr(self, '_field_data') and hasattr(self._field_data, 'set'):
                    log.info(f"[PdfxXBlock] STUDENT_VIEW - Attempting to save block_id to field")
                    self.block_id = temp_id
                    working_block_id = temp_id
                    log.info(f"[PdfxXBlock] STUDENT_VIEW - Successfully saved block_id: {temp_id}")
                else:
                    working_block_id = temp_id
                    log.info(f"[PdfxXBlock] STUDENT_VIEW - Using temp block_id (Studio context): {temp_id}")
            except Exception as e:
                # If we can't save (e.g., in preview mode), use temp ID
                working_block_id = temp_id
                log.warning(f"[PdfxXBlock] STUDENT_VIEW - Failed to save block_id, using temp: {temp_id}, error: {e}")

        # Use the same HTML template as the base class
        html = self.resource_string("static/html/pdfx.html")

        # Import Template from Mako
        from mako.template import Template
        template = Template(html)

        # Prepare context for template
        user_info = self.get_user_info()
        course_info = self.get_course_info()
        pdf_url = self.get_pdf_url()
        is_staff = self.is_staff_user()

        # Debug logging
        log.info(f"[PdfxXBlock] Block ID: {working_block_id}")
        log.info(f"[PdfxXBlock] Raw PDF URL field: '{self.pdf_url}'")
        log.info(f"[PdfxXBlock] Raw PDF URL length: {len(self.pdf_url) if self.pdf_url else 0}")
        log.info(f"[PdfxXBlock] PDF file asset key: '{getattr(self, 'pdf_file_asset_key', 'N/A')}'")
        log.info(f"[PdfxXBlock] PDF file path: '{getattr(self, 'pdf_file_path', 'N/A')}'")
        log.info(f"[PdfxXBlock] PDF file name: '{self.pdf_file_name}'")
        log.info(f"[PdfxXBlock] Allow download: {self.allow_download}")
        log.info(f"[PdfxXBlock] Allow annotation: {self.allow_annotation}")
        log.info(f"[PdfxXBlock] Processed PDF URL: '{pdf_url}'")
        log.info(f"[PdfxXBlock] Processed PDF URL length: {len(pdf_url) if pdf_url else 0}")
        log.info(f"[PdfxXBlock] User ID: {user_info.get('id', 'anonymous')}")
        log.info(f"[PdfxXBlock] Username: {user_info.get('username', 'anonymous')}")
        log.info(f"[PdfxXBlock] User Email: {user_info.get('email', 'none')}")
        log.info(f"[PdfxXBlock] Is Staff: {is_staff}")
        log.info(f"[PdfxXBlock] Course ID: {course_info.get('id', 'none')}")

        # Detailed user service debug
        try:
            user_service = self.runtime.service(self, 'user')
            if user_service:
                current_user = user_service.get_current_user()
                if current_user and hasattr(current_user, 'opt_attrs'):
                    log.info(f"[PdfxXBlock] User service available - opt_attrs keys: {list(current_user.opt_attrs.keys())}")
                    log.info(f"[PdfxXBlock] User authenticated: {current_user.opt_attrs.get('edx-platform.is_authenticated', False)}")
                else:
                    log.warning(f"[PdfxXBlock] User service available but no current_user or opt_attrs")
            else:
                log.warning(f"[PdfxXBlock] User service not available")
        except Exception as user_debug_error:
            log.error(f"[PdfxXBlock] Error in user service debug: {user_debug_error}")

        # Validate PDF URL
        if not pdf_url:
            log.warning(f"[PdfxXBlock] No PDF URL provided for block {working_block_id}")
            log.warning(f"[PdfxXBlock] Raw pdf_url field: '{self.pdf_url}'")
            log.warning(f"[PdfxXBlock] Raw pdf_url length: {len(self.pdf_url) if self.pdf_url else 0}")
            log.warning(f"[PdfxXBlock] PDF file name: '{self.pdf_file_name}'")
            log.warning(f"[PdfxXBlock] PDF file path: '{getattr(self, 'pdf_file_path', 'N/A')}'")
            log.warning(f"[PdfxXBlock] PDF file asset key: '{getattr(self, 'pdf_file_asset_key', 'N/A')}'")

            # Instead of returning a different fragment, let's continue with the normal template
            # but use an empty PDF URL - this will allow the template to render properly
            # and the JavaScript to handle the "no PDF" case gracefully
            pdf_url = ""  # Ensure it's an empty string, not None
            log.info(f"[PdfxXBlock] Continuing with empty PDF URL to render proper template")

        # Log PDF configuration status
        if pdf_url:
            log.info(f"[PdfxXBlock] ✅ PDF successfully configured for block {working_block_id}")
            if getattr(self, 'pdf_file_path', ''):
                log.info(f"[PdfxXBlock] ✅ PDF source: Uploaded file (stored at: {self.pdf_file_path})")
            elif pdf_url.startswith('data:application/pdf'):
                log.info(f"[PdfxXBlock] ✅ PDF source: Uploaded file (data URL, length: {len(pdf_url)})")
            else:
                log.info(f"[PdfxXBlock] ✅ PDF source: External URL - {pdf_url}")
            log.info(f"[PdfxXBlock] ✅ PDF file name: {self.pdf_file_name}")
        else:
            log.warning(f"[PdfxXBlock] ⚠️ PDF NOT configured for block {working_block_id} - will render with empty PDF URL")

        log.info(f"[PdfxXBlock] ✅ Allow download: {self.allow_download}")
        log.info(f"[PdfxXBlock] ✅ Allow annotation: {self.allow_annotation}")

        # Check for field changes before proceeding
        current_fields = {
            'block_id': self.block_id,
            'pdf_url': self.pdf_url,
            'display_name': self.display_name
        }
        if current_fields != initial_fields:
            log.warning(f"[PdfxXBlock] STUDENT_VIEW - Field values changed during rendering!")
            log.warning(f"[PdfxXBlock] STUDENT_VIEW - Initial: {initial_fields}")
            log.warning(f"[PdfxXBlock] STUDENT_VIEW - Current: {current_fields}")

        # Get PDF file name
        if self.pdf_file_name:
            pdf_file_name = self.pdf_file_name
        elif pdf_url:
            try:
                from urllib.parse import urlparse
                import os
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

        # Get highlights based on user type
        if is_staff:
            highlights_to_display = self.get_all_user_highlights()
        else:
            highlights_to_display = self.retrieve_user_highlights(user_info['id'])
            if self.staff_highlights:
                for page, page_highlights in self.staff_highlights.items():
                    if page not in highlights_to_display:
                        highlights_to_display[page] = []
                    highlights_to_display[page].extend(page_highlights)

        # Get annotation data
        marker_strokes_data = self.marker_strokes or {}
        text_annotations_data = self.text_annotations or {}
        shape_annotations_data = self.shape_annotations or {}
        note_annotations_data = self.note_annotations or {}

        # Get save URL
        save_url = self.runtime.handler_url(self, 'save_annotations')

        # Pre-serialize JSON data to avoid scope issues in f-strings
        # Use HTML escaping to prevent quotes from breaking HTML attributes
        import html
        allow_download_json = html.escape(json.dumps(self.allow_download))
        allow_annotation_json = html.escape(json.dumps(self.allow_annotation))
        annotations_json = html.escape(json.dumps(self.annotations))
        drawing_strokes_json = html.escape(json.dumps(self.drawing_strokes))
        highlights_json = html.escape(json.dumps(highlights_to_display))
        marker_strokes_json = html.escape(json.dumps(marker_strokes_data))
        text_annotations_json = html.escape(json.dumps(text_annotations_data))
        shape_annotations_json = html.escape(json.dumps(shape_annotations_data))
        note_annotations_json = html.escape(json.dumps(note_annotations_data))
        document_info_json = html.escape(json.dumps(document_info))

        # Debug the JSON serialization
        log.info(f"[PdfxXBlock] JSON SERIALIZATION DEBUG:")
        log.info(f"  - Raw drawing_strokes: {self.drawing_strokes}")
        log.info(f"  - JSON dumped: {json.dumps(self.drawing_strokes)}")
        log.info(f"  - HTML escaped: {drawing_strokes_json}")
        log.info(f"  - Length of escaped JSON: {len(drawing_strokes_json)}")

        # Render template with context
        template_context = {
            'block': self,
            'block_id': working_block_id,
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
            # Add JSON data for JavaScript
            'saved_annotations_json': annotations_json,
            'drawing_strokes_json': drawing_strokes_json,
            'highlights_json': highlights_json,
            'marker_strokes_json': marker_strokes_json,
            'text_annotations_json': text_annotations_json,
            'shape_annotations_json': shape_annotations_json,
            'note_annotations_json': note_annotations_json,
        }

        # Debug the template context
        log.info(f"[PdfxXBlock] TEMPLATE CONTEXT:")
        log.info(f"  - block_id: '{template_context['block_id']}'")
        log.info(f"  - pdf_url: '{template_context['pdf_url']}'")
        log.info(f"  - allow_download: {template_context['allow_download']}")
        log.info(f"  - allow_annotation: {template_context['allow_annotation']}")
        log.info(f"  - user_id: '{template_context['user_id']}'")
        log.info(f"  - course_id: '{template_context['course_id']}'")
        log.info(f"  - current_page: {template_context['current_page']}")

        # Debug annotation data being passed
        log.info(f"[PdfxXBlock] ANNOTATION DATA:")
        log.info(f"  - drawing_strokes: {len(self.drawing_strokes)} pages")
        log.info(f"  - drawing_strokes content: {self.drawing_strokes}")
        log.info(f"  - highlights: {len(highlights_to_display)} pages")
        log.info(f"  - saved_annotations: {len(self.annotations)} items")

        rendered_html = template.render(**template_context)
        frag = Fragment(rendered_html)

        # Add CSS

        frag.add_css(self.resource_string("static/css/pdfx.css"))
        frag.add_css(self.resource_string("static/css/pdf_viewer.min.css"))
        frag.add_css_url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css')

        # Add external library dependencies
        # Load PDF.js using custom loader to handle ES modules properly
        frag.add_javascript(self.resource_string("static/js/pdf-loader.js"))

        # Load Fabric.js from local vendor file
        frag.add_javascript(self.resource_string("static/js/vendor/fabric.min.js"))

        # Add the PDF XBlock implementation
        frag.add_javascript(self.resource_string("static/js/build/pdfx-xblock.js"))

        # Add the initialization script
        frag.add_javascript(self.resource_string("static/js/pdfx-init.js"))

        # Add data element for JavaScript access
        data_html = f"""
        <div id="pdfx-data-{working_block_id}"
            data-block-id="{working_block_id}"
            data-user-id="{user_info['id']}"
            data-course-id="{course_info['id']}"
            data-handler-url="{save_url}"
            data-marker-strokes='{marker_strokes_json}'
            data-text-annotations='{text_annotations_json}'
            data-shape-annotations='{shape_annotations_json}'
            data-note-annotations='{note_annotations_json}'
            data-document-info='{document_info_json}'
            style="display:none;">
        </div>
        """
        frag.add_resource(data_html, mimetype='text/html')

        # Final field check
        final_fields = {
            'block_id': self.block_id,
            'pdf_url': self.pdf_url,
            'display_name': self.display_name
        }
        if final_fields != initial_fields:
            log.warning(f"[PdfxXBlock] STUDENT_VIEW - Final field values changed!")
            log.warning(f"[PdfxXBlock] STUDENT_VIEW - Initial: {initial_fields}")
            log.warning(f"[PdfxXBlock] STUDENT_VIEW - Final: {final_fields}")

        log.info(f"[PdfxXBlock] STUDENT_VIEW END - Successfully created fragment")
        return frag

    def author_view(self, context=None):
        """
        The author view for Studio preview - shows configuration summary.
        This is used when instructors preview the component in Studio.
        This view should NOT try to display the actual PDF viewer.
        """
        import json  # Ensure json is available for this method

        log.info(f"[PdfxXBlock] AUTHOR_VIEW START - Block: {getattr(self, 'location', 'unknown')}")
        log.info(f"[PdfxXBlock] AUTHOR_VIEW - Context: {context}")

        # Generate a temporary block ID for display purposes only (don't save to field)
        display_block_id = self.block_id if self.block_id else 'preview-' + str(hash(str(self.location)))[:8]
        log.info(f"[PdfxXBlock] AUTHOR_VIEW - Display block ID: {display_block_id}")

        # Get basic info without triggering saves
        try:
            pdf_url = self.get_pdf_url()
            log.info(f"[PdfxXBlock] AUTHOR_VIEW - PDF URL: '{pdf_url}'")
        except Exception as e:
            log.error(f"[PdfxXBlock] AUTHOR_VIEW - Error getting PDF URL: {e}")
            pdf_url = ""

        # If no PDF URL, show configuration message
        if not pdf_url:
            log.info(f"[PdfxXBlock] AUTHOR_VIEW - No PDF URL, showing configuration message")
            error_html = """
            <div class="pdfx-studio-preview" style="padding: 20px; text-align: center; border: 2px dashed #ccc; background: #f9f9f9; margin: 10px;">
                <h3>📄 PDF Viewer Component</h3>
                <p>This component will display a PDF with annotation capabilities.</p>
                <p><strong>Configuration needed:</strong> Please edit this component and provide a PDF URL or upload a PDF file.</p>
                <div style="margin-top: 15px; padding: 10px; background: #e8f4fd; border-left: 4px solid #0073e6;">
                    <strong>Features:</strong> PDF viewing, highlighting, drawing, text annotations, shapes, and notes.
                </div>
            </div>
            """

            error_frag = Fragment(error_html)
            # Add Font Awesome for icons
            error_frag.add_css_url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css')

            log.info(f"[PdfxXBlock] AUTHOR_VIEW END - Returning configuration message")
            return error_frag

        # Create a configuration summary preview for Studio
        log.info(f"[PdfxXBlock] AUTHOR_VIEW - Creating Studio preview HTML")

        # Determine PDF source type
        pdf_source_info = ""
        if pdf_url.startswith('data:application/pdf'):
            pdf_source_info = "📁 Uploaded PDF File"
        else:
            pdf_source_info = f"🔗 External URL: {pdf_url[:50]}{'...' if len(pdf_url) > 50 else ''}"

        preview_html = f"""
        <div class="pdfx-studio-preview" style="padding: 20px; border: 1px solid #ddd; background: #fff; margin: 10px; font-family: 'Open Sans', Arial, sans-serif;">
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
                <i class="fas fa-file-pdf" style="font-size: 24px; color: #d32f2f; margin-right: 10px;"></i>
                <div>
                    <h3 style="margin: 0; color: #333; font-weight: 600;">PDF Viewer: {self.display_name}</h3>
                    <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">
                        {self.pdf_file_name or 'PDF Document'} |
                        Download: {'Enabled' if self.allow_download else 'Disabled'} |
                        Annotations: {'Enabled' if self.allow_annotation else 'Disabled'}
                    </p>
                </div>
            </div>

            <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin-bottom: 15px;">
                <strong>PDF Source:</strong> {pdf_source_info}
            </div>

            <div style="background: #e8f5e8; padding: 15px; border-left: 4px solid #4caf50; border-radius: 0 4px 4px 0; margin-bottom: 15px;">
                <strong>✅ PDF Configured Successfully!</strong><br>
                <p style="margin: 5px 0 0 0; color: #2e7d32;">
                    This PDF viewer is ready for students. The full interactive PDF with annotation tools will be available in the LMS.
                </p>
            </div>

            <div style="background: #e8f4fd; padding: 10px; border-left: 4px solid #0073e6; border-radius: 0 4px 4px 0;">
                <strong>Studio Preview:</strong> This is a configuration summary.
                The actual PDF viewer with full annotation capabilities will load in the LMS student view.
            </div>

            <div style="margin-top: 15px; padding: 15px; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; background: #fafafa; border-radius: 4px;">
                <div style="text-align: center; color: #666;">
                    <i class="fas fa-eye" style="font-size: 32px; margin-bottom: 10px; display: block; color: #4caf50;"></i>
                    <p style="margin: 10px 0 5px 0; font-weight: bold; color: #4caf50;">Preview Mode</p>
                    <small>Full PDF functionality available in LMS</small>
                </div>
            </div>
        </div>
        """

        log.info(f"[PdfxXBlock] AUTHOR_VIEW - Creating Fragment")
        frag = Fragment(preview_html)

        # Add minimal CSS for Studio preview
        frag.add_css("""
        .pdfx-studio-preview {
            font-family: 'Open Sans', Arial, sans-serif;
        }
        .pdfx-studio-preview h3 {
            font-weight: 600;
        }
        .pdfx-studio-preview code {
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 12px;
        }
        """)

        # Add Font Awesome for icons
        frag.add_css_url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css')

        # Pre-serialize JSON data to avoid scope issues in f-strings
        has_pdf_url_json = json.dumps(bool(pdf_url))

        # Add minimal debug JavaScript for Studio
        frag.add_javascript(f"""
        // Studio Author View - Configuration Summary
        (function() {{
            'use strict';
            // Store Studio instance info
            window.PdfxStudioInstances = window.PdfxStudioInstances || {{}};
            window.PdfxStudioInstances['{display_block_id}'] = {{
                blockId: '{display_block_id}',
                hasPdfUrl: {has_pdf_url_json},
                mode: 'studio_preview',
                timestamp: new Date().toISOString()
            }};

        }})();
        """)

        log.info(f"[PdfxXBlock] AUTHOR_VIEW END - Successfully created fragment")
        return frag

    def studio_view(self, context=None):
        """
        The view for Studio configuration.
        This view is only for editing settings, not for displaying the PDF.
        """
        log.info(f"[PdfxXBlock] STUDIO_VIEW START - Block: {getattr(self, 'location', 'unknown')}")

        try:
            # Load the HTML template
            html = self.resource_string("static/html/pdfx_edit.html")

            # Import Template from Mako
            from mako.template import Template
            template = Template(html)

            # Render template with proper context
            template_context = {
                'block': self  # Pass the block instance as 'block'
            }

            rendered_html = template.render(**template_context)
            log.info(f"[PdfxXBlock] STUDIO_VIEW - Template rendered successfully")

            # Create fragment
            frag = Fragment(rendered_html)

            # Add CSS
            frag.add_css(self.resource_string("static/css/pdfx_edit.css"))

            # Add JavaScript
            frag.add_javascript(self.resource_string("static/js/build/pdfx-edit.js"))

            # Initialize JavaScript
            frag.initialize_js('PdfxXBlockEdit')

            log.info(f"[PdfxXBlock] STUDIO_VIEW END - Successfully created fragment")
            return frag

        except Exception as e:
            log.error(f"[PdfxXBlock] STUDIO_VIEW - Error creating studio view: {e}")
            log.error(f"[PdfxXBlock] STUDIO_VIEW - Error type: {type(e).__name__}")

            # Return a fallback error view
            error_html = f"""
            <div class="pdfx-studio-error" style="padding: 20px; border: 2px solid #d32f2f; background: #fff3f3; margin: 10px;">
                <h3 style="color: #d32f2f;">⚠️ Studio Edit Error</h3>
                <p><strong>Error:</strong> {str(e)}</p>
                <p>Unable to load the PDF Viewer edit interface.</p>
                <div style="margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
                    <strong>Troubleshooting:</strong><br>
                    • Check that all template files exist<br>
                    • Verify CSS and JavaScript resources are available<br>
                    • Review server logs for additional details
                </div>
            </div>
            """

            error_frag = Fragment(error_html)

            # Add debug JavaScript for studio error
            import json
            error_message = json.dumps(str(e))  # Properly escape the error message
            location = json.dumps(str(getattr(self, 'location', 'unknown')))  # Properly escape location

            error_frag.add_javascript(f"""
            console.error('[PdfxXBlock] 🚨 STUDIO_VIEW ERROR:', {error_message});
            console.error('[PdfxXBlock] 🚨 Block location:', {location});
            console.error('[PdfxXBlock] 🚨 Failed to load studio edit interface');

            // Store error info
            window.PdfxStudioErrors = window.PdfxStudioErrors || [];
            window.PdfxStudioErrors.push({{
                error: {error_message},
                location: {location},
                timestamp: new Date().toISOString()
            }});
            """)

            return error_frag

    @XBlock.handler
    def studio_submit(self, request, suffix=''):
        """
        Handle the Studio save and file uploads.
        """
        log.info(f"[PdfxXBlock] =================== STUDIO_SUBMIT START ===================")
        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Block: {getattr(self, 'location', 'unknown')}")
        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Request method: {request.method}")
        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Content type: {getattr(request, 'content_type', 'unknown')}")
        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Request path: {getattr(request, 'path', 'unknown')}")

        # Log detailed request information
        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Request details:")
        log.info(f"  - Request: {request.params}")
        log.info(f"  - Request method: {request.method}")
        log.info(f"  - Has POST: {hasattr(request, 'POST')}")
        log.info(f"  - Has FILES: {hasattr(request, 'FILES')}")

        if hasattr(request, 'POST'):
            log.info(f"  - POST keys: {list(request.POST.keys())}")
            for key, value in request.POST.items():
                if hasattr(value, 'name') and hasattr(value, 'size'):  # It's a file object
                    log.info(f"    - POST[{key}]: FILE - name='{value.name}', size={value.size}, type='{getattr(value, 'content_type', 'unknown')}'")
                elif len(str(value)) > 100:
                    log.info(f"    - POST[{key}]: {str(value)[:100]}... (truncated, length: {len(str(value))})")
                else:
                    log.info(f"    - POST[{key}]: {value}")

        if hasattr(request, 'FILES'):
            log.info(f"  - FILES keys: {list(request.FILES.keys())}")
            for key, file_obj in request.FILES.items():
                log.info(f"    - FILES[{key}]: name='{file_obj.name}', size={file_obj.size}, type='{file_obj.content_type}'")

        # Ensure backward compatibility fields exist
        if not hasattr(self, 'pdf_file_path'):
            log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Adding pdf_file_path field for backward compatibility")
            self.pdf_file_path = ""

        if not hasattr(self, 'pdf_file_asset_key'):
            log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Adding pdf_file_asset_key field for backward compatibility")
            self.pdf_file_asset_key = ""

        # Get user info (but don't enforce staff status in Studio context)
        user_info = self.get_user_info()
        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - User: {user_info.get('username', 'anonymous')} (ID: {user_info.get('id', 'anonymous')})")

        # Log current field values before update
        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - BEFORE UPDATE - Current field values:")
        log.info(f"  - display_name: '{self.display_name}'")
        log.info(f"  - pdf_url: '{self.pdf_url}' (length: {len(self.pdf_url) if self.pdf_url else 0})")
        log.info(f"  - pdf_file_name: '{self.pdf_file_name}'")
        log.info(f"  - pdf_file_path: '{getattr(self, 'pdf_file_path', 'N/A')}'")
        log.info(f"  - pdf_file_asset_key: '{getattr(self, 'pdf_file_asset_key', 'N/A')}'")
        log.info(f"  - allow_download: {self.allow_download}")
        log.info(f"  - allow_annotation: {self.allow_annotation}")

        try:
            # **STEP 1: DETECT FILE UPLOAD** - Check both FILES and POST for uploaded files
            uploaded_file = None
            form_data = {}

            log.info(f"[PdfxXBlock] STUDIO_SUBMIT - STEP 1: Detecting file upload...")

            # First check request.FILES (standard Django file upload location)
            if hasattr(request, 'FILES') and 'pdf_file' in request.FILES:
                uploaded_file = request.FILES['pdf_file']
                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ FILE UPLOAD DETECTED in FILES!")
                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - File details:")
                log.info(f"    - File name: '{uploaded_file.name}'")
                log.info(f"    - File size: {uploaded_file.size} bytes ({uploaded_file.size / (1024*1024):.2f} MB)")
                log.info(f"    - Content type: '{uploaded_file.content_type}'")
                log.info(f"    - File object type: {type(uploaded_file)}")

            # Also check request.POST for file objects (XBlock sometimes puts files here)
            elif hasattr(request, 'POST') and 'pdf_file' in request.POST:
                file_obj = request.POST['pdf_file']
                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Found object in POST[pdf_file]: {type(file_obj)}")

                # Check if it's a DjangoUploadedFile or similar file object
                # DjangoUploadedFile has different attributes than regular files
                if hasattr(file_obj, 'filename') or hasattr(file_obj, 'name'):
                    # Check for file-like behavior - DjangoUploadedFile specific
                    if (hasattr(file_obj, 'read') or
                        hasattr(file_obj, 'chunks') or
                        'UploadedFile' in str(type(file_obj)) or
                        hasattr(file_obj, 'content_type') or
                        hasattr(file_obj, 'file')):
                        uploaded_file = file_obj
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ FILE UPLOAD DETECTED in POST!")
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - File details:")

                        # Get filename properly for DjangoUploadedFile
                        actual_filename = getattr(uploaded_file, 'filename', getattr(uploaded_file, 'name', 'unknown.pdf'))
                        log.info(f"    - File name: '{actual_filename}'")

                        # DjangoUploadedFile has different size access patterns
                        file_size = 0
                        try:
                            if hasattr(uploaded_file, 'file') and hasattr(uploaded_file.file, 'size'):
                                file_size = uploaded_file.file.size
                            elif hasattr(uploaded_file, 'size'):
                                file_size = uploaded_file.size
                            elif hasattr(uploaded_file, '_size'):
                                file_size = uploaded_file._size
                            elif hasattr(uploaded_file, 'file'):
                                # Try to get size by seeking to end
                                current_pos = uploaded_file.file.tell()
                                uploaded_file.file.seek(0, 2)  # Seek to end
                                file_size = uploaded_file.file.tell()
                                uploaded_file.file.seek(current_pos)  # Restore position
                        except Exception as size_error:
                            log.warning(f"[PdfxXBlock] STUDIO_SUBMIT - Could not determine file size: {size_error}")

                        log.info(f"    - File size: {file_size} bytes ({file_size / (1024*1024):.2f} MB)")
                        log.info(f"    - Content type: '{getattr(uploaded_file, 'content_type', 'application/pdf')}'")
                        log.info(f"    - File object type: {type(uploaded_file)}")
                        log.info(f"    - Available attributes: {[attr for attr in dir(uploaded_file) if not attr.startswith('_')]}")
                        log.info(f"    - Has 'file' attribute: {hasattr(uploaded_file, 'file')}")
                        log.info(f"    - Has 'filename' attribute: {hasattr(uploaded_file, 'filename')}")
                        if hasattr(uploaded_file, 'file'):
                            log.info(f"    - File object type: {type(uploaded_file.file)}")
                            log.info(f"    - File object attributes: {[attr for attr in dir(uploaded_file.file) if not attr.startswith('_')][:10]}")
                    else:
                        log.warning(f"[PdfxXBlock] STUDIO_SUBMIT - POST[pdf_file] exists but doesn't have file-like attributes")
                        log.warning(f"    - Has 'read': {hasattr(file_obj, 'read')}")
                        log.warning(f"    - Has 'chunks': {hasattr(file_obj, 'chunks')}")
                        log.warning(f"    - Has 'content_type': {hasattr(file_obj, 'content_type')}")
                        log.warning(f"    - Has 'file': {hasattr(file_obj, 'file')}")
                        log.warning(f"    - Type: {type(file_obj)}")
                        log.warning(f"    - String representation: {str(file_obj)[:100]}")
                else:
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - POST[pdf_file] is not a file object")
                    log.info(f"    - Has 'name': {hasattr(file_obj, 'name')}")
                    log.info(f"    - Has 'filename': {hasattr(file_obj, 'filename')}")
                    log.info(f"    - Type: {type(file_obj)}")

            # Get form data from POST
            if hasattr(request, 'POST'):
                for key, value in request.POST.items():
                    # Skip file objects when collecting form data - check for file-like attributes
                    if not (hasattr(value, 'name') and ('UploadedFile' in str(type(value)) or hasattr(value, 'read'))):
                        form_data[key] = value
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Form field '{key}': '{value}'")

            # **CRITICAL CHECK: If no file uploaded, check for existing files or URL**
            if not uploaded_file:
                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - No new file uploaded, checking for existing files or URL...")
                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Available data in request:")
                log.info(f"    - request.FILES keys: {list(request.FILES.keys()) if hasattr(request, 'FILES') else 'No FILES'}")
                log.info(f"    - request.POST keys: {list(request.POST.keys()) if hasattr(request, 'POST') else 'No POST'}")

                # Check if user is providing a PDF URL
                pdf_url = form_data.get('pdf_url', '').strip()

                # Check for existing uploaded files in XBlock fields
                existing_asset_key = getattr(self, 'pdf_file_asset_key', '').strip()
                existing_file_path = getattr(self, 'pdf_file_path', '').strip()
                existing_file_name = getattr(self, 'pdf_file_name', '').strip()

                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Checking existing file data:")
                log.info(f"    - pdf_url from form: '{pdf_url}'")
                log.info(f"    - existing_asset_key: '{existing_asset_key}'")
                log.info(f"    - existing_file_path: '{existing_file_path}'")
                log.info(f"    - existing_file_name: '{existing_file_name}'")

                # We have valid configuration if any of these are true:
                # 1. User provided a PDF URL
                # 2. There's an existing asset key (contentstore file)
                # 3. There's an existing file path (Django storage file)
                # 4. There's an existing file name (any uploaded file)
                has_valid_pdf_source = (
                    pdf_url or
                    existing_asset_key or
                    existing_file_path or
                    existing_file_name
                )

                if pdf_url:
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ User provided PDF URL: '{pdf_url}'")
                elif existing_asset_key:
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ Found existing contentstore asset: '{existing_asset_key}'")
                elif existing_file_path:
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ Found existing file path: '{existing_file_path}'")
                elif existing_file_name:
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ Found existing file name: '{existing_file_name}'")

                if not has_valid_pdf_source:
                    log.error(f"[PdfxXBlock] STUDIO_SUBMIT - ❌ CRITICAL ERROR: No PDF source found!")
                    log.error(f"[PdfxXBlock] STUDIO_SUBMIT - This PDF viewer component requires either:")
                    log.error(f"    - A new PDF file upload, OR")
                    log.error(f"    - A PDF URL, OR")
                    log.error(f"    - An existing uploaded file")
                    return self._json_response({
                        'result': 'error',
                        'message': 'No PDF file uploaded and no PDF URL provided. This component requires either a PDF file upload or a valid PDF URL to function.'
                    })
                else:
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ Valid PDF source found, proceeding with configuration update...")

            if not uploaded_file and not form_data:
                log.warning(f"[PdfxXBlock] STUDIO_SUBMIT - ❌ No POST or FILES data found")
                return self._json_response({
                    'result': 'error',
                    'message': 'No form data received. Please try uploading the file again.'
                })

            # **STEP 2: PROCESS FILE UPLOAD**
            file_stored_successfully = False
            storage_path = None
            storage_method = None

            if uploaded_file:
                # Get the actual filename from DjangoUploadedFile
                actual_filename = getattr(uploaded_file, 'filename', uploaded_file.name)
                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - STEP 2: Processing file upload for '{actual_filename}'")

                try:
                    # **STEP 2A: VALIDATE PDF**
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - STEP 2A: Validating PDF file...")

                    # For DjangoUploadedFile, we need to read from the .file attribute
                    if hasattr(uploaded_file, 'file'):
                        file_content = uploaded_file.file.read()
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Read {len(file_content)} bytes from uploaded_file.file")
                    else:
                        # Fallback for other file types
                        file_content = uploaded_file.read()
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Read {len(file_content)} bytes from uploaded_file")

                    if not file_content.startswith(b'%PDF'):
                        log.error(f"[PdfxXBlock] STUDIO_SUBMIT - ❌ File validation failed: Not a valid PDF")
                        log.error(f"[PdfxXBlock] STUDIO_SUBMIT - File starts with: {file_content[:20]}")
                        return self._json_response({'result': 'error', 'message': 'Uploaded file is not a valid PDF'})

                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ PDF validation passed")

                    # Reset file pointer for storage (for DjangoUploadedFile, reset the .file)
                    if hasattr(uploaded_file, 'file'):
                        uploaded_file.file.seek(0)
                    else:
                        uploaded_file.seek(0)

                    # **STEP 2B: USE OPEN EDX CONTENTSTORE** (Only method we support)
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - STEP 2B: Using Open edX contentstore...")
                    try:
                        # Import Open edX contentstore modules
                        from xmodule.contentstore.django import contentstore
                        from xmodule.contentstore.content import StaticContent
                        from opaque_keys.edx.keys import AssetKey
                        import uuid

                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Successfully imported contentstore modules")

                        # Generate a unique filename
                        import os
                        safe_filename = actual_filename.replace(' ', '_')
                        unique_id = str(uuid.uuid4())[:8]
                        unique_filename = f"{unique_id}_{safe_filename}"

                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Generated unique filename: {unique_filename}")

                        # Get the course key from the XBlock's location
                        course_key = self.location.course_key
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Course key: {course_key}")

                        # Get content store
                        content_store = contentstore()
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Got contentstore: {type(content_store)}")

                        # Create asset path - use a simpler name pattern (same as example-pdf.py)
                        asset_path = f"pdfs_{unique_id}_{safe_filename}"
                        asset_key = StaticContent.compute_location(course_key, asset_path)
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Generated asset key: {asset_key}")

                        # Reset file pointer and read content again for storage
                        if hasattr(uploaded_file, 'file'):
                            uploaded_file.file.seek(0)
                            file_content = uploaded_file.file.read()
                        else:
                            uploaded_file.seek(0)
                            file_content = uploaded_file.read()
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Read file content for storage: {len(file_content)} bytes")

                        # Create the static content (same pattern as example-pdf.py)
                        content = StaticContent(
                            asset_key,
                            actual_filename,  # Use actual filename for display
                            'application/pdf',
                            file_content,
                            length=len(file_content)
                        )
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Created StaticContent object")

                        # Save the content to contentstore
                        content_store.save(content)
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ Successfully saved to contentstore!")

                        # Generate the asset URL (same pattern as example-pdf.py)
                        try:
                            asset_url = StaticContent.serialize_asset_key_with_slash(asset_key)
                            log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Generated asset URL: {asset_url}")

                            # If this doesn't work, try constructing it manually
                            if not asset_url:
                                log.warning(f"[PdfxXBlock] STUDIO_SUBMIT - serialize_asset_key_with_slash returned empty, using manual construction")
                                asset_url = f"/asset-v1:{str(course_key)}+type@asset+block@{asset_path}"
                                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Manual asset URL: {asset_url}")

                        except Exception as url_error:
                            log.error(f"[PdfxXBlock] STUDIO_SUBMIT - Error generating asset URL: {url_error}")
                            # Fallback to basic URL format
                            asset_url = f"/asset-v1:{str(course_key)}+type@asset+block@{asset_path}"
                            log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Fallback asset URL: {asset_url}")

                        # Update fields with asset data
                        self.display_name = form_data.get('display_name', self.display_name)
                        self.pdf_url = ""  # Clear URL since we're using asset storage
                        self.pdf_file_path = ""  # Clear file path since we're using asset storage
                        self.pdf_file_asset_key = asset_url  # Store the asset URL
                        self.pdf_file_name = actual_filename
                        file_stored_successfully = True
                        storage_method = 'open_edx_contentstore'
                        storage_path = asset_url

                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ Open edX contentstore SUCCESS!")
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Updated fields after contentstore:")
                        log.info(f"    - pdf_file_asset_key: '{self.pdf_file_asset_key}'")
                        log.info(f"    - pdf_file_name: '{self.pdf_file_name}'")
                        log.info(f"    - pdf_url cleared: '{self.pdf_url}'")
                        log.info(f"    - pdf_file_path cleared: '{self.pdf_file_path}'")

                    except ImportError as import_error:
                        log.error(f"[PdfxXBlock] STUDIO_SUBMIT - ❌ Contentstore import failed: {import_error}")
                        return self._json_response({
                            'result': 'error',
                            'message': f'Open edX contentstore is not available. This is required for file uploads: {str(import_error)}'
                        })

                    except Exception as contentstore_error:
                        log.error(f"[PdfxXBlock] STUDIO_SUBMIT - ❌ Open edX contentstore FAILED: {contentstore_error}")
                        log.error(f"[PdfxXBlock] STUDIO_SUBMIT - Contentstore error type: {type(contentstore_error).__name__}")
                        import traceback
                        log.error(f"[PdfxXBlock] STUDIO_SUBMIT - Contentstore error traceback: {traceback.format_exc()}")
                        return self._json_response({
                            'result': 'error',
                            'message': f'File storage to Open edX contentstore failed: {str(contentstore_error)}'
                        })

                    if not file_stored_successfully:
                        log.error(f"[PdfxXBlock] STUDIO_SUBMIT - ❌ File storage failed - Open edX contentstore is required")
                        return self._json_response({'result': 'error', 'message': 'File storage failed. Open edX contentstore is required for file uploads.'})

                    # Handle boolean fields after successful file storage
                    self.allow_download = str(form_data.get('allow_download', 'true')).lower() == 'true'
                    self.allow_annotation = str(form_data.get('allow_annotation', 'true')).lower() == 'true'

                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - STEP 2D: Final field verification after file storage:")
                    log.info(f"    - display_name: '{self.display_name}'")
                    log.info(f"    - pdf_file_asset_key: '{getattr(self, 'pdf_file_asset_key', 'N/A')}'")
                    log.info(f"    - pdf_file_path: '{getattr(self, 'pdf_file_path', 'N/A')}'")
                    log.info(f"    - pdf_file_name: '{self.pdf_file_name}'")
                    log.info(f"    - pdf_url length: {len(self.pdf_url) if self.pdf_url else 0}")
                    log.info(f"    - allow_download: {self.allow_download}")
                    log.info(f"    - allow_annotation: {self.allow_annotation}")
                    log.info(f"    - storage_method: {storage_method}")

                except Exception as file_error:
                    log.error(f"[PdfxXBlock] STUDIO_SUBMIT - ❌ File processing error: {file_error}")
                    log.error(f"[PdfxXBlock] STUDIO_SUBMIT - File error type: {type(file_error).__name__}")
                    import traceback
                    log.error(f"[PdfxXBlock] STUDIO_SUBMIT - File error traceback: {traceback.format_exc()}")
                    return self._json_response({'result': 'error', 'message': f'File processing failed: {str(file_error)}'})

            else:
                # **STEP 3: HANDLE REGULAR FORM DATA (configuration updates)**
                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - STEP 3: Processing configuration update (no new file upload)")

                # Update basic field values
                self.display_name = form_data.get('display_name', self.display_name)

                # Handle PDF source carefully - don't overwrite existing files with empty URLs
                form_pdf_url = form_data.get('pdf_url', '').strip()

                if form_pdf_url:
                    # User provided a new URL - switch to URL mode
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - User provided new PDF URL: '{form_pdf_url}'")
                    self.pdf_url = form_pdf_url
                    self.pdf_file_path = ""  # Clear file path when using URL
                    self.pdf_file_asset_key = ""  # Clear asset key when using URL
                    self.pdf_file_name = ""  # Clear file name when using URL
                else:
                    # No new URL provided - preserve existing file configuration
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - No new URL provided, preserving existing file configuration")
                    # Don't update pdf_url, pdf_file_path, pdf_file_asset_key, or pdf_file_name
                    # These should remain as they were to preserve existing uploaded files

                    # Only update the file name if explicitly provided in form (for display purposes)
                    if 'pdf_file_name' in form_data and form_data['pdf_file_name'].strip():
                        self.pdf_file_name = form_data['pdf_file_name'].strip()
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Updated file name for display: '{self.pdf_file_name}'")

                # Handle boolean fields properly
                if 'allow_download' in form_data:
                    self.allow_download = str(form_data['allow_download']).lower() == 'true'
                if 'allow_annotation' in form_data:
                    self.allow_annotation = str(form_data['allow_annotation']).lower() == 'true'

                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Updated fields for configuration update:")
                log.info(f"    - display_name: '{self.display_name}'")
                log.info(f"    - pdf_url: '{self.pdf_url}'")
                log.info(f"    - pdf_file_name: '{self.pdf_file_name}'")
                log.info(f"    - pdf_file_path: '{getattr(self, 'pdf_file_path', 'N/A')}'")
                log.info(f"    - pdf_file_asset_key: '{getattr(self, 'pdf_file_asset_key', 'N/A')}'")
                log.info(f"    - allow_download: {self.allow_download}")
                log.info(f"    - allow_annotation: {self.allow_annotation}")

            # **STEP 4: SAVE CHANGES**
            log.info(f"[PdfxXBlock] STUDIO_SUBMIT - STEP 4: Saving changes to database...")

            # Log field values before save
            log.info(f"[PdfxXBlock] STUDIO_SUBMIT - BEFORE SAVE - Final field values:")
            log.info(f"  - display_name: '{self.display_name}'")
            log.info(f"  - pdf_url: length={len(self.pdf_url) if self.pdf_url else 0}, starts_with={'data:' if self.pdf_url and self.pdf_url.startswith('data:') else 'other'}")
            log.info(f"  - pdf_file_path: '{getattr(self, 'pdf_file_path', 'N/A')}'")
            log.info(f"  - pdf_file_asset_key: '{getattr(self, 'pdf_file_asset_key', 'N/A')}'")
            log.info(f"  - pdf_file_name: '{self.pdf_file_name}'")
            log.info(f"  - allow_download: {self.allow_download}")
            log.info(f"  - allow_annotation: {self.allow_annotation}")

            # Simple save - let XBlock handle scope issues
            try:
                # Actually call save() to persist the fields
                self.save()
                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ Save completed successfully")
            except Exception as save_error:
                log.error(f"[PdfxXBlock] STUDIO_SUBMIT - ❌ Save error: {save_error}")
                log.error(f"[PdfxXBlock] STUDIO_SUBMIT - Save error type: {type(save_error).__name__}")

                # For InvalidScopeError in Studio context, try to continue anyway
                if "InvalidScopeError" in str(type(save_error).__name__):
                    log.warning(f"[PdfxXBlock] STUDIO_SUBMIT - InvalidScopeError in Studio context - this might be expected")
                    log.warning(f"[PdfxXBlock] STUDIO_SUBMIT - Continuing despite save error")
                else:
                    # For other errors, fail the request
                    return self._json_response({'result': 'error', 'message': f'Save failed: {str(save_error)}'})

            # **STEP 5: VERIFICATION**
            log.info(f"[PdfxXBlock] STUDIO_SUBMIT - STEP 5: Verifying saved data...")

            # Verify fields were set correctly
            log.info(f"[PdfxXBlock] STUDIO_SUBMIT - AFTER SAVE - Verification:")
            log.info(f"  - display_name: '{self.display_name}'")
            log.info(f"  - pdf_url: length={len(self.pdf_url) if self.pdf_url else 0}")
            log.info(f"  - pdf_file_path: '{getattr(self, 'pdf_file_path', 'N/A')}'")
            log.info(f"  - pdf_file_asset_key: '{getattr(self, 'pdf_file_asset_key', 'N/A')}'")
            log.info(f"  - pdf_file_name: '{self.pdf_file_name}'")

            # Test if get_pdf_url() works correctly
            try:
                test_url = self.get_pdf_url()
                if test_url:
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - ✅ get_pdf_url() working correctly")
                    log.info(f"[PdfxXBlock] STUDIO_SUBMIT - Generated URL: {test_url[:100]}...")
                    if test_url.startswith('/xblock/'):
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - URL type: Handler URL (serve_pdf_file)")
                    elif test_url.startswith('data:'):
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - URL type: Data URL")
                    else:
                        log.info(f"[PdfxXBlock] STUDIO_SUBMIT - URL type: External URL")
                else:
                    log.warning(f"[PdfxXBlock] STUDIO_SUBMIT - ⚠️ get_pdf_url() returned empty string")
            except Exception as url_error:
                log.error(f"[PdfxXBlock] STUDIO_SUBMIT - ❌ get_pdf_url() failed: {url_error}")

            # **STEP 6: SUCCESS RESPONSE**
            log.info(f"[PdfxXBlock] STUDIO_SUBMIT - STEP 6: Preparing success response...")

            # Success response
            response_data = {'result': 'success'}
            if uploaded_file:
                response_data['file_uploaded'] = True
                response_data['file_name'] = self.pdf_file_name
                response_data['storage_method'] = storage_method
                response_data['storage_path'] = storage_path

                log.info(f"[PdfxXBlock] STUDIO_SUBMIT - File upload response data:")
                log.info(f"    - file_uploaded: {response_data['file_uploaded']}")
                log.info(f"    - file_name: '{response_data['file_name']}'")
                log.info(f"    - storage_method: '{response_data['storage_method']}'")
                log.info(f"    - storage_path: '{response_data.get('storage_path', 'N/A')}'")

            log.info(f"[PdfxXBlock] STUDIO_SUBMIT ================== SUCCESS END ==================")
            return self._json_response(response_data)

        except Exception as e:
            log.error(f"[PdfxXBlock] STUDIO_SUBMIT ================== ERROR END ==================")
            log.error(f"[PdfxXBlock] STUDIO_SUBMIT - Error during processing: {e}")
            log.error(f"[PdfxXBlock] STUDIO_SUBMIT - Error type: {type(e).__name__}")
            import traceback
            log.error(f"[PdfxXBlock] STUDIO_SUBMIT - Full traceback: {traceback.format_exc()}")
            return self._json_response({'result': 'error', 'message': f'Failed to save settings: {str(e)}'})

    def _json_response(self, data):
        """Helper method to create JSON response"""
        import json
        from webob import Response

        response = Response(
            body=json.dumps(data),
            content_type='application/json',
            charset='utf-8'
        )
        return response




    @XBlock.handler
    def save_annotations(self, request, suffix=''):
        """
        Save the student's annotations and other data to MongoDB via XBlock fields.
        """
        import json

        # Add CSRF exemption for XBlock handler if needed
        try:
            from django.views.decorators.csrf import csrf_exempt
            # Note: XBlock handlers are typically CSRF exempt by default,
            # but we can ensure it by checking if request has CSRF validation
            if hasattr(request, '_dont_enforce_csrf_checks'):
                request._dont_enforce_csrf_checks = True
        except ImportError:
            # Django not available in this context
            pass

        # Handle both GET and POST requests
        if request.method == 'POST':
            data = None

            # Try multiple methods to extract POST data
            try:
                # Method 1: Try to get JSON data from request body
                if hasattr(request, 'body') and request.body:
                    body_str = request.body.decode('utf-8') if isinstance(request.body, bytes) else str(request.body)
                    if body_str.strip():
                        data = json.loads(body_str)
                        log.info(f"[PdfxXBlock] 💾 save_annotations - Data extracted from JSON body")
            except (json.JSONDecodeError, AttributeError, UnicodeDecodeError) as e:
                log.warning(f"[PdfxXBlock] 💾 save_annotations - JSON body parse failed: {e}")

            # Method 2: Try request.POST (form data)
            if data is None and hasattr(request, 'POST'):
                try:
                    post_data = dict(request.POST)
                    if post_data:
                        # If data values are lists, take the first element
                        data = {k: v[0] if isinstance(v, list) and len(v) > 0 else v for k, v in post_data.items()}
                        log.info(f"[PdfxXBlock] 💾 save_annotations - Data extracted from POST form data")

                        # If there's a 'data' field that looks like JSON, try to parse it
                        if 'data' in data and isinstance(data['data'], str):
                            try:
                                parsed_data = json.loads(data['data'])
                                data['data'] = parsed_data
                                log.info(f"[PdfxXBlock] 💾 save_annotations - Parsed JSON from data field")
                            except json.JSONDecodeError:
                                pass
                except Exception as e:
                    log.warning(f"[PdfxXBlock] 💾 save_annotations - POST data extraction failed: {e}")

            # Method 3: Try request.params (alternative parameter source)
            if data is None and hasattr(request, 'params'):
                try:
                    params_data = dict(request.params)
                    if params_data:
                        data = params_data
                        log.info(f"[PdfxXBlock] 💾 save_annotations - Data extracted from request.params")
                except Exception as e:
                    log.warning(f"[PdfxXBlock] 💾 save_annotations - Params data extraction failed: {e}")

            # If still no data, return error
            if data is None:
                log.error(f"[PdfxXBlock] 💾 save_annotations - No data found in request")
                log.error(f"[PdfxXBlock] 💾 save_annotations - Request attributes: {[attr for attr in dir(request) if not attr.startswith('_')]}")
                from webob import Response
                response = Response('{"result": "error", "message": "No data received in request"}')
                response.content_type = 'application/json'
                response.status_code = 400
                return response
        else:
            # For GET requests, return method not allowed
            from webob import Response
            response = Response('{"result": "error", "message": "Method not allowed"}')
            response.content_type = 'application/json'
            response.status_code = 405
            return response

        log.info(f"[PdfxXBlock] 💾 save_annotations - START")
        log.info(f"[PdfxXBlock] 💾 save_annotations - Data keys: {list(data.keys()) if data else 'None'}")
        log.info(f"[PdfxXBlock] 💾 save_annotations - Allow annotation: {self.allow_annotation}")

        if not self.allow_annotation:
            log.warning(f"[PdfxXBlock] 💾 save_annotations - Annotations not allowed")
            from webob import Response
            response = Response('{"result": "error", "message": "Annotations are not allowed"}')
            response.content_type = 'application/json'
            response.status_code = 403
            return response

        # Extract the actual annotation data if it's nested under 'data' key
        annotation_data = data.get('data', data)
        log.info(f"[PdfxXBlock] 💾 save_annotations - Annotation data keys: {list(annotation_data.keys()) if annotation_data else 'None'}")

        # Log detailed structure of incoming data
        if annotation_data:
            for key, value in annotation_data.items():
                if isinstance(value, dict):
                    log.info(f"[PdfxXBlock] 💾 save_annotations - {key}: dict with {len(value)} keys: {list(value.keys())}")
                    # Log first level of nested data for scribble
                    if key == 'scribble' and value:
                        for page_num, page_data in value.items():
                            if isinstance(page_data, list):
                                log.info(f"[PdfxXBlock] 💾 save_annotations - scribble page {page_num}: {len(page_data)} annotations")
                elif isinstance(value, list):
                    log.info(f"[PdfxXBlock] 💾 save_annotations - {key}: list with {len(value)} items")
                else:
                    log.info(f"[PdfxXBlock] 💾 save_annotations - {key}: {type(value).__name__} = {value}")

        # Initialize saved fields list
        saved_fields = []

        # Check if this is a deletion-only request (more efficient)
        is_deletion_only = annotation_data.get('_deletionOnly', False)
        if is_deletion_only:
            log.info(f"[PdfxXBlock] 💾 DELETION-ONLY mode detected - processing only deletions")

        # Handle deletions first (before processing saves)
        if '_deletions' in annotation_data:
            deletions = annotation_data['_deletions']
            log.info(f"[PdfxXBlock] 💾 Processing {len(deletions)} deletions")

            for deletion in deletions:
                deletion_type = deletion.get('type')
                deletion_id = deletion.get('id')
                page_num = str(deletion.get('pageNum'))

                log.info(f"[PdfxXBlock] 💾 Deleting {deletion_type} annotation {deletion_id} from page {page_num}")

                # Handle scribble/drawing_strokes deletions
                if deletion_type == 'scribble' and isinstance(self.drawing_strokes, dict):
                    if page_num in self.drawing_strokes:
                        original_count = len(self.drawing_strokes[page_num])
                        self.drawing_strokes[page_num] = [
                            stroke for stroke in self.drawing_strokes[page_num]
                            if stroke.get('id') != deletion_id
                        ]
                        new_count = len(self.drawing_strokes[page_num])

                        # Remove empty page entries
                        if new_count == 0:
                            del self.drawing_strokes[page_num]

                        log.info(f"[PdfxXBlock] 💾 Deleted scribble: page {page_num} had {original_count}, now has {new_count}")

                # Handle highlight deletions
                elif deletion_type == 'highlight' and isinstance(self.highlights, dict):
                    user_id = self.get_user_info()['id']
                    if user_id in self.highlights and page_num in self.highlights[user_id]:
                        original_count = len(self.highlights[user_id][page_num])
                        self.highlights[user_id][page_num] = [
                            highlight for highlight in self.highlights[user_id][page_num]
                            if highlight.get('id') != deletion_id
                        ]
                        new_count = len(self.highlights[user_id][page_num])

                        # Remove empty page entries
                        if new_count == 0:
                            del self.highlights[user_id][page_num]

                        log.info(f"[PdfxXBlock] 💾 Deleted highlight: page {page_num} had {original_count}, now has {new_count}")

                # Add more deletion handlers for other annotation types as needed
                # TODO: Add handlers for text_annotations, shape_annotations, note_annotations, etc.

            if deletions:
                saved_fields.append('processed_deletions')

        # For deletion-only requests, skip processing other annotation data (efficiency optimization)
        if is_deletion_only:
            log.info(f"[PdfxXBlock] 💾 DELETION-ONLY mode: skipping other annotation processing for efficiency")
        else:
            # Save various types of data to MongoDB via XBlock fields (only if not deletion-only)
            log.info(f"[PdfxXBlock] 💾 FULL SAVE mode: processing all annotation data")

        if not is_deletion_only and 'annotations' in annotation_data:
            # Merge new annotations with existing ones
            if not isinstance(self.annotations, dict):
                self.annotations = {}

            new_annotations = annotation_data['annotations']
            for key, value in new_annotations.items():
                if key not in self.annotations:
                    self.annotations[key] = value
                else:
                    # If it's a list, merge; otherwise replace
                    if isinstance(self.annotations[key], list) and isinstance(value, list):
                        # Merge by ID to avoid duplicates
                        existing_ids = {item.get('id') for item in self.annotations[key] if isinstance(item, dict)}
                        for item in value:
                            if isinstance(item, dict) and item.get('id') not in existing_ids:
                                self.annotations[key].append(item)
                    else:
                        self.annotations[key] = value

            saved_fields.append('annotations')
            log.info(f"[PdfxXBlock] 💾 Merged annotations: {len(annotation_data['annotations'])} items")

        # Handle both 'drawing_strokes' and 'scribble' (legacy support)
        if not is_deletion_only and 'drawing_strokes' in annotation_data:
            # Merge new drawing strokes with existing ones
            if not isinstance(self.drawing_strokes, dict):
                self.drawing_strokes = {}

            new_strokes = annotation_data['drawing_strokes']
            for page_num, page_strokes in new_strokes.items():
                if page_num not in self.drawing_strokes:
                    self.drawing_strokes[page_num] = []

                # Merge by stroke ID to avoid duplicates
                existing_ids = {stroke.get('id') for stroke in self.drawing_strokes[page_num] if isinstance(stroke, dict)}
                for stroke in page_strokes:
                    if isinstance(stroke, dict) and stroke.get('id') not in existing_ids:
                        self.drawing_strokes[page_num].append(stroke)

            saved_fields.append('drawing_strokes')
            log.info(f"[PdfxXBlock] 💾 Merged drawing_strokes: {len(annotation_data['drawing_strokes'])} pages")

        elif not is_deletion_only and 'scribble' in annotation_data:
            # Map scribble to drawing_strokes field and merge with existing
            if not isinstance(self.drawing_strokes, dict):
                self.drawing_strokes = {}

            new_scribbles = annotation_data['scribble']
            log.info(f"[PdfxXBlock] 💾 Processing scribble data: {new_scribbles}")

            for page_num, page_scribbles in new_scribbles.items():
                if page_num not in self.drawing_strokes:
                    self.drawing_strokes[page_num] = []

                # Merge by stroke ID to avoid duplicates
                existing_ids = {stroke.get('id') for stroke in self.drawing_strokes[page_num] if isinstance(stroke, dict)}
                log.info(f"[PdfxXBlock] 💾 Existing stroke IDs for page {page_num}: {existing_ids}")

                for stroke in page_scribbles:
                    if isinstance(stroke, dict):
                        stroke_id = stroke.get('id')
                        log.info(f"[PdfxXBlock] 💾 Processing stroke ID: {stroke_id}")
                        if stroke_id not in existing_ids:
                            self.drawing_strokes[page_num].append(stroke)
                            log.info(f"[PdfxXBlock] 💾 Added new stroke: {stroke_id}")
                        else:
                            log.info(f"[PdfxXBlock] 💾 Skipped duplicate stroke: {stroke_id}")

            saved_fields.append('drawing_strokes')
            log.info(f"[PdfxXBlock] 💾 Merged scribble as drawing_strokes: {len(annotation_data['scribble'])} pages")
            log.info(f"[PdfxXBlock] 💾 Final drawing strokes: {self.drawing_strokes}")

        if not is_deletion_only and 'highlights' in annotation_data:
            user_id = self.get_user_info()['id']
            if not isinstance(self.highlights, dict):
                self.highlights = {}
            self.highlights[user_id] = annotation_data['highlights']
            saved_fields.append('highlights')
            log.info(f"[PdfxXBlock] 💾 Saved highlights for user {user_id}: {len(annotation_data['highlights'])} pages")

        if not is_deletion_only and 'marker_strokes' in annotation_data:
            self.marker_strokes = annotation_data['marker_strokes']
            saved_fields.append('marker_strokes')
            log.info(f"[PdfxXBlock] 💾 Saved marker_strokes: {len(annotation_data['marker_strokes'])} pages")

        if not is_deletion_only and 'text_annotations' in annotation_data:
            self.text_annotations = annotation_data['text_annotations']
            saved_fields.append('text_annotations')
            log.info(f"[PdfxXBlock] 💾 Saved text_annotations: {len(annotation_data['text_annotations'])} pages")

        if not is_deletion_only and 'shape_annotations' in annotation_data:
            self.shape_annotations = annotation_data['shape_annotations']
            saved_fields.append('shape_annotations')
            log.info(f"[PdfxXBlock] 💾 Saved shape_annotations: {len(annotation_data['shape_annotations'])} pages")

        if not is_deletion_only and 'note_annotations' in annotation_data:
            self.note_annotations = annotation_data['note_annotations']
            saved_fields.append('note_annotations')
            log.info(f"[PdfxXBlock] 💾 Saved note_annotations: {len(annotation_data['note_annotations'])} pages")

        # Check for page/display settings in both data and annotation_data
        if 'currentPage' in data:
            self.current_page = data['currentPage']
            saved_fields.append('current_page')
        elif 'currentPage' in annotation_data:
            self.current_page = annotation_data['currentPage']
            saved_fields.append('current_page')

        if 'brightness' in data:
            self.brightness = data['brightness']
            saved_fields.append('brightness')
        elif 'brightness' in annotation_data:
            self.brightness = annotation_data['brightness']
            saved_fields.append('brightness')

        if 'is_grayscale' in data:
            self.is_grayscale = data['is_grayscale']
            saved_fields.append('is_grayscale')
        elif 'is_grayscale' in annotation_data:
            self.is_grayscale = annotation_data['is_grayscale']
            saved_fields.append('is_grayscale')

        log.info(f"[PdfxXBlock] 💾 save_annotations - Successfully saved fields to MongoDB: {saved_fields}")

        # Return success response
        response_data = {
            'result': 'success',
            'message': f'Saved {len(saved_fields)} field(s) to MongoDB',
            'saved_fields': saved_fields,
            'annotations': self.annotations,
            'currentPage': self.current_page
        }

        from webob import Response
        response = Response(json.dumps(response_data))
        response.content_type = 'application/json'
        response.status_code = 200
        return response

    def save(self):
        """Simple save method - let XBlock handle the scoping"""
        try:
            super().save()
        except Exception as e:
            # Log the error but don't try to handle it - let it bubble up
            log.warning(f"[PdfxXBlock] SAVE - Error during save: {e}")
            raise

    def _get_context_info(self):
        """Get information about the current runtime context"""
        context_info = {
            'runtime_type': type(self.runtime).__name__,
            'is_studio_preview': False,
            'is_real_preview': False,
            'has_field_data': hasattr(self, '_field_data'),
            'field_data_type': type(getattr(self, '_field_data', None)).__name__ if hasattr(self, '_field_data') else 'None'
        }

        try:
            # More accurate detection of actual preview mode vs Studio editing
            # Real preview mode indicators:
            if hasattr(self.runtime, 'is_author_mode'):
                is_author_mode = getattr(self.runtime, 'is_author_mode', False)
                context_info['is_studio_preview'] = is_author_mode
                # Only consider it real preview if it's explicitly author mode AND in a preview context
                if is_author_mode and hasattr(self.runtime, '_view_name'):
                    view_name = getattr(self.runtime, '_view_name', '')
                    context_info['is_real_preview'] = 'preview' in str(view_name).lower()

            # Check if we're in an actual author_view call (real preview)
            import inspect
            frame = inspect.currentframe()
            try:
                # Look up the call stack for author_view
                while frame:
                    frame_info = inspect.getframeinfo(frame)
                    if 'author_view' in str(frame_info.function):
                        context_info['is_real_preview'] = True
                        context_info['is_studio_preview'] = True
                        break
                    frame = frame.f_back
            finally:
                del frame

            # CachingDescriptorSystem is normal for Studio operations
            # Don't automatically assume it's preview mode
            if 'CachingDescriptorSystem' == context_info['runtime_type']:
                # This is normal Studio runtime, not necessarily preview
                context_info['is_studio_preview'] = False

        except Exception as e:
            log.warning(f"[PdfxXBlock] _get_context_info - Error checking context: {e}")

        return context_info

    def _get_dirty_fields(self):
        """Get list of fields that have been modified"""
        dirty_fields = []
        try:
            if hasattr(self, '_dirty_fields'):
                dirty_fields = list(getattr(self, '_dirty_fields', set()))
            elif hasattr(self, '_field_data') and hasattr(self._field_data, '_dirty_fields'):
                dirty_fields = list(getattr(self._field_data, '_dirty_fields', set()))

            # Also check if any fields were recently modified
            for field_name, field in self.fields.items():
                try:
                    if hasattr(field, '_dirty') and getattr(field, '_dirty', False):
                        if field_name not in dirty_fields:
                            dirty_fields.append(field_name)
                except:
                    pass
        except Exception as e:
            log.warning(f"[PdfxXBlock] _get_dirty_fields - Error getting dirty fields: {e}")

        return dirty_fields

    @staticmethod
    def workbench_scenarios():
        """A canned scenario for display in the workbench."""
        return [
            ("PDF Viewer",
             """<pdfx pdf_url="https://example.com/sample.pdf"/>
             """),
            ("PDF Viewer with Annotations Disabled",
             """<pdfx
                    pdf_url="https://example.com/sample.pdf"
                    allow_annotation="False"
                />
             """),
        ]

    @XBlock.handler
    def upload_pdf(self, request, suffix=''):
        """
        Handle PDF file upload - alternative handler for dedicated file uploads.
        This can be used as a separate endpoint for file uploads.
        """
        log.info(f"[PdfxXBlock] =============== upload_pdf START ===============")
        log.info(f"[PdfxXBlock] upload_pdf - Block: {getattr(self, 'location', 'unknown')}")
        log.info(f"[PdfxXBlock] upload_pdf - Request method: {request.method}")

        response_data = {}
        status_code = 200

        try:
            # Check if file was uploaded
            if not hasattr(request, 'params') or 'file' not in request.params:
                log.error(f"[PdfxXBlock] upload_pdf - No file in request.params")
                response_data = {'result': 'error', 'message': 'No file uploaded'}
                status_code = 400
            else:
                upload = request.params['file'].file
                filename = request.params['file'].filename
                log.info(f"[PdfxXBlock] upload_pdf - Processing file: {filename}")

                # Validate file type
                if not filename.lower().endswith('.pdf'):
                    log.error(f"[PdfxXBlock] upload_pdf - Invalid file type: {filename}")
                    response_data = {'result': 'error', 'message': 'Only PDF files are allowed'}
                    status_code = 400
                else:
                    # Generate a unique filename
                    safe_filename = filename.replace(' ', '_')
                    unique_id = str(uuid.uuid4())[:8]
                    unique_filename = f"{unique_id}_{safe_filename}"
                    log.info(f"[PdfxXBlock] upload_pdf - Generated unique filename: {unique_filename}")

                    # Get the course key from the XBlock's location
                    course_key = self.location.course_key
                    log.info(f"[PdfxXBlock] upload_pdf - Course key: {course_key}")

                    # Import ContentStore and StaticContent
                    try:
                        from xmodule.contentstore.django import contentstore
                        from xmodule.contentstore.content import StaticContent
                        from opaque_keys.edx.keys import AssetKey

                        # Get content store
                        content_store = contentstore()
                        log.info(f"[PdfxXBlock] upload_pdf - Got contentstore: {type(content_store)}")

                        # Create asset key - use a simpler name pattern (same as example-pdf.py)
                        asset_path = f"pdfs_{unique_id}_{safe_filename}"
                        asset_key = StaticContent.compute_location(course_key, asset_path)
                        log.info(f"[PdfxXBlock] upload_pdf - Generated asset key: {asset_key}")

                        # Read the file content
                        file_content = upload.read()
                        log.info(f"[PdfxXBlock] upload_pdf - Read file content: {len(file_content)} bytes")

                        # Validate PDF content
                        if not file_content.startswith(b'%PDF'):
                            log.error(f"[PdfxXBlock] upload_pdf - Invalid PDF content")
                            response_data = {'result': 'error', 'message': 'Invalid PDF file content'}
                            status_code = 400
                        else:
                            # Create the static content (same pattern as example-pdf.py)
                            content = StaticContent(
                                asset_key,
                                filename,  # Use original filename for display
                                'application/pdf',
                                file_content,
                                length=len(file_content)
                            )
                            log.info(f"[PdfxXBlock] upload_pdf - Created StaticContent object")

                            # Save the content to contentstore
                            content_store.save(content)
                            log.info(f"[PdfxXBlock] upload_pdf - ✅ Successfully saved to contentstore!")

                            # Generate the asset URL (same pattern as example-pdf.py)
                            try:
                                asset_url = StaticContent.serialize_asset_key_with_slash(asset_key)
                                log.info(f"[PdfxXBlock] upload_pdf - Generated asset URL: {asset_url}")

                                # If this doesn't work, try constructing it manually
                                if not asset_url:
                                    log.warning(f"[PdfxXBlock] upload_pdf - serialize_asset_key_with_slash returned empty, using manual construction")
                                    asset_url = f"/asset-v1:{str(course_key)}+type@asset+block@{asset_path}"
                                    log.info(f"[PdfxXBlock] upload_pdf - Manual asset URL: {asset_url}")

                            except Exception as url_error:
                                log.error(f"[PdfxXBlock] upload_pdf - Error generating asset URL: {url_error}")
                                # Fallback to basic URL format
                                asset_url = f"/asset-v1:{str(course_key)}+type@asset+block@{asset_path}"
                                log.info(f"[PdfxXBlock] upload_pdf - Fallback asset URL: {asset_url}")

                            # Update XBlock fields
                            self.pdf_file_name = filename
                            self.pdf_file_asset_key = asset_url
                            self.pdf_url = ""  # Clear the URL field since we're using an uploaded file

                            log.info(f"[PdfxXBlock] upload_pdf - ✅ PDF file uploaded successfully: {filename}")
                            log.info(f"[PdfxXBlock] upload_pdf - Asset URL: {asset_url}")

                            response_data = {
                                'result': 'success',
                                'filename': filename,
                                'asset_url': asset_url,
                                'file_size': len(file_content)
                            }

                    except ImportError as import_error:
                        log.error(f"[PdfxXBlock] upload_pdf - ❌ Contentstore import failed: {import_error}")
                        response_data = {'result': 'error', 'message': f'ContentStore not available: {import_error}'}
                        status_code = 500
                    except Exception as contentstore_error:
                        log.error(f"[PdfxXBlock] upload_pdf - ❌ Contentstore operation failed: {contentstore_error}")
                        response_data = {'result': 'error', 'message': f'File upload failed: {contentstore_error}'}
                        status_code = 500

        except Exception as e:
            log.error(f"[PdfxXBlock] upload_pdf - ❌ General error: {e}")
            import traceback
            log.error(f"[PdfxXBlock] upload_pdf - Traceback: {traceback.format_exc()}")
            response_data = {'result': 'error', 'message': f'Upload failed: {str(e)}'}
            status_code = 500

        # Return appropriate response
        from webob import Response
        import json
        response = Response(json.dumps(response_data))
        response.content_type = 'application/json'
        response.status_code = status_code

        log.info(f"[PdfxXBlock] upload_pdf =============== END (status: {status_code}) ===============")
        return response