import { state } from '../core/state.js';
import { broadcastState } from '../core/broadcastState.js';

/**
 * @param {string} host
 * @param {'on'|'off'} action
 * @returns {Promise<void>}
 */
export async function setKasaPowerState(host, action) {
  const kasaDevice = state.kasaDevices[host];
  if (!kasaDevice) {
    console.error(`Kasa device at ${host} not found`);
    return;
  }

  try {
    await kasaDevice.device.setPowerState(action === 'on');
    kasaDevice.state = action;
    broadcastState();
  } catch (err) {
    console.error(`Failed to set Kasa device state for ${host}:`, err.message);
  }
}

/**
 * @param {string} host
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function setKasaName(host, name) {
  const kasaDevice = state.kasaDevices[host];
  if (!kasaDevice) {
    console.error(`Kasa device at ${host} not found`);
    return;
  }

  try {
    await kasaDevice.device.setAlias(name);
    kasaDevice.name = name;
    broadcastState();
  } catch (err) {
    console.error(`Failed to set Kasa device name for ${host}:`, err.message);
  }
}
