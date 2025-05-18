/**
 * PDF XBlock - Common Tool Utilities
 *
 * This module provides shared utilities and common functionality
 * for all PDF XBlock tools. It helps maintain consistency between
 * different tool implementations and provides reusable components.
 */

var PdfxToolsCommon = (function() {
    'use strict';

    // Private storage for registered tools
    var _registeredTools = {};

    // Track auto-activation prevention settings
    var _preventAutoActivation = {};

    // Tool state tracking
    var _activeTool = null;
    var _previousTool = null;
    var _toolStates = {}; // Store tool-specific states

    // Debug logging helper
    function _debugLog(message) {
    }

    /**
     * Base tool prototype with common functionality
     * All tools should inherit from this
     */
    function BaseTool(options) {
        this.options = options || {};
        this.element = options.element;
        this.blockId = options.blockId || 'default';
        this.userId = options.userId || 'anonymous';
        this.isActive = false;
        this.name = options.name || 'base';

        // Optional callbacks
        this.debugCallback = options.debugCallback || function() {};
        this.saveCallback = options.saveCallback || function() {};
    }

    // Base methods that all tools should implement
    BaseTool.prototype = {
        // Activate the tool
        enable: function() {
            this.isActive = true;
            this.debugCallback(`${this.constructor.name} tool enabled`);
        },

        // Deactivate the tool
        disable: function() {
            this.isActive = false;
            this.debugCallback(`${this.constructor.name} tool disabled`);
        },

        // Handle page changes
        setCurrentPage: function(page) {
            this.currentPage = page;
        },

        // Return if tool is currently active
        isToolActive: function() {
            return this.isActive;
        },

        // Save tool state if needed
        saveState: function() {
            // Default implementation does nothing
            return true;
        }
    };

    /**
     * Register a tool in the tools registry
     */
    function registerTool(toolConfig) {
        var toolName = toolConfig.name;
        var toolData = {
            name: toolName,
            buttonSelector: toolConfig.buttonSelector || `#${toolName}-tool-`,
            containerSelector: toolConfig.containerSelector,
            factory: toolConfig.factory,
            preventAutoActivation: !!toolConfig.preventAutoActivation,
            onActivate: toolConfig.onActivate || function() {},
            onDeactivate: toolConfig.onDeactivate || function() {},
            priority: toolConfig.priority || 0,
            hasCanvas: !!toolConfig.hasCanvas,
            dependencies: toolConfig.dependencies || []
        };

        _registeredTools[toolName] = toolData;
        _toolStates[toolName] = { isActive: false, lastActivated: null };

        // Set up auto-activation prevention if needed
        if (toolData.preventAutoActivation) {
            _preventAutoActivation[toolName] = true;
        }

        _debugLog(`Registered tool: ${toolName}`);
        return toolData;
    }

    /**
     * Initialize tool management for a specific block
     */
    function initToolsForBlock(blockId, element, options) {
        _debugLog(`Initializing tools for block ${blockId}`);

        // Set up mutation observer to watch for auto-activation attempts
        setupToolActivationObserver(blockId, element);

        // Return tool manager interface for this block
        return {
            activateTool: function(toolName) {
                return activateTool(toolName, blockId, element, options);
            },
            deactivateTool: function(toolName) {
                return deactivateTool(toolName, blockId, element, options);
            },
            deactivateAllTools: function() {
                return deactivateAllTools(blockId, element, options);
            },
            getActiveTool: function() {
                return getActiveToolForBlock(blockId);
            },
            preventAutoActivation: function(toolName) {
                _preventAutoActivation[toolName] = true;
            }
        };
    }

    /**
     * Set up observer to prevent unwanted auto-activations
     */
    function setupToolActivationObserver(blockId, element) {
        _debugLog(`Setting up tool activation observer for block ${blockId}`);

        // Create observer to watch for class changes on tool buttons
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' &&
                    mutation.attributeName === 'class' &&
                    mutation.target.id &&
                    mutation.target.classList.contains('active')) {

                    // Extract tool name from button ID
                    var buttonId = mutation.target.id;
                    var toolName = extractToolNameFromButtonId(buttonId, blockId);

                    // Check if this tool should prevent auto-activation
                    if (toolName && _preventAutoActivation[toolName]) {
                        _debugLog(`Preventing auto-activation of ${toolName} (${buttonId})`);

                        // Remove active class to prevent auto-activation
                        mutation.target.classList.remove('active');

                        // Make sure the tool is properly deactivated
                        deactivateTool(toolName, blockId, element);
                    }
                }
            });
        });

        // Find all tool buttons for this block and observe them
        var toolButtons = element.querySelectorAll('.tool-btn');
        toolButtons.forEach(function(button) {
            observer.observe(button, { attributes: true });
        });

        // Store observer reference for potential cleanup
        window[`toolObserver_${blockId}`] = observer;
    }

    /**
     * Extract tool name from a button ID
     */
    function extractToolNameFromButtonId(buttonId, blockId) {
        if (!buttonId) return null;

        // Remove block ID suffix if present
        var cleanId = buttonId.replace(`-${blockId}`, '');

        // Remove -tool suffix to get the base name
        var baseName = cleanId.replace('-tool', '');

        // Check if this is a registered tool
        for (var toolName in _registeredTools) {
            if (_registeredTools[toolName].buttonSelector.includes(baseName)) {
                return toolName;
            }
        }

        // Default fallback - return the cleaned ID
        return baseName;
    }

    /**
     * Get the currently active tool for a specific block
     */
    function getActiveToolForBlock(blockId) {
        // Check each tool's state to find which is active for this block
        for (var toolName in _toolStates) {
            if (_toolStates[toolName].isActive &&
                _toolStates[toolName].blockId === blockId) {
                return toolName;
            }
        }
        return null;
    }

    /**
     * Activate a specific tool
     */
    function activateTool(toolName, blockId, element, options) {
        if (!_registeredTools[toolName]) {
            _debugLog(`Cannot activate unknown tool: ${toolName}`);
            return false;
        }

        _debugLog(`Activating tool: ${toolName} for block ${blockId}`);

        // First deactivate any active tools
        deactivateAllTools(blockId, element, options);

        // Get the tool configuration
        var toolConfig = _registeredTools[toolName];

        // Find and activate the tool button
        var toolButton = element.querySelector(`${toolConfig.buttonSelector}${blockId}`);
        if (toolButton) {
            toolButton.classList.add('active');
        }

        // Update tool state
        _toolStates[toolName] = {
            isActive: true,
            blockId: blockId,
            lastActivated: new Date().getTime()
        };

        // Set as active and previous tool
        _previousTool = _activeTool;
        _activeTool = toolName;

        // Get the user-selected color
        var colorInput = element.querySelector(`#color-input-${blockId}`);
        var selectedColor = colorInput ? colorInput.value : '#FF0000';

        // If this tool uses canvas, apply proper cursor styles and settings
        if (toolConfig.hasCanvas) {
            var drawContainer = getBlockElement(element, '.draw-container', blockId);
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'auto';
                drawContainer.classList.add('draw-mode');

                // Get the fabric canvas
                var fabricCanvas = window[`fabricCanvas_${blockId}`];
                if (fabricCanvas) {
                    // Apply cursor based on tool type
                    if (toolName === 'marker' || toolName === 'scribble') {
                        fabricCanvas.isDrawingMode = true;
                        fabricCanvas.freeDrawingBrush.color = selectedColor;
                        if (fabricCanvas.freeDrawingBrush.scribbleMode !== undefined) {
                            fabricCanvas.freeDrawingBrush.scribbleMode = true;
                        }
                        if (fabricCanvas.upperCanvasEl) {
                            fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                            fabricCanvas.upperCanvasEl.style.cursor = 'crosshair';
                        }
                    }
                }
            }
        }

        // Special handling for highlighter
        if (toolName === 'highlight') {
            var textLayer = element.querySelector(`#text-layer-${blockId}`);
            if (textLayer) {
                textLayer.style.pointerEvents = 'auto';
                textLayer.style.cursor = 'text';

                // Apply hover effect to all text spans
                var textSpans = textLayer.querySelectorAll('span');
                textSpans.forEach(function(span) {
                    span.style.pointerEvents = 'auto';
                    span.style.cursor = 'text';
                    span.classList.add('highlight-hover-effect');
                });
            }
        }

        // Call the tool's custom activation logic
        try {
            toolConfig.onActivate(blockId, element, options);
        } catch (error) {
            handleToolError(toolName, 'activation', error);
        }

        return true;
    }

    /**
     * Deactivate a specific tool
     */
    function deactivateTool(toolName, blockId, element, options) {
        if (!_registeredTools[toolName]) {
            _debugLog(`Cannot deactivate unknown tool: ${toolName}`);
            return false;
        }

        _debugLog(`Deactivating tool: ${toolName} for block ${blockId}`);

        // Get the tool configuration
        var toolConfig = _registeredTools[toolName];

        // Find and deactivate the tool button
        var toolButton = element.querySelector(`${toolConfig.buttonSelector}${blockId}`);
        if (toolButton) {
            toolButton.classList.remove('active');
        }

        // Update tool state
        _toolStates[toolName] = {
            isActive: false,
            blockId: null,
            lastDeactivated: new Date().getTime()
        };

        // Update active tool reference if this was the active tool
        if (_activeTool === toolName) {
            _activeTool = null;
        }

        // Reset draw container pointer events if this tool used the canvas
        if (toolConfig.hasCanvas) {
            var drawContainer = getBlockElement(element, '.draw-container', blockId);
            if (drawContainer) {
                drawContainer.style.pointerEvents = 'none';
                drawContainer.classList.remove('draw-mode');

                // Also reset any fabric canvas pointer events
                var fabricCanvas = window[`fabricCanvas_${blockId}`];
                if (fabricCanvas && fabricCanvas.upperCanvasEl) {
                    fabricCanvas.upperCanvasEl.style.pointerEvents = 'none';
                    fabricCanvas.isDrawingMode = false;
                }
            }
        }

        // Call the tool's custom deactivation logic
        try {
            toolConfig.onDeactivate(blockId, element, options);
        } catch (error) {
            handleToolError(toolName, 'deactivation', error);
        }

        return true;
    }

    /**
     * Deactivate all tools for a block
     */
    function deactivateAllTools(blockId, element, options) {
        _debugLog(`Deactivating all tools for block ${blockId}`);

        // Deactivate each registered tool
        for (var toolName in _registeredTools) {
            if (_toolStates[toolName].isActive &&
                _toolStates[toolName].blockId === blockId) {
                deactivateTool(toolName, blockId, element, options);
            }
        }

        // Also remove active class from all tool buttons as a fallback
        var toolButtons = element.querySelectorAll('.tool-btn');
        toolButtons.forEach(function(button) {
            button.classList.remove('active');
        });

        return true;
    }

    /**
     * Create a tool factory for consistent tool instantiation
     */
    function createToolFactory(toolClass, defaultOptions) {
        return function(element, options) {
            var fullOptions = Object.assign({}, defaultOptions || {}, options || {});
            fullOptions.element = element;
            return new toolClass(fullOptions);
        };
    }

    /**
     * Utility to find a DOM element specific to a block
     * This helps maintain proper isolation between blocks
     */
    function getBlockElement(element, selector, blockId) {
        if (!element || !selector) {
            return null;
        }

        // If blockId is provided, try to find element by specific ID
        if (blockId) {
            // Try with ID suffix first
            var specificId = selector.replace('#', '#') + '-' + blockId;
            var specificElement = $(element).find(specificId);
            if (specificElement.length > 0) {
                return specificElement[0];
            }

            // Try with attribute selector
            var attrSelector = `[data-block-id="${blockId}"]`;
            var attrElement = $(element).find(selector + attrSelector);
            if (attrElement.length > 0) {
                return attrElement[0];
            }
        }

        // Fallback to regular selector within element
        var result = $(element).find(selector);
        return result.length > 0 ? result[0] : null;
    }

    /**
     * Utility to apply custom styles to tool buttons when active
     */
    function styleToolButton(element, toolName, blockId, isActive) {
        var btnSelector = `#${toolName}-tool-${blockId}`;
        var button = $(element).find(btnSelector);

        if (button.length > 0) {
            if (isActive) {
                button.addClass('active');
            } else {
                button.removeClass('active');
            }
        }

        return button.length > 0;
    }

    /**
     * Helper to convert hex color to rgba
     */
    function hexToRgba(hex, alpha) {
        hex = hex.replace('#', '');
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);
        alpha = alpha !== undefined ? alpha : 1;

        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Shared error handler for tool operations
     */
    function handleToolError(toolName, operation, error) {
        return {
            success: false,
            tool: toolName,
            operation: operation,
            error: error.message || String(error)
        };
    }

    // Fix canvas container size function
    function fixCanvasContainerSize(blockId) {
        _debugLog(`Fixing canvas container size for block ${blockId}`);

        // Get necessary elements
        const pdfContainer = document.getElementById(`pdf-container-${blockId}`);
        const fabricCanvas = window[`fabricCanvas_${blockId}`];

        if (!pdfContainer || !fabricCanvas) {
            _debugLog(`Missing required elements for fixing canvas container`);
            return false;
        }

        // Get dimensions from PDF container
        const width = pdfContainer.offsetWidth;
        const height = pdfContainer.offsetHeight;

        // Set canvas dimensions
        fabricCanvas.setWidth(width);
        fabricCanvas.setHeight(height);

        // Fix canvas container dimensions
        const canvasContainer = fabricCanvas.wrapperEl;
        if (canvasContainer) {
            canvasContainer.style.width = width + 'px';
            canvasContainer.style.height = height + 'px';
        }

        // Fix both lower and upper canvas dimensions
        if (fabricCanvas.lowerCanvasEl) {
            fabricCanvas.lowerCanvasEl.style.width = width + 'px';
            fabricCanvas.lowerCanvasEl.style.height = height + 'px';
        }

        if (fabricCanvas.upperCanvasEl) {
            fabricCanvas.upperCanvasEl.style.width = width + 'px';
            fabricCanvas.upperCanvasEl.style.height = height + 'px';
        }

        return true;
    }

    // Public API
    return {
        BaseTool: BaseTool,
        createToolFactory: createToolFactory,
        registerTool: registerTool,
        getToolFactory: function(toolName) {
            return _registeredTools[toolName] ? _registeredTools[toolName].factory : null;
        },
        initToolsForBlock: initToolsForBlock,
        getBlockElement: getBlockElement,
        styleToolButton: styleToolButton,
        hexToRgba: hexToRgba,
        handleToolError: handleToolError,
        fixCanvasContainerSize: fixCanvasContainerSize
    };
})();

// Make the function available globally
window.fixCanvasContainerSize = PdfxToolsCommon.fixCanvasContainerSize;