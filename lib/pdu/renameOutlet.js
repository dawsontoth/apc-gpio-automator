import { OIDS } from './oids.js';
import { set } from '../common/set.js';
import { state } from '../core/state.js';
import { broadcastState } from '../core/broadcastState.js';

export async function renameOutlet(host, outletIndex, newName) {
    const pdu = state.discoveredPDUs[host];
    if (!pdu) return;

    const nameOid = `${OIDS[pdu.type].rename || OIDS[pdu.type].names}.${outletIndex}`;
    try {
        // newName is expected to be a string
        await set(pdu.session, nameOid, newName, 4); // 4 = OctetString
        console.log(`PDU ${host} Outlet ${outletIndex} renamed to "${newName}"`);
        
        // Update local state and broadcast
        const outlet = pdu.outlets.find(o => o.index === outletIndex);
        if (outlet) {
            outlet.name = newName;
            broadcastState();
        }
    } catch (err) {
        console.error(`Failed to rename PDU ${host} Outlet ${outletIndex} to "${newName}":`, err.message);
    }
}
