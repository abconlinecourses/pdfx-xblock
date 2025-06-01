#!/usr/bin/env python3
"""
Verification script to confirm modern PDF XBlock implementation is active
"""

import sys
import importlib.util

def verify_modern_implementation():
    """Verify that the modern implementation is being imported correctly."""

    print("🔍 Verifying PDF XBlock Modern Implementation")
    print("=" * 50)

    try:
        # Test the import that would happen in Open edX
        print("1. Testing import from pdfx package...")

        # Import the package
        import pdfx

        # Check what class is being imported
        xblock_class = pdfx.PdfxXBlock
        print(f"   ✅ Successfully imported: {xblock_class}")
        print(f"   📍 Class location: {xblock_class.__module__}")

        # Check if it's the modern implementation
        if 'pdfx_modern' in xblock_class.__module__:
            print("   🎉 MODERN IMPLEMENTATION IS ACTIVE!")

            # Check if the modern methods exist
            if hasattr(xblock_class, 'student_view'):
                print("   ✅ student_view method found")

                # Get the method source to verify it's using modern JS
                import inspect
                try:
                    source = inspect.getsource(xblock_class.student_view)
                    if 'pdfx-xblock-modern.js' in source:
                        print("   ✅ Modern JavaScript bundle detected in student_view")
                    else:
                        print("   ⚠️  Modern JavaScript bundle NOT found in student_view")
                except:
                    print("   ⚠️  Could not inspect student_view source")

        elif 'pdfx.py' in xblock_class.__module__:
            print("   ❌ LEGACY IMPLEMENTATION IS STILL ACTIVE!")
            print("   💡 The __init__.py file might not be updated correctly")
            return False
        else:
            print(f"   ❓ Unknown implementation: {xblock_class.__module__}")
            return False

        print("\n2. Checking for modern JavaScript bundle...")

        # Check if the modern JS file exists
        from pathlib import Path
        js_file = Path(__file__).parent / "pdfx" / "static" / "js" / "pdfx-xblock-modern.js"

        if js_file.exists():
            print(f"   ✅ Modern JS bundle found: {js_file}")
            print(f"   📊 File size: {js_file.stat().st_size:,} bytes")
        else:
            print(f"   ❌ Modern JS bundle NOT found: {js_file}")
            return False

        print("\n3. Testing XBlock initialization...")

        # Create a mock runtime and test initialization
        class MockRuntime:
            def handlerUrl(self, element, handler):
                return f"/handler/{handler}"

        class MockElement:
            pass

        try:
            # Test creating an instance
            runtime = MockRuntime()
            element = MockElement()
            instance = xblock_class(runtime, None, None, None)

            print("   ✅ XBlock instance created successfully")
            print(f"   📋 Instance type: {type(instance)}")

            # Check if it has the modern method signature
            if hasattr(instance, 'student_view'):
                print("   ✅ student_view method accessible")

            return True

        except Exception as e:
            print(f"   ❌ Error creating XBlock instance: {e}")
            return False

    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("💡 Make sure you're running this from the correct directory")
        return False

    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def show_next_steps():
    """Show what to do next."""
    print("\n📋 Next Steps:")
    print("1. Restart your Open edX services:")
    print("   tutor local restart  # for Tutor")
    print("   # OR")
    print("   sudo systemctl restart edxapp lms cms  # for native install")
    print()
    print("2. Test in browser:")
    print("   - Open browser dev tools (F12)")
    print("   - Look for console message: '[PdfxModernXBlock] Initialized successfully with modern ES6 modules'")
    print("   - Check that PDF loading is faster and UI looks modern")
    print()
    print("3. Debug if needed:")
    print("   - Check browser console for any JavaScript errors")
    print("   - Verify network tab shows pdfx-xblock-modern.js loading")
    print("   - Look for modern toolbar with responsive design")

if __name__ == "__main__":
    success = verify_modern_implementation()

    if success:
        print("\n🎉 VERIFICATION SUCCESSFUL!")
        print("The modern PDF XBlock implementation is properly configured.")
        show_next_steps()
    else:
        print("\n❌ VERIFICATION FAILED!")
        print("The modern implementation is not active. Please check the setup.")

    sys.exit(0 if success else 1)