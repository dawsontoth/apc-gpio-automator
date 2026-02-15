import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { state } from './lib/core/state.js';
import { initGPIO } from './lib/gpio/initGPIO.js';
import { discoverDevices } from './lib/pdu/discoverDevices.js';
import { pollPDUStatus } from './lib/pdu/pollPDUStatus.js';
import { triggerGroup } from './lib/core/triggerGroup.js';
import { toggleGroup } from './lib/core/toggleGroup.js';
import { runSchedules } from './lib/core/runSchedules.js';
import { startWebServer } from './lib/web/startWebServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
state.config = config;

async function main() {
    console.log('Starting APC GPIO Automator...');
    
    startWebServer();
    initGPIO(triggerGroup, toggleGroup);
    await discoverDevices();

    setInterval(() => {
        for (const host in state.discoveredPDUs) {
            pollPDUStatus(host);
        }
    }, 60_000);

    setInterval(discoverDevices, 5 * 60_000);

    setInterval(runSchedules, 10_000);
}

main().catch(err => console.error('Main error:', err));
