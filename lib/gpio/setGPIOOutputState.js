import { state } from '../core/state.js';
import { broadcastState } from '../core/broadcastState.js';
import { runCommand } from '../common/runCommand.js';

/**
 * @param {string} key
 * @param {'on'|'off'} stateVal
 * @returns {Promise<void>}
 */
export async function setGPIOOutputState(key, stateVal) {
    const output = state.gpioOutputs[key];
    if (!output) return;

    const bcmPin = output.bcmPin || output.pin;
    if (state.pinTimers[key]) {
        clearTimeout(state.pinTimers[key]);
        delete state.pinTimers[key];
    }

    try {
        const val = stateVal === 'on' ? 1 : 0;
        await runCommand(`gpioset GPIO${bcmPin}=${val}`);
        console.log(`GPIO Pin ${bcmPin} on ${output.host}:${output.port || 8888} (${output.name}) set to ${stateVal}`);

        const cmd = stateVal === 'on' ? output.onCommand : output.offCommand;
        if (cmd) {
            await runCommand(cmd);
        }

        output.state = stateVal;
        broadcastState();

        if (stateVal === 'on' && output.autoOffAfter) {
            console.log(`GPIO Pin ${bcmPin} on ${output.host}:${output.port || 8888} (${output.name}) will auto-off after ${output.autoOffAfter}ms`);
            state.pinTimers[key] = setTimeout(() => {
                console.log(`Auto-off triggered for GPIO Pin ${bcmPin} on ${output.host}:${output.port || 8888} (${output.name})`);
                setGPIOOutputState(key, 'off');
            }, output.autoOffAfter);
        }
    } catch (err) {
        console.error(`Failed to set GPIO pin ${bcmPin} on ${output.host}:${output.port || 8888} to ${stateVal}:`, err.message);
    }
}
