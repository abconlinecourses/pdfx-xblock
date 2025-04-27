# PDF XBlock Usage Guide

This guide provides detailed information on how to use the PDF XBlock in your courses.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Configuring the PDF XBlock](#configuring-the-pdf-xblock)
3. [Student Features](#student-features)
4. [Annotation Tools](#annotation-tools)
5. [Navigation and Display Options](#navigation-and-display-options)
6. [Keyboard Shortcuts](#keyboard-shortcuts)
7. [Troubleshooting](#troubleshooting)

## Basic Setup

To add a PDF XBlock to your course:

1. In Studio, navigate to the unit where you want to add the PDF.
2. Click the "Add New Component" button.
3. Select "Advanced" from the component types.
4. Select "PDF Viewer" from the list of XBlocks.
5. Click "Edit" on the newly added component.
6. Enter the display name and URL of your PDF.
7. Configure additional settings as desired.
8. Click "Save" to apply your changes.

## Configuring the PDF XBlock

The PDF XBlock has several configuration options:

| Setting | Description | Default |
|---------|-------------|---------|
| Display Name | The name displayed to students | "PDF Viewer" |
| PDF URL | URL or path to the PDF file | "" |
| Height | Height of the viewer (in pixels) | 800 |
| Show Toolbar | Shows/hides the toolbar | True |
| Enable Fullscreen | Allows fullscreen viewing | True |
| Enable Annotations | Allows students to annotate | True |
| Enable Thumbnail Navigation | Shows page thumbnails | True |
| Enable Keyboard Shortcuts | Enables keyboard shortcuts | True |

### PDF URL Configuration

The PDF URL can be:

- A full URL to a publicly accessible PDF (e.g., `https://example.com/document.pdf`)
- A path to a PDF in your course files (e.g., `/static/pdfs/document.pdf`)
- A path to a PDF in the LMS static files (e.g., `/asset/v1/course/block-id/document.pdf`)

## Student Features

Students can use the PDF XBlock to:

- View PDF documents directly in the course
- Navigate between pages using the toolbar or keyboard shortcuts
- Zoom in and out, or fit the document to the screen
- Use various annotation tools (if enabled)
- Adjust brightness and display settings
- Download the PDF (if enabled)

## Annotation Tools

The PDF XBlock provides the following annotation tools (if enabled):

| Tool | Description | Icon |
|------|-------------|------|
| Pan | Navigate around the document | 🖐️ |
| Pencil | Free-hand drawing | ✏️ |
| Highlighter | Highlight text | 🖌️ |
| Rectangle | Draw rectangles | □ |
| Circle | Draw circles | ○ |
| Line | Draw straight lines | ╱ |
| Arrow | Draw arrows | → |
| Text | Add text notes | T |
| Eraser | Remove annotations | 🧽 |

### Using Annotation Tools

1. Select the desired tool from the toolbar.
2. For drawing tools:
   - Click and drag on the document to draw.
   - Release to finish the drawing.
3. For text tools:
   - Click where you want to add text.
   - Type your note.
   - Click outside the text box when done.
4. For the highlighter:
   - Select text in the document.
   - The text will be highlighted automatically.
5. For the eraser:
   - Click and drag over annotations to erase them.

### Saving Annotations

Annotations are automatically saved as you work. They persist between sessions, so students can return to the document and continue working where they left off.

## Navigation and Display Options

The PDF XBlock provides several navigation and display options:

| Feature | Description | Control |
|---------|-------------|---------|
| Page Navigation | Move between pages | Arrow buttons or keyboard |
| Zoom | Adjust document size | Zoom buttons or keyboard |
| Page Fit | Fit document to screen | Fit button |
| Brightness | Adjust brightness | Brightness slider |
| Grayscale | Toggle grayscale mode | Grayscale button |
| E-ink Mode | Toggle e-ink mode | E-ink button |
| Thumbnails | View page thumbnails | Thumbnails button |

## Keyboard Shortcuts

The PDF XBlock supports the following keyboard shortcuts:

| Action | Shortcut |
|--------|----------|
| Next Page | Right Arrow, Page Down |
| Previous Page | Left Arrow, Page Up |
| First Page | Home |
| Last Page | End |
| Zoom In | + or = |
| Zoom Out | - |
| Reset Zoom | 0 |
| Fullscreen | F |
| Escape Fullscreen | Escape |
| Save Annotations | S |
| Undo | Z |
| Redo | Y |
| Toggle Sidebar | B |
| Toggle Drawing Mode | D |
| Toggle Highlight Mode | H |
| Toggle Text Mode | T |
| Pan Tool | V |
| Pencil Tool | P |
| Rectangle Tool | R |
| Eraser Tool | E |

## Troubleshooting

### Common Issues

1. **PDF doesn't load:**
   - Check that the PDF URL is correct and accessible.
   - Ensure the PDF is not too large (max 50MB).
   - Try using a different browser.

2. **Annotations don't save:**
   - Check your internet connection.
   - Make sure you have permission to save annotations.
   - Ensure browser storage is not full or restricted.

3. **Display issues:**
   - Try adjusting the zoom or fit options.
   - Check if the browser has any content blockers enabled.
   - Ensure JavaScript is enabled in the browser.

### Support

If you encounter issues not covered in this guide, please:

1. Check the [Github repository](https://github.com/yourusername/pdfx-xblock) for known issues.
2. Submit a new issue with details about the problem, including:
   - Browser and operating system
   - Steps to reproduce the issue
   - Error messages, if any
   - Screenshots, if applicable