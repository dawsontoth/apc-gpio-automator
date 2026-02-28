/**
 * @typedef {import('snmp-native').Session} SnmpSession
 */

/**
 * @typedef {Object} PDUOutlet
 * @property {string} index - The SNMP index of the outlet.
 * @property {string} name - The name of the outlet.
 * @property {string} state - The current state of the outlet ('on', 'off', or 'unknown').
 */

/**
 * @typedef {Object} DiscoveredPDU
 * @property {SnmpSession} session - The SNMP session for this PDU.
 * @property {PDUOutlet[]} outlets - The list of outlets on this PDU.
 * @property {string} type - The PDU type ('RPDU' or 'RPDU2').
 * @property {string} sysName - The system name of the PDU.
 * @property {string} sysLocation - The system location of the PDU.
 */

/**
 * @typedef {Object} GPIOConfig
 * @property {number} pin - The physical pin number or BCM pin number.
 * @property {number} [bcmPin] - The BCM pin number.
 * @property {string} group - The group name this GPIO belongs to.
 * @property {string} [color] - The LED color associated with this GPIO.
 * @property {string} [mode] - The mode of the GPIO ('switch' or 'output').
 * @property {string} [pull] - The pull-up/down configuration ('up', 'down', or 'none').
 * @property {string} [name] - The name of the GPIO.
 * @property {string} [host] - The host for remote GPIO (default: '127.0.0.1').
 * @property {number} [port] - The port for remote GPIO (default: 8888).
 */

/**
 * @typedef {Object} GPIOOutput
 * @extends GPIOConfig
 * @property {string} state - The current state of the output ('on' or 'off').
 */

/**
 * @typedef {Object} GPIOInput
 * @extends GPIOConfig
 * @property {boolean} lastState - The last seen state of the input.
 * @property {number|null} highSince - Timestamp when the input last went high.
 */

/**
 * @typedef {Object} GroupConfig
 * @property {string} name - The name of the group.
 * @property {string} [ledColor] - The color of the LED for this group.
 * @property {string} [onCommand] - Shell command to run when the group is turned on.
 * @property {string} [offCommand] - Shell command to run when the group is turned off.
 * @property {string[]} [dependsOn] - List of group names this group depends on.
 */

/**
 * @typedef {Object} SpecialActionConfig
 * @property {string} name - The name of the special action.
 * @property {string} [onCommand] - Shell command to run when the action is triggered.
 * @property {string} [offCommand] - Shell command to run after auto-off.
 * @property {number} [autoOffAfter] - Time in ms after which to run the offCommand.
 */

/**
 * @typedef {Object} ScheduleConfig
 * @property {string} time - The time in "HH:MM" format.
 * @property {string} action - The action to perform ('on' or 'off').
 * @property {string} [group] - The group to perform the action on (omitting means all).
 */

/**
 * @typedef {Object} AppConfig
 * @property {GroupConfig[]} groups - List of group configurations.
 * @property {string[]} [scanSubnets] - List of subnets to scan for PDUs.
 * @property {string[]} [apcPDUs] - List of static PDU IP addresses.
 * @property {GPIOConfig[]} gpio - List of GPIO configurations.
 * @property {SpecialActionConfig[]} [specialActions] - List of special action configurations.
 * @property {ScheduleConfig[]} [schedules] - List of scheduled actions.
 */

/**
 * @typedef {Object} AppState
 * @property {Object.<string, DiscoveredPDU>} discoveredPDUs - Map of host to discovered PDU.
 * @property {Object.<string, GPIOOutput>} gpioOutputs - Map of key to GPIO output state.
 * @property {Object.<string, GPIOInput>} gpioInputs - Map of key to GPIO input state.
 * @property {Object.<string, NodeJS.Timeout>} groupTimers - Map of group name to timer.
 * @property {Object.<string, NodeJS.Timeout>} pinTimers - Map of pin key to timer.
 * @property {Object.<string, NodeJS.Timeout>} actionTimers - Map of action name to timer.
 * @property {Object.<string, any>} specialActions - Map of special action name to state.
 * @property {AppConfig|null} config - The application configuration.
 * @property {import('socket.io').Server|null} io - The Socket.IO server instance.
 */

/**
 * @typedef {Object} PublicPDUOutlet
 * @property {string|number} index - The index of the outlet.
 * @property {string} name - The name of the outlet.
 * @property {string} state - The current state of the outlet ('on', 'off', or 'unknown').
 */

/**
 * @typedef {Object} PublicPDUInfo
 * @property {string} sysName - The system name of the PDU.
 * @property {string} sysLocation - The system location of the PDU.
 * @property {string} type - The PDU type ('RPDU', 'RPDU2', or 'GPIO').
 * @property {PublicPDUOutlet[]} outlets - The list of outlets on this PDU.
 */

/**
 * @typedef {Object} PublicGroupOutlet
 * @property {string} host - The host of the PDU or GPIO key.
 * @property {string|number} index - The index of the outlet.
 * @property {string} name - The name of the outlet.
 * @property {string} state - The state of the outlet.
 * @property {string} pduName - The system name of the PDU.
 * @property {string} location - The system location of the PDU.
 * @property {string} type - The type of the PDU.
 */

/**
 * @typedef {Object} PublicSpecialAction
 * @property {string} name - The name of the special action.
 * @property {string} state - The state of the special action.
 */

/**
 * @typedef {Object} PublicState
 * @property {Object.<string, PublicPDUInfo>} pdus - Map of host to PDU info.
 * @property {Object.<string, PublicGroupOutlet[]>} groups - Map of group name to outlets.
 * @property {Object.<string, {ledColor: string}>} groupConfigs - Map of group name to config.
 * @property {PublicSpecialAction[]} specialActions - List of special actions.
 */

/**
 * @callback TriggerGroup
 * @param {string|null} groupName
 * @param {'on'|'off'} [action]
 * @returns {Promise<void>}
 */

/**
 * @callback ToggleGroup
 * @param {string} groupName
 * @returns {Promise<void>}
 */

/** @type {AppState} */
export const state = {
    discoveredPDUs: {},
    gpioOutputs: {},
    gpioInputs: {},
    groupTimers: {},
    pinTimers: {},
    actionTimers: {},
    specialActions: {},
    config: null,
    io: null
};
