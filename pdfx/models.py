"""
Models for the PDF XBlock.

This module contains data models and structures for
PDF annotations and user interactions.
"""

import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class PDFDocument:
    """Model representing a PDF document."""

    def __init__(self, url, title=None, author=None, pages=0):
        """
        Initialize a PDF document.

        Args:
            url (str): The URL to the PDF.
            title (str, optional): The title of the PDF.
            author (str, optional): The author of the PDF.
            pages (int, optional): The number of pages in the PDF.
        """
        self.url = url
        self.title = title or "Untitled Document"
        self.author = author or "Unknown"
        self.pages = pages
        self.annotations = {}  # Dictionary mapping page numbers to annotations
        self.thumbnails = {}   # Dictionary mapping page numbers to thumbnail URLs

    def to_dict(self):
        """
        Convert the document to a dictionary.

        Returns:
            dict: The document as a dictionary.
        """
        return {
            'url': self.url,
            'title': self.title,
            'author': self.author,
            'pages': self.pages,
            'annotations': self.annotations,
            'thumbnails': self.thumbnails
        }

    @classmethod
    def from_dict(cls, data):
        """
        Create a document from a dictionary.

        Args:
            data (dict): The dictionary to create the document from.

        Returns:
            PDFDocument: The created document.
        """
        doc = cls(
            url=data.get('url', ''),
            title=data.get('title', 'Untitled Document'),
            author=data.get('author', 'Unknown'),
            pages=data.get('pages', 0)
        )
        doc.annotations = data.get('annotations', {})
        doc.thumbnails = data.get('thumbnails', {})
        return doc


class Annotation:
    """Base class for PDF annotations."""

    def __init__(self, page_number, user_id=None):
        """
        Initialize an annotation.

        Args:
            page_number (int): The page number the annotation is on.
            user_id (str, optional): The ID of the user who created the annotation.
        """
        self.page_number = page_number
        self.user_id = user_id
        self.timestamp = datetime.utcnow().isoformat()
        self.id = f"{self.timestamp}-{hash(self)}"
        self.type = "base"

    def to_dict(self):
        """
        Convert the annotation to a dictionary.

        Returns:
            dict: The annotation as a dictionary.
        """
        return {
            'id': self.id,
            'type': self.type,
            'pageNumber': self.page_number,
            'userId': self.user_id,
            'timestamp': self.timestamp
        }

    @classmethod
    def from_dict(cls, data):
        """
        Create an annotation from a dictionary.

        Args:
            data (dict): The dictionary to create the annotation from.

        Returns:
            Annotation: The created annotation.
        """
        annotation = cls(
            page_number=data.get('pageNumber', 1),
            user_id=data.get('userId')
        )
        annotation.id = data.get('id', annotation.id)
        annotation.timestamp = data.get('timestamp', annotation.timestamp)
        return annotation


class DrawingAnnotation(Annotation):
    """Model representing a drawing annotation."""

    def __init__(self, page_number, paths, color="#000000", width=2, user_id=None):
        """
        Initialize a drawing annotation.

        Args:
            page_number (int): The page number the annotation is on.
            paths (list): List of path objects with points.
            color (str, optional): The color of the drawing.
            width (int, optional): The width of the drawing.
            user_id (str, optional): The ID of the user who created the annotation.
        """
        super().__init__(page_number, user_id)
        self.paths = paths
        self.color = color
        self.width = width
        self.type = "drawing"

    def to_dict(self):
        """
        Convert the drawing annotation to a dictionary.

        Returns:
            dict: The drawing annotation as a dictionary.
        """
        data = super().to_dict()
        data.update({
            'data': {
                'paths': self.paths,
                'color': self.color,
                'width': self.width
            }
        })
        return data

    @classmethod
    def from_dict(cls, data):
        """
        Create a drawing annotation from a dictionary.

        Args:
            data (dict): The dictionary to create the annotation from.

        Returns:
            DrawingAnnotation: The created drawing annotation.
        """
        annotation_data = data.get('data', {})
        annotation = cls(
            page_number=data.get('pageNumber', 1),
            paths=annotation_data.get('paths', []),
            color=annotation_data.get('color', "#000000"),
            width=annotation_data.get('width', 2),
            user_id=data.get('userId')
        )
        annotation.id = data.get('id', annotation.id)
        annotation.timestamp = data.get('timestamp', annotation.timestamp)
        return annotation


