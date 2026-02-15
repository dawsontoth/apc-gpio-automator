import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { state } from './lib/core/state.js';
import { initGPIO } from './lib/gpio/initGPIO.js';
import { scanSubnet } from './lib/pdu/scanSubnet.js';
import { discoverPDU } from './lib/pdu/discoverPDU.js';
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
    
    // 1. Start web server early
    startWebServer();

    // 2. Initialize GPIO
    initGPIO(triggerGroup, toggleGroup);

    const allHosts = new Set(config.apcPDUs || []);

    // Perform subnet scanning if configured
    if (config.scanSubnets) {
        for (const subnet of config.scanSubnets) {
            const discoveredHosts = await scanSubnet(subnet);
            discoveredHosts.forEach(h => allHosts.add(h));
        }
    }

    // 3. Load multiple APC PDUs
    for (const host of allHosts) {
        if (!state.discoveredPDUs[host]) {
            await discoverPDU(host);
        }
    }

    // 4. Start status polling
    setInterval(() => {
        for (const host in state.discoveredPDUs) {
            pollPDUStatus(host);
        }
    }, 10000); // Poll every 10 seconds

    // 5. Start scheduler
    setInterval(runSchedules, 10000);
}

main().catch(err => console.error('Main error:', err));
