import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { state } from '../core/state.js';
import { broadcastState } from '../core/broadcastState.js';
import { runCommand } from '../common/runCommand.js';

export async function setGPIOOutputState(pin, stateVal) {
    const output = state.gpioOutputs[pin];
    if (!output) return;

    if (state.pinTimers[pin]) {
        clearTimeout(state.pinTimers[pin]);
        delete state.pinTimers[pin];
    }

    try {
        let gpio;
        try {
            gpio = require('rpi-gpio');
        } catch (e) {
            // Should not happen if initGPIO was successful, but just in case
            return;
        }
        if (!gpio) return;
        
        await new Promise((resolve, reject) => {
            gpio.write(pin, stateVal === 'on', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log(`GPIO Pin ${pin} (${output.name}) set to ${stateVal}`);

        const cmd = stateVal === 'on' ? output.onCommand : output.offCommand;
        if (cmd) {
            await runCommand(cmd);
        }

        output.state = stateVal;
        broadcastState();

        if (stateVal === 'on' && output.autoOffAfter) {
            console.log(`GPIO Pin ${pin} (${output.name}) will auto-off after ${output.autoOffAfter}ms`);
            state.pinTimers[pin] = setTimeout(() => {
                console.log(`Auto-off triggered for GPIO Pin ${pin} (${output.name})`);
                setGPIOOutputState(pin, 'off');
            }, output.autoOffAfter);
        }
    } catch (err) {
        console.error(`Failed to set GPIO pin ${pin} to ${stateVal}:`, err.message);
    }
}
