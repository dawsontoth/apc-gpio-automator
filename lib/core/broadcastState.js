import { state } from './state.js';
import { getPublicState } from './getPublicState.js';

export function broadcastState() {
    if (state.io) {
        state.io.emit('state', getPublicState());
    }
}
