"""
Services for the PDF XBlock.

This module contains services for handling PDF-related operations
such as processing, storage, and annotation management.
"""

import os
import json
import logging
import base64
from datetime import datetime
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class PdfService:
    """Service for handling PDF-related operations."""

    @staticmethod
    def validate_pdf_url(url):
        """
        Validate the PDF URL.

        Args:
            url (str): The URL to validate.

        Returns:
            bool: True if the URL is valid, False otherwise.
        """
        if not url:
            return False

        parsed_url = urlparse(url)

        # Check if the URL has a scheme and netloc or is a relative path
        if not (parsed_url.scheme and parsed_url.netloc) and not os.path.isfile(url):
            return False

        # Check if the URL points to a PDF file
        if not parsed_url.path.lower().endswith('.pdf'):
            return False

        return True

    @staticmethod
    def get_pdf_metadata(pdf_data):
        """
        Extract metadata from PDF data.

        Args:
            pdf_data (dict): The PDF data.

        Returns:
            dict: The PDF metadata.
        """
        metadata = {
            'title': pdf_data.get('title', 'Untitled PDF'),
            'author': pdf_data.get('author', 'Unknown'),
            'numPages': pdf_data.get('numPages', 0),
            'pageSize': pdf_data.get('pageSize', {}),
        }
        return metadata


class AnnotationService:
    """Service for handling annotation operations."""

    @staticmethod
    def validate_annotation(annotation):
        """
        Validate an annotation.

        Args:
            annotation (dict): The annotation to validate.

        Returns:
            tuple: (bool, str) - (is_valid, error_message)
        """
        required_fields = ['type', 'pageNumber', 'data']

        for field in required_fields:
            if field not in annotation:
                return False, f"Missing required field: {field}"

        valid_types = ['drawing', 'highlight', 'text', 'shape']
        if annotation['type'] not in valid_types:
            return False, f"Invalid annotation type: {annotation['type']}"

        try:
            page_number = int(annotation['pageNumber'])
            if page_number < 1:
                return False, "Page number must be positive"
        except (ValueError, TypeError):
            return False, "Page number must be an integer"

        return True, ""

    @staticmethod
    def process_annotations(annotations, user_id=None):
        """
        Process and enrich annotations with metadata.

        Args:
            annotations (list): The list of annotations.
            user_id (str, optional): The user ID.

        Returns:
            list: The processed annotations.
        """
        processed = []
        timestamp = datetime.utcnow().isoformat()

        for annotation in annotations:
            # Only process valid annotations
            valid, _ = AnnotationService.validate_annotation(annotation)
            if not valid:
                continue

            # Add metadata
            annotation['timestamp'] = timestamp
            if user_id:
                annotation['userId'] = user_id

            processed.append(annotation)

        return processed

    @staticmethod
    def serialize_annotations(annotations):
        """
        Serialize annotations for storage.

        Args:
            annotations (list): The list of annotations.

        Returns:
            str: The serialized annotations.
        """
        try:
            return json.dumps(annotations)
        except (TypeError, ValueError) as e:
            logger.error(f"Error serializing annotations: {e}")
            return json.dumps([])

    @staticmethod
    def deserialize_annotations(serialized):
        """
        Deserialize annotations from storage.

        Args:
            serialized (str): The serialized annotations.

        Returns:
            list: The deserialized annotations.
        """
        if not serialized:
            return []

        try:
            return json.loads(serialized)
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Error deserializing annotations: {e}")
            return []


class ThumbnailService:
    """Service for handling PDF thumbnails."""

    @staticmethod
    def process_thumbnail_data(thumbnail_data):
        """
        Process thumbnail data.

        Args:
            thumbnail_data (str): Base64-encoded thumbnail data.

        Returns:
            str: Processed thumbnail data.
        """
        # Remove data URL prefix if present
        if thumbnail_data.startswith('data:image'):
            thumbnail_data = thumbnail_data.split(',')[1]

        # Validate base64 data
        try:
            base64.b64decode(thumbnail_data)
        except Exception as e:
            logger.error(f"Invalid thumbnail data: {e}")
            return None

        return thumbnail_data

    @staticmethod
    def generate_thumbnail_url(thumbnail_id, xblock_id):
        """
        Generate a URL for a thumbnail.

        Args:
            thumbnail_id (str): The thumbnail ID.
            xblock_id (str): The XBlock ID.

        Returns:
            str: The thumbnail URL.
        """
        return f"/xblock/{xblock_id}/handler/get_pdf_thumbnail?id={thumbnail_id}"