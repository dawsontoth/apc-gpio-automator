import { parseOid } from './parseOid.js';

export function set(session, oidStr, value, type) {
    return new Promise((resolve, reject) => {
        session.set({
            oid: parseOid(oidStr),
            value: value,
            type: type || 2 // default to Integer
        }, (err, varbinds) => {
            if (err) reject(err);
            else resolve(varbinds);
        });
    });
}
