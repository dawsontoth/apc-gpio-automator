import { spawn, execSync } from 'child_process';

import { state } from '../core/state.js';
import { handleGPIOChange } from './handleGPIOChange.js';
import { broadcastState } from '../core/broadcastState.js';

/**
 * @param {import('../core/state.js').TriggerGroup} triggerGroup
 * @param {import('../core/state.js').ToggleGroup} toggleGroup
 */
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

    console.log(`Initializing local GPIO using gpiod tools...`);

    const inputPins = [];
    const monitors = [];

    gpioConfig.forEach(cfg => {
        const bcmPin = cfg.bcmPin || cfg.pin;
        const host = cfg.host || '127.0.0.1';
        const port = cfg.port || 8888;
        const key = `${host}:${port}:${bcmPin}`;

        if (cfg.mode === 'output') {
            state.gpioOutputs[key] = {
                ...cfg,
                host,
                port,
                pin: bcmPin,
                name: cfg.name || `GPIO ${bcmPin}`,
                state: 'off'
            };
            try {
                execSync(`gpioset GPIO${bcmPin}=0`);
            } catch (e) {}
            console.log(`GPIO pin ${bcmPin} ready as output.`);
        } else {
            const mode = cfg.mode || 'switch';
            state.gpioInputs[key] = {
                ...cfg,
                host,
                port,
                pin: bcmPin,
                mode,
                lastState: false,
                highSince: null
            };
            inputPins.push(state.gpioInputs[key]);

            // Do not do an initial read, we'll only change things when the pins change.
            // try {
            //const output = execSync(`gpioget GPIO${bcmPin}`).toString().trim();
            //const value = parseInt(output, 10);
            //handleGPIOChange(key, value, true, triggerGroup, toggleGroup);
            //
            // } catch (readErr) {}

            console.log(`GPIO pin ${bcmPin} ready as input (${mode} mode, pull: ${cfg.pull || 'none'}).`);
        }
    });

    // Group inputs by pull and debounce for gpiomon
    const inputGroups = {};
    inputPins.forEach(cfg => {
        const pull = cfg.pull === 'up' ? 'pull-up' : (cfg.pull === 'down' ? 'pull-down' : 'none');
        const debounce = cfg.mode === 'switch' ? 100 : 0;
        const groupKey = `${pull}-${debounce}`;
        if (!inputGroups[groupKey]) {
            inputGroups[groupKey] = { pull, debounce, cfgs: [] };
        }
        inputGroups[groupKey].cfgs.push(cfg);
    });

    Object.values(inputGroups).forEach(group => {
        const lineNames = group.cfgs.map(cfg => `GPIO${cfg.pin}`);
        const args = [
            '-e', 'both',
            '-p', group.debounce.toString(),
            '-b', group.pull,
            ...lineNames
        ];

        try {
            console.log(`Starting gpiomon for pins: ${lineNames.join(', ')}`);
            const mon = spawn('gpiomon', args);

            mon.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (!line.trim()) return;
                    // Expected format: 2454.3452345\trising\t"GPIO27"
                    const parts = line.split('\t');
                    if (parts.length < 3) return;

                    const edge = parts[1];
                    const name = parts[2].replace(/"/g, '');
                    const match = name.match(/GPIO(\d+)/);
                    if (match) {
                        const bcmPin = parseInt(match[1], 10);
                        const key = Object.keys(state.gpioInputs).find(k => k.endsWith(`:${bcmPin}`));
                        if (key) {
                            const value = edge === 'rising' ? 1 : 0;
                            handleGPIOChange(key, value, false, triggerGroup, toggleGroup);
                        }
                    }
                });
            });

            mon.stderr.on('data', (data) => {
                console.error(`gpiomon stderr: ${data}`);
            });

            mon.on('error', (err) => {
                console.error(`Failed to start gpiomon: ${err.message}`);
            });

            monitors.push(mon);
        } catch (e) {
            console.error(`Error spawning gpiomon: ${e.message}`);
        }
    });

    broadcastState();

    const cleanup = () => {
        console.log('Shutting down GPIO monitors...');
        monitors.forEach(mon => mon.kill());
        process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}
