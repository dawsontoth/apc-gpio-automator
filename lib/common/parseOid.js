/**
 * @param {string|number[]} oidStr
 * @returns {number[]}
 */
export function parseOid(oidStr) {
    if (Array.isArray(oidStr)) return oidStr;
    return oidStr.split('.').filter(s => s.length > 0).map(s => parseInt(s, 10));
}
