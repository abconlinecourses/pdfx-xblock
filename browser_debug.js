// Browser Diagnostic Script for Modern PDF XBlock
// Copy and paste this into your browser console on a page with a PDF XBlock

(function() {
    'use strict';

    console.log('🔍 PDF XBlock Modern Implementation Diagnostic');
    console.log('=' * 50);

    // Check if we're on the right page
    const pdfBlocks = document.querySelectorAll('[data-block-type="pdfx"], .xblock[data-name="pdfx"], .xblock-student_view');
    console.log(`📋 Found ${pdfBlocks.length} potential PDF XBlocks on page`);

    if (pdfBlocks.length === 0) {
        console.warn('⚠️  No PDF XBlocks found on this page');
        console.log('💡 Navigate to a course page that contains a PDF XBlock');
        return;
    }

    // Check for modern JavaScript bundle
    const modernScript = document.querySelector('script[src*="pdfx-xblock-modern.js"]');
    if (modernScript) {
        console.log('✅ Modern JavaScript bundle found:', modernScript.src);
    } else {
        console.warn('❌ Modern JavaScript bundle NOT found');
        console.log('💡 Check if the XBlock is loading the modern implementation');
    }

    // Check for PDF.js
    if (typeof pdfjsLib !== 'undefined') {
        console.log('✅ PDF.js loaded:', pdfjsLib.version || 'version unknown');
        if (pdfjsLib.version && pdfjsLib.version.includes('5.2.133')) {
            console.log('✅ Modern PDF.js version detected');
        } else {
            console.warn('⚠️  PDF.js version might be outdated');
        }
    } else {
        console.warn('❌ PDF.js not found');
    }

    // Check for FabricJS
    if (typeof fabric !== 'undefined') {
        console.log('✅ FabricJS loaded:', fabric.version || 'version unknown');
        if (fabric.version && fabric.version.includes('6.6')) {
            console.log('✅ Modern FabricJS version detected');
        } else {
            console.warn('⚠️  FabricJS version might be outdated');
        }
    } else {
        console.warn('❌ FabricJS not found');
    }

    // Check for modern implementation instances
    if (typeof window.PdfxInstances !== 'undefined') {
        console.log('✅ Modern PDF XBlock instances found:', Object.keys(window.PdfxInstances));
        for (const [blockId, instance] of Object.entries(window.PdfxInstances)) {
            console.log(`   📄 Block ${blockId}:`, instance);
        }
    } else {
        console.warn('❌ No modern PDF XBlock instances found');
    }

    // Check for legacy implementation
    const legacyIndicators = [
        'pdfx_modules.js',
        'pdfx_init.js',
        'pdfx_view.js'
    ];

    let legacyFound = false;
    legacyIndicators.forEach(indicator => {
        const script = document.querySelector(`script[src*="${indicator}"]`);
        if (script) {
            console.warn(`⚠️  Legacy script found: ${indicator}`);
            legacyFound = true;
        }
    });

    if (legacyFound) {
        console.warn('❌ LEGACY IMPLEMENTATION IS STILL LOADING');
        console.log('💡 The XBlock may not be using the modern implementation');
    }

    // Check for modern console messages
    console.log('\n📋 Look for these console messages:');
    console.log('   ✅ "[PdfxModernXBlock] Initialized successfully with modern ES6 modules"');
    console.log('   ❌ If you see old PDF.js init messages, legacy is still running');

    // Check network requests
    console.log('\n🌐 Check Network Tab for:');
    console.log('   ✅ pdfx-xblock-modern.js');
    console.log('   ✅ pdf.js/5.2.133/pdf.min.mjs');
    console.log('   ✅ fabric.js/6.6.6/fabric.min.js');

    // Try to trigger manual initialization if modern bundle is present
    if (modernScript && typeof PdfxXBlock === 'function') {
        console.log('\n🔧 Attempting manual modern initialization...');

        pdfBlocks.forEach((element, index) => {
            try {
                const mockRuntime = {
                    handlerUrl: (elem, handler) => `/handler/${handler}`
                };

                const mockArgs = {
                    blockId: `debug-${index}`,
                    pdfUrl: 'test.pdf',
                    allowAnnotation: true,
                    allowDownload: true,
                    currentPage: 1,
                    savedAnnotations: {},
                    drawingStrokes: {},
                    highlights: {},
                    userId: 'debug-user',
                    courseId: 'debug-course'
                };

                const instance = PdfxXBlock(mockRuntime, element, mockArgs);
                console.log(`✅ Manually initialized modern instance ${index}:`, instance);

            } catch (error) {
                console.error(`❌ Failed to manually initialize instance ${index}:`, error);
            }
        });
    }

    console.log('\n📋 Summary:');
    console.log('If you see legacy indicators or missing modern components,');
    console.log('the XBlock services may need to be restarted or the configuration');
    console.log('may need to be checked.');

})();