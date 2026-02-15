import { sleep } from '../common/sleep.js';
import { runCommand } from '../common/runCommand.js';
import { state } from './state.js';
import { setOutletState } from '../pdu/setOutletState.js';
import { setGPIOOutputState } from '../gpio/setGPIOOutputState.js';

export async function triggerGroup(groupName, action) {
    if (groupName && state.groupTimers[groupName]) {
        clearTimeout(state.groupTimers[groupName]);
        delete state.groupTimers[groupName];
    }

    console.log(`Triggering group "${groupName || 'All'}" -> ${action} (sequentially)`);
    
    // Execute group commands immediately
    const config = state.config;
    if (config && config.groups) {
        config.groups.forEach(g => {
            const name = typeof g === 'string' ? g : g.name;
            if (!groupName || name.toLowerCase() === groupName.toLowerCase()) {
                const cmd = action === 'on' ? g.onCommand : g.offCommand;
                if (cmd) {
                    runCommand(cmd);
                }
            }
        });
    }
    
    const tasks = [];
    for (const host in state.discoveredPDUs) {
        const pdu = state.discoveredPDUs[host];
        for (const outlet of pdu.outlets) {
            if (!groupName || outlet.name.toLowerCase().includes(groupName.toLowerCase())) {
                tasks.push({ type: 'pdu', host, index: outlet.index, name: outlet.name });
            }
        }
    }

    for (const key in state.gpioOutputs) {
        const output = state.gpioOutputs[key];
        if (!groupName || output.name.toLowerCase().includes(groupName.toLowerCase())) {
            tasks.push({ type: 'gpio', key: key, name: output.name });
        }
    }

    // Sort tasks alphabetically by name
    tasks.sort((a, b) => a.name.localeCompare(b.name));

    for (const task of tasks) {
        if (task.type === 'pdu') {
            await setOutletState(task.host, task.index, action);
        } else if (task.type === 'gpio') {
            await setGPIOOutputState(task.key, action);
        }
        await sleep(100);
    }

    if (action === 'on' && groupName && config && config.groups) {
        const groupCfg = config.groups.find(g => (typeof g === 'string' ? g : g.name).toLowerCase() === groupName.toLowerCase());
        if (groupCfg && groupCfg.autoOffAfter) {
            console.log(`Group "${groupName}" will auto-off after ${groupCfg.autoOffAfter}ms`);
            state.groupTimers[groupName] = setTimeout(() => {
                console.log(`Auto-off triggered for group "${groupName}"`);
                triggerGroup(groupName, 'off');
            }, groupCfg.autoOffAfter);
        }
    }
}
