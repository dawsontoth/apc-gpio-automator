import tpLink from 'tplink-smarthome-api';
const { Client, Plug } = tpLink;

import { state } from '../core/state.js';
import { broadcastState } from '../core/broadcastState.js';

const client = new Client();

/**
 * @param {import('tplink-smarthome-api').Device} device
 */
function setupDeviceListeners(device) {
  if (device instanceof Plug) {
    device.on('power-on', () => {
      console.log(`Kasa device ${device.alias} (${device.host}) turned on`);
      if (state.kasaDevices[device.host]) {
        state.kasaDevices[device.host].state = 'on';
        broadcastState();
      }
    });

    device.on('power-off', () => {
      console.log(`Kasa device ${device.alias} (${device.host}) turned off`);
      if (state.kasaDevices[device.host]) {
        state.kasaDevices[device.host].state = 'off';
        broadcastState();
      }
    });
  }

  device.on('power-update', (powerOn) => {
    const newState = powerOn ? 'on' : 'off';
    if (state.kasaDevices[device.host] && state.kasaDevices[device.host].state !== newState) {
      console.log(`Kasa device ${device.alias} (${device.host}) power update: ${newState}`);
      state.kasaDevices[device.host].state = newState;
      broadcastState();
    }
  });

  device.on('alias-update', (alias) => {
    console.log(`Kasa device ${device.host} alias updated: ${alias}`);
    if (state.kasaDevices[device.host]) {
      state.kasaDevices[device.host].name = alias;
      broadcastState();
    }
  });
}

/**
 * @returns {Promise<void>}
 */
export async function discoverKasaDevices() {
  const config = state.config;
  if (!config || !config.tpLinkKasaDevices) return;

  console.log('Discovering Kasa devices...');

  for (const host of config.tpLinkKasaDevices) {
    try {
      const device = await client.getDevice({ host });
      const sysInfo = await device.getSysInfo();
      const name = sysInfo.alias;
      const powerState = await device.getPowerState();

      console.log(`Found Kasa device: ${name} (${host}) state: ${powerState ? 'on' : 'off'}`);

      state.kasaDevices[host] = {
        device,
        host,
        name,
        state: powerState ? 'on' : 'off',
      };

      setupDeviceListeners(device);
      // device.startPolling(10000);
    } catch (err) {
      console.error(`Failed to discover Kasa device at ${host}:`, err.message);
    }
  }

  broadcastState();
}
