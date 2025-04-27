# PDF Viewer XBlock

A rich PDF annotation and viewing XBlock for Open edX that provides advanced features similar to professional PDF annotation tools. This XBlock allows students to view PDFs with features like drawing, highlighting, commenting, and more.

## Features

- **PDF Viewing**: High-quality PDF rendering using PDF.js
- **Drawing**: Freehand drawing tools with customizable colors and line widths
- **Shapes**: Add rectangles, circles, lines, and arrows to PDFs
- **Text Highlighting**: Highlight text in PDFs with customizable colors
- **Text Notes**: Add sticky notes and comments to PDFs
- **Annotations**: All annotations are saved and persisted between sessions
- **Page Navigation**: Easy page navigation with thumbnails and keyboard shortcuts
- **Zoom Controls**: Zoom in, zoom out, and fit to page
- **Display Options**: Brightness control, grayscale mode, and e-ink mode
- **Download**: Download annotated PDFs
- **Fullscreen Mode**: View PDFs in fullscreen mode
- **Responsive Design**: Works on desktop and mobile devices

## Installation

### From PyPI

```bash
pip install pdfx-xblock
```

### From Source

Clone this repository and install it using pip:

```bash
git clone https://github.com/yourusername/pdfx-xblock
cd pdfx-xblock
pip install -e .
```

### Enable in Open edX

Add `pdfx` to the list of advanced modules in Studio:

1. Go to Settings > Advanced Settings
2. Find the "Advanced Module List" field
3. Add `"pdfx"` to the list
4. Click "Save Changes"

## Usage

### Adding a PDF to a Course

1. In Studio, add an "Advanced" component to a unit
2. Select "PDF Viewer" from the list
3. Upload a PDF file or specify a URL
4. Configure options like allowing downloads and annotations
5. Save and publish the unit

### Student Experience

Students can:

- Navigate between pages using arrows or keyboard shortcuts
- Zoom in/out using buttons or keyboard shortcuts
- Annotate the PDF with various tools
- Change display options (brightness, grayscale, etc.)
- Download the annotated PDF

## Development

### Prerequisites

- Python 3.8+
- Node.js 14+ (for building frontend assets)

### Setup

1. Clone the repository
2. Install the package in development mode:
   ```bash
   pip install -e .
   ```

3. Run the development server:
   ```bash
   cd pdfx-xblock
   python -m http.server
   ```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [PDF.js](https://mozilla.github.io/pdf.js/) - PDF rendering engine
- [Fabric.js](http://fabricjs.com/) - Canvas drawing library
- [Open edX](https://open.edx.org/) - Open source learning platform
