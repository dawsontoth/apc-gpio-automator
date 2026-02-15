import snmp from 'snmp-native';
import { OIDS } from './oids.js';
import { parseOid } from '../common/parseOid.js';

export async function scanSubnet(subnetPrefix) {
    console.log(`Scanning subnet ${subnetPrefix}.* for PDUs...`);
    const session = new snmp.Session({ community: 'private', version: snmp.Versions.SNMPv1, timeouts: [1000] });
    const oid = parseOid(OIDS.sysDescr);
    const foundHosts = [];

    const promises = [];
    for (let i = 1; i < 255; i++) {
        const host = `${subnetPrefix}.${i}`;
        promises.push(new Promise((resolve) => {
            session.get({ oid, host }, (err, varbinds) => {
                if (!err && varbinds && varbinds.length > 0) {
                    console.log(`  Found potential SNMP device at ${host}`);
                    foundHosts.push(host);
                }
                resolve();
            });
        }));
    }

    await Promise.all(promises);
    session.close();
    return foundHosts;
}
