import { state } from '../core/state.js';

export function handleGPIOChange(key, value, isInitial = false, triggerGroup, toggleGroup) {
    // Find the matching input config
    const cfg = state.gpioInputs[key];
    if (!cfg) return;

    if (cfg.mode === 'switch') {
        const action = value ? 'on' : 'off';
        if (isInitial || value !== cfg.lastState) {
            console.log(`GPIO Switch: Pin ${cfg.pin} on ${cfg.host}:${cfg.port || 8888} (${cfg.group}) is now ${value ? 'HIGH' : 'LOW'} -> Action: ${action}`);
            triggerGroup(cfg.group, action);
        }
    } else if (cfg.mode === 'momentary') {
        if (value) {
            // High
            cfg.highSince = Date.now();
        } else {
            // Low
            if (cfg.highSince) {
                const duration = Date.now() - cfg.highSince;
                const minTime = cfg.minTime || 50;
                if (duration >= minTime) {
                    console.log(`GPIO Momentary: Pin ${cfg.pin} on ${cfg.host}:${cfg.port || 8888} pulse detected (${duration}ms) -> Toggling group ${cfg.group}`);
                    toggleGroup(cfg.group);
                }
            }
            cfg.highSince = null;
        }
    }
    cfg.lastState = value;
}
