import { OIDS } from './oids.js';
import { walk } from '../common/walk.js';
import { parseOid } from '../common/parseOid.js';
import { state } from '../core/state.js';
import { broadcastState } from '../core/broadcastState.js';

export async function pollPDUStatus(host) {
    const pdu = state.discoveredPDUs[host];
    if (!pdu) return;

    try {
        const baseOid = parseOid(OIDS[pdu.type].status);
        const varbinds = await walk(pdu.session, OIDS[pdu.type].status);
        varbinds.forEach(vb => {
            const index = vb.oid.slice(baseOid.length).join('.');
            const outletState = vb.value === 1 ? 'on' : (vb.value === 2 ? 'off' : 'unknown');
            const outlet = pdu.outlets.find(o => o.index === index);
            if (outlet) {
                outlet.state = outletState;
            }
        });
        broadcastState();
    } catch (err) {
        console.error(`Failed to poll status for PDU ${host}:`, err.message);
    }
}
