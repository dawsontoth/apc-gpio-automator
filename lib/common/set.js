import { parseOid } from './parseOid.js';

/**
 * @param {import('../core/state.js').SnmpSession} session
 * @param {string|number[]} oidStr
 * @param {any} value
 * @param {number} [type]
 * @returns {Promise<any[]>}
 */
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