class TextAnnotation(Annotation):
    """Model representing a text annotation."""

    def __init__(self, page_number, text, position, color="#000000", font_size=14, user_id=None):
        """
        Initialize a text annotation.

        Args:
            page_number (int): The page number the annotation is on.
            text (str): The text content.
            position (dict): The position {x, y} of the text.
            color (str, optional): The color of the text.
            font_size (int, optional): The font size of the text.
            user_id (str, optional): The ID of the user who created the annotation.
        """
        super().__init__(page_number, user_id)
        self.text = text
        self.position = position
        self.color = color
        self.font_size = font_size
        self.type = "text"

    def to_dict(self):
        """
        Convert the text annotation to a dictionary.

        Returns:
            dict: The text annotation as a dictionary.
        """
        data = super().to_dict()
        data.update({
            'data': {
                'text': self.text,
                'position': self.position,
                'color': self.color,
                'fontSize': self.font_size
            }
        })
        return data

    @classmethod
    def from_dict(cls, data):
        """
        Create a text annotation from a dictionary.

        Args:
            data (dict): The dictionary to create the annotation from.

        Returns:
            TextAnnotation: The created text annotation.
        """
        annotation_data = data.get('data', {})
        annotation = cls(
            page_number=data.get('pageNumber', 1),
            text=annotation_data.get('text', ''),
            position=annotation_data.get('position', {'x': 0, 'y': 0}),
            color=annotation_data.get('color', "#000000"),
            font_size=annotation_data.get('fontSize', 14),
            user_id=data.get('userId')
        )
        annotation.id = data.get('id', annotation.id)
        annotation.timestamp = data.get('timestamp', annotation.timestamp)
        return annotation


class HighlightAnnotation(Annotation):
    """Model representing a highlight annotation."""

    def __init__(self, page_number, rects, color="#ffff00", user_id=None):
        """
        Initialize a highlight annotation.

        Args:
            page_number (int): The page number the annotation is on.
            rects (list): List of rectangle objects {x, y, width, height}.
            color (str, optional): The color of the highlight.
            user_id (str, optional): The ID of the user who created the annotation.
        """
        super().__init__(page_number, user_id)
        self.rects = rects
        self.color = color
        self.type = "highlight"

    def to_dict(self):
        """
        Convert the highlight annotation to a dictionary.

        Returns:
            dict: The highlight annotation as a dictionary.
        """
        data = super().to_dict()
        data.update({
            'data': {
                'rects': self.rects,
                'color': self.color
            }
        })
        return data

    @classmethod
    def from_dict(cls, data):
        """
        Create a highlight annotation from a dictionary.

        Args:
            data (dict): The dictionary to create the annotation from.

        Returns:
            HighlightAnnotation: The created highlight annotation.
        """
        annotation_data = data.get('data', {})
        annotation = cls(
            page_number=data.get('pageNumber', 1),
            rects=annotation_data.get('rects', []),
            color=annotation_data.get('color', "#ffff00"),
            user_id=data.get('userId')
        )
        annotation.id = data.get('id', annotation.id)
        annotation.timestamp = data.get('timestamp', annotation.timestamp)
        return annotation


class ShapeAnnotation(Annotation):
    """Model representing a shape annotation."""

    def __init__(self, page_number, shape_type, points, color="#000000", width=2, fill=None, user_id=None):
        """
        Initialize a shape annotation.

        Args:
            page_number (int): The page number the annotation is on.
            shape_type (str): The type of shape ('rectangle', 'circle', 'line', 'arrow').
            points (list): List of points defining the shape.
            color (str, optional): The stroke color of the shape.
            width (int, optional): The stroke width of the shape.
            fill (str, optional): The fill color of the shape.
            user_id (str, optional): The ID of the user who created the annotation.
        """
        super().__init__(page_number, user_id)
        self.shape_type = shape_type
        self.points = points
        self.color = color
        self.width = width
        self.fill = fill
        self.type = "shape"

    def to_dict(self):
        """
        Convert the shape annotation to a dictionary.

        Returns:
            dict: The shape annotation as a dictionary.
        """
        data = super().to_dict()
        data.update({
            'data': {
                'shapeType': self.shape_type,
                'points': self.points,
                'color': self.color,
                'width': self.width,
                'fill': self.fill
            }
        })
        return data

    @classmethod
    def from_dict(cls, data):
        """
        Create a shape annotation from a dictionary.

        Args:
            data (dict): The dictionary to create the annotation from.

        Returns:
            ShapeAnnotation: The created shape annotation.
        """
        annotation_data = data.get('data', {})
        annotation = cls(
            page_number=data.get('pageNumber', 1),
            shape_type=annotation_data.get('shapeType', 'rectangle'),
            points=annotation_data.get('points', []),
            color=annotation_data.get('color', "#000000"),
            width=annotation_data.get('width', 2),
            fill=annotation_data.get('fill'),
            user_id=data.get('userId')
        )
        annotation.id = data.get('id', annotation.id)
        annotation.timestamp = data.get('timestamp', annotation.timestamp)
        return annotation