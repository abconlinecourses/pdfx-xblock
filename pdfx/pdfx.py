"""PDF Viewer XBlock - A rich PDF annotation and viewing XBlock for Open edX."""

from importlib.resources import files
import json

from web_fragments.fragment import Fragment
from xblock.core import XBlock
from xblock.fields import Scope, String, Dict, Boolean, Integer


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

    # Store student's current page
    current_page = Integer(
        help="Current page number in the PDF",
        scope=Scope.user_state,
        default=1
    )

    def resource_string(self, path):
        """Handy helper for getting resources from our kit."""
        return files(__package__).joinpath(path).read_text(encoding="utf-8")

    def student_view(self, context=None):
        """
        The primary view of the PdfxXBlock, shown to students
        when viewing courses.
        """
        html = self.resource_string("static/html/pdfx.html")
        frag = Fragment(html.format(self=self))

        # Add CSS
        frag.add_css(self.resource_string("static/css/pdfx.css"))

        # Add vendor libraries
        frag.add_javascript_url('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
        frag.add_javascript_url('https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js')

        # Add our JavaScript
        frag.add_javascript(self.resource_string("static/js/src/pdfx_view.js"))

        # Initialize with config
        frag.initialize_js('PdfxXBlock', {
            'pdfUrl': self.pdf_url,
            'allowDownload': self.allow_download,
            'allowAnnotation': self.allow_annotation,
            'savedAnnotations': self.annotations,
            'currentPage': self.current_page
        })

        return frag

    def studio_view(self, context=None):
        """
        The view for Studio configuration.
        """
        html = self.resource_string("static/html/pdfx_edit.html")
        frag = Fragment(html.format(self=self))
        frag.add_css(self.resource_string("static/css/pdfx_edit.css"))
        frag.add_javascript(self.resource_string("static/js/src/pdfx_edit.js"))
        frag.initialize_js('PdfxXBlockEdit')
        return frag

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

    @XBlock.json_handler
    def save_annotations(self, data, suffix=''):
        """
        Save the student's annotations.
        """
        if not self.allow_annotation:
            return {'result': 'error', 'message': 'Annotations are not allowed'}

        self.annotations = data.get('annotations', {})
        self.current_page = data.get('currentPage', 1)

        return {
            'result': 'success',
            'annotations': self.annotations,
            'currentPage': self.current_page
        }

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
