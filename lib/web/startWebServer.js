import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import { state } from '../core/state.js';
import { getPublicState } from '../core/getPublicState.js';
import { triggerGroup } from '../core/triggerGroup.js';
import { setOutletState } from '../pdu/setOutletState.js';
import { setGPIOOutputState } from '../gpio/setGPIOOutputState.js';
import { sleep } from '../common/sleep.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startWebServer() {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);
    state.io = io;

    const publicPath = path.join(__dirname, '../../public');
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
                        const hostPart = task.host.includes(':') ? task.host.split(':')[1] : '127.0.0.1';
                        await setGPIOOutputState(`${hostPart}:${task.index}`, action);
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
            if (host.startsWith('GPIO')) {
                const hostPart = host.includes(':') ? host.split(':')[1] : '127.0.0.1';
                await setGPIOOutputState(`${hostPart}:${index}`, action);
            } else {
                await setOutletState(host, index, action);
            }
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
