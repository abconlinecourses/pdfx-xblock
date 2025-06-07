/**
 * EventEmitter - Simple event emitter implementation
 *
 * Provides event-based communication between different components
 */

export class EventEmitter {
    constructor() {
        this.events = new Map();
    }

    /**
     * Register an event listener
     * @param {string} event - Event name
     * @param {Function} listener - Event listener function
     * @param {Object} options - Options (once: boolean)
     */
    on(event, listener, options = {}) {
        if (typeof listener !== 'function') {
            throw new Error('Listener must be a function');
        }

        if (!this.events.has(event)) {
            this.events.set(event, []);
        }

        const listenerData = {
            listener,
            once: options.once || false
        };

        this.events.get(event).push(listenerData);

        return this;
    }

    /**
     * Register a one-time event listener
     * @param {string} event - Event name
     * @param {Function} listener - Event listener function
     */
    once(event, listener) {
        return this.on(event, listener, { once: true });
    }

    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {Function} listener - Event listener function to remove
     */
    off(event, listener) {
        if (!this.events.has(event)) {
            return this;
        }

        const listeners = this.events.get(event);
        const index = listeners.findIndex(l => l.listener === listener);

        if (index !== -1) {
            listeners.splice(index, 1);

            // Clean up empty event arrays
            if (listeners.length === 0) {
                this.events.delete(event);
            }
        }

        return this;
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to listeners
     */
    emit(event, ...args) {
        if (!this.events.has(event)) {
            return false;
        }

        const listeners = this.events.get(event).slice(); // Copy to avoid issues if modified during emit
        let hadListeners = false;

        for (const listenerData of listeners) {
            hadListeners = true;

            try {
                listenerData.listener.apply(this, args);
            } catch (error) {
                console.error(`Error in event listener for '${event}':`, error);
            }

            // Remove one-time listeners
            if (listenerData.once) {
                this.off(event, listenerData.listener);
            }
        }

        return hadListeners;
    }

    /**
     * Get all event names that have listeners
     */
    eventNames() {
        return Array.from(this.events.keys());
    }

    /**
     * Get the number of listeners for an event
     * @param {string} event - Event name
     */
    listenerCount(event) {
        return this.events.has(event) ? this.events.get(event).length : 0;
    }

    /**
     * Get all listeners for an event
     * @param {string} event - Event name
     */
    listeners(event) {
        if (!this.events.has(event)) {
            return [];
        }

        return this.events.get(event).map(l => l.listener);
    }

    /**
     * Remove all listeners for an event, or all listeners for all events
     * @param {string} [event] - Event name (optional)
     */
    removeAllListeners(event) {
        if (event) {
            this.events.delete(event);
        } else {
            this.events.clear();
        }

        return this;
    }

    /**
     * Set the maximum number of listeners for an event (for debugging)
     * @param {number} n - Maximum number of listeners
     */
    setMaxListeners(n) {
        this.maxListeners = n;
        return this;
    }

    /**
     * Get the maximum number of listeners
     */
    getMaxListeners() {
        return this.maxListeners || 10;
    }
}

export default EventEmitter;