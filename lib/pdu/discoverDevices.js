import { state } from '../core/state.js';
import { scanSubnet } from './scanSubnet.js';
import { discoverPDU } from './discoverPDU.js';

let isDiscovering = false;

export async function discoverDevices() {
    if (isDiscovering) {
        console.log('Discovery already in progress, skipping...');
        return;
    }
    isDiscovering = true;

    try {
        console.log('Starting device discovery...');
        const config = state.config;
        const allHosts = new Set(config.apcPDUs || []);

        // Perform subnet scanning if configured
        if (config.scanSubnets) {
            for (const subnet of config.scanSubnets) {
                const discoveredHosts = await scanSubnet(subnet);
                discoveredHosts.forEach(h => allHosts.add(h));
            }
        }

        // Load multiple APC PDUs
        for (const host of allHosts) {
            if (!state.discoveredPDUs[host]) {
                await discoverPDU(host);
            }
        }
        console.log('Device discovery completed.');
    } finally {
        isDiscovering = false;
    }
}
