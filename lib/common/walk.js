import { parseOid } from './parseOid.js';

export function walk(session, oidStr) {
    return new Promise((resolve, reject) => {
        session.getSubtree({ oid: parseOid(oidStr) }, (err, varbinds) => {
            if (err) reject(err);
            else resolve(varbinds);
        });
    });
}
