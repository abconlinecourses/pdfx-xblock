/**
 * ToolManager - Manages all annotation tools
 *
 * Handles tool registration, activation, deactivation, and coordination
 */

import { EventEmitter } from '../utils/EventEmitter.js';
import { AnnotationInterface } from '../storage/AnnotationInterface.js';
import { ScribbleTool } from './scribble/ScribbleTool.js';
import { HighlightTool } from './highlight/HighlightTool.js';
import { TextTool } from './text/TextTool.js';
import { StampTool } from './stamp/StampTool.js';

export class ToolManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.blockId = options.blockId;
        this.container = options.container;
        this.pdfManager = options.pdfManager;
        this.storageManager = options.storageManager;
        this.allowAnnotation = options.allowAnnotation !== false;

        // Extract user context from DOM if not provided
        const blockElement = document.getElementById(`pdfx-block-${this.blockId}`);
        this.userId = options.userId || (blockElement && blockElement.getAttribute('data-user-id')) || 'anonymous';
        this.courseId = options.courseId || (blockElement && blockElement.getAttribute('data-course-id')) || '';

        console.log(`[ToolManager] Initializing for block: ${this.blockId}, user: ${this.userId}, annotations: ${this.allowAnnotation}`);

        // Create annotation interface for tools
        this.annotationInterface = this.storageManager ? new AnnotationInterface(this.storageManager, {
            blockId: this.blockId,
            userId: this.userId,
            courseId: this.courseId
        }) : null;

        // Tool instances
        this.tools = new Map();
        this.activeTool = null;

        // State
        this.isInitialized = false;
        this.currentPage = 1;

        // Configuration - Updated to match HTML tools
        this.config = {
            enabledTools: ['highlight', 'scribble', 'text', 'stamp'],
            defaultTool: null,
            ...options.config
        };

        // Setup UI event handlers for secondary toolbar
        this.uiHandlers = new Map();

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
            console.log(`[ToolManager] Annotations disabled for block: ${this.blockId}`);
            return;
        }

        try {
            console.log(`[ToolManager] Initializing tools for block: ${this.blockId}`);

            // Register all available tools
            await this._registerTools();

            // Set up event listeners
            this._setupEventListeners();

            // Setup UI button handlers
            this._setupUIHandlers();

            // Load existing annotations if storage manager is available
            if (this.storageManager) {
                await this._loadExistingAnnotations();
            }

            this.isInitialized = true;

            console.log(`[ToolManager] Initialized with ${this.tools.size} tools: ${Array.from(this.tools.keys()).join(', ')}`);

            this.emit('initialized', {
                tools: Array.from(this.tools.keys()),
                toolManager: this
            });

        } catch (error) {
            console.error(`[ToolManager] Error during initialization:`, error);
            throw error;
        }
    }

    /**
     * Register all available tools - Updated to match HTML structure
     */
    async _registerTools() {
        const toolConfigs = [
            {
                name: 'highlight',
                class: HighlightTool,
                enabled: this.config.enabledTools.includes('highlight')
            },
            {
                name: 'scribble',
                class: ScribbleTool,
                enabled: this.config.enabledTools.includes('scribble')
            },
            {
                name: 'text',
                class: TextTool,
                enabled: this.config.enabledTools.includes('text')
            },
            {
                name: 'stamp',
                class: StampTool,
                enabled: this.config.enabledTools.includes('stamp')
            }
        ];

        for (const toolConfig of toolConfigs) {
            if (toolConfig.enabled) {
                await this._registerTool(toolConfig.name, toolConfig.class);
            }
        }
    }

    /**
     * Register a single tool with enhanced context
     */
    async _registerTool(name, ToolClass) {
        try {
            console.log(`[ToolManager] Registering tool: ${name}`);

            const toolOptions = {
                name: name,
                blockId: this.blockId,
                container: this.container,
                pdfManager: this.pdfManager,
                storageManager: this.storageManager,
                annotationInterface: this.annotationInterface,
                userId: this.userId,
                courseId: this.courseId,
                currentPage: this.currentPage
            };

            const tool = new ToolClass(toolOptions);

            // Initialize the tool
            await tool.init();

            // Set up tool event listeners
            this._setupToolEventListeners(tool);

            // Store the tool
            this.tools.set(name, tool);

            console.log(`[ToolManager] Successfully registered tool: ${name}`);

        } catch (error) {
            console.error(`[ToolManager] Error registering tool ${name}:`, error);
            throw error;
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

        // Also listen for viewer page changes if using pdfx-init.js architecture
        document.addEventListener('pageChanged', (event) => {
            if (event.detail && event.detail.blockId === this.blockId) {
                this.handlePageChange(event.detail.pageNum);
            }
        });

        // Listen for keyboard shortcuts
        this._setupKeyboardShortcuts();

        // Listen for storage events
        if (this.storageManager) {
            this.storageManager.on('annotationsLoaded', (data) => {
                console.log(`[ToolManager] Annotations loaded, notifying tools`);
                this._distributeLoadedAnnotations(data);
            });

            this.storageManager.on('annotationsSaved', (data) => {
                console.log(`[ToolManager] Annotations saved successfully`);
                this.emit('annotationsSaved', data);
            });

            this.storageManager.on('error', (error) => {
                console.error(`[ToolManager] Storage error:`, error);
                this.emit('storageError', error);
            });
        }
    }

    /**
     * Setup UI event handlers for secondary toolbar buttons
     */
    _setupUIHandlers() {
        console.log(`[ToolManager] Setting up UI handlers for block: ${this.blockId}`);

        // Tool button mappings
        const toolButtons = {
            [`highlightTool-${this.blockId}`]: 'highlight',
            [`scribbleTool-${this.blockId}`]: 'scribble',
            [`textTool-${this.blockId}`]: 'text',
            [`stampTool-${this.blockId}`]: 'stamp'
        };

        // Parameter toolbar mappings
        const paramToolbars = {
            [`highlightTool-${this.blockId}`]: `editorHighlightParamsToolbar-${this.blockId}`,
            [`scribbleTool-${this.blockId}`]: `editorInkParamsToolbar-${this.blockId}`,
            [`textTool-${this.blockId}`]: `editorFreeTextParamsToolbar-${this.blockId}`,
            [`stampTool-${this.blockId}`]: `editorStampParamsToolbar-${this.blockId}`
        };

        // Setup tool button handlers
        Object.entries(toolButtons).forEach(([buttonId, toolName]) => {
            const button = document.getElementById(buttonId);
            const toolbar = document.getElementById(paramToolbars[buttonId]);

            if (button) {
                const handler = (event) => {
                    event.stopPropagation();
                    console.log(`[ToolManager] Tool button clicked: ${toolName}`);

                    // Toggle tool activation
                    if (this.activeTool === toolName) {
                        this.deactivateCurrentTool();
                    } else {
                        this.activateTool(toolName);
                    }

                    // Toggle parameter toolbar
                    if (toolbar) {
                        this._toggleParameterToolbar(button, toolbar);
                    }
                };

                button.addEventListener('click', handler);
                this.uiHandlers.set(buttonId, { element: button, event: 'click', handler });

                console.log(`[ToolManager] Setup handler for tool button: ${buttonId} -> ${toolName}`);
            } else {
                console.warn(`[ToolManager] Tool button not found: ${buttonId}`);
            }
        });

        // Setup clear annotations button
        const clearButton = document.getElementById(`clearAnnotations-${this.blockId}`);
        if (clearButton) {
            const clearHandler = (event) => {
                event.stopPropagation();
                console.log(`[ToolManager] Clear annotations clicked`);
                this.clearAllAnnotations();
            };

            clearButton.addEventListener('click', clearHandler);
            this.uiHandlers.set(`clearAnnotations-${this.blockId}`, {
                element: clearButton,
                event: 'click',
                handler: clearHandler
            });
        }

        // Setup secondary toolbar toggle
        const secondaryToggle = document.getElementById(`secondaryToolbarToggle-${this.blockId}`);
        const secondaryToolbar = document.getElementById(`secondaryToolbar-${this.blockId}`);

        if (secondaryToggle && secondaryToolbar) {
            const toggleHandler = (event) => {
                event.stopPropagation();
                const isHidden = secondaryToolbar.classList.contains('hidden');

                if (isHidden) {
                    secondaryToolbar.classList.remove('hidden');
                    secondaryToggle.classList.add('active');
                } else {
                    secondaryToolbar.classList.add('hidden');
                    secondaryToggle.classList.remove('active');
                    // Also hide any open parameter toolbars
                    this._hideAllParameterToolbars();
                }
            };

            secondaryToggle.addEventListener('click', toggleHandler);
            this.uiHandlers.set(`secondaryToolbarToggle-${this.blockId}`, {
                element: secondaryToggle,
                event: 'click',
                handler: toggleHandler
            });
        }
    }

    /**
     * Toggle parameter toolbar visibility
     */
    _toggleParameterToolbar(button, toolbar) {
        const isHidden = toolbar.classList.contains('hidden');

        // First hide all other parameter toolbars
        this._hideAllParameterToolbars();

        if (isHidden) {
            // Show this toolbar
            toolbar.classList.remove('hidden');
            button.setAttribute('aria-expanded', 'true');

            // Position the toolbar relative to the button
            this._positionParameterToolbar(button, toolbar);
        } else {
            // Hide this toolbar
            toolbar.classList.add('hidden');
            button.setAttribute('aria-expanded', 'false');
        }
    }

    /**
     * Hide all parameter toolbars
     */
    _hideAllParameterToolbars() {
        const toolbars = [
            `editorHighlightParamsToolbar-${this.blockId}`,
            `editorInkParamsToolbar-${this.blockId}`,
            `editorFreeTextParamsToolbar-${this.blockId}`,
            `editorStampParamsToolbar-${this.blockId}`
        ];

        toolbars.forEach(toolbarId => {
            const toolbar = document.getElementById(toolbarId);
            if (toolbar) {
                toolbar.classList.add('hidden');
            }
        });

        // Reset button aria-expanded states
        const buttons = [
            `highlightTool-${this.blockId}`,
            `scribbleTool-${this.blockId}`,
            `textTool-${this.blockId}`,
            `stampTool-${this.blockId}`
        ];

        buttons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.setAttribute('aria-expanded', 'false');
            }
        });
    }

    /**
     * Position parameter toolbar relative to button
     */
    _positionParameterToolbar(button, toolbar) {
        // Position toolbar to the right of the sidebar
        const rect = button.getBoundingClientRect();
        const sidebarWidth = 60; // Width of secondary toolbar

        toolbar.style.position = 'fixed';
        toolbar.style.left = `${rect.right + 10}px`;
        toolbar.style.top = `${rect.top}px`;
        toolbar.style.zIndex = '10001';
    }

    /**
     * Set up tool-specific event listeners
     */
    _setupToolEventListeners(tool) {
        tool.on('annotationCreated', (annotation) => {
            console.log(`[ToolManager] Annotation created by ${tool.name}:`, annotation.id);
            this.emit('annotationCreated', {
                tool: tool.name,
                annotation: annotation
            });
        });

        tool.on('annotationUpdated', (annotation) => {
            console.log(`[ToolManager] Annotation updated by ${tool.name}:`, annotation.id);
            this.emit('annotationUpdated', {
                tool: tool.name,
                annotation: annotation
            });
        });

        tool.on('annotationDeleted', (annotation) => {
            console.log(`[ToolManager] Annotation deleted by ${tool.name}:`, annotation.id);
            this.emit('annotationDeleted', {
                tool: tool.name,
                annotation: annotation
            });
        });

        tool.on('configChanged', (data) => {
            this.emit('toolConfigChanged', {
                tool: tool.name,
                ...data
            });
        });
    }

    /**
     * Load existing annotations and distribute to tools
     */
    async _loadExistingAnnotations() {
        if (!this.storageManager) {
            return;
        }

        try {
            console.log(`[ToolManager] Loading existing annotations for block: ${this.blockId}`);

            // Get existing data from DOM if available
            const blockElement = document.getElementById(`pdfx-block-${this.blockId}`);
            const existingData = {};

            if (blockElement) {
                // Extract existing annotation data from data attributes
                const dataAttributes = [
                    'saved-annotations',
                    'drawing-strokes',
                    'highlights',
                    'marker-strokes',
                    'text-annotations',
                    'shape-annotations',
                    'note-annotations'
                ];

                dataAttributes.forEach(attr => {
                    const dataValue = blockElement.getAttribute(`data-${attr}`);
                    if (dataValue) {
                        try {
                            const parsedData = JSON.parse(dataValue);
                            const key = attr.replace(/-([a-z])/g, (g) => g[1].toUpperCase()); // Convert to camelCase
                            existingData[key] = parsedData;
                        } catch (e) {
                            console.warn(`[ToolManager] Failed to parse ${attr} data:`, e);
                        }
                    }
                });
            }

            // Load from storage manager
            const loadedData = await this.storageManager.loadAnnotations(existingData);

            if (loadedData) {
                this._distributeLoadedAnnotations(loadedData);
            }

        } catch (error) {
            console.error(`[ToolManager] Error loading existing annotations:`, error);
        }
    }

    /**
     * Distribute loaded annotations to appropriate tools
     */
    _distributeLoadedAnnotations(annotationsData) {
        if (!annotationsData || typeof annotationsData !== 'object') {
            return;
        }

        console.log(`[ToolManager] Distributing loaded annotations to tools`);

        // Map annotation types to tools
        const typeToToolMap = {
            'highlight': 'highlight',
            'highlights': 'highlight',
            'scribble': 'scribble',
            'drawing_strokes': 'scribble',
            'drawingStrokes': 'scribble',
            'marker_strokes': 'scribble',
            'markerStrokes': 'scribble',
            'text': 'text',
            'text_annotations': 'text',
            'textAnnotations': 'text',
            'stamp': 'stamp',
            'stamp_annotations': 'stamp',
            'stampAnnotations': 'stamp'
        };

        Object.entries(annotationsData).forEach(([dataType, typeData]) => {
            const toolName = typeToToolMap[dataType];

            if (toolName && this.tools.has(toolName)) {
                const tool = this.tools.get(toolName);

                try {
                    console.log(`[ToolManager] Loading ${dataType} data for tool: ${toolName}`);
                    tool.loadAnnotations(typeData);
                } catch (error) {
                    console.error(`[ToolManager] Error loading ${dataType} for tool ${toolName}:`, error);
                }
            } else if (dataType !== 'currentPage' && dataType !== 'brightness' && dataType !== 'is_grayscale') {
                console.warn(`[ToolManager] No tool found for annotation type: ${dataType}`);
            }
        });

        // Update current page if provided
        if (annotationsData.currentPage) {
            this.currentPage = annotationsData.currentPage;
            this.handlePageChange(this.currentPage);
        }
    }

    /**
     * Set up keyboard shortcuts
     */
    _setupKeyboardShortcuts() {
        const shortcuts = {
            'KeyH': 'highlight',  // H for highlight
            'KeyD': 'scribble',   // D for draw/scribble
            'KeyT': 'text',       // T for text
            'KeyS': 'stamp',      // S for stamp
            'Escape': 'deactivate' // ESC to deactivate current tool
        };

        const handleKeydown = (event) => {
            // Only handle shortcuts if no input is focused
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            // Require Ctrl/Cmd key for tool shortcuts (except Escape)
            if (event.code === 'Escape') {
                if (this.activeTool) {
                    this.deactivateCurrentTool();
                    event.preventDefault();
                }
                return;
            }

            if (event.ctrlKey || event.metaKey) {
                const toolName = shortcuts[event.code];
                if (toolName && toolName !== 'deactivate') {
                    if (this.tools.has(toolName)) {
                        this.activateTool(toolName);
                        event.preventDefault();
                    }
                }
            }
        };

        document.addEventListener('keydown', handleKeydown);

        // Store reference for cleanup
        this._keydownHandler = handleKeydown;
    }

    /**
     * Activate a tool by name with enhanced storage integration
     */
    activateTool(toolName) {
        if (!this.isInitialized) {
            console.warn(`[ToolManager] Cannot activate tool ${toolName} - not initialized`);
            return false;
        }

        if (!this.tools.has(toolName)) {
            console.warn(`[ToolManager] Tool ${toolName} not found`);
            return false;
        }

        try {
            // Deactivate current tool first
            this.deactivateCurrentTool();

            // Get the tool
            const tool = this.tools.get(toolName);

            // Activate the tool
            tool.activate();
            this.activeTool = tool;

            // Notify storage manager that a tool is now active
            if (this.storageManager) {
                this.storageManager.setToolActive(true);
                console.log(`[ToolManager] Notified storage manager that tool ${toolName} is active`);
            }

            // Update UI
            this._updateToolUI(toolName, true);

            console.log(`[ToolManager] Activated tool: ${toolName}`);
            this.emit('toolActivated', { toolName, tool });

            return true;

        } catch (error) {
            console.error(`[ToolManager] Error activating tool ${toolName}:`, error);
            return false;
        }
    }

    /**
     * Deactivate the current tool with enhanced storage integration
     */
    deactivateCurrentTool() {
        if (!this.activeTool) {
            return;
        }

        try {
            const toolName = this.activeTool.name;

            // Deactivate the tool
            this.activeTool.deactivate();

            // Notify storage manager that no tool is active
            if (this.storageManager) {
                this.storageManager.setToolActive(false);
                console.log(`[ToolManager] Notified storage manager that tool ${toolName} is inactive`);
            }

            // Update UI
            this._updateToolUI(toolName, false);

            console.log(`[ToolManager] Deactivated tool: ${toolName}`);
            this.emit('toolDeactivated', { toolName, tool: this.activeTool });

            this.activeTool = null;

        } catch (error) {
            console.error(`[ToolManager] Error deactivating current tool:`, error);
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
     * Check if tool is available
     */
    hasToolAvailable(toolName) {
        return this.tools.has(toolName);
    }

    /**
     * Handle page change with enhanced storage coordination
     */
    handlePageChange(pageNum) {
        if (this.currentPage === pageNum) {
            return;
        }

        const previousPage = this.currentPage;
        this.currentPage = pageNum;

        console.log(`[ToolManager] Page changed from ${previousPage} to ${pageNum}`);

        try {
            // Force save any pending annotations before page change
            if (this.storageManager && this.storageManager.saveQueue.length > 0) {
                console.log(`[ToolManager] Force saving ${this.storageManager.saveQueue.length} pending annotations before page change`);
                this.storageManager.forceSave();
            }

            // Notify all tools about page change
            this.tools.forEach((tool, toolName) => {
                try {
                    if (tool.handlePageChange) {
                        tool.handlePageChange(pageNum, previousPage);
                    }
                } catch (error) {
                    console.error(`[ToolManager] Error handling page change for tool ${toolName}:`, error);
                }
            });

            // Update storage manager's current page
            if (this.storageManager) {
                this.storageManager.currentPage = pageNum;
            }

            this.emit('pageChanged', {
                currentPage: pageNum,
                previousPage: previousPage
            });

        } catch (error) {
            console.error(`[ToolManager] Error handling page change:`, error);
        }
    }

    /**
     * Set tool configuration
     */
    setToolConfig(toolName, config) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            console.warn(`[ToolManager] Tool not found for config update: ${toolName}`);
            return false;
        }

        try {
            tool.setConfig(config);
            console.log(`[ToolManager] Updated config for tool: ${toolName}`);
            return true;
        } catch (error) {
            console.error(`[ToolManager] Error setting config for tool ${toolName}:`, error);
            return false;
        }
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
        if (!tool) {
            console.warn(`[ToolManager] Tool not found for enable: ${toolName}`);
            return false;
        }

        try {
            tool.enable();
            console.log(`[ToolManager] Enabled tool: ${toolName}`);
            return true;
        } catch (error) {
            console.error(`[ToolManager] Error enabling tool ${toolName}:`, error);
            return false;
        }
    }

    /**
     * Disable a tool
     */
    disableTool(toolName) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            console.warn(`[ToolManager] Tool not found for disable: ${toolName}`);
            return false;
        }

        try {
            // Deactivate if currently active
            if (this.activeTool === tool) {
                this.deactivateCurrentTool();
            }

            tool.disable();
            console.log(`[ToolManager] Disabled tool: ${toolName}`);
            return true;
        } catch (error) {
            console.error(`[ToolManager] Error disabling tool ${toolName}:`, error);
            return false;
        }
    }

    /**
     * Get all annotations from all tools
     */
    getAllAnnotations() {
        const allAnnotations = [];

        this.tools.forEach(tool => {
            try {
                const toolAnnotations = tool.getAllAnnotations();
                if (Array.isArray(toolAnnotations)) {
                    allAnnotations.push(...toolAnnotations);
                }
            } catch (error) {
                console.error(`[ToolManager] Error getting annotations from tool ${tool.name}:`, error);
            }
        });

        return allAnnotations;
    }

    /**
     * Load annotations into all tools
     */
    async loadAllAnnotations(annotationsData) {
        if (!annotationsData) {
            return;
        }

        console.log(`[ToolManager] Loading annotations into all tools`);
        this._distributeLoadedAnnotations(annotationsData);
    }

    /**
     * Clear all annotations from all tools
     */
    clearAllAnnotations() {
        console.log(`[ToolManager] Clearing all annotations`);

        let clearedCount = 0;

        this.tools.forEach(tool => {
            try {
                const toolAnnotations = tool.getAllAnnotations();
                clearedCount += toolAnnotations.length;
                tool.clearAllAnnotations();
            } catch (error) {
                console.error(`[ToolManager] Error clearing annotations from tool ${tool.name}:`, error);
            }
        });

        // Also clear from storage manager
        if (this.storageManager) {
            this.storageManager.clearAllAnnotations();
        }

        console.log(`[ToolManager] Cleared ${clearedCount} annotations`);

        this.emit('allAnnotationsCleared', {
            count: clearedCount
        });
    }

    /**
     * Clear annotations for current page
     */
    clearCurrentPageAnnotations() {
        console.log(`[ToolManager] Clearing annotations for page: ${this.currentPage}`);

        let clearedCount = 0;

        this.tools.forEach(tool => {
            try {
                const pageAnnotations = tool.getAnnotationsForPage(this.currentPage);
                clearedCount += pageAnnotations.length;

                // Delete each annotation
                pageAnnotations.forEach(annotation => {
                    tool.deleteAnnotation(annotation.id);
                });
            } catch (error) {
                console.error(`[ToolManager] Error clearing page annotations from tool ${tool.name}:`, error);
            }
        });

        console.log(`[ToolManager] Cleared ${clearedCount} annotations from page ${this.currentPage}`);

        this.emit('pageAnnotationsCleared', {
            pageNum: this.currentPage,
            count: clearedCount
        });
    }

    /**
     * Get tool statistics
     */
    getToolStatistics() {
        const stats = {
            totalTools: this.tools.size,
            enabledTools: [],
            activeTool: this.getActiveToolName(),
            annotationCounts: {},
            totalAnnotations: 0
        };

        this.tools.forEach(tool => {
            if (tool.isToolEnabled && tool.isToolEnabled()) {
                stats.enabledTools.push(tool.name);
            }

            try {
                const annotations = tool.getAllAnnotations();
                stats.annotationCounts[tool.name] = annotations.length;
                stats.totalAnnotations += annotations.length;
            } catch (error) {
                console.error(`[ToolManager] Error getting statistics from tool ${tool.name}:`, error);
                stats.annotationCounts[tool.name] = 0;
            }
        });

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
     * Cleanup and destroy tool manager
     */
    async destroy() {
        console.log(`[ToolManager] Destroying tool manager for block: ${this.blockId}`);

        // Deactivate current tool
        if (this.activeTool) {
            this.deactivateCurrentTool();
        }

        // Clean up UI handlers
        for (const [handlerId, handlerInfo] of this.uiHandlers) {
            try {
                handlerInfo.element.removeEventListener(handlerInfo.event, handlerInfo.handler);
            } catch (error) {
                console.error(`[ToolManager] Error removing UI handler ${handlerId}:`, error);
            }
        }
        this.uiHandlers.clear();

        // Destroy all tools
        for (const [name, tool] of this.tools) {
            try {
                console.log(`[ToolManager] Destroying tool: ${name}`);
                if (tool.destroy) {
                    await tool.destroy();
                }
            } catch (error) {
                console.error(`[ToolManager] Error destroying tool ${name}:`, error);
            }
        }

        // Clear tools map
        this.tools.clear();

        // Remove keyboard handler
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }

        // Clean up annotation interface
        if (this.annotationInterface) {
            this.annotationInterface.destroy();
            this.annotationInterface = null;
        }

        // Remove all event listeners
        this.removeAllListeners();

        this.isInitialized = false;
        this.activeTool = null;

        console.log(`[ToolManager] Tool manager destroyed for block: ${this.blockId}`);
    }

    /**
     * Update tool UI state
     */
    _updateToolUI(toolName, isActive) {
        try {
            // Update secondary toolbar button state
            const toolButton = document.getElementById(`${toolName}Tool-${this.blockId}`);
            if (toolButton) {
                if (isActive) {
                    toolButton.classList.add('toggled', 'active');
                    toolButton.setAttribute('aria-pressed', 'true');
                } else {
                    toolButton.classList.remove('toggled', 'active');
                    toolButton.setAttribute('aria-pressed', 'false');
                }
            }

            // Update parameter toolbar visibility
            const paramToolbar = document.getElementById(`editor${toolName.charAt(0).toUpperCase() + toolName.slice(1)}ParamsToolbar-${this.blockId}`);
            if (paramToolbar) {
                if (isActive) {
                    paramToolbar.classList.remove('hidden');
                } else {
                    paramToolbar.classList.add('hidden');
                }
            }

            console.log(`[ToolManager] Updated UI for tool ${toolName}: ${isActive ? 'active' : 'inactive'}`);

        } catch (error) {
            console.error(`[ToolManager] Error updating UI for tool ${toolName}:`, error);
        }
    }
}

export default ToolManager;