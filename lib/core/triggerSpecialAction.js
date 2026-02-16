import { runCommand } from '../common/runCommand.js';
import { state } from './state.js';
import { broadcastState } from './broadcastState.js';

export async function triggerSpecialAction(name, action) {
    const config = state.config;
    if (!config || !config.specialActions) return;

    const actionCfg = config.specialActions.find(a => a.name === name);
    if (!actionCfg) return;

    if (state.actionTimers[name]) {
        clearTimeout(state.actionTimers[name]);
        delete state.actionTimers[name];
    }

    console.log(`Triggering special action "${name}" -> ${action}`);

    if (action === 'on') {
        if (actionCfg.onCommand) {
            await runCommand(actionCfg.onCommand);
        }
        state.specialActions[name] = 'on';
        
        if (actionCfg.autoOffAfter) {
            console.log(`Special action "${name}" will auto-off after ${actionCfg.autoOffAfter}ms`);
            state.actionTimers[name] = setTimeout(() => {
                console.log(`Auto-off triggered for special action "${name}"`);
                triggerSpecialAction(name, 'off');
            }, actionCfg.autoOffAfter);
        }
    } else {
        if (actionCfg.offCommand) {
            await runCommand(actionCfg.offCommand);
        }
        state.specialActions[name] = 'off';
    }

    broadcastState();
}
