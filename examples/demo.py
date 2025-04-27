#!/usr/bin/env python
"""
Standalone demonstration of the PDF XBlock functionality.

This script creates a simple web server to demonstrate
the PDF XBlock features without requiring a full Open edX installation.
"""

import os
import sys
import json
import logging
import argparse
import random
import string
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
import webbrowser
from urllib.parse import parse_qs, urlparse

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
DEFAULT_PORT = 8000
DEFAULT_PDF_URL = "https://arxiv.org/pdf/1706.03762.pdf"  # Attention Is All You Need paper
DEMO_DIR = os.path.dirname(os.path.abspath(__file__))
SAMPLE_ANNOTATIONS = {
    "annotations": [
        {
            "type": "drawing",
            "pageNumber": 1,
            "data": {
                "paths": [
                    {
                        "points": [
                            {"x": 100, "y": 100, "time": 1620000000000},
                            {"x": 150, "y": 150, "time": 1620000000100},
                            {"x": 200, "y": 100, "time": 1620000000200}
                        ],
                        "color": "#ff0000",
                        "width": 2
                    }
                ]
            },
            "timestamp": "2023-01-01T00:00:00.000Z",
            "userId": "demo-user"
        },
        {
            "type": "highlight",
            "pageNumber": 1,
            "data": {
                "rects": [
                    {"x": 100, "y": 200, "width": 300, "height": 20}
                ],
                "color": "#ffff00"
            },
            "timestamp": "2023-01-01T00:00:00.000Z",
            "userId": "demo-user"
        },
        {
            "type": "text",
            "pageNumber": 1,
            "data": {
                "text": "This is a sample note",
                "position": {"x": 300, "y": 300},
                "color": "#0000ff",
                "fontSize": 14
            },
            "timestamp": "2023-01-01T00:00:00.000Z",
            "userId": "demo-user"
        }
    ]
}


class DemoRequestHandler(SimpleHTTPRequestHandler):
    """Custom request handler for the demo server."""

    def __init__(self, *args, pdf_url=DEFAULT_PDF_URL, **kwargs):
        self.pdf_url = pdf_url
        self.annotations = SAMPLE_ANNOTATIONS.copy()
        super().__init__(*args, **kwargs)

    def do_GET(self):
        """Handle GET requests."""
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        # Handle API requests
        if path.startswith('/api/'):
            self.handle_api_request(path, parsed_url)
            return

        # Serve static files
        if path == '/':
            self.serve_demo_page()
        else:
            super().do_GET()

    def do_POST(self):
        """Handle POST requests."""
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')

        if self.path == '/api/save_annotations':
            self.handle_save_annotations(post_data)
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not Found')

    def handle_api_request(self, path, parsed_url):
        """Handle API GET requests."""
        if path == '/api/get_annotations':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(self.annotations).encode())
        elif path == '/api/get_pdf_url':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"url": self.pdf_url}).encode())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not Found')

    def handle_save_annotations(self, post_data):
        """Handle saving annotations."""
        try:
            new_annotations = json.loads(post_data)
            self.annotations = {"annotations": new_annotations}

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode())

            logger.info(f"Saved {len(new_annotations)} annotations")
        except json.JSONDecodeError:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "message": "Invalid JSON"}).encode())

    def serve_demo_page(self):
        """Serve the demo HTML page."""
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()

        with open(os.path.join(DEMO_DIR, 'index.html'), 'rb') as f:
            content = f.read()

        self.wfile.write(content)

    def log_message(self, format, *args):
        """Override to use our logger."""
        logger.info("%s - %s", self.address_string(), format % args)


def generate_session_id():
    """Generate a random session ID."""
    return ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(10))


def start_demo_server(port, pdf_url):
    """Start the demo HTTP server."""
    handler = lambda *args, **kwargs: DemoRequestHandler(*args, pdf_url=pdf_url, **kwargs)
    server = HTTPServer(('', port), handler)

    server_thread = threading.Thread(target=server.serve_forever)
    server_thread.daemon = True
    server_thread.start()

    url = f"http://localhost:{port}/"
    logger.info(f"Demo server started at {url}")
    logger.info(f"Using PDF: {pdf_url}")
    logger.info("Press Ctrl+C to stop the server")

    # Open the browser
    webbrowser.open(url)

    try:
        # Keep the main thread alive
        server_thread.join()
    except KeyboardInterrupt:
        logger.info("Shutting down server...")
        server.shutdown()
        server.server_close()
        sys.exit(0)


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='Run PDF XBlock demo server')
    parser.add_argument('-p', '--port', type=int, default=DEFAULT_PORT,
                        help=f'Port to run the server on (default: {DEFAULT_PORT})')
    parser.add_argument('-u', '--pdf-url', type=str, default=DEFAULT_PDF_URL,
                        help=f'URL of the PDF to display (default: {DEFAULT_PDF_URL})')
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_arguments()
    start_demo_server(args.port, args.pdf_url)