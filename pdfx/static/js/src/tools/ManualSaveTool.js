/**
 * ManualSaveTool.js - Manual Save Tool for PDF Annotations
 * Provides manual save button with auto-save status indicator
 */

class ManualSaveTool {
    constructor(blockId, viewer, storageManager) {
        this.blockId = blockId;
        this.viewer = viewer;
        this.storageManager = storageManager;

        this.saveButton = null;
        this.saveStatusIndicator = null;
        this.saveTextSpan = null;
        this.isAutoSaveEnabled = true;
        this.lastSaveTime = null;

        this.init();
    }

    init() {
        console.log(`[ManualSaveTool] DEBUG: Init started for block: ${this.blockId}`);
        console.log(`[ManualSaveTool] DEBUG: Storage manager available:`, !!this.storageManager);
        console.log(`[ManualSaveTool] DEBUG: Viewer available:`, !!this.viewer);

        this.createSaveButton();
        this.setupEventListeners();
        this.updateSaveStatus();

        // Monitor storage manager events
        if (this.storageManager) {
            this.storageManager.on('annotationCached', () => this.updateSaveStatus());
            this.storageManager.on('saveSuccess', () => this.onSaveSuccess());
            this.storageManager.on('saveError', () => this.onSaveError());
            console.log(`[ManualSaveTool] DEBUG: Event listeners attached to storage manager`);
        } else {
            console.warn(`[ManualSaveTool] WARNING: No storage manager available`);
        }

        console.log(`[ManualSaveTool] DEBUG: Initialization completed for block: ${this.blockId}`);
    }

    createSaveButton() {
        // Get existing button from HTML template
        this.saveButton = document.getElementById(`manualSave-${this.blockId}`);
        this.saveStatusIndicator = document.getElementById(`saveStatus-${this.blockId}`);

        if (!this.saveButton) {
            console.error(`[ManualSaveTool] Save button not found for block: ${this.blockId}`);
            return;
        }

        if (!this.saveStatusIndicator) {
            console.error(`[ManualSaveTool] Save status indicator not found for block: ${this.blockId}`);
            return;
        }

        // Get the save text span
        this.saveTextSpan = this.saveButton.querySelector('.saveText');
        if (!this.saveTextSpan) {
            console.error(`[ManualSaveTool] Save text span not found for block: ${this.blockId}`);
            return;
        }

        // Add CSS styles
        this.addStyles();
    }

