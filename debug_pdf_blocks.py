#!/usr/bin/env python3
"""
Debug script to check PDF block states
"""

import os
import sys
import django

# Add the project path
sys.path.append('/openedx/edx-platform')

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'lms.envs.production')
django.setup()

try:
    from xmodule.modulestore.django import modulestore
    from opaque_keys.edx.locator import CourseLocator

    print("=== PDF Block Debug ===")

    # Get modulestore
    store = modulestore()
    print(f"Modulestore: {type(store).__name__}")

    # Try to find courses
    courses = store.get_courses()
    print(f"Found {len(courses)} courses")

    for course in courses:
        print(f"\nCourse: {course.id}")

        # Look for PDF blocks
        try:
            items = store.get_items(course.id, qualifiers={'category': 'pdfx'})
            print(f"  Found {len(items)} PDF blocks")

            for item in items:
                print(f"  Block: {item.location}")
                print(f"    - pdf_url length: {len(item.pdf_url) if item.pdf_url else 0}")
                print(f"    - pdf_file_name: '{item.pdf_file_name}'")
                print(f"    - pdf_file_path: '{getattr(item, 'pdf_file_path', 'N/A')}'")

                if item.pdf_url:
                    if item.pdf_url.startswith('data:'):
                        print(f"    - pdf_url: data URL (length: {len(item.pdf_url)})")
                    else:
                        print(f"    - pdf_url: {item.pdf_url[:100]}...")
                else:
                    print(f"    - pdf_url: empty")

                # Check if file exists in storage
                if hasattr(item, 'pdf_file_path') and item.pdf_file_path:
                    try:
                        from django.core.files.storage import default_storage
                        if default_storage.exists(item.pdf_file_path):
                            file_size = default_storage.size(item.pdf_file_path)
                            print(f"    - file in storage: YES ({file_size} bytes)")
                        else:
                            print(f"    - file in storage: NO (path exists but file missing)")
                    except Exception as storage_error:
                        print(f"    - file in storage: ERROR ({storage_error})")
                else:
                    print(f"    - file in storage: N/A (no file path)")

        except Exception as e:
            print(f"  Error getting PDF blocks: {e}")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()