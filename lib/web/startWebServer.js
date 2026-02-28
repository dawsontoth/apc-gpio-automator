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
                    const cmd = action === 'on' ? device.onCommand : device.offCommand;
                    if (cmd) {
                        void runCommand(cmd);
                    }
                    state.manualDeviceStates[device.name] = action;
                    broadcastState();
                }
            } else if (host.startsWith('GPIO')) {
                const connKey = host.substring(5);
                await setGPIOOutputState(`${connKey}:${index}`, action);
            } else {
                await setOutletState(host, index, action);
            }
        });

        socket.on('renameOutlet', async ({ host, index, name }) => {
            console.log(`Web command: rename outlet ${host} index ${index} to "${name}"`);
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
                    const port = parseInt(connKey.split(':')[1], 10);
                    
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
