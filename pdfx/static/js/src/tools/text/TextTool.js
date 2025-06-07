/**
 * TextTool - Text annotation functionality
 *
 * Provides text annotation capabilities
 */

import { BaseTool } from '../base/BaseTool.js';

export class TextTool extends BaseTool {
    constructor(options = {}) {
        super({
            name: 'text',
            ...options
        });
    }

    async init() {
        console.debug('[TextTool] Initializing text tool');
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
        console.debug('[TextTool] Cleaning up text tool');
    }
}

export default TextTool;