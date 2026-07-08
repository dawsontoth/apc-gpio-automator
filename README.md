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
- **HTTP API**: Turn channels on or off from other systems with a single POST request that matches devices by name or regular expression (see [HTTP API](#http-api)).

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

### (Optional) Port Forwarding (80/443)

By default, the application runs on port 3000. To allow the application to respond to standard HTTP (80) and HTTPS (443) ports without running as `sudo`, you can set up port forwarding using `iptables`.

Run the following commands to forward traffic from ports 80 and 443 to port 3000:

```bash
# Forward port 80 to 3000
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000

# Forward port 443 to 3000
sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 3000
```

To make these rules persistent across reboots, install `iptables-persistent`:

```bash
sudo apt install iptables-persistent
sudo netfilter-persistent save
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
  - `autoOffAfterSeconds`: (Number, Optional) Delay in seconds after which the group will automatically turn OFF.
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
  - `autoOffAfterSeconds`: (Number, Optional) For outputs, time in seconds to automatically turn back off.
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
  - `autoOffAfterSeconds`: (Number, Optional) Delay in seconds after which the action will automatically turn OFF.

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

## HTTP API

In addition to the real-time web interface, channels can be controlled with a simple, body-less HTTP request. This is convenient for automation, home-automation hubs, `curl`, or any system that can make an HTTP call.

### Turn channels on/off

```
POST /action/:action/:names
```

- `:action` — `on` or `off` (case-insensitive). Any other value returns `400`.
- `:names` — a comma-separated list of channel names. Everything is in the path; **no request body is required**.

Each name is matched against device names (APC outlets, Kasa devices, GPIO outputs, and manual devices) as a **case-insensitive regular expression**. Because a plain name is itself a valid regex, it behaves like a substring match — so `Hazer` targets every device whose name contains "Hazer", exactly like the [grouping logic](#grouping-logic). Wildcards let you target several specific devices at once:

```bash
# Turn on two specific outlets by their full names
curl -X POST "http://localhost:3000/action/on/Hazer%20Drum%20Back%20Fan,Hazer%20Drum%20Front%20Fan"

# Same result using a wildcard in the middle
curl -X POST "http://localhost:3000/action/on/Hazer%20Drum.%2B%3FFan"

# Turn off everything in the "Hazer" group
curl -X POST "http://localhost:3000/action/off/Hazer"
```

Matching a name reuses the standard group-trigger path, so per-device on/off delays, group commands, dependencies, and auto-off timers all apply just as they do from the web interface.

On success the endpoint responds with `200` and the parsed request, e.g.:

```json
{ "success": true, "action": "on", "names": ["Hazer Drum Back Fan", "Hazer Drum Front Fan"] }
```

**Notes:**

- **URL-encode special characters.** Spaces may be sent literally or as `%20`. Regex metacharacters that are also URL-significant must be encoded: `+` → `%2B`, `?` → `%3F`, and especially `#` → `%23` (an unencoded `#` is treated as a URL fragment and never reaches the server).
- **Comma is the list delimiter**, so a channel name or pattern cannot contain a literal comma.
- **Invalid regex is safe.** If a pattern fails to compile, it falls back to plain substring matching instead of erroring.
- A name that matches no devices is not an error — the request still returns `success: true` and simply does nothing.

## License

MIT
