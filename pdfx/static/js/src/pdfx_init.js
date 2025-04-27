/**
 * PDF.js Initialization
 *
 * This module initializes the PDF.js library with proper configuration.
 * It must be loaded before any other PDF.js-dependent modules.
 */
(function() {
    'use strict';

    // Check if PDF.js is loaded immediately
    if (typeof pdfjsLib !== 'undefined') {
        console.log('PDF XBlock: PDF.js library already loaded');
        setupPDFJSWorker();
    } else {
        // Wait a short time to ensure pdfjsLib has loaded (it might be loading asynchronously)
        console.log('PDF XBlock: Waiting for PDF.js to load...');
        setTimeout(function() {
            initPDFJS();
        }, 500);
    }

    function initPDFJS() {
        console.log('PDF XBlock: Initializing PDF.js library');

        if (typeof pdfjsLib === 'undefined') {
            console.error('PDF XBlock: PDF.js library not loaded! Attempting to reload...');

            // Try all possible locations for PDF.js
            tryLoadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.min.js', function() {
                console.log('PDF XBlock: Successfully loaded PDF.js from CDN');
                if (typeof pdfjsLib !== 'undefined') {
                    setupPDFJSWorker();
                }
            });
            return;
        }
        setupPDFJSWorker();
    }

    function tryLoadScript(url, callback) {
        var script = document.createElement('script');
        script.src = url;
        script.onload = callback;
        script.onerror = function() {
            console.error('PDF XBlock: Failed to load script from: ' + url);
        };
        document.head.appendChild(script);
    }

    function setupPDFJSWorker() {
        if (typeof pdfjsLib === 'undefined') {
            console.error('PDF XBlock: PDF.js still not available after loading attempt');
            return;
        }

        // First check if the worker is already set
        if (pdfjsLib.GlobalWorkerOptions.workerSrc) {
            console.log('PDF XBlock: PDF.js worker already configured: ' + pdfjsLib.GlobalWorkerOptions.workerSrc);
            return;
        }

        // Try multiple approaches to find the worker

        // 1. Find the script tag for the worker (if dynamically added by Python)
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var scriptContent = scripts[i].textContent || scripts[i].innerText;
            if (scriptContent && scriptContent.indexOf('pdfjsLib.GlobalWorkerOptions.workerSrc') !== -1) {
                console.log('PDF XBlock: Worker configuration found in script tag');
                // The worker should already be configured by this script
                return;
            }
        }

        // 2. Try to use a local worker URL (from the same path as pdf.min.js)
        try {
            var scripts = document.getElementsByTagName('script');
            var pdfJsScript = null;

            // Find the pdf.min.js script tag
            for (var i = 0; i < scripts.length; i++) {
                if (scripts[i].src && scripts[i].src.indexOf('pdf.min.js') !== -1) {
                    pdfJsScript = scripts[i];
                    break;
                }
            }

            if (pdfJsScript) {
                // If we found the script, try to figure out if it's local or CDN
                var scriptSrc = pdfJsScript.src;
                var workerSrc = scriptSrc.replace('pdf.min.js', 'pdf.worker.min.js');

                console.log('PDF XBlock: Setting worker from script path: ' + workerSrc);
                pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
                return;
            }
        } catch (e) {
            console.error('PDF XBlock: Error setting up worker src from script tag: ', e);
        }

        // 3. Default fallback to CDN
        console.log('PDF XBlock: Using fallback CDN worker');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
    }

    // Also expose this function globally to allow manual initialization
    window.initPdfJsWorker = initPDFJS;
})();