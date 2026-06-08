import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { state } from './state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stateFilePath = path.join(__dirname, '../../manual-state.json');

/**
 * Persist the current manual device states to disk so they survive a reboot.
 * @returns {void}
 */
export function saveManualDeviceStates() {
  try {
    fs.writeFileSync(stateFilePath, JSON.stringify(state.manualDeviceStates, null, 2));
  } catch (err) {
    console.error('Failed to save manual device states:', err.message);
  }
}

/**
 * Load persisted manual device states from disk, defaulting any unknown device
 * to 'off'. Should be called after config has been loaded into state.
 * @returns {void}
 */
export function loadManualDeviceStates() {
  let saved = {};
  try {
    if (fs.existsSync(stateFilePath)) {
      saved = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to load manual device states, defaulting to off:', err.message);
    saved = {};
  }

  const devices = state.config?.manualDevices || [];
  devices.forEach((d) => {
    state.manualDeviceStates[d.name] = saved[d.name] === 'on' ? 'on' : 'off';
  });

  const restoredOn = devices.filter((d) => state.manualDeviceStates[d.name] === 'on');
  if (restoredOn.length > 0) {
    console.log(`Restored manual devices to ON: ${restoredOn.map((d) => d.name).join(', ')}`);
  }
}
