import { sleep } from '../common/sleep.js';
import { runCommand } from '../common/runCommand.js';
import { state } from './state.js';
import { setOutletState } from '../pdu/setOutletState.js';
import { setGPIOOutputState } from '../gpio/setGPIOOutputState.js';
import { getPublicState } from './getPublicState.js';

function getGroupConfig(groupName) {
    if (!groupName || !state.config || !state.config.groups) return null;
    return state.config.groups.find(g => (typeof g === 'string' ? g : g.name).toLowerCase() === groupName.toLowerCase());
}

function isGroupOn(groupName) {
    if (!groupName) return false;
    const publicState = getPublicState();
    const lowerName = groupName.toLowerCase();
    const groupKey = Object.keys(publicState.groups).find(k => k.toLowerCase() === lowerName);
    if (!groupKey) return false;
    return publicState.groups[groupKey].some(o => o.state === 'on');
}

function isAnyOtherGroupOnThatDependsOn(dependencyName, excludingGroupName) {
    if (!state.config || !state.config.groups) return false;
    const lowerDep = dependencyName.toLowerCase();
    const lowerExcluding = excludingGroupName.toLowerCase();

    for (const group of state.config.groups) {
        if (typeof group === 'string') continue;
        const name = group.name;
        if (name.toLowerCase() === lowerExcluding) continue;

        if (group.dependsOn && group.dependsOn.some(d => d.toLowerCase() === lowerDep)) {
            if (isGroupOn(name)) {
                return true;
            }
        }
    }
    return false;
}

export async function triggerGroup(groupName, action, triggeredBy = new Set()) {
    const normalizedName = groupName ? groupName.toLowerCase() : null;
    if (normalizedName && triggeredBy.has(normalizedName)) return;
    if (normalizedName) triggeredBy.add(normalizedName);

    if (groupName && state.groupTimers[groupName]) {
        clearTimeout(state.groupTimers[groupName]);
        delete state.groupTimers[groupName];
    }

    const groupCfg = getGroupConfig(groupName);

    // If turning on, trigger dependencies first
    if (action === 'on' && groupCfg && groupCfg.dependsOn) {
        for (const dep of groupCfg.dependsOn) {
            await triggerGroup(dep, 'on', triggeredBy);
        }
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
        if (groupCfg && groupCfg.autoOffAfter) {
            console.log(`Group "${groupName}" will auto-off after ${groupCfg.autoOffAfter}ms`);
            state.groupTimers[groupName] = setTimeout(() => {
                console.log(`Auto-off triggered for group "${groupName}"`);
                triggerGroup(groupName, 'off');
            }, groupCfg.autoOffAfter);
        }
    }

    // If turning off, trigger dependencies after
    if (action === 'off' && groupCfg && groupCfg.dependsOn) {
        for (const dep of groupCfg.dependsOn) {
            if (!isAnyOtherGroupOnThatDependsOn(dep, groupName)) {
                await triggerGroup(dep, 'off', triggeredBy);
            }
        }
    }
}
