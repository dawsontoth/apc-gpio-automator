import { OIDS } from './oids.js';
import { set } from '../common/set.js';
import { state } from '../core/state.js';
import { broadcastState } from '../core/broadcastState.js';

/**
 * @param {string} host
 * @param {string} outletIndex
 * @param {'on'|'off'} stateVal
 * @returns {Promise<void>}
 */
export async function setOutletState(host, outletIndex, stateVal) {
    const pdu = state.discoveredPDUs[host];
    if (!pdu) return;

    const cmdOid = `${OIDS[pdu.type].control}.${outletIndex}`;
    const value = stateVal === 'on' ? 1 : 2; // 1=on, 2=off
    try {
        await set(pdu.session, cmdOid, value);
        console.log(`PDU ${host} Outlet ${outletIndex} set to ${stateVal}`);
        
        // Update local state and broadcast
        const outlet = pdu.outlets.find(o => o.index === outletIndex);
        if (outlet) {
            outlet.state = stateVal;
            broadcastState();
        }
    } catch (err) {
        console.error(`Failed to set PDU ${host} Outlet ${outletIndex} to ${stateVal}:`, err.message);
    }
}
