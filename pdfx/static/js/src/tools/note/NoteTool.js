/**
 * NoteTool - Note annotation functionality
 *
 * Provides note and comment capabilities
 */

import { BaseTool } from '../base/BaseTool.js';

export class NoteTool extends BaseTool {
    constructor(options = {}) {
        super({
            name: 'note',
            ...options
        });
    }

    async init() {
        this.isEnabled = true;
    }

    enable() {
        this.isEnabled = true;
    }

    disable() {
        this.isEnabled = false;
    }

    activate() {
        this.isActive = true;
        return true;
    }

    deactivate() {
        this.isActive = false;
    }

    async cleanup() {
    }
}

export default NoteTool;