import snmp from 'snmp-native';
import { OIDS } from './oids.js';
import { walk } from '../common/walk.js';
import { get } from '../common/get.js';
import { state } from '../core/state.js';
import { pollPDUStatus } from './pollPDUStatus.js';

export async function discoverPDU(host) {
    console.log(`Discovering PDU at ${host}...`);
    const session = new snmp.Session({ host, community: 'private', version: snmp.Versions.SNMPv1 });
    
    try {
        let sysName = 'unknown';
        try {
            const sysNameVb = await get(session, OIDS.sysName);
            sysName = sysNameVb[0] ? sysNameVb[0].value.toString() : 'unknown';
        } catch (e) {
            console.warn(`Warning: Could not get sysName for ${host}`);
        }

        let sysLocation = 'unknown';
        try {
            const sysLocationVb = await get(session, OIDS.sysLocation);
            sysLocation = sysLocationVb[0] ? sysLocationVb[0].value.toString() : 'unknown';
        } catch (e) {
            console.warn(`Warning: Could not get sysLocation for ${host}`);
        }
        
        let sysDescr = 'unknown';
        try {
            const sysDescrVb = await get(session, OIDS.sysDescr);
            sysDescr = sysDescrVb[0] ? sysDescrVb[0].value.toString() : 'unknown';
        } catch (e) {
            console.warn(`Warning: Could not get sysDescr for ${host}`);
        }
        
        console.log(`PDU ${host} sysName: ${sysName}`);
        console.log(`PDU ${host} sysLocation: ${sysLocation}`);
        console.log(`PDU ${host} sysDescr: ${sysDescr}`);

        // Try RPDU2 first
        let varbinds = [];
        let type = 'RPDU2';
        try {
            varbinds = await walk(session, OIDS.RPDU2.names);
        } catch (e) {
            console.log(`RPDU2 walk failed for ${host}, trying RPDU...`);
        }

        if (varbinds.length === 0) {
            // Try RPDU
            try {
                varbinds = await walk(session, OIDS.RPDU.names);
                type = 'RPDU';
            } catch (e) {
                console.error(`RPDU walk failed for ${host}`);
            }
        }

        if (varbinds.length > 0) {
            const outlets = varbinds.map(vb => ({
                index: vb.oid[vb.oid.length - 1],
                name: vb.value.toString(),
                state: 'unknown'
            })).sort((a, b) => a.name.localeCompare(b.name));
            console.log(`Found ${outlets.length} outlets on PDU ${host} (${type})`);
            outlets.forEach(o => console.log(`  Outlet ${o.index}: ${o.name}`));
            state.discoveredPDUs[host] = { session, outlets, type, sysName, sysLocation };
            await pollPDUStatus(host);
        } else {
            console.log(`No outlets found on PDU ${host}`);
            session.close();
        }
    } catch (err) {
        console.error(`Failed to discover PDU at ${host}:`, err.message);
        session.close();
    }
}
