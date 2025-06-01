#!/usr/bin/env python3
"""
Simple verification script to check if modern implementation is configured
"""

import os
import sys
from pathlib import Path

def check_files():
    """Check if all required files exist."""
    print("🔍 Checking Modern PDF XBlock Configuration")
    print("=" * 50)

    # Check root __init__.py
    root_init = Path("__init__.py")
    if root_init.exists():
        content = root_init.read_text()
        if "pdfx_modern" in content:
            print("✅ Root __init__.py configured for modern implementation")
        else:
            print("❌ Root __init__.py still uses legacy implementation")
            return False
    else:
        print("⚠️  Root __init__.py not found")

    # Check pdfx package __init__.py
    pdfx_init = Path("pdfx/__init__.py")
    if pdfx_init.exists():
        content = pdfx_init.read_text()
        if "pdfx_modern" in content:
            print("✅ Package __init__.py configured for modern implementation")
        else:
            print("❌ Package __init__.py still uses legacy implementation")
            return False
    else:
        print("❌ Package __init__.py not found")
        return False

    # Check modern implementation file
    modern_file = Path("pdfx/pdfx_modern.py")
    if modern_file.exists():
        print("✅ Modern implementation file exists")
        size = modern_file.stat().st_size
        print(f"   📊 File size: {size:,} bytes")
        if size < 1000:
            print("⚠️  File seems too small")
            return False
    else:
        print("❌ Modern implementation file not found")
        return False

    # Check modern JavaScript bundle
    js_file = Path("pdfx/static/js/pdfx-xblock-modern.js")
    if js_file.exists():
        print("✅ Modern JavaScript bundle exists")
        size = js_file.stat().st_size
        print(f"   📊 Bundle size: {size:,} bytes")
        if size < 10000:
            print("⚠️  Bundle seems too small")
            return False
    else:
        print("❌ Modern JavaScript bundle not found")
        return False

    # Check source map
    map_file = Path("pdfx/static/js/pdfx-xblock-modern.js.map")
    if map_file.exists():
        print("✅ Source map exists")
    else:
        print("⚠️  Source map not found (optional)")

    return True

def check_imports():
    """Check the import configuration."""
    print("\n📝 Checking Import Configuration:")

    # Check pdfx/__init__.py content
    pdfx_init = Path("pdfx/__init__.py")
    content = pdfx_init.read_text()

    lines = content.strip().split('\n')
    for i, line in enumerate(lines, 1):
        if 'from' in line and 'import' in line:
            print(f"   {i:2d}: {line.strip()}")
            if 'pdfx_modern' in line:
                print("       ✅ Imports modern implementation")
            elif 'pdfx.py' in line or 'from .pdfx import' in line:
                print("       ❌ Still imports legacy implementation")
                return False

    return True

def check_modern_file_content():
    """Check if the modern file has the expected content."""
    print("\n🔍 Checking Modern Implementation Content:")

    modern_file = Path("pdfx/pdfx_modern.py")
    content = modern_file.read_text()

    # Check for key indicators
    indicators = [
        ("PdfxModernXBlock class", "class PdfxModernXBlock"),
        ("Modern ES6 modules", "ES6 modules"),
        ("Modern JavaScript bundle", "pdfx-xblock-modern.js"),
        ("PDF.js v5.2.133", "pdf.js/5.2.133"),
        ("FabricJS v6.6.6", "fabric.js/6.6.6"),
        ("Modern initialization", "PdfxXBlock constructor")
    ]

    for name, pattern in indicators:
        if pattern in content:
            print(f"   ✅ {name} found")
        else:
            print(f"   ⚠️  {name} not found")

    return True

def show_browser_verification():
    """Show how to verify in browser."""
    print("\n🌐 Browser Verification Steps:")
    print("After restarting Open edX services, check these in browser:")
    print()
    print("1. Open browser dev tools (F12)")
    print("2. Look for console messages:")
    print("   ✅ '[PdfxModernXBlock] Initialized successfully with modern ES6 modules'")
    print("   ❌ If you see old PDF.js messages, legacy is still running")
    print()
    print("3. Network tab should show:")
    print("   ✅ pdfx-xblock-modern.js loading")
    print("   ✅ pdf.js/5.2.133/pdf.min.mjs")
    print("   ✅ fabric.js/6.6.6/fabric.min.js")
    print()
    print("4. UI should have:")
    print("   ✅ Modern responsive toolbar")
    print("   ✅ Better navigation controls")
    print("   ✅ Improved drawing tools")

def main():
    """Main verification function."""
    success = True

    if not check_files():
        success = False

    if not check_imports():
        success = False

    check_modern_file_content()

    if success:
        print("\n🎉 CONFIGURATION VERIFIED!")
        print("Modern implementation should be active after service restart.")
        show_browser_verification()

        print("\n📋 Next Steps:")
        print("1. Restart Open edX services:")
        print("   tutor local restart")
        print("   # OR")
        print("   sudo systemctl restart edxapp lms cms")
        print()
        print("2. Test with any PDF XBlock in your courses")
        print("3. Check browser console for confirmation messages")

    else:
        print("\n❌ CONFIGURATION ISSUES FOUND!")
        print("Please fix the issues above before proceeding.")

    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)