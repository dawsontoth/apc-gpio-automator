import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { state } from '../core/state.js';
import { broadcastState } from '../core/broadcastState.js';
import { runCommand } from '../common/runCommand.js';

export async function setGPIOOutputState(key, stateVal) {
    const output = state.gpioOutputs[key];
    if (!output) return;

    const pin = output.pin;
    if (state.pinTimers[key]) {
        clearTimeout(state.pinTimers[key]);
        delete state.pinTimers[key];
    }

    try {
        const gpio = output.gpio;
        if (!gpio) {
            console.error(`GPIO object not found for ${key}`);
            return;
        }
        
        gpio.write(stateVal === 'on' ? 1 : 0);
        console.log(`GPIO Pin ${pin} on ${output.host} (${output.name}) set to ${stateVal}`);

        const cmd = stateVal === 'on' ? output.onCommand : output.offCommand;
        if (cmd) {
            await runCommand(cmd);
        }

        output.state = stateVal;
        broadcastState();

        if (stateVal === 'on' && output.autoOffAfter) {
            console.log(`GPIO Pin ${pin} on ${output.host} (${output.name}) will auto-off after ${output.autoOffAfter}ms`);
            state.pinTimers[key] = setTimeout(() => {
                console.log(`Auto-off triggered for GPIO Pin ${pin} on ${output.host} (${output.name})`);
                setGPIOOutputState(key, 'off');
            }, output.autoOffAfter);
        }
    } catch (err) {
        console.error(`Failed to set GPIO pin ${pin} on ${output.host} to ${stateVal}:`, err.message);
    }
}
