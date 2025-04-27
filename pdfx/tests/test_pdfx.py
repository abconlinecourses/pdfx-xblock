"""
Tests for PDF XBlock.

This module contains unit tests for the PDF XBlock functionality.
"""

import unittest
import json
import mock
from webob import Response
from xblock.field_data import DictFieldData
from xblock.test.tools import TestRuntime

from pdfx.pdfx import PdfxXBlock
from pdfx.models import (
    Annotation, DrawingAnnotation, TextAnnotation,
    HighlightAnnotation, ShapeAnnotation
)
from pdfx.services import PdfService, AnnotationService, ThumbnailService


class PdfxXBlockTests(unittest.TestCase):
    """Test cases for the PDF XBlock."""

    def setUp(self):
        """Set up the test environment."""
        self.runtime = TestRuntime()
        field_data = DictFieldData({
            'display_name': 'Test PDF',
            'pdf_url': 'https://example.com/test.pdf',
            'enable_annotations': True,
            'enable_thumbnail_nav': True,
            'show_toolbar': True,
        })
        self.block = PdfxXBlock(self.runtime, field_data, None)

    def test_student_view(self):
        """Test the student view."""
        fragment = self.block.student_view()
        self.assertIsNotNone(fragment.content)
        self.assertIn('pdf-viewer-xblock', fragment.content)
        self.assertIn(self.block.pdf_url, fragment.content)

    def test_studio_view(self):
        """Test the studio view."""
        fragment = self.block.studio_view()
        self.assertIsNotNone(fragment.content)
        self.assertIn('pdf-viewer-studio', fragment.content)
        self.assertIn(self.block.display_name, fragment.content)

    def test_author_view(self):
        """Test the author view."""
        fragment = self.block.author_view()
        self.assertIsNotNone(fragment.content)
        self.assertIn('pdf-viewer-xblock', fragment.content)
        self.assertIn(self.block.pdf_url, fragment.content)

    @mock.patch('pdfx.pdfx.PdfxXBlock.runtime')
    def test_save_annotations(self, mock_runtime):
        """Test saving annotations."""
        mock_runtime.service.return_value = None  # No user service

        # Test data
        annotations = [{
            'type': 'drawing',
            'pageNumber': 1,
            'data': {
                'paths': [{'points': [{'x': 100, 'y': 100}, {'x': 200, 'y': 200}]}],
                'color': '#ff0000',
                'width': 2
            }
        }]

        # Mock request
        request = mock.Mock()
        request.method = 'POST'
        request.body = json.dumps(annotations).encode()

        # Call the handler
        response = self.block.save_annotations(request)

        # Check the response
        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 200)

        # Check that the annotations were saved
        saved_annotations = json.loads(self.block.annotations)
        self.assertEqual(len(saved_annotations), 1)
        self.assertEqual(saved_annotations[0]['type'], 'drawing')

    def test_get_pdf_worker(self):
        """Test get_pdf_worker handler."""
        request = mock.Mock()
        request.method = 'GET'

        response = self.block.get_pdf_worker(request)

        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 200)
        self.assertIn('application/javascript', response.content_type)

    def test_get_pdf_thumbnail(self):
        """Test get_pdf_thumbnail handler."""
        # Set up a mock thumbnail
        thumbnail_id = '123'
        self.block.thumbnails = json.dumps({
            thumbnail_id: 'SGVsbG8gV29ybGQ='  # Base64 encoded "Hello World"
        })

        # Mock request
        request = mock.Mock()
        request.method = 'GET'
        request.params = {'id': thumbnail_id}

        # Call the handler
        response = self.block.get_pdf_thumbnail(request)

        # Check the response
        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 200)
        self.assertIn('image/', response.content_type)

        # Test missing thumbnail
        request.params = {'id': 'nonexistent'}
        response = self.block.get_pdf_thumbnail(request)
        self.assertEqual(response.status_code, 404)

    def test_studio_submit(self):
        """Test studio_submit handler."""
        # Test data
        data = {
            'display_name': 'Updated PDF',
            'pdf_url': 'https://example.com/updated.pdf',
            'enable_annotations': False,
            'enable_thumbnail_nav': False,
            'show_toolbar': False,
        }

        # Mock request
        request = mock.Mock()
        request.method = 'POST'
        request.body = json.dumps(data).encode()

        # Call the handler
        response = self.block.studio_submit(request)

        # Check the response
        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 200)

        # Check that the fields were updated
        self.assertEqual(self.block.display_name, data['display_name'])
        self.assertEqual(self.block.pdf_url, data['pdf_url'])
        self.assertEqual(self.block.enable_annotations, data['enable_annotations'])
        self.assertEqual(self.block.enable_thumbnail_nav, data['enable_thumbnail_nav'])
        self.assertEqual(self.block.show_toolbar, data['show_toolbar'])


