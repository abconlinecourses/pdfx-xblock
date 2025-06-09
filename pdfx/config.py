"""
Configuration settings for the PDF XBlock.

This module contains default configuration settings and
constants used throughout the XBlock.
"""

# Default settings for the PDF XBlock
DEFAULT_SETTINGS = {
    # Display settings
    'display_name': 'PDF Viewer',
    'pdf_url': '',
    'height': 800,
    'width': '100%',
    'show_toolbar': True,
    'enable_fullscreen': True,
    'enable_download': True,
    'enable_print': True,

    # Annotation settings
    'enable_annotations': True,
    'annotation_sync_interval': 60,  # in seconds
    'default_annotation_color': '#ff0000',
    'default_annotation_width': 2,

    # Navigation settings
    'enable_thumbnail_nav': True,
    'enable_page_number_input': True,
    'enable_keyboard_shortcuts': True,

    # Zoom settings
    'default_zoom': 'auto',
    'min_zoom': 0.5,
    'max_zoom': 5.0,
    'zoom_step': 0.1,

    # Display options
    'enable_brightness_control': True,
    'enable_grayscale_option': True,
    'enable_eink_mode': True,

    # Tool settings
    'available_tools': [
        'pan',
        'pencil',
        'highlighter',
        'rectangle',
        'circle',
        'line',
        'arrow',
        'text',
        'eraser'
    ],
    'default_tool': 'pan',

    # Performance settings
    'cache_pdf': True,
    'preload_pages': 2,  # Number of pages to preload
    'render_text_layer': True,
    'disable_animations_on_mobile': True,

    # Advanced settings
    'pdf_worker_url': '',  # Default uses CDN
    'annotation_storage_limit': 10 * 1024 * 1024,  # 10MB
    'debug_mode': False
}

# Tool definitions
TOOL_DEFINITIONS = {
    'pan': {
        'icon': 'fa-hand-paper',
        'tooltip': 'Pan/Select',
        'cursor': 'grab',
        'category': 'navigation'
    },
    'pencil': {
        'icon': 'fa-pencil-alt',
        'tooltip': 'Draw',
        'cursor': 'crosshair',
        'category': 'drawing'
    },
    'highlighter': {
        'icon': 'fa-highlighter',
        'tooltip': 'Highlight',
        'cursor': 'crosshair',
        'category': 'drawing'
    },
    'rectangle': {
        'icon': 'fa-square',
        'tooltip': 'Rectangle',
        'cursor': 'crosshair',
        'category': 'shape'
    },
    'circle': {
        'icon': 'fa-circle',
        'tooltip': 'Circle',
        'cursor': 'crosshair',
        'category': 'shape'
    },
    'line': {
        'icon': 'fa-slash',
        'tooltip': 'Line',
        'cursor': 'crosshair',
        'category': 'shape'
    },
    'arrow': {
        'icon': 'fa-long-arrow-alt-right',
        'tooltip': 'Arrow',
        'cursor': 'crosshair',
        'category': 'shape'
    },
    'text': {
        'icon': 'fa-font',
        'tooltip': 'Text',
        'cursor': 'text',
        'category': 'text'
    },
    'eraser': {
        'icon': 'fa-eraser',
        'tooltip': 'Eraser',
        'cursor': 'crosshair',
        'category': 'drawing'
    }
}

# Keyboard shortcuts
KEYBOARD_SHORTCUTS = {
    'next_page': ['ArrowRight', 'PageDown'],
    'prev_page': ['ArrowLeft', 'PageUp'],
    'first_page': ['Home'],
    'last_page': ['End'],
    'zoom_in': ['=', '+'],
    'zoom_out': ['-', '_'],
    'reset_zoom': ['0'],
    'fullscreen': ['f', 'F'],
    'escape': ['Escape'],
    'save': ['s', 'S'],
    'undo': ['z', 'Z'],
    'redo': ['y', 'Y'],
    'toggle_sidebar': ['b', 'B'],
    'toggle_drawing_mode': ['d', 'D'],
    'toggle_highlight_mode': ['h', 'H'],
    'toggle_text_mode': ['t', 'T'],
    'pan_tool': ['v', 'V'],
    'pencil_tool': ['p', 'P'],
    'rectangle_tool': ['r', 'R'],
    'eraser_tool': ['e', 'E']
}

# Other constants
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
MAX_ANNOTATION_COUNT = 1000
SUPPORTED_PDF_VERSIONS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7]
DEFAULT_TOOLBAR_GROUPS = [
    'navigation', 'zoom', 'drawing', 'shape', 'text', 'utility', 'display'
]