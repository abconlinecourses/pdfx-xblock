/**
 * ToolManager - Manages all annotation tools
 *
 * Handles tool registration, activation, deactivation, and coordination
 */

import { EventEmitter } from '../utils/EventEmitter.js';
import { ScribbleTool } from './scribble/ScribbleTool.js';
import { HighlightTool } from './highlight/HighlightTool.js';
import { TextTool } from './text/TextTool.js';
import { ShapeTool } from './shape/ShapeTool.js';
import { NoteTool } from './note/NoteTool.js';

export class ToolManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.blockId = options.blockId;
        this.container = options.container;
        this.pdfManager = options.pdfManager;
        this.storageManager = options.storageManager;
        this.allowAnnotation = options.allowAnnotation !== false;

        // Tool instances
        this.tools = new Map();
        this.activeTool = null;

        // State
        this.isInitialized = false;

        // Configuration
        this.config = {
            enabledTools: ['scribble', 'highlight', 'text', 'shape', 'note'],
            defaultTool: null,
            ...options.config
        };

        // Bind methods
        this._bindMethods();
    }

    /**
     * Initialize the tool manager
     */
    async init() {
        if (this.isInitialized) {
            return;
        }

        if (!this.allowAnnotation) {
            return;
        }

        try {

            // Register all available tools
            await this._registerTools();

            // Set up event listeners
            this._setupEventListeners();

            this.isInitialized = true;


            this.emit('initialized', {
                tools: Array.from(this.tools.keys()),
                toolManager: this
            });

        } catch (error) {
            throw error;
        }
    }

    /**
     * Register all available tools
     */
    async _registerTools() {
        const toolConfigs = [
            {
                name: 'scribble',
                class: ScribbleTool,
                enabled: this.config.enabledTools.includes('scribble')
            },
            {
                name: 'highlight',
                class: HighlightTool,
                enabled: this.config.enabledTools.includes('highlight')
            },
            {
                name: 'text',
                class: TextTool,
                enabled: this.config.enabledTools.includes('text')
            },
            {
                name: 'shape',
                class: ShapeTool,
                enabled: this.config.enabledTools.includes('shape')
            },
            {
                name: 'note',
                class: NoteTool,
                enabled: this.config.enabledTools.includes('note')
            }
        ];

        for (const toolConfig of toolConfigs) {
            if (toolConfig.enabled) {
                await this._registerTool(toolConfig.name, toolConfig.class);
            }
        }
    }

    /**
     * Register a single tool
     */
    async _registerTool(name, ToolClass) {
        try {

            const tool = new ToolClass({
                name: name,
                blockId: this.blockId,
                container: this.container,
                pdfManager: this.pdfManager,
                storageManager: this.storageManager
            });

            // Initialize the tool
            await tool.init();

            // Set up tool event listeners
            this._setupToolEventListeners(tool);

            // Store the tool
            this.tools.set(name, tool);


        } catch (error) {
        }
    }

    /**
     * Set up event listeners
     */
    _setupEventListeners() {
        // Listen for PDF page changes
        if (this.pdfManager) {
            this.pdfManager.on('pageChanged', (data) => {
                this.handlePageChange(data.pageNum);
            });
        }

        // Listen for keyboard shortcuts
        this._setupKeyboardShortcuts();
    }

    /**
     * Set up tool-specific event listeners
     */
    _setupToolEventListeners(tool) {
        tool.on('annotationCreated', (annotation) => {
            this.emit('annotationCreated', annotation);
        });

        tool.on('annotationUpdated', (annotation) => {
            this.emit('annotationUpdated', annotation);
        });

        tool.on('annotationDeleted', (annotation) => {
            this.emit('annotationDeleted', annotation);
        });

        tool.on('configChanged', (data) => {
            this.emit('toolConfigChanged', data);
        });
    }

    /**
     * Set up keyboard shortcuts
     */
    _setupKeyboardShortcuts() {
        const shortcuts = {
            'KeyH': 'highlight',  // H for highlight
            'KeyM': 'scribble',   // M for marker/scribble
            'KeyT': 'text',       // T for text
            'KeyS': 'shape',      // S for shape
            'KeyN': 'note',       // N for note
            'Escape': 'deactivate' // ESC to deactivate current tool
        };

        const handleKeydown = (event) => {
            // Only handle shortcuts if no input is focused
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            // Require Ctrl/Cmd key for tool shortcuts
            if (event.ctrlKey || event.metaKey) {
                const action = shortcuts[event.code];
                if (action === 'deactivate') {
                    this.deactivateCurrentTool();
                    event.preventDefault();
                } else if (action && this.tools.has(action)) {
                    this.activateTool(action);
                    event.preventDefault();
                }
            } else if (event.code === 'Escape') {
                this.deactivateCurrentTool();
                event.preventDefault();
            }
        };

        document.addEventListener('keydown', handleKeydown);

        // Store for cleanup
        this._keyboardHandler = handleKeydown;
    }

    /**
     * Activate a tool
     */
    activateTool(toolName) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            return false;
        }

        try {
            // Deactivate current tool if any
            if (this.activeTool) {
                this.deactivateCurrentTool();
            }

            // Activate the new tool
            tool.activate();
            this.activeTool = tool;


            this.emit('toolActivated', {
                toolName: toolName,
                tool: tool
            });

            return true;

        } catch (error) {
            return false;
        }
    }

    /**
     * Deactivate the current tool
     */
    deactivateCurrentTool() {
        if (!this.activeTool) {
            return false;
        }

        try {
            const toolName = this.activeTool.name;

            this.activeTool.deactivate();


            this.emit('toolDeactivated', {
                toolName: toolName,
                tool: this.activeTool
            });

            this.activeTool = null;

            return true;

        } catch (error) {
            return false;
        }
    }

    /**
     * Get a specific tool
     */
    getTool(toolName) {
        return this.tools.get(toolName);
    }

    /**
     * Get all tools
     */
    getAllTools() {
        return Array.from(this.tools.values());
    }

    /**
     * Get active tool
     */
    getActiveTool() {
        return this.activeTool;
    }

    /**
     * Get active tool name
     */
    getActiveToolName() {
        return this.activeTool ? this.activeTool.name : null;
    }

    /**
     * Check if a tool is available
     */
    hasToolAvailable(toolName) {
        return this.tools.has(toolName);
    }

    /**
     * Handle page change
     */
    handlePageChange(pageNum) {
        // Notify all tools about page change
        for (const tool of this.tools.values()) {
            try {
                tool.handlePageChange(pageNum);
            } catch (error) {
            }
        }

        this.emit('pageChanged', { pageNum });
    }

    /**
     * Set tool configuration
     */
    setToolConfig(toolName, config) {
        const tool = this.tools.get(toolName);
        if (tool) {
            tool.setConfig(config);
            return true;
        }
        return false;
    }

    /**
     * Get tool configuration
     */
    getToolConfig(toolName) {
        const tool = this.tools.get(toolName);
        return tool ? tool.getConfig() : null;
    }

    /**
     * Enable a tool
     */
    enableTool(toolName) {
        const tool = this.tools.get(toolName);
        if (tool) {
            tool.enable();
            this.emit('toolEnabled', { toolName, tool });
            return true;
        }
        return false;
    }

    /**
     * Disable a tool
     */
    disableTool(toolName) {
        const tool = this.tools.get(toolName);
        if (tool) {
            // Deactivate if currently active
            if (this.activeTool === tool) {
                this.deactivateCurrentTool();
            }

            tool.disable();
            this.emit('toolDisabled', { toolName, tool });
            return true;
        }
        return false;
    }

    /**
     * Get all annotations from all tools
     */
    getAllAnnotations() {
        const allAnnotations = {};

        for (const [toolName, tool] of this.tools) {
            const toolAnnotations = tool.exportAnnotations();
            if (Object.keys(toolAnnotations).length > 0) {
                allAnnotations[toolName] = toolAnnotations;
            }
        }

        return allAnnotations;
    }

    /**
     * Load annotations for all tools
     */
    async loadAllAnnotations(annotationsData) {
        const promises = [];

        for (const [toolName, toolData] of Object.entries(annotationsData)) {
            const tool = this.tools.get(toolName);
            if (tool) {
                promises.push(tool.loadAnnotations(toolData));
            }
        }

        try {
            await Promise.all(promises);
        } catch (error) {
        }
    }

    /**
     * Clear all annotations
     */
    clearAllAnnotations() {
        for (const tool of this.tools.values()) {
            tool.annotations.clear();
            tool.annotationsByPage.clear();
        }

        this.emit('allAnnotationsCleared');
    }

    /**
     * Clear annotations for current page only
     */
    clearCurrentPageAnnotations() {
        if (!this.pdfManager) {
            return;
        }

        const currentPage = this.pdfManager.getCurrentPage();

        for (const tool of this.tools.values()) {
            // Get annotations for current page
            const pageAnnotations = tool.getAnnotationsForPage(currentPage);

            // Delete each annotation on current page
            for (const annotation of pageAnnotations) {
                tool.deleteAnnotation(annotation.id);
            }

            // Special handling for scribble tool to clear canvas
            if (tool.name === 'scribble' && typeof tool.clearCurrentPage === 'function') {
                tool.clearCurrentPage();
            }
        }

        this.emit('currentPageCleared', { pageNum: currentPage });
    }

    /**
     * Get tool statistics
     */
    getToolStatistics() {
        const stats = {};

        for (const [toolName, tool] of this.tools) {
            stats[toolName] = {
                totalAnnotations: tool.annotations.size,
                annotationsByPage: Object.fromEntries(tool.annotationsByPage),
                isEnabled: tool.isToolEnabled(),
                isActive: tool.isToolActive()
            };
        }

        return stats;
    }

    /**
     * Bind methods to preserve context
     */
    _bindMethods() {
        this.activateTool = this.activateTool.bind(this);
        this.deactivateCurrentTool = this.deactivateCurrentTool.bind(this);
        this.handlePageChange = this.handlePageChange.bind(this);
    }

    /**
     * Destroy the tool manager
     */
    async destroy() {

        // Deactivate current tool
        this.deactivateCurrentTool();

        // Destroy all tools
        const destroyPromises = [];
        for (const tool of this.tools.values()) {
            destroyPromises.push(tool.destroy());
        }

        try {
            await Promise.all(destroyPromises);
        } catch (error) {
        }

        // Clear tools
        this.tools.clear();

        // Remove keyboard handler
        if (this._keyboardHandler) {
            document.removeEventListener('keydown', this._keyboardHandler);
            this._keyboardHandler = null;
        }

        // Remove all event listeners
        this.removeAllListeners();

        // Clear references
        this.container = null;
        this.pdfManager = null;
        this.storageManager = null;
        this.activeTool = null;

        this.isInitialized = false;
    }
}

export default ToolManager;