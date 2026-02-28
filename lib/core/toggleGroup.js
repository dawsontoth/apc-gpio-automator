import { getPublicState } from './getPublicState.js';
import { triggerGroup } from './triggerGroup.js';

/**
 * @param {string} groupName
 * @returns {Promise<void>}
 */
export async function toggleGroup(groupName) {
    const publicState = getPublicState();
    const groupOutlets = publicState.groups[groupName] || [];
    const anyOn = groupOutlets.some(o => o.state === 'on');
    const nextAction = anyOn ? 'off' : 'on';

    console.log(`Toggling group ${groupName} -> ${nextAction}`);
    await triggerGroup(groupName, nextAction);
}
