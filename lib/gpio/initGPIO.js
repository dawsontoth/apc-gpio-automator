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

    const connections = gpioConfig.reduce((acc, cfg) => {
        const host = cfg.host || '127.0.0.1';
        const port = cfg.port || 8888;
        const connKey = `${host}:${port}`;
        if (!acc[connKey]) {
            acc[connKey] = { host, port };
        }
        return acc;
    }, {});

    Object.values(connections).forEach(({ host, port }) => {
        const connKey = `${host}:${port}`;
        try {
            const { pigpio } = require('pigpio-client');
            console.log(`Initializing pigpio-client for ${host}:${port}...`);
            const pi = pigpio({ host, port });
            state.gpioConnections[connKey] = pi;

            pi.on('connected', (info) => {
                console.log(`Connected to pigpiod on ${host}:${port}`);
                
                const hostConfig = gpioConfig.filter(cfg =>
                    (cfg.host || '127.0.0.1') === host && 
                    (cfg.port || 8888) === port
                );
                
                hostConfig.forEach(cfg => {
                    const pin = parseInt(cfg.pin, 10);
                    const key = `${host}:${port}:${pin}`;
                    const gpio = pi.gpio(pin);

                    if (cfg.mode === 'output') {
                        state.gpioOutputs[key] = {
                            ...cfg,
                            host,
                            port,
                            pin,
                            name: cfg.name || `GPIO ${pin}`,
                            state: 'off',
                            gpio
                        };
                        gpio.modeSet('output');
                        gpio.write(0);
                        console.log(`GPIO pin ${pin} on ${host}:${port} ready as output.`);
                    } else {
                        state.gpioInputs[key] = {
                            ...cfg,
                            host,
                            port,
                            pin,
                            mode: cfg.mode || 'switch',
                            lastState: false,
                            highSince: null,
                            gpio
                        };
                        gpio.modeSet('input');
                        
                        // Set pull up/down if specified
                        const mode = cfg.mode || 'switch';
                        if (cfg.pull === 'up') gpio.pullUpDown(2);
                        else if (cfg.pull === 'down') gpio.pullUpDown(1);
                        else gpio.pullUpDown(0);

                        // Set glitch filter (debounce) for switch mode
                        if (mode === 'switch') {
                            gpio.glitchSet(100000); // 100ms in microseconds
                        }

                        gpio.notify((level) => {
                            handleGPIOChange(key, level, false, triggerGroup, toggleGroup);
                        });
                        
                        console.log(`GPIO pin ${pin} on ${host}:${port} ready as input (${state.gpioInputs[key].mode} mode).`);
                        
                        // Initial read
                        gpio.read((err, level) => {
                            if (!err) handleGPIOChange(key, level, true, triggerGroup, toggleGroup);
                        });
                    }
                });
                broadcastState();
            });

            pi.on('error', (err) => {
                console.error(`Error connecting to pigpiod on ${host}:${port}:`, err.message);
            });

            pi.on('disconnected', () => {
                console.log(`Disconnected from pigpiod on ${host}:${port}`);
                // Remove pins for this connection from state
                Object.keys(state.gpioOutputs).forEach(key => {
                    const output = state.gpioOutputs[key];
                    if (output.host === host && output.port === port) delete state.gpioOutputs[key];
                });
                Object.keys(state.gpioInputs).forEach(key => {
                    const input = state.gpioInputs[key];
                    if (input.host === host && input.port === port) delete state.gpioInputs[key];
                });
                broadcastState();
            });

        } catch (e) {
            console.log('pigpio-client not found or failed to initialize, GPIO functionality disabled');
            console.log(e);
        }
    });
}
