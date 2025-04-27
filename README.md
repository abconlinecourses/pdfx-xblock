# PDF XBlock

An interactive PDF viewer XBlock for Open edX, providing advanced features such as highlighting, annotations, and user interaction tracking.

## Features

- Responsive PDF viewing with zoom, page navigation, and fullscreen support
- Text highlighting with automatic saving
- Per-user annotations stored in MongoDB
- Brightness and grayscale view controls
- Instructor analytics for viewing student interactions (coming soon)

## Installation

### Standard Installation

```bash
pip install pdfx-xblock
```

### Development Installation

```bash
git clone https://github.com/your-repo/pdfx-xblock.git
cd pdfx-xblock
pip install -e .
```

## MongoDB Configuration

This XBlock uses MongoDB to store user highlights and annotations. You need to configure MongoDB connection settings:

1. Through Open edX settings:

Add the following to your `lms.env.json` and `cms.env.json`:

```json
{
  "MONGODB_URI": "mongodb://localhost:27017/",
  "MONGODB_DATABASE": "pdfx_annotations"
}
```

2. Or modify the connection settings in `models.py`:

```python
mongo_client = MongoClient('your-mongodb-uri')
mongo_db = mongo_client.get_database('your_database_name')
```

## Usage

### Adding to Course

1. Enable the XBlock in your course's advanced settings by adding "pdfx" to the "Advanced Module List"
2. Create a new unit and select "Advanced" > "PDF Viewer" from the component menu
3. Configure the PDF by either:
   - Uploading a PDF file
   - Providing a URL to a PDF file

### Configuration Options

- **Display Name**: The name displayed to students
- **PDF File**: Upload a PDF file or provide a URL
- **Allow Download**: Enable/disable downloading the PDF
- **Allow Annotation**: Enable/disable text highlighting and annotations

## Highlighting Feature

The PDF XBlock includes a text highlighting feature that:

- Allows students to highlight important text in the document
- Saves highlights to MongoDB for persistence
- Stores highlight metadata including:
  - Document information (title, URL)
  - User information (user ID, username)
  - Course information (course ID)
  - Page number and position
  - Highlighted text content
  - Timestamp

Students can:
- Double-click a highlight to remove it
- See all their own highlights across course materials
- Highlight text in yellow by selecting it while in highlight mode

## Developers

### Structure

- `pdfx/pdfx.py`: Main XBlock implementation
- `pdfx/models.py`: Data models and MongoDB integration
- `pdfx/static/js/src/`: JavaScript implementation
  - `pdfx_init.js`: Core initialization
  - `pdfx_highlight.js`: Text highlighting implementation

### Adding Features

To contribute new features:

1. Fork the repository
2. Create a feature branch
3. Add tests for your feature
4. Submit a pull request

## License

This code is licensed under the MIT license.