    addStyles() {
        // Only add styles once
        if (document.getElementById('manualSaveToolStyles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'manualSaveToolStyles';
        style.textContent = `
            /* Tooltip styles only */
            .manualSaveButton {
                position: relative !important;
            }

            .manualSaveButton::after {
                content: attr(data-tooltip) !important;
                position: absolute !important;
                bottom: 100% !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                background: rgba(0, 0, 0, 0.9) !important;
                color: white !important;
                padding: 6px 10px !important;
                border-radius: 4px !important;
                font-size: 11px !important;
                white-space: nowrap !important;
                opacity: 0 !important;
                visibility: hidden !important;
                transition: opacity 0.1s ease, visibility 0.1s ease !important;
                pointer-events: none !important;
                z-index: 1000 !important;
                margin-bottom: 5px !important;
            }

            .manualSaveButton:hover::after {
                opacity: 1 !important;
                visibility: visible !important;
            }
        `;

        document.head.appendChild(style);
    }

    setupEventListeners() {
        if (!this.saveButton) {
            console.error(`[ManualSaveTool] ❌ No save button found - cannot setup event listeners`);
            return;
        }

        this.saveButton.addEventListener('click', (e) => {
            console.log(`[ManualSaveTool] DEBUG: Save button clicked!`);
            e.preventDefault();
            this.triggerManualSave();
        });

        // Update status periodically
        setInterval(() => {
            this.updateSaveStatus();
        }, 1000);
    }

    async triggerManualSave() {
        if (!this.storageManager) {
            console.error('[ManualSaveTool] ❌ No storage manager available');
            alert('Error: No storage manager available for saving annotations.');
            return;
        }

        // Prevent multiple simultaneous saves
        if (this.saveButton.classList.contains('saving')) {
            return;
        }

        // If no items in queue, create a test save to demonstrate functionality
        if ((!this.storageManager.saveQueue || this.storageManager.saveQueue.length === 0) &&
            (!this.storageManager.deleteQueue || this.storageManager.deleteQueue.length === 0)) {

            // Create a test annotation save (current page state)
            const testSaveData = {
                action: 'save',
                userId: this.storageManager.userId,
                courseId: this.storageManager.courseId,
                blockId: this.storageManager.blockId,
                data: { currentPage: this.storageManager.currentPage || 1 },
                deletions: [],
                currentPage: this.storageManager.currentPage || 1,
                timestamp: Date.now()
            };
        }

        // Update button state
        this.updateButtonState('saving');

        try {
            // Force process the save queue
            await this.storageManager._processSaveQueue();

            // Check if there are still items in queue after save attempt
            const hasUnsavedItems = (this.storageManager.saveQueue && this.storageManager.saveQueue.length > 0) ||
                                   (this.storageManager.deleteQueue && this.storageManager.deleteQueue.length > 0);

            if (hasUnsavedItems) {
                throw new Error('Some items could not be saved');
            }

            this.onSaveSuccess();

        } catch (error) {
            console.error('[ManualSaveTool] ❌ Manual save failed:', error);
            this.onSaveError();
        }
    }

    onSaveSuccess() {
        this.lastSaveTime = new Date();
        this.updateButtonState('success');

        // Reset button state after 2 seconds
        setTimeout(() => {
            this.updateButtonState('normal');
            this.updateSaveStatus();
        }, 2000);
    }

    onSaveError() {
        this.updateButtonState('error');

        // Reset button state after 3 seconds
        setTimeout(() => {
            this.updateButtonState('normal');
            this.updateSaveStatus();
        }, 3000);
    }

    updateButtonState(state) {
        if (!this.saveButton || !this.saveTextSpan) return;

        // Remove all state classes
        this.saveButton.classList.remove('saving', 'success', 'error', 'auto-save-off', 'pending');

        // Add new state class
        if (state !== 'normal') {
            this.saveButton.classList.add(state);
        }

        // Update button content based on state - only update the text span, preserve the save status indicator
        let iconClass, text;
        switch (state) {
            case 'saving':
                iconClass = 'fas fa-spinner fa-spin';
                text = 'Saving';
                this.saveButton.disabled = true;
                break;
            case 'success':
                iconClass = 'fas fa-check';
                text = 'Saved';
                this.saveButton.disabled = false;
                break;
            case 'error':
                iconClass = 'fas fa-exclamation-triangle';
                text = 'Error';
                this.saveButton.disabled = false;
                break;
            default:
                iconClass = 'fas fa-save';
                text = 'Save';
                this.saveButton.disabled = false;
                break;
        }

        // Update only the text content, preserving the save status indicator
        this.saveTextSpan.innerHTML = `<i class="${iconClass} saveIcon"></i> ${text}`;
    }

    updateSaveStatus() {
        if (!this.saveStatusIndicator || !this.storageManager) return;

        const hasUnsavedItems = (this.storageManager.saveQueue && this.storageManager.saveQueue.length > 0) ||
                               (this.storageManager.deleteQueue && this.storageManager.deleteQueue.length > 0);

        const isAutoSaveEnabled = this.storageManager.config && this.storageManager.config.autoSave;

        let statusClass = '';
        let statusTooltipText = '';
        let buttonTooltipText = '';

        if (hasUnsavedItems) {
            const totalUnsaved = (this.storageManager.saveQueue?.length || 0) + (this.storageManager.deleteQueue?.length || 0);
            statusClass = 'pending';
            statusTooltipText = `${totalUnsaved} annotation${totalUnsaved > 1 ? 's' : ''} pending save`;
            buttonTooltipText = `Save Now - ${totalUnsaved} unsaved annotation${totalUnsaved > 1 ? 's' : ''}`;
        } else if (isAutoSaveEnabled) {
            statusClass = 'auto-save-on';
            statusTooltipText = 'Auto-save is enabled';
            buttonTooltipText = 'Manual Save - Auto-save is ON';

            if (this.lastSaveTime) {
                const timeAgo = this.getTimeAgoText(this.lastSaveTime);
                statusTooltipText += ` • Last saved ${timeAgo}`;
                buttonTooltipText += ` • Last saved ${timeAgo}`;
            }
        } else {
            statusClass = 'auto-save-off';
            statusTooltipText = 'Auto-save is disabled';
            buttonTooltipText = 'Manual Save - Auto-save is OFF (click to save manually)';
        }

        this.updateStatusIndicator(statusClass, statusTooltipText);
        this.updateButtonTooltip(buttonTooltipText);
    }

    updateStatusIndicator(className = '', tooltipText = '') {
        if (!this.saveStatusIndicator) return;

        this.saveStatusIndicator.className = 'saveStatusIndicator';
        this.saveStatusIndicator.title = tooltipText;

        if (className) {
            this.saveStatusIndicator.classList.add(className);
        }
    }

    updateButtonTooltip(tooltipText) {
        if (!this.saveButton) return;

        // Use data-tooltip for instant CSS tooltip instead of title
        this.saveButton.setAttribute('data-tooltip', tooltipText);
        // Remove title to prevent browser tooltip
        this.saveButton.removeAttribute('title');
    }

    getTimeAgoText(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);

        if (diffSecs < 10) {
            return 'just now';
        } else if (diffSecs < 60) {
            return `${diffSecs}s ago`;
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }

    destroy() {
        // Clean up event listeners (DOM elements stay in template)
        if (this.saveButton) {
            // Remove click listener by cloning and replacing the element
            const newButton = this.saveButton.cloneNode(true);
            this.saveButton.parentNode.replaceChild(newButton, this.saveButton);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ManualSaveTool;
} else if (typeof window !== 'undefined') {
    window.ManualSaveTool = ManualSaveTool;
}