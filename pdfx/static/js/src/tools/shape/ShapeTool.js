/**
 * ShapeTool - Shape drawing functionality
 *
 * Provides shape drawing capabilities
 */

import { BaseTool } from '../base/BaseTool.js';

export class ShapeTool extends BaseTool {
    constructor(options = {}) {
        super({
            name: 'shape',
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

export default ShapeTool;