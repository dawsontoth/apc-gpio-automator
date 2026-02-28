import { state } from './state.js';

/**
 * @returns {import('./state.js').PublicState}
 */
export function getPublicState() {
    /** @type {import('./state.js').PublicState} */
    const publicState = {
        pdus: {},
        groups: {},
        groupConfigs: {},
        specialActions: []
    };

    const config = state.config;
    if (!config) return publicState;

    // Identify groups from config
    const knownGroups = new Set();
    if (config.groups) {
        config.groups.forEach(g => {
            const isObject = typeof g !== 'string';
            const name = isObject ? g.name : g;
            knownGroups.add(name);
            if (isObject && g.ledColor) {
                publicState.groupConfigs[name] = { ledColor: g.ledColor };
            }
        });
    }
    const rpiConfig = config['gpio'] || [];
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

    if (config.manualDevices) {
        const pduKey = 'Manual';
        publicState.pdus[pduKey] = {
            sysName: 'Manual Devices',
            sysLocation: 'Various',
            type: 'Manual',
            outlets: config.manualDevices.map(d => ({
                index: d.name,
                name: d.name,
                state: state.manualDeviceStates[d.name] || 'off'
            })).sort((a, b) => a.name.localeCompare(b.name))
        };

        config.manualDevices.forEach(d => {
            allOutlets.push({
                host: pduKey,
                index: d.name,
                name: d.name,
                state: state.manualDeviceStates[d.name] || 'off',
                pduName: 'Manual Devices',
                location: 'Various',
                type: 'Manual'
            });
        });
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

    if (config.specialActions) {
        publicState.specialActions = config.specialActions.map(a => ({
            name: a.name,
            state: state.specialActions[a.name] || 'off'
        }));
    }

    return publicState;
}