class AnnotationModelTests(unittest.TestCase):
    """Test cases for the annotation models."""

    def test_base_annotation(self):
        """Test the base Annotation class."""
        annotation = Annotation(page_number=1, user_id='user1')
        self.assertEqual(annotation.page_number, 1)
        self.assertEqual(annotation.user_id, 'user1')
        self.assertEqual(annotation.type, 'base')

        # Test to_dict
        annotation_dict = annotation.to_dict()
        self.assertEqual(annotation_dict['pageNumber'], 1)
        self.assertEqual(annotation_dict['userId'], 'user1')
        self.assertEqual(annotation_dict['type'], 'base')

        # Test from_dict
        recreated = Annotation.from_dict(annotation_dict)
        self.assertEqual(recreated.page_number, 1)
        self.assertEqual(recreated.user_id, 'user1')
        self.assertEqual(recreated.type, 'base')

    def test_drawing_annotation(self):
        """Test the DrawingAnnotation class."""
        paths = [{'points': [{'x': 100, 'y': 100}, {'x': 200, 'y': 200}]}]
        annotation = DrawingAnnotation(
            page_number=1,
            paths=paths,
            color='#ff0000',
            width=2,
            user_id='user1'
        )

        self.assertEqual(annotation.page_number, 1)
        self.assertEqual(annotation.paths, paths)
        self.assertEqual(annotation.color, '#ff0000')
        self.assertEqual(annotation.width, 2)
        self.assertEqual(annotation.type, 'drawing')

        # Test to_dict
        annotation_dict = annotation.to_dict()
        self.assertEqual(annotation_dict['pageNumber'], 1)
        self.assertEqual(annotation_dict['data']['paths'], paths)
        self.assertEqual(annotation_dict['data']['color'], '#ff0000')
        self.assertEqual(annotation_dict['data']['width'], 2)

        # Test from_dict
        recreated = DrawingAnnotation.from_dict(annotation_dict)
        self.assertEqual(recreated.page_number, 1)
        self.assertEqual(recreated.paths, paths)
        self.assertEqual(recreated.color, '#ff0000')
        self.assertEqual(recreated.width, 2)
        self.assertEqual(recreated.type, 'drawing')

    def test_text_annotation(self):
        """Test the TextAnnotation class."""
        position = {'x': 100, 'y': 100}
        annotation = TextAnnotation(
            page_number=1,
            text='Test note',
            position=position,
            color='#000000',
            font_size=14,
            user_id='user1'
        )

        self.assertEqual(annotation.page_number, 1)
        self.assertEqual(annotation.text, 'Test note')
        self.assertEqual(annotation.position, position)
        self.assertEqual(annotation.color, '#000000')
        self.assertEqual(annotation.font_size, 14)
        self.assertEqual(annotation.type, 'text')

        # Test to_dict
        annotation_dict = annotation.to_dict()
        self.assertEqual(annotation_dict['pageNumber'], 1)
        self.assertEqual(annotation_dict['data']['text'], 'Test note')
        self.assertEqual(annotation_dict['data']['position'], position)

        # Test from_dict
        recreated = TextAnnotation.from_dict(annotation_dict)
        self.assertEqual(recreated.page_number, 1)
        self.assertEqual(recreated.text, 'Test note')
        self.assertEqual(recreated.position, position)
        self.assertEqual(recreated.type, 'text')

    def test_highlight_annotation(self):
        """Test the HighlightAnnotation class."""
        rects = [{'x': 100, 'y': 100, 'width': 200, 'height': 20}]
        annotation = HighlightAnnotation(
            page_number=1,
            rects=rects,
            color='#ffff00',
            user_id='user1'
        )

        self.assertEqual(annotation.page_number, 1)
        self.assertEqual(annotation.rects, rects)
        self.assertEqual(annotation.color, '#ffff00')
        self.assertEqual(annotation.type, 'highlight')

        # Test to_dict
        annotation_dict = annotation.to_dict()
        self.assertEqual(annotation_dict['pageNumber'], 1)
        self.assertEqual(annotation_dict['data']['rects'], rects)
        self.assertEqual(annotation_dict['data']['color'], '#ffff00')

        # Test from_dict
        recreated = HighlightAnnotation.from_dict(annotation_dict)
        self.assertEqual(recreated.page_number, 1)
        self.assertEqual(recreated.rects, rects)
        self.assertEqual(recreated.color, '#ffff00')
        self.assertEqual(recreated.type, 'highlight')

    def test_shape_annotation(self):
        """Test the ShapeAnnotation class."""
        points = [{'x': 100, 'y': 100}, {'x': 200, 'y': 200}]
        annotation = ShapeAnnotation(
            page_number=1,
            shape_type='rectangle',
            points=points,
            color='#000000',
            width=2,
            fill='#f0f0f0',
            user_id='user1'
        )

        self.assertEqual(annotation.page_number, 1)
        self.assertEqual(annotation.shape_type, 'rectangle')
        self.assertEqual(annotation.points, points)
        self.assertEqual(annotation.color, '#000000')
        self.assertEqual(annotation.width, 2)
        self.assertEqual(annotation.fill, '#f0f0f0')
        self.assertEqual(annotation.type, 'shape')

        # Test to_dict
        annotation_dict = annotation.to_dict()
        self.assertEqual(annotation_dict['pageNumber'], 1)
        self.assertEqual(annotation_dict['data']['shapeType'], 'rectangle')
        self.assertEqual(annotation_dict['data']['points'], points)
        self.assertEqual(annotation_dict['data']['fill'], '#f0f0f0')

        # Test from_dict
        recreated = ShapeAnnotation.from_dict(annotation_dict)
        self.assertEqual(recreated.page_number, 1)
        self.assertEqual(recreated.shape_type, 'rectangle')
        self.assertEqual(recreated.points, points)
        self.assertEqual(recreated.fill, '#f0f0f0')
        self.assertEqual(recreated.type, 'shape')


