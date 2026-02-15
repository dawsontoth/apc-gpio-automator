import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { state } from '../core/state.js';
import { handleGPIOChange } from './handleGPIOChange.js';

export function initGPIO(triggerGroup, toggleGroup) {
    try {
        const gpio = require('rpi-gpio');
        console.log('rpi-gpio found, initializing...');
        
        const config = state.config;
        let rpiConfig = config['rpi-gpio'] || [];
        if (!Array.isArray(rpiConfig)) {
            rpiConfig = Object.entries(rpiConfig).map(([pin, group]) => ({
                pin: parseInt(pin, 10),
                group: group,
                mode: 'switch',
                name: group
            }));
        }

        gpio.on('change', (channel, value) => {
            handleGPIOChange(channel, value, false, triggerGroup, toggleGroup);
        });

        rpiConfig.forEach(cfg => {
            const pin = parseInt(cfg.pin, 10);

            if (cfg.mode === 'output') {
                state.gpioOutputs[pin] = {
                    pin,
                    name: cfg.name || `GPIO ${pin}`,
                    state: 'off',
                    onCommand: cfg.onCommand,
                    offCommand: cfg.offCommand,
                    autoOffAfter: cfg.autoOffAfter
                };

                gpio.setup(pin, gpio.DIR_OUT, (err) => {
                    if (err) console.error(`Error setting up GPIO output pin ${pin}:`, err);
                    else {
                        console.log(`GPIO pin ${pin} (${state.gpioOutputs[pin].name}) ready.`);
                        gpio.write(pin, false);
                    }
                });
            } else {
                state.gpioInputs[pin] = {
                    ...cfg,
                    pin,
                    mode: cfg.mode || 'switch',
                    lastState: false,
                    highSince: null
                };

                gpio.setup(pin, gpio.DIR_IN, gpio.EDGE_BOTH, (err) => {
                    if (err) console.error(`Error setting up GPIO input pin ${pin}:`, err);
                    else {
                        console.log(`GPIO pin ${pin} ready as input (${state.gpioInputs[pin].mode} mode).`);
                        gpio.read(pin, (err, value) => {
                            if (!err) handleGPIOChange(pin, value, true, triggerGroup, toggleGroup);
                        });
                    }
                });
            }
        });
    } catch (e) {
        console.log('rpi-gpio not found or failed to initialize, GPIO functionality disabled');
    }
}
