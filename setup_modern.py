#!/usr/bin/env python3
"""
Setup script for integrating modern ES6 PDF XBlock implementation
"""

import os
import sys
import json
import shutil
import subprocess
from pathlib import Path


class ModernPdfxSetup:
    """Setup utility for modern PDF XBlock implementation."""

    def __init__(self):
        self.root_dir = Path(__file__).parent
        self.pdfx_dir = self.root_dir / "pdfx"
        self.modern_dir = self.pdfx_dir / "static" / "js" / "modern"
        self.js_dir = self.pdfx_dir / "static" / "js"

    def check_requirements(self):
        """Check if all requirements are met."""
        print("🔍 Checking requirements...")

        # Check if Node.js is available
        try:
            result = subprocess.run(['node', '--version'], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✅ Node.js found: {result.stdout.strip()}")
            else:
                print("❌ Node.js not found. Please install Node.js 18+ to continue.")
                return False
        except FileNotFoundError:
            print("❌ Node.js not found. Please install Node.js 18+ to continue.")
            return False

        # Check if npm is available
        try:
            result = subprocess.run(['npm', '--version'], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✅ npm found: {result.stdout.strip()}")
            else:
                print("❌ npm not found.")
                return False
        except FileNotFoundError:
            print("❌ npm not found.")
            return False

        # Check if modern directory exists
        if not self.modern_dir.exists():
            print(f"❌ Modern directory not found: {self.modern_dir}")
            return False
        else:
            print(f"✅ Modern directory found: {self.modern_dir}")

        return True

    def build_modern_implementation(self):
        """Build the modern ES6 implementation."""
        print("\n🔨 Building modern ES6 implementation...")

        try:
            # Change to modern directory
            os.chdir(self.modern_dir)

            # Install dependencies
            print("📦 Installing dependencies...")
            result = subprocess.run(['npm', 'install'], capture_output=True, text=True)
            if result.returncode != 0:
                print(f"❌ npm install failed: {result.stderr}")
                return False
            print("✅ Dependencies installed")

            # Build the project
            print("🏗️ Building project...")
            result = subprocess.run(['npm', 'run', 'build'], capture_output=True, text=True)
            if result.returncode != 0:
                print(f"❌ Build failed: {result.stderr}")
                return False
            print("✅ Build completed")

            return True

        except Exception as e:
            print(f"❌ Build error: {e}")
            return False
        finally:
            # Return to root directory
            os.chdir(self.root_dir)

    def copy_built_files(self):
        """Copy built files to the main JS directory."""
        print("\n📁 Copying built files...")

        dist_dir = self.modern_dir / "dist"
        if not dist_dir.exists():
            print(f"❌ Dist directory not found: {dist_dir}")
            return False

        # Copy UMD bundle
        umd_file = dist_dir / "pdfx-xblock.umd.cjs"
        umd_map_file = dist_dir / "pdfx-xblock.umd.cjs.map"

        if umd_file.exists():
            target_file = self.js_dir / "pdfx-xblock-modern.js"
            target_map_file = self.js_dir / "pdfx-xblock-modern.js.map"

            shutil.copy2(umd_file, target_file)
            print(f"✅ Copied {umd_file} -> {target_file}")

            if umd_map_file.exists():
                shutil.copy2(umd_map_file, target_map_file)
                print(f"✅ Copied {umd_map_file} -> {target_map_file}")
        else:
            print(f"❌ UMD bundle not found: {umd_file}")
            return False

        return True

    def create_integration_option(self, option):
        """Create the chosen integration option."""
        print(f"\n⚙️ Setting up integration option {option}...")

        init_file = self.pdfx_dir / "__init__.py"

        if option == 1:
            # Complete replacement
            content = '''"""PDF XBlock - Modern ES6 Implementation"""
from .pdfx_modern import PdfxModernXBlock as PdfxXBlock

__all__ = ['PdfxXBlock']
'''
            print("🔄 Complete replacement - modern implementation will be the default")

        elif option == 2:
            # Side-by-side
            content = '''"""PDF XBlock - Dual Implementation"""
from .pdfx import PdfxXBlock
from .pdfx_modern import PdfxModernXBlock

__all__ = ['PdfxXBlock', 'PdfxModernXBlock']
'''
            print("🔄 Side-by-side deployment - both implementations available")

        elif option == 3:
            # Gradual migration - update existing class
            print("🔄 Gradual migration - adding feature flag to existing implementation")
            self._add_feature_flag()
            return True
        else:
            print("❌ Invalid option")
            return False

        # Write the new __init__.py
        with open(init_file, 'w') as f:
            f.write(content)

        print(f"✅ Updated {init_file}")
        return True

    def _add_feature_flag(self):
        """Add feature flag to existing implementation."""
        pdfx_file = self.pdfx_dir / "pdfx.py"

        # Read the existing file
        with open(pdfx_file, 'r') as f:
            content = f.read()

        # Add the feature flag field (simplified - you may need to adjust positioning)
        flag_field = '''
    # Modern implementation feature flag
    use_modern_implementation = Boolean(
        display_name="Use Modern Implementation",
        help="Use the modern ES6 modules implementation",
        scope=Scope.settings,
        default=False
    )
'''

        # Add after the last field definition (simplified insertion)
        # In a real implementation, you'd want more sophisticated insertion logic
        if 'use_modern_implementation' not in content:
            # Find a good insertion point (after other Boolean fields)
            insertion_point = content.rfind('scope=Scope.settings,\n        default=')
            if insertion_point != -1:
                # Find the end of that field
                next_newline = content.find('\n    )', insertion_point)
                if next_newline != -1:
                    insert_pos = next_newline + len('\n    )')
                    content = content[:insert_pos] + flag_field + content[insert_pos:]

        # Modify student_view method (simplified - you'd want better parsing)
        if 'if self.use_modern_implementation:' not in content:
            old_student_view = 'def student_view(self, context):'
            new_student_view = '''def student_view(self, context):
        """
        The primary view of the PdfxXBlock, with optional modern implementation.
        """
        if getattr(self, 'use_modern_implementation', False):
            from .pdfx_modern import PdfxModernXBlock
            # Create modern instance with same field values
            modern_instance = PdfxModernXBlock.__new__(PdfxModernXBlock)
            # Copy essential attributes
            for field_name in self.fields:
                if hasattr(self, field_name):
                    setattr(modern_instance, field_name, getattr(self, field_name))
            modern_instance.runtime = self.runtime
            return modern_instance.student_view(context)

        # Original implementation
'''
            content = content.replace(old_student_view, new_student_view, 1)

        # Write back
        with open(pdfx_file, 'w') as f:
            f.write(content)

        print(f"✅ Added feature flag to {pdfx_file}")

    def update_setup_py(self, option):
        """Update setup.py for the chosen option."""
        print("\n📝 Updating setup.py...")

        setup_file = self.root_dir / "setup.py"
        if not setup_file.exists():
            print(f"⚠️ setup.py not found at {setup_file}")
            return True  # Continue anyway

        with open(setup_file, 'r') as f:
            content = f.read()

        if option == 2:
            # Side-by-side: add both entry points
            if "'pdfx-modern" not in content:
                # Find entry_points section and add modern implementation
                if "'pdfx = pdfx:PdfxXBlock'" in content:
                    content = content.replace(
                        "'pdfx = pdfx:PdfxXBlock'",
                        "'pdfx = pdfx:PdfxXBlock',\n            'pdfx-modern = pdfx:PdfxModernXBlock'"
                    )
                    print("✅ Added pdfx-modern entry point")

        # Update version
        if 'version=' in content:
            import re
            content = re.sub(
                r'version\s*=\s*["\'][^"\']*["\']',
                'version="2.0.0"',
                content
            )
            print("✅ Updated version to 2.0.0")

        with open(setup_file, 'w') as f:
            f.write(content)

        return True

    def show_next_steps(self, option):
        """Show next steps after installation."""
        print("\n🎉 Setup completed successfully!")
        print("\n📋 Next Steps:")

        if option == 1:
            print("1. Restart your Open edX services")
            print("2. Test existing PDF XBlocks (they now use modern implementation)")
            print("3. Monitor browser console for any issues")

        elif option == 2:
            print("1. Restart your Open edX services")
            print("2. Use 'pdfx-modern' in new course content for modern implementation")
            print("3. Existing 'pdfx' blocks continue to use legacy implementation")
            print("4. Update course content gradually to use 'pdfx-modern'")

        elif option == 3:
            print("1. Restart your Open edX services")
            print("2. Enable 'Use Modern Implementation' in XBlock settings to test")
            print("3. Gradually migrate by enabling the flag on individual blocks")
            print("4. Monitor for any issues before full migration")

        print("\n🔍 Testing:")
        print("- Check browser console for initialization messages")
        print("- Test PDF loading, navigation, and annotation tools")
        print("- Verify annotation saving works correctly")
        print("- Test with large PDFs for performance")

        print("\n📚 Documentation:")
        print("- See MODERN_INTEGRATION_GUIDE.md for detailed information")
        print("- See ES6_MIGRATION_SUMMARY.md for technical details")
        print("- Check modern/src/ directory for source code")

    def run(self):
        """Run the complete setup process."""
        print("🚀 PDF XBlock Modern Implementation Setup")
        print("=" * 50)

        if not self.check_requirements():
            return False

        if not self.build_modern_implementation():
            return False

        if not self.copy_built_files():
            return False

        # Ask user for integration option
        print("\n🔧 Choose integration option:")
        print("1. Complete replacement (recommended for new deployments)")
        print("2. Side-by-side deployment (both old and new available)")
        print("3. Gradual migration (feature flag in existing implementation)")

        while True:
            try:
                choice = int(input("\nEnter your choice (1-3): "))
                if choice in [1, 2, 3]:
                    break
                else:
                    print("Please enter 1, 2, or 3")
            except ValueError:
                print("Please enter a valid number")

        if not self.create_integration_option(choice):
            return False

        if not self.update_setup_py(choice):
            return False

        self.show_next_steps(choice)
        return True


if __name__ == "__main__":
    setup = ModernPdfxSetup()
    success = setup.run()
    sys.exit(0 if success else 1)