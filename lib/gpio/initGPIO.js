import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { state } from '../core/state.js';
import { handleGPIOChange } from './handleGPIOChange.js';
import { broadcastState } from '../core/broadcastState.js';

export function initGPIO(triggerGroup, toggleGroup) {
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

    const hosts = [...new Set(rpiConfig.map(cfg => cfg.host || '127.0.0.1'))];

    hosts.forEach(host => {
        try {
            const { pigpio } = require('pigpio-client');
            console.log(`Initializing pigpio-client for ${host}...`);
            const pi = pigpio({ host });
            state.gpioConnections[host] = pi;

            pi.on('connected', (info) => {
                console.log(`Connected to pigpiod on ${host}`);
                
                const hostConfig = rpiConfig.filter(cfg => (cfg.host || '127.0.0.1') === host);
                
                hostConfig.forEach(cfg => {
                    const pin = parseInt(cfg.pin, 10);
                    const key = `${host}:${pin}`;
                    const gpio = pi.gpio(pin);

                    if (cfg.mode === 'output') {
                        state.gpioOutputs[key] = {
                            ...cfg,
                            host,
                            pin,
                            name: cfg.name || `GPIO ${pin}`,
                            state: 'off',
                            gpio
                        };
                        gpio.modeSet('output');
                        gpio.write(0);
                        console.log(`GPIO pin ${pin} on ${host} ready as output.`);
                    } else {
                        state.gpioInputs[key] = {
                            ...cfg,
                            host,
                            pin,
                            mode: cfg.mode || 'switch',
                            lastState: false,
                            highSince: null,
                            gpio
                        };
                        gpio.modeSet('input');
                        
                        // Set pull up/down if specified
                        if (cfg.pull === 'up') gpio.pullUpDown(2);
                        else if (cfg.pull === 'down') gpio.pullUpDown(1);
                        else gpio.pullUpDown(0);

                        gpio.notify((level) => {
                            handleGPIOChange(key, level, false, triggerGroup, toggleGroup);
                        });
                        
                        console.log(`GPIO pin ${pin} on ${host} ready as input (${state.gpioInputs[key].mode} mode).`);
                        
                        // Initial read
                        gpio.read((err, level) => {
                            if (!err) handleGPIOChange(key, level, true, triggerGroup, toggleGroup);
                        });
                    }
                });
                broadcastState();
            });

            pi.on('error', (err) => {
                console.error(`Error connecting to pigpiod on ${host}:`, err.message);
            });

            pi.on('disconnected', () => {
                console.log(`Disconnected from pigpiod on ${host}`);
                // Remove pins for this host from state
                Object.keys(state.gpioOutputs).forEach(key => {
                    if (state.gpioOutputs[key].host === host) delete state.gpioOutputs[key];
                });
                Object.keys(state.gpioInputs).forEach(key => {
                    if (state.gpioInputs[key].host === host) delete state.gpioInputs[key];
                });
                broadcastState();
            });

        } catch (e) {
            console.log('pigpio-client not found or failed to initialize, GPIO functionality disabled');
        }
    });
}
