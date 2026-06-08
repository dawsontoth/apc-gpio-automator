import { spawn, execSync } from 'child_process';

import { state } from '../core/state.js';
import { handleGPIOChange } from './handleGPIOChange.js';
import { broadcastState } from '../core/broadcastState.js';

/**
 * @param {import('../core/state.js').TriggerGroup} triggerGroup
 * @param {import('../core/state.js').ToggleGroup} toggleGroup
 */
export function initGPIO(triggerGroup, toggleGroup) {
  const config = state.config;
  let gpioConfig = config['gpio'] || [];
  if (!Array.isArray(gpioConfig)) {
    gpioConfig = Object.entries(gpioConfig).map(([pin, group]) => ({
      pin: parseInt(pin, 10),
      group: group,
      mode: 'switch',
      name: group,
    }));
  }

  console.log(`Initializing local GPIO using gpiod tools...`);

  const inputPins = [];
  const monitors = [];

  gpioConfig.forEach((cfg) => {
    const bcmPin = cfg.bcmPin || cfg.pin;
    const host = cfg.host || '127.0.0.1';
    const port = cfg.port || 8888;
    const key = `${host}:${port}:${bcmPin}`;

    if (cfg.mode === 'output') {
      state.gpioOutputs[key] = {
        ...cfg,
        host,
        port,
        pin: bcmPin,
        name: cfg.name || `GPIO ${bcmPin}`,
        state: 'off',
      };
      try {
        execSync(`gpioset GPIO${bcmPin}=0`);
      } catch {}
      console.log(`GPIO pin ${bcmPin} ready as output.`);
    } else {
      const mode = cfg.mode || 'switch';
      state.gpioInputs[key] = {
        ...cfg,
        host,
        port,
        pin: bcmPin,
        mode,
        lastState: false,
        highSince: null,
      };
      inputPins.push(state.gpioInputs[key]);

      // Do not do an initial read, we'll only change things when the pins change.
      // try {
      //const output = execSync(`gpioget GPIO${bcmPin}`).toString().trim();
      //const value = parseInt(output, 10);
      //handleGPIOChange(key, value, true, triggerGroup, toggleGroup);
      //
      // } catch (readErr) {}

      console.log(`GPIO pin ${bcmPin} ready as input (${mode} mode, pull: ${cfg.pull || 'none'}).`);
    }
  });

  // Group inputs by pull and debounce for gpiomon
  const inputGroups = {};
  inputPins.forEach((cfg) => {
    const pull = cfg.pull === 'up' ? 'pull-up' : cfg.pull === 'down' ? 'pull-down' : 'none';
    const debounce = cfg.mode === 'switch' ? 100 : 0;
    const groupKey = `${pull}-${debounce}`;
    if (!inputGroups[groupKey]) {
      inputGroups[groupKey] = { pull, debounce, cfgs: [] };
    }
    inputGroups[groupKey].cfgs.push(cfg);
  });

  const groups = Object.values(inputGroups);
  let stopping = false;

  /**
   * Spawn (or re-spawn) a gpiomon process for a group of input pins.
   *
   * A dead gpiomon process is the most common cause of GPIO switches silently
   * going unresponsive while everything else (web UI, PDU polling) keeps
   * working, because gpiomon runs independently of the rest of the app. If it
   * exits for any reason we log it loudly and automatically restart it.
   *
   * @param {{pull: string, debounce: number, cfgs: any[], proc?: import('child_process').ChildProcess, lastEventAt?: number}} group
   */
  function startMonitor(group) {
    const lineNames = group.cfgs.map((cfg) => `GPIO${cfg.pin}`);
    const args = ['-e', 'both', '-p', group.debounce.toString(), '-b', group.pull, ...lineNames];

    let mon;
    try {
      console.log(`Starting gpiomon for pins: ${lineNames.join(', ')}`);
      mon = spawn('gpiomon', args);
    } catch (e) {
      console.error(
        `Error spawning gpiomon for ${lineNames.join(', ')}: ${e.message}. Retrying in 5s.`,
      );
      if (!stopping) setTimeout(() => startMonitor(group), 5_000);
      return;
    }

    group.proc = mon;
    group.restartScheduled = false;
    group.lastEventAt = Date.now();
    monitors.push(mon);

    // gpiomon output can arrive split across multiple data chunks, so buffer
    // and only process complete (newline-terminated) lines.
    let buffer = '';
    mon.stdout.on('data', (data) => {
      group.lastEventAt = Date.now();
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach((line) => {
        if (!line.trim()) return;
        // Expected format: 2454.3452345\trising\t"GPIO27"
        const parts = line.split('\t');
        if (parts.length < 3) return;

        const edge = parts[1];
        const name = parts[2].replace(/"/g, '');
        const match = name.match(/GPIO(\d+)/);
        if (match) {
          const bcmPin = parseInt(match[1], 10);
          const key = Object.keys(state.gpioInputs).find((k) => k.endsWith(`:${bcmPin}`));
          if (key) {
            const value = edge === 'rising' ? 1 : 0;
            handleGPIOChange(key, value, false, triggerGroup, toggleGroup);
          }
        }
      });
    });

    mon.stderr.on('data', (data) => {
      console.error(`gpiomon stderr (${lineNames.join(', ')}): ${data.toString().trim()}`);
    });

    mon.on('error', (err) => {
      console.error(`gpiomon process error (${lineNames.join(', ')}): ${err.message}`);
    });

    mon.on('exit', (code, signal) => {
      group.proc = undefined;
      if (stopping) return;
      console.error(
        `gpiomon for pins ${lineNames.join(', ')} exited unexpectedly (code=${code}, signal=${signal}). Restarting in 5s.`,
      );
      group.restartScheduled = true;
      setTimeout(() => startMonitor(group), 5_000);
    });
  }

  groups.forEach((group) => startMonitor(group));

  // Watchdog: periodically confirm every gpiomon is still alive. The exit
  // handler already restarts crashed monitors; this catches any monitor that
  // somehow ended up without a running process and provides a heartbeat in the
  // logs to make diagnosing "switches stopped working" issues possible.
  const watchdog = setInterval(() => {
    if (stopping) return;
    groups.forEach((group) => {
      const lineNames = group.cfgs.map((cfg) => `GPIO${cfg.pin}`).join(', ');
      const alive =
        group.proc && group.proc.pid && group.proc.exitCode === null && !group.proc.killed;
      if (alive) {
        console.log(`GPIO watchdog: gpiomon for ${lineNames} alive (pid ${group.proc.pid}).`);
      } else if (group.restartScheduled) {
        console.log(`GPIO watchdog: gpiomon for ${lineNames} down, restart already pending.`);
      } else {
        console.error(`GPIO watchdog: gpiomon for ${lineNames} is not running. Restarting now.`);
        startMonitor(group);
      }
    });
  }, 60_000);

  broadcastState();

  const cleanup = () => {
    console.log('Shutting down GPIO monitors...');
    stopping = true;
    clearInterval(watchdog);
    monitors.forEach((mon) => mon.kill());
    process.exit();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
