import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { state } from '../core/state.js';
import { handleGPIOChange } from './handleGPIOChange.js';
import { broadcastState } from '../core/broadcastState.js';

export function initGPIO(triggerGroup, toggleGroup) {
    const config = state.config;
    let gpioConfig = config['gpio'] || [];
    if (!Array.isArray(gpioConfig)) {
        gpioConfig = Object.entries(gpioConfig).map(([pin, group]) => ({
            pin: parseInt(pin, 10),
            group: group,
            mode: 'switch',
            name: group
        }));
    }

    try {
        const { Gpio } = require('onoff');
        console.log(`Initializing local GPIO using onoff...`);

        gpioConfig.forEach(cfg => {
            const pin = parseInt(cfg.pin, 10);
            const host = cfg.host || '127.0.0.1';
            const port = cfg.port || 8888;
            const key = `${host}:${port}:${pin}`;

            if (cfg.mode === 'output') {
                const gpio = new Gpio(pin, 'out');
                state.gpioOutputs[key] = {
                    ...cfg,
                    host,
                    port,
                    pin,
                    name: cfg.name || `GPIO ${pin}`,
                    state: 'off',
                    gpio
                };
                gpio.writeSync(0);
                console.log(`GPIO pin ${pin} ready as output.`);
            } else {
                const mode = cfg.mode || 'switch';
                const debounceTimeout = mode === 'switch' ? 100 : 0;
                
                const gpio = new Gpio(pin, 'in', 'both', { debounceTimeout });
                
                state.gpioInputs[key] = {
                    ...cfg,
                    host,
                    port,
                    pin,
                    mode,
                    lastState: false,
                    highSince: null,
                    gpio
                };

                if (cfg.pull) {
                    console.warn(`Warning: GPIO pin ${pin} has pull=${cfg.pull} configured, but onoff does not support setting pull-up/down resistors. Please ensure they are set externally.`);
                }

                gpio.watch((err, value) => {
                    if (err) {
                        console.error(`Error watching GPIO pin ${pin}:`, err);
                        return;
                    }
                    handleGPIOChange(key, value, false, triggerGroup, toggleGroup);
                });

                console.log(`GPIO pin ${pin} ready as input (${mode} mode).`);

                // Initial read
                try {
                    const value = gpio.readSync();
                    handleGPIOChange(key, value, true, triggerGroup, toggleGroup);
                } catch (readErr) {
                    console.error(`Initial read failed for GPIO pin ${pin}:`, readErr.message);
                }
            }
        });
        broadcastState();

        // Cleanup on exit
        const cleanup = () => {
            console.log('Unexporting GPIO pins...');
            Object.values(state.gpioInputs).forEach(input => {
                if (input.gpio) try { input.gpio.unexport(); } catch (e) {}
            });
            Object.values(state.gpioOutputs).forEach(output => {
                if (output.gpio) try { output.gpio.unexport(); } catch (e) {}
            });
            process.exit();
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

    } catch (e) {
        console.log('onoff not found or failed to initialize, GPIO functionality disabled');
        console.log(e);
    }
}
