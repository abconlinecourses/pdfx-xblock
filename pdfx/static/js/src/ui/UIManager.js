/**
 * UIManager - Manages all user interface components
 *
 * Handles toolbar, navigation, settings, and UI interactions
 */

import { EventEmitter } from '../utils/EventEmitter.js';

export class UIManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.blockId = options.blockId;
        this.container = options.container;
        this.allowDownload = options.allowDownload !== false;
        this.isStudio = options.isStudio || false;

        // UI elements
        this.toolbar = null;
        this.navigation = null;
        this.statusBar = null;
        this.loadingIndicator = null;
        this.errorDisplay = null;

        // State
        this.isInitialized = false;
        this.currentPage = 1;
        this.totalPages = 0;
        this.activeToolName = null;

        // Event handlers
        this.eventHandlers = new Map();

        // Bind methods
        this._bindMethods();
    }

    /**
     * Initialize the UI manager
     */
    async init() {
        if (this.isInitialized) {
            return;
        }

        try {

            // Initialize core UI components
            this._initializeLoadingIndicator();
            this._initializeErrorDisplay();
            this._initializeToolbar();
            this._initializeNavigation();
            this._initializeStatusBar();

            // Set up event listeners
            this._setupEventListeners();

            this.isInitialized = true;


            this.emit('initialized', { uiManager: this });

        } catch (error) {
            throw error;
        }
    }

    /**
     * Initialize loading indicator
     */
    _initializeLoadingIndicator() {
        this.loadingIndicator = this.container.querySelector('.loading-indicator');
        if (!this.loadingIndicator) {
            this.loadingIndicator = document.createElement('div');
            this.loadingIndicator.className = 'loading-indicator';
            this.loadingIndicator.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading PDF...</div>
            `;
            this.loadingIndicator.style.display = 'block';
            this.container.appendChild(this.loadingIndicator);
        }
    }

    /**
     * Initialize error display
     */
    _initializeErrorDisplay() {
        this.errorDisplay = this.container.querySelector('.pdf-error');
        if (!this.errorDisplay) {
            this.errorDisplay = document.createElement('div');
            this.errorDisplay.className = 'pdf-error';
            this.errorDisplay.style.display = 'none';
            this.errorDisplay.innerHTML = `
                <div class="error-icon">⚠️</div>
                <div class="error-message">An error occurred</div>
                <button class="error-retry">Retry</button>
            `;
            this.container.appendChild(this.errorDisplay);
        }

        // Add retry button handler
        const retryButton = this.errorDisplay.querySelector('.error-retry');
        if (retryButton) {
            this._addEventHandler(retryButton, 'click', () => {
                this.emit('retryRequested');
            });
        }
    }

    /**
     * Initialize toolbar
     */
    _initializeToolbar() {
        // Find existing toolbar (now using FontAwesome icons from HTML template)
        this.toolbar = this.container.querySelector(`#toolbar-${this.blockId}`);
        if (this.toolbar) {
            // Don't recreate - just set up event listeners for existing toolbar
            this._setupToolbarEvents();
            return;
        }

        // Only create fallback if toolbar doesn't exist
        this.toolbar = document.createElement('div');
        this.toolbar.id = `toolbar-${this.blockId}`;
        this.toolbar.className = 'pdf-toolbar';

        // Create toolbar content with FontAwesome icons
        this.toolbar.innerHTML = this._createToolbarHTML();

        // Insert toolbar at the beginning of main container
        const mainContainer = this.container.querySelector(`#pdf-main-${this.blockId}`);
        if (mainContainer) {
            mainContainer.insertBefore(this.toolbar, mainContainer.firstChild);
        }

        // Set up toolbar event listeners
        this._setupToolbarEvents();
    }

    /**
     * Create toolbar HTML with FontAwesome icons
     */
    _createToolbarHTML() {
        const tools = [
            { name: 'highlight', icon: 'fas fa-highlighter', title: 'Highlight Text' },
            { name: 'scribble', icon: 'fas fa-pen', title: 'Draw/Scribble' },
            { name: 'text', icon: 'fas fa-font', title: 'Add Text' },
            { name: 'shape', icon: 'fas fa-shapes', title: 'Draw Shape' },
            { name: 'note', icon: 'fas fa-sticky-note', title: 'Add Note' }
        ];

        let toolsHTML = '';
        for (const tool of tools) {
            toolsHTML += `
                <button class="tool-button" data-tool="${tool.name}" title="${tool.title}">
                    <i class="${tool.icon}"></i>
                </button>
            `;
        }

        return `
            <div class="toolbar-section tools-section">
                <div class="tool-buttons">
                    ${toolsHTML}
                </div>
            </div>
            <div class="toolbar-section settings-section">
                <div class="setting-controls">
                    <label for="color-input-${this.blockId}">
                        <i class="fas fa-palette"></i>
                    </label>
                    <input type="color" id="color-input-${this.blockId}" value="#FF0000" class="color-picker">
                    <label for="size-input-${this.blockId}">
                        <i class="fas fa-expand-arrows-alt"></i>
                    </label>
                    <input type="range" id="size-input-${this.blockId}" min="1" max="20" value="5" class="size-slider">
                </div>
            </div>
            <div class="toolbar-section actions-section">
                <div class="action-buttons">
                    <button class="action-button" data-action="clear" title="Clear All">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="action-button" data-action="undo" title="Undo">
                        <i class="fas fa-undo"></i>
                    </button>
                    ${this.allowDownload ? '<button class="action-button" data-action="download" title="Download PDF"><i class="fas fa-download"></i></button>' : ''}
                </div>
            </div>
        `;
    }

    /**
     * Set up toolbar event listeners
     */
    _setupToolbarEvents() {
        // Tool buttons
        const toolButtons = this.toolbar.querySelectorAll('.tool-button');
        toolButtons.forEach(button => {
            this._addEventHandler(button, 'click', () => {
                const toolName = button.dataset.tool;
                this._activateTool(toolName);
            });
        });

        // Action buttons
        const actionButtons = this.toolbar.querySelectorAll('.action-button');
        actionButtons.forEach(button => {
            this._addEventHandler(button, 'click', () => {
                const action = button.dataset.action;
                this._handleAction(action);
            });
        });

        // Color picker
        const colorPicker = this.toolbar.querySelector('.color-picker');
        if (colorPicker) {
            this._addEventHandler(colorPicker, 'change', (event) => {
                this.emit('colorChanged', { color: event.target.value });
            });
        }

        // Size slider
        const sizeSlider = this.toolbar.querySelector('.size-slider');
        if (sizeSlider) {
            this._addEventHandler(sizeSlider, 'input', (event) => {
                this.emit('sizeChanged', { size: parseInt(event.target.value, 10) });
            });
        }
    }

    /**
     * Initialize navigation
     */
    _initializeNavigation() {

        // Try multiple possible navigation selectors
        const possibleSelectors = [
            `#navigation-${this.blockId}`,
            `.pdf-navigation`,
            `[id*="navigation"]`,
            `[class*="navigation"]`
        ];

        let foundNavigation = null;
        for (const selector of possibleSelectors) {
            const element = this.container.querySelector(selector);
            if (element) {
                foundNavigation = element;
                break;
            } else {
            }
        }

        this.navigation = foundNavigation;

        if (this.navigation) {
            this._setupNavigationEvents();
            return;
        }

        this.navigation = document.createElement('div');
        this.navigation.id = `navigation-${this.blockId}`;
        this.navigation.className = 'pdf-navigation';
        this.navigation.innerHTML = `
            <div class="nav-section">
                <button class="nav-button" data-nav="first" title="First Page">
                    <i class="fas fa-step-backward"></i>
                </button>
                <button class="nav-button" data-nav="prev" title="Previous Page">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="page-info">
                    <input type="number" class="page-input" value="1" min="1">
                    <span class="page-separator">of</span>
                    <span class="total-pages">1</span>
                </span>
                <button class="nav-button" data-nav="next" title="Next Page">
                    <i class="fas fa-chevron-right"></i>
                </button>
                <button class="nav-button" data-nav="last" title="Last Page">
                    <i class="fas fa-step-forward"></i>
                </button>
            </div>
            <div class="zoom-section">
                <button class="zoom-button" data-zoom="out" title="Zoom Out">
                    <i class="fas fa-search-minus"></i>
                </button>
                <span class="zoom-info">100%</span>
                <button class="zoom-button" data-zoom="in" title="Zoom In">
                    <i class="fas fa-search-plus"></i>
                </button>
                <button class="zoom-button" data-zoom="fit" title="Fit to Page">
                    <i class="fas fa-compress-alt"></i>
                </button>
                <button class="zoom-button" data-zoom="fit-width" title="Fit Width">
                    <i class="fas fa-arrows-alt-h"></i>
                </button>
                <button class="zoom-button" data-action="fullscreen" title="Fullscreen">
                    <i class="fas fa-expand"></i>
                </button>
            </div>
        `;

        const mainContainer = this.container.querySelector(`#pdf-main-${this.blockId}`);
        const pdfViewerArea = this.container.querySelector('.pdf-viewer-area');

        if (mainContainer && pdfViewerArea) {
            mainContainer.insertBefore(this.navigation, pdfViewerArea.nextSibling);
        } else if (mainContainer) {
            mainContainer.appendChild(this.navigation);
        }

        this._setupNavigationEvents();
    }

    /**
     * Set up navigation event listeners
     */
    _setupNavigationEvents() {

        if (!this.navigation) {
            return;
        }

        // Navigation buttons
        const navButtons = this.navigation.querySelectorAll('.nav-button');

        navButtons.forEach((button, index) => {
            const action = button.dataset.nav;

            if (!action) {
                return;
            }

            // Add visual feedback for debugging
            button.style.cursor = 'pointer';
            button.style.userSelect = 'none';

            // Add multiple event types for better compatibility
            this._addEventHandler(button, 'click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._handleNavigation(action);
            });

            // Add touch support for mobile
            this._addEventHandler(button, 'touchend', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._handleNavigation(action);
            });

            // Visual feedback
            this._addEventHandler(button, 'mousedown', () => {
                button.style.backgroundColor = '#0066cc';
            });

            this._addEventHandler(button, 'mouseup', () => {
                button.style.backgroundColor = '';
            });

            this._addEventHandler(button, 'mouseleave', () => {
                button.style.backgroundColor = '';
            });
        });

        // Page input
        const pageInput = this.navigation.querySelector('.page-input');

        if (pageInput) {
            this._addEventHandler(pageInput, 'change', (event) => {
                const pageNum = parseInt(event.target.value, 10);
                if (pageNum >= 1 && pageNum <= this.totalPages) {
                    this.emit('pageNavigationRequested', { pageNum });
                } else {
                    // Reset to current page if invalid
                    event.target.value = this.currentPage;
                }
            });

            this._addEventHandler(pageInput, 'keypress', (event) => {
                if (event.key === 'Enter') {
                    const pageNum = parseInt(event.target.value, 10);
                    if (pageNum >= 1 && pageNum <= this.totalPages) {
                        this.emit('pageNavigationRequested', { pageNum });
                    }
                }
            });
        }

        // Zoom buttons
        const zoomButtons = this.navigation.querySelectorAll('.zoom-button');

        zoomButtons.forEach((button, index) => {
            const action = button.dataset.zoom;

            if (!action) {
                return;
            }

            // Add visual feedback for debugging
            button.style.cursor = 'pointer';
            button.style.userSelect = 'none';

            this._addEventHandler(button, 'click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._handleZoom(action);
            });

            // Add touch support
            this._addEventHandler(button, 'touchend', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._handleZoom(action);
            });

            // Visual feedback
            this._addEventHandler(button, 'mousedown', () => {
                button.style.backgroundColor = '#0066cc';
            });

            this._addEventHandler(button, 'mouseup', () => {
                button.style.backgroundColor = '';
            });

            this._addEventHandler(button, 'mouseleave', () => {
                button.style.backgroundColor = '';
            });
        });

        // Action buttons (including fullscreen)
        const actionButtons = this.navigation.querySelectorAll('[data-action]');

        actionButtons.forEach((button, index) => {
            const action = button.dataset.action;

            if (!action) {
                return;
            }

            // Add visual feedback for debugging
            button.style.cursor = 'pointer';
            button.style.userSelect = 'none';

            this._addEventHandler(button, 'click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._handleAction(action);
            });

            // Add touch support
            this._addEventHandler(button, 'touchend', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._handleAction(action);
            });
        });

        // Add debugging info to the DOM
        if (this.navigation) {
            this.navigation.setAttribute('data-debug-events', 'true');
            this.navigation.setAttribute('data-nav-buttons', navButtons.length.toString());
            this.navigation.setAttribute('data-zoom-buttons', zoomButtons.length.toString());
            this.navigation.setAttribute('data-action-buttons', actionButtons.length.toString());
        }
    }

    /**
     * Initialize status bar
     */
    _initializeStatusBar() {
        this.statusBar = this.container.querySelector(`#status-bar-${this.blockId}`);
        if (this.statusBar) {
            // Don't recreate - status bar already exists in template
            return;
        }

        // Only create fallback if status bar doesn't exist
        this.statusBar = document.createElement('div');
        this.statusBar.id = `status-bar-${this.blockId}`;
        this.statusBar.className = 'pdf-status-bar';
        this.statusBar.innerHTML = `
            <div class="status-section">
                <span class="status-text">Ready</span>
            </div>
            <div class="tool-status">
                <span class="active-tool-label">No tool active</span>
            </div>
        `;

        const mainContainer = this.container.querySelector(`#pdf-main-${this.blockId}`);
        if (mainContainer) {
            mainContainer.appendChild(this.statusBar);
        } else {
            this.container.appendChild(this.statusBar);
        }
    }

    /**
     * Set up event listeners
     */
    _setupEventListeners() {
        // Global keyboard shortcuts
        this._addEventHandler(document, 'keydown', this._handleKeyboardShortcuts.bind(this));

        // Fullscreen change events
        this._setupFullscreenEventListeners();
    }

    /**
     * Set up fullscreen event listeners
     */
    _setupFullscreenEventListeners() {
        const fullscreenEvents = [
            'fullscreenchange',
            'webkitfullscreenchange',
            'mozfullscreenchange',
            'msfullscreenchange'
        ];

        fullscreenEvents.forEach(eventName => {
            this._addEventHandler(document, eventName, () => {
                const pdfBlock = this.container.closest('.pdfx-block');
                if (!pdfBlock) return;

                if (document.fullscreenElement) {
                    // Entered fullscreen
                    pdfBlock.classList.add('fullscreen');

                    // Recalculate PDF scale for fullscreen
                    setTimeout(() => {
                        this.emit('zoomRequested', { zoom: 'fit-width' });
                    }, 200);
                } else {
                    // Exited fullscreen
                    pdfBlock.classList.remove('fullscreen');

                    // Recalculate PDF scale for normal mode
                    setTimeout(() => {
                        this.emit('zoomRequested', { zoom: 'fit-width' });
                    }, 200);
                }
            });
        });
    }

    /**
     * Handle keyboard shortcuts
     */
    _handleKeyboardShortcuts(event) {
        // Only handle shortcuts when not typing in inputs
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        // Page navigation shortcuts
        if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
            this._handleNavigation('prev');
            event.preventDefault();
        } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
            this._handleNavigation('next');
            event.preventDefault();
        } else if (event.key === 'Home') {
            this._handleNavigation('first');
            event.preventDefault();
        } else if (event.key === 'End') {
            this._handleNavigation('last');
            event.preventDefault();
        }
    }

    /**
     * Activate a tool
     */
    _activateTool(toolName) {
        this.emit('toolRequested', { toolName });
    }

    /**
     * Handle action buttons
     */
    _handleAction(action) {
        switch (action) {
            case 'clear':
                this.emit('clearRequested');
                break;
            case 'undo':
                this.emit('undoRequested');
                break;
            case 'download':
                this.emit('downloadRequested');
                break;
            case 'fullscreen':
                this._toggleFullscreen();
                break;
        }
    }

    /**
     * Handle navigation actions
     */
    _handleNavigation(action) {

        if (this.totalPages === 0) {
            return;
        }

        let targetPage = this.currentPage;

        switch (action) {
            case 'first':
                targetPage = 1;
                break;
            case 'prev':
                targetPage = Math.max(1, this.currentPage - 1);
                break;
            case 'next':
                targetPage = Math.min(this.totalPages, this.currentPage + 1);
                break;
            case 'last':
                targetPage = this.totalPages;
                break;
            default:
                return;
        }


        // Validate target page
        if (targetPage < 1 || targetPage > this.totalPages) {
            return;
        }

        if (targetPage !== this.currentPage) {
            this.emit('pageNavigationRequested', { pageNum: targetPage });

            // Update button states immediately for better UX
            this._updateNavigationButtonStates(targetPage);
        } else {
        }
    }

    /**
     * Update navigation button states
     */
    _updateNavigationButtonStates(currentPage = this.currentPage) {
        if (!this.navigation) return;

        const firstBtn = this.navigation.querySelector('[data-nav="first"]');
        const prevBtn = this.navigation.querySelector('[data-nav="prev"]');
        const nextBtn = this.navigation.querySelector('[data-nav="next"]');
        const lastBtn = this.navigation.querySelector('[data-nav="last"]');

        // Disable first/prev buttons on first page
        if (firstBtn) firstBtn.disabled = (currentPage <= 1);
        if (prevBtn) prevBtn.disabled = (currentPage <= 1);

        // Disable next/last buttons on last page
        if (nextBtn) nextBtn.disabled = (currentPage >= this.totalPages);
        if (lastBtn) lastBtn.disabled = (currentPage >= this.totalPages);

    }

    /**
     * Update zoom button states
     */
    updateZoomState(zoomMode, scale) {
        const zoomButtons = this.navigation?.querySelectorAll('.zoom-button');
        if (zoomButtons) {
            zoomButtons.forEach(button => {
                const buttonZoom = button.dataset.zoom;
                if (buttonZoom === zoomMode) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }
            });
        }

        // Update zoom info display
        if (scale) {
            this.updateZoomInfo(scale);
        }
    }

    /**
     * Update zoom info display
     */
    updateZoomInfo(scale) {
        const zoomInfo = this.navigation?.querySelector('.zoom-info');
        if (zoomInfo) {
            const percentage = Math.round(scale * 100);
            zoomInfo.textContent = `${percentage}%`;
        }
    }

    /**
     * Handle zoom
     */
    _handleZoom(action) {

        // Update button states
        this.updateZoomState(action);

        switch (action) {
            case 'in':
                this.emit('zoomRequested', { zoom: 'in' });
                break;
            case 'out':
                this.emit('zoomRequested', { zoom: 'out' });
                break;
            case 'fit':
                this.emit('zoomRequested', { zoom: 'fit' });
                break;
            case 'fit-width':
                this.emit('zoomRequested', { zoom: 'fit-width' });
                break;
            default:
        }
    }

    /**
     * Toggle fullscreen mode
     */
    _toggleFullscreen() {
        // Try to find the PDF main container
        let pdfMainContainer = this.container.querySelector(`#pdf-main-${this.blockId}`);

        // If not found with blockId, try with class selector as fallback
        if (!pdfMainContainer) {
            pdfMainContainer = this.container.querySelector('.pdf-main-container');
        }

        // Try to find the PDF block container
        const pdfBlock = this.container.closest('.pdfx-block');

        if (!pdfMainContainer || !pdfBlock) {
            return;
        }

        const isCurrentlyFullscreen = document.fullscreenElement || pdfBlock.classList.contains('fullscreen');

        if (!isCurrentlyFullscreen) {
            // Enter fullscreen

            // Add fullscreen class immediately for CSS styling
            pdfBlock.classList.add('fullscreen');

            // Enable floating mode for menus
            this._enableFloatingMenus();

            // Request native fullscreen
            const requestFullscreen = pdfMainContainer.requestFullscreen ||
                                    pdfMainContainer.webkitRequestFullscreen ||
                                    pdfMainContainer.mozRequestFullScreen ||
                                    pdfMainContainer.msRequestFullscreen;

            if (requestFullscreen) {
                requestFullscreen.call(pdfMainContainer).then(() => {
                    // Force PDF to recalculate scale for fullscreen
                    setTimeout(() => {
                        this.emit('zoomRequested', { zoom: 'fit-width' });
                    }, 100);
                }).catch((err) => {
                    // Keep the fullscreen class for CSS fallback
                    // Force PDF to recalculate scale for CSS fullscreen
                    setTimeout(() => {
                        this.emit('zoomRequested', { zoom: 'fit-width' });
                    }, 100);
                });
            } else {
                // Force PDF to recalculate scale for CSS fullscreen
                setTimeout(() => {
                    this.emit('zoomRequested', { zoom: 'fit-width' });
                }, 100);
            }
        } else {
            // Exit fullscreen

            // If we're in native fullscreen, try to exit it
            if (document.fullscreenElement) {
                const exitFullscreen = document.exitFullscreen ||
                                      document.webkitExitFullscreen ||
                                      document.mozCancelFullScreen ||
                                      document.msExitFullscreen;

                if (exitFullscreen) {
                    exitFullscreen.call(document).then(() => {
                    }).catch((err) => {
                    });
                }
            }

            // Always remove fullscreen class (for both native and CSS fullscreen)
            pdfBlock.classList.remove('fullscreen');

            // Disable floating mode for menus
            this._disableFloatingMenus();

            // Force PDF to recalculate scale for normal mode
            setTimeout(() => {
                this.emit('zoomRequested', { zoom: 'fit-width' });
            }, 100);
        }
    }

    /**
     * Update document information
     */
    updateDocumentInfo(docInfo) {
        this.totalPages = docInfo.numPages || 0;

        // Update navigation
        const totalPagesSpan = this.navigation?.querySelector('.total-pages');
        if (totalPagesSpan) {
            totalPagesSpan.textContent = this.totalPages;
        }

        const pageInput = this.navigation?.querySelector('.page-input');
        if (pageInput) {
            pageInput.max = this.totalPages;
        }

        // Set fit-width as default active zoom mode
        this.updateZoomState('fit-width');

        // Automatically trigger fit-width zoom when document loads
        this.emit('zoomRequested', { zoom: 'fit-width' });

        // Update status
        this.updateStatus(`Document loaded: ${this.totalPages} pages`);
    }

    /**
     * Update current page display
     */
    updateCurrentPage(pageNum, totalPages = null) {
        this.currentPage = pageNum;
        if (totalPages) {
            this.totalPages = totalPages;
        }

        const pageInput = this.navigation?.querySelector('.page-input');
        if (pageInput) {
            pageInput.value = pageNum;
        }

        const totalPagesSpan = this.navigation?.querySelector('.total-pages');
        if (totalPagesSpan && totalPages) {
            totalPagesSpan.textContent = totalPages;
        }
    }

    /**
     * Update tool state
     */
    updateToolState(toolName, isActive) {
        this.activeToolName = isActive ? toolName : null;

        // Update toolbar buttons
        const toolButtons = this.toolbar?.querySelectorAll('.tool-button');
        if (toolButtons) {
            toolButtons.forEach(button => {
                const buttonTool = button.dataset.tool;
                if (buttonTool === toolName) {
                    button.classList.toggle('active', isActive);
                } else {
                    button.classList.remove('active');
                }
            });
        }

        // Update status bar
        const activeToolLabel = this.statusBar?.querySelector('.active-tool-label');
        if (activeToolLabel) {
            activeToolLabel.textContent = isActive ? `${toolName} tool active` : 'No tool active';
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        if (this.errorDisplay) {
            const errorMessage = this.errorDisplay.querySelector('.error-message');
            if (errorMessage) {
                errorMessage.textContent = message;
            }
            this.errorDisplay.style.display = 'block';
        }

        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = 'none';
        }

        this.updateStatus(`Error: ${message}`);
    }

    /**
     * Hide error message
     */
    hideError() {
        if (this.errorDisplay) {
            this.errorDisplay.style.display = 'none';
        }
    }

    /**
     * Show/hide loading indicator
     */
    setLoading(isLoading) {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = isLoading ? 'block' : 'none';
        }

        if (!isLoading) {
            this.hideError();
        }
    }

    /**
     * Update status message
     */
    updateStatus(message) {
        const statusText = this.statusBar?.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = message;
        }
    }

    /**
     * Add event handler with automatic cleanup
     */
    _addEventHandler(element, event, handler, options = {}) {
        if (!element || typeof handler !== 'function') {
            return;
        }

        const handlerKey = `${element.id || 'element'}_${event}_${Date.now()}`;

        element.addEventListener(event, handler, options);

        this.eventHandlers.set(handlerKey, {
            element,
            event,
            handler,
            options
        });
    }

    /**
     * Remove all event handlers
     */
    _removeAllEventHandlers() {
        for (const [key, handlerData] of this.eventHandlers) {
            handlerData.element.removeEventListener(
                handlerData.event,
                handlerData.handler,
                handlerData.options
            );
        }
        this.eventHandlers.clear();
    }

    /**
     * Bind methods to preserve context
     */
    _bindMethods() {
        this.updateDocumentInfo = this.updateDocumentInfo.bind(this);
        this.updateCurrentPage = this.updateCurrentPage.bind(this);
        this.updateToolState = this.updateToolState.bind(this);
        this.updateZoomState = this.updateZoomState.bind(this);
        this.showError = this.showError.bind(this);
        this.hideError = this.hideError.bind(this);
        this.setLoading = this.setLoading.bind(this);
        this.updateStatus = this.updateStatus.bind(this);
    }

    /**
     * Enable floating menus in fullscreen
     */
    _enableFloatingMenus() {
        if (this.toolbar) {
            this.toolbar.classList.add('floating');
            this._makeDraggable(this.toolbar);
        }
        if (this.navigation) {
            this.navigation.classList.add('floating');
            this._makeDraggable(this.navigation);
        }
    }

    /**
     * Disable floating menus
     */
    _disableFloatingMenus() {
        if (this.toolbar) {
            this.toolbar.classList.remove('floating', 'dragging');
            this.toolbar.style.transform = '';
            this.toolbar.style.top = '';
            this.toolbar.style.left = '';
            this.toolbar.style.bottom = '';
            this.toolbar.style.right = '';
        }
        if (this.navigation) {
            this.navigation.classList.remove('floating', 'dragging');
            this.navigation.style.transform = '';
            this.navigation.style.top = '';
            this.navigation.style.left = '';
            this.navigation.style.bottom = '';
            this.navigation.style.right = '';
        }
    }

    /**
     * Make an element draggable
     */
    _makeDraggable(element) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const onMouseDown = (e) => {
            // Only allow dragging if clicking directly on the element or its padding area
            if (e.target.closest('button') || e.target.closest('input')) return;

            isDragging = true;
            element.classList.add('dragging');

            const rect = element.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            startLeft = rect.left;
            startTop = rect.top;

            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;

            // Keep within viewport bounds
            const rect = element.getBoundingClientRect();
            newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, newLeft));
            newTop = Math.max(0, Math.min(window.innerHeight - rect.height, newTop));

            element.style.left = `${newLeft}px`;
            element.style.top = `${newTop}px`;
            element.style.right = 'auto';
            element.style.bottom = 'auto';
        };

        const onMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                element.classList.remove('dragging');
            }
        };

        // Add event listeners
        this._addEventHandler(element, 'mousedown', onMouseDown);
        this._addEventHandler(document, 'mousemove', onMouseMove);
        this._addEventHandler(document, 'mouseup', onMouseUp);

        // Touch support for mobile
        const onTouchStart = (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;

            const touch = e.touches[0];
            isDragging = true;
            element.classList.add('dragging');

            const rect = element.getBoundingClientRect();
            startX = touch.clientX;
            startY = touch.clientY;
            startLeft = rect.left;
            startTop = rect.top;

            e.preventDefault();
        };

        const onTouchMove = (e) => {
            if (!isDragging) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;

            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;

            // Keep within viewport bounds
            const rect = element.getBoundingClientRect();
            newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, newLeft));
            newTop = Math.max(0, Math.min(window.innerHeight - rect.height, newTop));

            element.style.left = `${newLeft}px`;
            element.style.top = `${newTop}px`;
            element.style.right = 'auto';
            element.style.bottom = 'auto';

            e.preventDefault();
        };

        const onTouchEnd = () => {
            if (isDragging) {
                isDragging = false;
                element.classList.remove('dragging');
            }
        };

        this._addEventHandler(element, 'touchstart', onTouchStart);
        this._addEventHandler(document, 'touchmove', onTouchMove);
        this._addEventHandler(document, 'touchend', onTouchEnd);
    }

    /**
     * Destroy the UI manager
     */
    destroy() {

        // Remove all event handlers
        this._removeAllEventHandlers();

        // Remove all event listeners
        this.removeAllListeners();

        // Clear references
        this.toolbar = null;
        this.navigation = null;
        this.statusBar = null;
        this.loadingIndicator = null;
        this.errorDisplay = null;
        this.container = null;

        this.isInitialized = false;
    }
}

export default UIManager;