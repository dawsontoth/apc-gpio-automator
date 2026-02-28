import { state } from '../core/state.js';
import { scanSubnet } from './scanSubnet.js';
import { discoverPDU } from './discoverPDU.js';

let isDiscovering = false;

/**
 * @returns {Promise<void>}
 */
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

        // Add already discovered PDUs to the set of hosts to check
        for (const host in state.discoveredPDUs) {
            allHosts.add(host);
        }

        // Perform subnet scanning if configured
        if (config.scanSubnets) {
            for (const subnet of config.scanSubnets) {
                const discoveredHosts = await scanSubnet(subnet);
                discoveredHosts.forEach(h => allHosts.add(h));
            }
        }

        // Load multiple APC PDUs
        const discoveryPromises = Array.from(allHosts).map(host => discoverPDU(host));
        await Promise.all(discoveryPromises);
        console.log('Device discovery completed.');
    } finally {
        isDiscovering = false;
    }
}
