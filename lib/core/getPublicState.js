import { state } from './state.js';

export function getPublicState() {
    const publicState = {
        pdus: {},
        groups: {}
    };

    const config = state.config;
    if (!config) return publicState;

    // Identify groups from config
    const knownGroups = new Set();
    if (config.groups) {
        config.groups.forEach(g => {
            knownGroups.add(typeof g === 'string' ? g : g.name);
        });
    }
    const rpiConfig = config['rpi-gpio'] || [];
    if (Array.isArray(rpiConfig)) {
        rpiConfig.forEach(cfg => {
            if (cfg.group) knownGroups.add(cfg.group);
        });
    } else {
        Object.values(rpiConfig).forEach(g => knownGroups.add(g));
    }
    
    if (config.schedules) {
        config.schedules.forEach(s => {
            if (s.groups) s.groups.forEach(g => knownGroups.add(g));
        });
    }

    // Aggregate all outlets
    const allOutlets = [];

    for (const host in state.discoveredPDUs) {
        const pdu = state.discoveredPDUs[host];
        publicState.pdus[host] = {
            sysName: pdu.sysName,
            sysLocation: pdu.sysLocation,
            type: pdu.type,
            outlets: pdu.outlets.map(o => ({
                index: o.index,
                name: o.name,
                state: o.state
            })).sort((a, b) => a.name.localeCompare(b.name))
        };

        pdu.outlets.forEach(o => {
            allOutlets.push({
                host,
                index: o.index,
                name: o.name,
                state: o.state,
                pduName: pdu.sysName,
                location: pdu.sysLocation,
                type: pdu.type
            });
        });
    }

    // Add GPIO outputs to PDUs and allOutlets
    const gpioPins = Object.values(state.gpioOutputs);
    if (gpioPins.length > 0) {
        // Group gpioPins by connection (host:port)
        const pinsByConnection = {};
        gpioPins.forEach(o => {
            const connKey = `${o.host}:${o.port || 8888}`;
            if (!pinsByConnection[connKey]) pinsByConnection[connKey] = [];
            pinsByConnection[connKey].push(o);
        });

        for (const connKey in pinsByConnection) {
            const hostPins = pinsByConnection[connKey];
            const pduKey = `GPIO:${connKey}`;
            
            publicState.pdus[pduKey] = {
                sysName: `GPIO (${connKey})`,
                sysLocation: connKey,
                type: 'GPIO',
                outlets: hostPins.map(o => ({
                    index: o.pin,
                    name: o.name,
                    state: o.state
                })).sort((a, b) => a.name.localeCompare(b.name))
            };

            hostPins.forEach(o => {
                allOutlets.push({
                    host: pduKey,
                    index: o.pin,
                    name: o.name,
                    state: o.state,
                    pduName: `GPIO (${connKey})`,
                    location: connKey,
                    type: 'GPIO'
                });
            });
        }
    }

    allOutlets.forEach(o => {
        let matched = false;
        knownGroups.forEach(groupName => {
            if (o.name.toLowerCase().includes(groupName.toLowerCase())) {
                if (!publicState.groups[groupName]) publicState.groups[groupName] = [];
                publicState.groups[groupName].push(o);
                matched = true;
            }
        });

        if (!matched) {
            if (!publicState.groups['Other']) publicState.groups['Other'] = [];
            publicState.groups['Other'].push(o);
        }
    });

    // Sort outlets within each group alphabetically
    for (const groupName in publicState.groups) {
        publicState.groups[groupName].sort((a, b) => a.name.localeCompare(b.name));
    }

    return publicState;
}
