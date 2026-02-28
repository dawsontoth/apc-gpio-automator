import { parseOid } from './parseOid.js';

/**
 * @param {import('../core/state.js').SnmpSession} session
 * @param {string|number[]} oidStr
 * @returns {Promise<any[]>}
 */
export function walk(session, oidStr) {
    return new Promise((resolve, reject) => {
        session.getSubtree({ oid: parseOid(oidStr) }, (err, varbinds) => {
            if (err) reject(err);
            else resolve(varbinds);
        });
    });
}
