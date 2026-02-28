import { sleep } from '../common/sleep.js';
import { runCommand } from '../common/runCommand.js';
import { state } from './state.js';
import { broadcastState } from './broadcastState.js';
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

async function executeTask(task, action) {
    if (task.type === 'pdu') {
        await setOutletState(task.host, task.index, action);
    } else if (task.type === 'gpio') {
        await setGPIOOutputState(task.key, action);
    } else if (task.type === 'manual') {
        const cmd = action === 'on' ? task.device.onCommand : task.device.offCommand;
        if (cmd) {
            void runCommand(cmd);
        }
        state.manualDeviceStates[task.device.name] = action;
        broadcastState();
    }
}

/**
 * @param {string|null} groupName
 * @param {'on'|'off'} action
 * @param {Set<string>} [triggeredBy]
 * @returns {Promise<void>}
 */
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
    
    if (groupName) {
        state.workingGroups.add(groupName);
        broadcastState();
    }

    try {
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
                    let delay = 0;
                    if (config.discoveredDeviceCustomizations && config.discoveredDeviceCustomizations[outlet.name]) {
                        const custom = config.discoveredDeviceCustomizations[outlet.name];
                        delay = action === 'on' ? (custom.delayOnSeconds || 0) : (custom.delayOffSeconds || 0);
                    }
                    tasks.push({ type: 'pdu', host, index: outlet.index, name: outlet.name, delay });
                }
            }
        }

        for (const key in state.gpioOutputs) {
            const output = state.gpioOutputs[key];
            if (!groupName || output.name.toLowerCase().includes(groupName.toLowerCase())) {
                let delay = 0;
                if (config.discoveredDeviceCustomizations && config.discoveredDeviceCustomizations[output.name]) {
                    const custom = config.discoveredDeviceCustomizations[output.name];
                    delay = action === 'on' ? (custom.delayOnSeconds || 0) : (custom.delayOffSeconds || 0);
                }
                tasks.push({ type: 'gpio', key: key, name: output.name, delay });
            }
        }

        if (config && config.manualDevices) {
            for (const device of config.manualDevices) {
                if (!groupName || device.name.toLowerCase().includes(groupName.toLowerCase())) {
                    const delay = action === 'on' ? (device.delayOnSeconds || 0) : (device.delayOffSeconds || 0);
                    tasks.push({ type: 'manual', device: device, name: device.name, delay });
                }
            }
        }

        // Separate tasks into non-delayed and delayed
        const nonDelayedTasks = tasks.filter(t => t.delay === 0);
        const delayedTasks = tasks.filter(t => t.delay > 0).sort((a, b) => a.delay - b.delay);

        // Sort non-delayed tasks alphabetically by name
        nonDelayedTasks.sort((a, b) => a.name.localeCompare(b.name));

        // Power cycle all non-delayed outlets
        for (const task of nonDelayedTasks) {
            await executeTask(task, action);
            await sleep(100);
        }

        // Do all of the delayed ones in their order and appropriate timing
        let currentTime = 0;
        for (const task of delayedTasks) {
            const waitTime = (task.delay * 1000) - currentTime;
            if (waitTime > 0) {
                await sleep(waitTime);
                currentTime += waitTime;
            }
            await executeTask(task, action);
        }

        if (action === 'on' && groupName && config && config.groups) {
            if (groupCfg && groupCfg.autoOffAfterSeconds) {
                console.log(`Group "${groupName}" will auto-off after ${groupCfg.autoOffAfterSeconds}ms`);
                state.groupTimers[groupName] = setTimeout(() => {
                    console.log(`Auto-off triggered for group "${groupName}"`);
                    triggerGroup(groupName, 'off');
                }, groupCfg.autoOffAfterSeconds * 1_000);
            }
        }
    } finally {
        if (groupName) {
            state.workingGroups.delete(groupName);
            broadcastState();
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
