import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { state } from '../core/state.js';
import { getPublicState } from '../core/getPublicState.js';
import { broadcastState } from '../core/broadcastState.js';
import { triggerGroup } from '../core/triggerGroup.js';
import { discoverDevices } from '../pdu/discoverDevices.js';
import { pollPDUStatus } from '../pdu/pollPDUStatus.js';
import { setOutletState } from '../pdu/setOutletState.js';
import { renameOutlet } from '../pdu/renameOutlet.js';
import { setGPIOOutputState } from '../gpio/setGPIOOutputState.js';
import { triggerSpecialAction } from '../core/triggerSpecialAction.js';
import { sleep } from '../common/sleep.js';
import { runCommand } from '../common/runCommand.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @returns {import('http').Server}
 */
export function startWebServer() {
    const app = express();
    app.use(express.json());
    const server = http.createServer(app);
    const io = new Server(server);
    state.io = io;

    const publicPath = path.join(__dirname, '../../public');

    app.get('/config', (req, res) => {
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            res.sendFile(path.join(publicPath, 'config/index.html'));
        } else {
            res.json(state.config);
        }
    });

    app.post('/config', (req, res) => {
        try {
            const newConfig = req.body;
            state.config = newConfig;
            const configPath = path.join(__dirname, '../../config.json');
            fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
            console.log('Configuration updated and saved.');
            res.json({ success: true });
        } catch (err) {
            console.error('Error saving config:', err);
            res.status(500).json({ error: 'Failed to save configuration' });
        }
    });

    app.use(express.static(publicPath));

    io.on('connection', (socket) => {
        console.log('Client connected');
        socket.emit('state', getPublicState());

        socket.on('triggerGroup', async ({ group, action }) => {
            console.log(`Web command: group "${group}" -> ${action}`);
            if (group === 'Other') {
                const publicState = getPublicState();
                const tasks = publicState.groups['Other'] || [];
                for (const task of tasks) {
                    if (task.host.startsWith('GPIO')) {
                        const connKey = task.host.substring(5);
                        await setGPIOOutputState(`${connKey}:${task.index}`, action);
                    } else {
                        await setOutletState(task.host, task.index, action);
                    }
                    await sleep(100);
                }
            } else {
                await triggerGroup(group, action);
            }
        });

        socket.on('triggerOutlet', async ({ host, index, action }) => {
            console.log(`Web command: outlet ${host} index ${index} -> ${action}`);
            if (host === 'Manual') {
                const device = state.config?.manualDevices?.find(d => d.name === index);
                if (device) {
                    const delay = action === 'on' ? (device.delayOnSeconds || 0) : (device.delayOffSeconds || 0);
                    if (delay > 0) {
                        setTimeout(async () => {
                            const cmd = action === 'on' ? device.onCommand : device.offCommand;
                            if (cmd) {
                                void runCommand(cmd);
                            }
                            state.manualDeviceStates[device.name] = action;
                            broadcastState();
                        }, delay * 1000);
                    } else {
                        const cmd = action === 'on' ? device.onCommand : device.offCommand;
                        if (cmd) {
                            void runCommand(cmd);
                        }
                        state.manualDeviceStates[device.name] = action;
                        broadcastState();
                    }
                }
            } else if (host.startsWith('GPIO')) {
                const connKey = host.substring(5);
                const key = `${connKey}:${index}`;
                const deviceName = state.gpioOutputs[key]?.name || index;
                const delay = action === 'on' ? (state.config.discoveredDeviceCustomizations?.[deviceName]?.delayOnSeconds || 0) : (state.config.discoveredDeviceCustomizations?.[deviceName]?.delayOffSeconds || 0);
                
                if (delay > 0) {
                    setTimeout(async () => {
                        await setGPIOOutputState(`${connKey}:${index}`, action);
                    }, delay * 1000);
                } else {
                    await setGPIOOutputState(`${connKey}:${index}`, action);
                }
            } else {
                const pdu = state.discoveredPDUs[host];
                const outlet = pdu?.outlets.find(o => o.index === index);
                const deviceName = outlet?.name || index;
                const delay = action === 'on' ? (state.config.discoveredDeviceCustomizations?.[deviceName]?.delayOnSeconds || 0) : (state.config.discoveredDeviceCustomizations?.[deviceName]?.delayOffSeconds || 0);
                
                if (delay > 0) {
                    setTimeout(async () => {
                        await setOutletState(host, index, action);
                    }, delay * 1000);
                } else {
                    await setOutletState(host, index, action);
                }
            }
        });

        socket.on('renameOutlet', async ({ host, index, name }) => {
            console.log(`Web command: rename outlet ${host} index ${index} to "${name}"`);
            if (host === 'Manual') {
                const device = state.config.manualDevices?.find(d => d.name === index);
                if (device) {
                    const oldName = device.name;
                    device.name = name;
                    
                    // Update manualDeviceStates if name changed
                    if (state.manualDeviceStates[oldName] !== undefined) {
                        state.manualDeviceStates[name] = state.manualDeviceStates[oldName];
                        delete state.manualDeviceStates[oldName];
                    }

                    const configPath = path.join(__dirname, '../../config.json');
                    fs.writeFileSync(configPath, JSON.stringify(state.config, null, 2));
                    broadcastState();
                }
                return;
            }
            if (!host.startsWith('GPIO')) {
                await renameOutlet(host, index, name);
            } else {
                // Optional: handle GPIO renaming by updating config
                const connKey = host.substring(5); // e.g. "127.0.0.1:8888"
                const key = `${connKey}:${index}`;
                if (state.gpioOutputs[key]) {
                    state.gpioOutputs[key].name = name;
                    
                    // Update config.json
                    const bcmPin = index;
                    const hostIp = connKey.split(':')[0];
                    
                    const gpioCfg = Array.isArray(state.config.gpio) && state.config.gpio.find(g => 
                        (g.bcmPin === bcmPin || g.pin === bcmPin) && 
                        (g.host === hostIp || (!g.host && hostIp === '127.0.0.1'))
                    );
                    
                    if (gpioCfg) {
                        gpioCfg.name = name;
                        const configPath = path.join(__dirname, '../../config.json');
                        fs.writeFileSync(configPath, JSON.stringify(state.config, null, 2));
                    }
                    broadcastState();
                }
            }
        });

        socket.on('updateOutletDetails', async (updates) => {
            const { host, index, name, delayOnSeconds, delayOffSeconds, onCommand, offCommand } = updates;
            console.log(`Web command: update outlet ${host} index ${index} details`);
            
            let changed = false;
            const config = state.config;

            if (host === 'Manual') {
                const device = config.manualDevices?.find(d => d.name === index);
                if (device) {
                    if (name && name !== device.name) {
                        const oldName = device.name;
                        device.name = name;
                        if (state.manualDeviceStates[oldName] !== undefined) {
                            state.manualDeviceStates[name] = state.manualDeviceStates[oldName];
                            delete state.manualDeviceStates[oldName];
                        }
                        changed = true;
                    }
                    if (onCommand !== undefined) {
                        device.onCommand = onCommand;
                        changed = true;
                    }
                    if (offCommand !== undefined) {
                        device.offCommand = offCommand;
                        changed = true;
                    }
                    if (delayOnSeconds !== undefined) {
                        if (delayOnSeconds === null) {
                            if (device.delayOnSeconds !== undefined) {
                                delete device.delayOnSeconds;
                                changed = true;
                            }
                        } else {
                            if (device.delayOnSeconds !== delayOnSeconds) {
                                device.delayOnSeconds = delayOnSeconds;
                                changed = true;
                            }
                        }
                    }
                    if (delayOffSeconds !== undefined) {
                        if (delayOffSeconds === null) {
                            if (device.delayOffSeconds !== undefined) {
                                delete device.delayOffSeconds;
                                changed = true;
                            }
                        } else {
                            if (device.delayOffSeconds !== delayOffSeconds) {
                                device.delayOffSeconds = delayOffSeconds;
                                changed = true;
                            }
                        }
                    }
                }
            } else {
                let deviceName = name || index;

                // Handle rename if name changed
                if (name && name !== index) {
                    if (!host.startsWith('GPIO')) {
                        // Find current name before renaming
                        const pdu = state.discoveredPDUs[host];
                        const outlet = pdu?.outlets.find(o => o.index === index);
                        const oldName = outlet?.name;

                        await renameOutlet(host, index, name);

                        // If it had customizations under the old name, move them to the new name
                        if (oldName && oldName !== name && config.discoveredDeviceCustomizations?.[oldName]) {
                            config.discoveredDeviceCustomizations[name] = {
                                ...config.discoveredDeviceCustomizations[oldName],
                                ...config.discoveredDeviceCustomizations[name]
                            };
                            delete config.discoveredDeviceCustomizations[oldName];
                            changed = true;
                        }
                    } else {
                        const connKey = host.substring(5);
                        const key = `${connKey}:${index}`;
                        if (state.gpioOutputs[key]) {
                            state.gpioOutputs[key].name = name;
                            const gpioCfg = Array.isArray(config.gpio) && config.gpio.find(g => 
                                (g.bcmPin === index || g.pin === index) && 
                                (g.host === connKey.split(':')[0] || (!g.host && connKey.split(':')[0] === '127.0.0.1'))
                            );
                            if (gpioCfg) {
                                gpioCfg.name = name;
                                changed = true;
                            }
                        }
                    }
                }

                // Handle delayOnSeconds and delayOffSeconds for discovered/GPIO devices
                if (delayOnSeconds !== undefined || delayOffSeconds !== undefined) {
                    if (!config.discoveredDeviceCustomizations) config.discoveredDeviceCustomizations = {};
                    
                    if (!config.discoveredDeviceCustomizations[deviceName]) {
                        config.discoveredDeviceCustomizations[deviceName] = {};
                    }

                    if (delayOnSeconds !== undefined) {
                        const current = config.discoveredDeviceCustomizations[deviceName].delayOnSeconds;
                        if (delayOnSeconds === null) {
                            if (current !== undefined) {
                                delete config.discoveredDeviceCustomizations[deviceName].delayOnSeconds;
                                changed = true;
                            }
                        } else {
                            if (current !== delayOnSeconds) {
                                config.discoveredDeviceCustomizations[deviceName].delayOnSeconds = delayOnSeconds;
                                changed = true;
                            }
                        }
                    }

                    if (delayOffSeconds !== undefined) {
                        const current = config.discoveredDeviceCustomizations[deviceName].delayOffSeconds;
                        if (delayOffSeconds === null) {
                            if (current !== undefined) {
                                delete config.discoveredDeviceCustomizations[deviceName].delayOffSeconds;
                                changed = true;
                            }
                        } else {
                            if (current !== delayOffSeconds) {
                                config.discoveredDeviceCustomizations[deviceName].delayOffSeconds = delayOffSeconds;
                                changed = true;
                            }
                        }
                    }

                    if (Object.keys(config.discoveredDeviceCustomizations[deviceName]).length === 0) {
                        delete config.discoveredDeviceCustomizations[deviceName];
                    }
                }
            }

            if (changed) {
                const configPath = path.join(__dirname, '../../config.json');
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                broadcastState();
            }
        });

        socket.on('triggerSpecialAction', async ({ name, action }) => {
            console.log(`Web command: special action "${name}" -> ${action}`);
            await triggerSpecialAction(name, action);
        });

        socket.on('discoverDevices', async () => {
            console.log('Web command: discoverDevices');
            for (const host in state.discoveredPDUs) {
                await pollPDUStatus(host);
            }
            await discoverDevices();
            broadcastState();
        });
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Web server accessible at:`);
        console.log(`http://localhost:${PORT}`);
        
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    console.log(`http://${iface.address}:${PORT}`);
                }
            }
        }
    });

    return server;
}
