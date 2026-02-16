# APC GPIO Automator

A comprehensive Node.js application for controlling APC PDUs and Raspberry Pi GPIOs through a unified web interface, physical inputs, and automated schedules.

## Features

- **Automated PDU Discovery**: Automatically scans specified subnets to find and configure APC PDUs via SNMP.
- **GPIO Support (gpiod)**:
  - **Switch Mode**: Toggle physical switches to turn groups on or off.
  - **Momentary Mode**: Use push-buttons to toggle group states with configurable minimum pulse time.
  - **Output Mode**: Control GPIO pins as virtual outlets, supporting auto-off timers (pulses) and arbitrary shell commands.
- **Special Actions**: Ungrouped buttons in the web interface to trigger custom shell commands with optional auto-off timers.
- **Real-time Web Interface**:
  - **Circuit Breaker UI**: Clean, responsive dark-mode interface.
  - **Real-time Updates**: Powered by Socket.io for immediate status feedback.
  - **Fuzzy Search**: Quickly find outlets or groups by name or location.
  - **Inline Confirmation**: Safety mechanism for bulk group actions.
  - **Mobile Friendly**: Fully responsive design for control on the go.
- **Sequential Triggering**: Implements a 100ms delay between outlet activations within a group to prevent power surges.
- **Flexible Grouping**: Outlets automatically join groups based on case-insensitive substring matching in their names.
- **Simple Scheduler**: Time and day-based scheduling for automated power control.

## Installation

### Prerequisites

- Node.js (v18 or higher recommended)
  - **nvm** is recommended for managing Node.js versions. [Install nvm](https://github.com/nvm-sh/nvm#install--update-script):
    ```bash
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    ```
- Raspberry Pi (optional, required for local GPIO functionality)
  - **gpiod** tools are required for local GPIO. Install on Raspberry Pi:
    ```bash
    sudo apt update
    sudo apt install -y gpiod
    ```
  - **i2cset** (part of `i2c-tools`) is required for some GPIO functions. Install on Raspberry Pi:
    ```bash
    sudo apt update
    sudo apt install -y i2c-tools
    ```
- APC PDUs (accessible via SNMPv1 with "private" community string)

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd apc-gpio-automator
   ```

2. (Optional) Use the recommended Node.js version via nvm:
   ```bash
   nvm install
   nvm use
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Configure the application by editing `config.json` (see Configuration section below).

5. Start the application:
   ```bash
   npm start
   ```

### Running as a Daemon (PM2)

To keep the application running in the background and ensure it restarts on crash or reboot, you can use the built-in daemon scripts powered by [PM2](https://pm2.keymetrics.io/):

1. **Start the daemon**:
   ```bash
   npm run daemon
   ```

2. **(Optional) Configure to start on boot**:
   To ensure the application starts automatically when the Raspberry Pi reboots:
   ```bash
   npx pm2 startup
   # Follow the instructions provided by the command output, then run:
   npx pm2 save
   ```

3. **Manage the daemon**:
   - **Check Status**: `npm run daemon:status`
   - **View Logs**: `npm run daemon:logs`
   - **Restart**: `npm run daemon:restart`
   - **Stop**: `npm run daemon:stop`

## Configuration (`config.json`)

The `config.json` file is the central point for setting up your environment.

### Top-level Properties

- `groups`: (Array of Objects) Explicitly defined groups.
  - `name`: (String) The name of the group.
  - `onCommand`: (String, Optional) Shell command to run when the group is turned ON.
  - `offCommand`: (String, Optional) Shell command to run when the group is turned OFF.
  - `autoOffAfter`: (Number, Optional) Delay in milliseconds after which the group will automatically turn OFF.
- `scanSubnets`: (Array of Strings) Subnets to scan for APC PDUs (e.g., `["10.1.32"]`).
- `apcPDUs`: (Array of Strings) Specific IP addresses of APC PDUs to include regardless of scanning.
- `gpio`: (Array of Objects) Configuration for local Raspberry Pi GPIO pins via `gpiod`.
  - `pin`: (Number) Physical pin number (informational).
  - `bcmPin`: (Number) GPIO pin number (BCM). This is the pin number used by the system (e.g. 17 for GPIO17).
  - `mode`: (String) `switch`, `momentary`, or `output`.
  - `group`: (String, for `switch`/`momentary`) The group name this pin controls.
  - `name`: (String, for `output`) Display name for the pin in the web interface.
  - `pull`: (String, Optional) `up` or `down` for input modes. Supported via `gpiomon`'s internal pull-up/down resistors.
  - `onCommand`/`offCommand`: (String, Optional) Commands to run when the pin state changes.
  - `autoOffAfter`: (Number, Optional) For outputs, time in ms to automatically turn back off.
  - `minTime`: (Number, for `momentary`) Minimum pulse duration in ms.
  - **Debounce**: `switch` mode pins are automatically debounced by 100ms using `gpiomon`'s `-p` (period) flag.
- `schedules`: (Array of Objects) Automated tasks.
  - `time`: (String) Time in HH:mm format.
  - `days`: (Array of Strings, Optional) Specific days to run (e.g., `["Sun", "Wed"]`).
  - `action`: (String) `on` or `off`.
  - `groups`: (Array of Strings, Optional) Specific groups to trigger. If omitted, triggers all.
- `specialActions`: (Array of Objects) custom actions that trigger shell commands.
  - `name`: (String) The name of the action.
  - `onCommand`: (String, Optional) Shell command to run when the action is turned ON.
  - `offCommand`: (String, Optional) Shell command to run when the action is turned OFF.
  - `autoOffAfter`: (Number, Optional) Delay in milliseconds after which the action will automatically turn OFF.

## How It Works

### Grouping Logic
An outlet (APC or GPIO) is associated with a group if the group's name is found anywhere within the outlet's name (case-insensitive). For example, an outlet named "Stage Left Lights" will automatically be included in a group named "Lights".

### SNMP Connectivity
The application uses **SNMPv1** with the community string **"private"** to communicate with APC PDUs. It supports both newer RPDU2 (AP8xxx series) and older RPDU (AP7xxx series) models.

### Local GPIO
The system uses the `gpiod` shell tools (`gpiomon`, `gpioset`, `gpioget`) for local GPIO control on Raspberry Pi. This requires the `gpiod` package to be installed on the system. Input pins used in `switch` mode are automatically debounced using `gpiomon`'s hardware-backed glitch filters (where supported) or software period filtering. Internal pull-up/down resistors are supported and can be configured in `config.json`.

## Web Interface

Once started, the web server is accessible at:
- `http://localhost:3000`
- `http://<your-raspberry-pi-ip>:3000`

The interface features a "Power Control" title which acts as a fuzzy search bar. Use it to filter by group name, outlet name, or PDU location.

## License

MIT
