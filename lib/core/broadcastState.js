import { state } from './state.js';
import { getPublicState } from './getPublicState.js';

/**
 * @returns {void}
 */
export function broadcastState() {
    if (state.io) {
        state.io.emit('state', getPublicState());
    }
}
