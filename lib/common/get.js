import { parseOid } from './parseOid.js';

export function get(session, oidStr) {
    return new Promise((resolve, reject) => {
        session.get({ oid: parseOid(oidStr) }, (err, varbinds) => {
            if (err) reject(err);
            else resolve(varbinds);
        });
    });
}