class ServiceTests(unittest.TestCase):
    """Test cases for the service classes."""

    def test_pdf_service(self):
        """Test the PdfService."""
        # Test validate_pdf_url
        self.assertTrue(PdfService.validate_pdf_url('https://example.com/test.pdf'))
        self.assertFalse(PdfService.validate_pdf_url('https://example.com/test.txt'))
        self.assertFalse(PdfService.validate_pdf_url(''))

        # Test get_pdf_metadata
        metadata = PdfService.get_pdf_metadata({
            'title': 'Test PDF',
            'author': 'Test Author',
            'numPages': 10,
            'pageSize': {'width': 612, 'height': 792}
        })
        self.assertEqual(metadata['title'], 'Test PDF')
        self.assertEqual(metadata['author'], 'Test Author')
        self.assertEqual(metadata['numPages'], 10)
        self.assertEqual(metadata['pageSize'], {'width': 612, 'height': 792})

    def test_annotation_service(self):
        """Test the AnnotationService."""
        # Test validate_annotation
        valid_annotation = {
            'type': 'drawing',
            'pageNumber': 1,
            'data': {'paths': []}
        }
        is_valid, _ = AnnotationService.validate_annotation(valid_annotation)
        self.assertTrue(is_valid)

        invalid_annotation = {
            'type': 'invalid',
            'pageNumber': 1,
            'data': {}
        }
        is_valid, error = AnnotationService.validate_annotation(invalid_annotation)
        self.assertFalse(is_valid)
        self.assertIn('Invalid annotation type', error)

        # Test process_annotations
        annotations = [valid_annotation]
        processed = AnnotationService.process_annotations(annotations, 'user1')
        self.assertEqual(len(processed), 1)
        self.assertEqual(processed[0]['type'], 'drawing')
        self.assertEqual(processed[0]['userId'], 'user1')
        self.assertIn('timestamp', processed[0])

        # Test serialize_annotations and deserialize_annotations
        serialized = AnnotationService.serialize_annotations(processed)
        deserialized = AnnotationService.deserialize_annotations(serialized)
        self.assertEqual(len(deserialized), 1)
        self.assertEqual(deserialized[0]['type'], 'drawing')
        self.assertEqual(deserialized[0]['userId'], 'user1')

    def test_thumbnail_service(self):
        """Test the ThumbnailService."""
        # Test process_thumbnail_data
        thumbnail_data = 'SGVsbG8gV29ybGQ='  # Base64 encoded "Hello World"
        processed = ThumbnailService.process_thumbnail_data(thumbnail_data)
        self.assertEqual(processed, thumbnail_data)

        data_url = 'data:image/png;base64,SGVsbG8gV29ybGQ='
        processed = ThumbnailService.process_thumbnail_data(data_url)
        self.assertEqual(processed, thumbnail_data)

        # Test generate_thumbnail_url
        url = ThumbnailService.generate_thumbnail_url('123', 'block-v1:123')
        self.assertEqual(url, '/xblock/block-v1:123/handler/get_pdf_thumbnail?id=123')


if __name__ == '__main__':
    unittest.main()