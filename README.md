# APC GPIO Automator

A comprehensive Node.js application for controlling APC PDUs and Raspberry Pi GPIOs through a unified web interface, physical inputs, and automated schedules.

## Features

- **Automated PDU Discovery**: Automatically scans specified subnets to find and configure APC PDUs via SNMP.
- **Advanced GPIO Support**:
  - **Switch Mode**: Toggle physical switches to turn groups on or off.
  - **Momentary Mode**: Use push-buttons to toggle group states with configurable minimum pulse time.
  - **Output Mode**: Control local GPIO pins as virtual outlets, supporting auto-off timers (pulses) and arbitrary shell commands.
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
- Raspberry Pi (optional, required for local GPIO functionality)
- APC PDUs (accessible via SNMPv1 with "private" community string)

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd apc-gpio-automator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure the application by editing `config.json` (see Configuration section below).

4. Start the application:
   ```bash
   npm start
   ```

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
- `rpi-gpio`: (Array of Objects) Configuration for Raspberry Pi GPIO pins.
  - `pin`: (Number) Physical pin number.
  - `mode`: (String) `switch`, `momentary`, or `output`.
  - `group`: (String, for `switch`/`momentary`) The group name this pin controls.
  - `name`: (String, for `output`) Display name for the pin in the web interface.
  - `onCommand`/`offCommand`: (String, Optional) Commands to run when the pin state changes.
  - `autoOffAfter`: (Number, Optional) For outputs, time in ms to automatically turn back off.
  - `minTime`: (Number, for `momentary`) Minimum pulse duration in ms.
- `schedules`: (Array of Objects) Automated tasks.
  - `time`: (String) Time in HH:mm format.
  - `days`: (Array of Strings, Optional) Specific days to run (e.g., `["Sun", "Wed"]`).
  - `action`: (String) `on` or `off`.
  - `groups`: (Array of Strings, Optional) Specific groups to trigger. If omitted, triggers all.

## How It Works

### Grouping Logic
An outlet (APC or GPIO) is associated with a group if the group's name is found anywhere within the outlet's name (case-insensitive). For example, an outlet named "Stage Left Lights" will automatically be included in a group named "Lights".

### SNMP Connectivity
The application uses **SNMPv1** with the community string **"private"** to communicate with APC PDUs. It supports both newer RPDU2 (AP8xxx series) and older RPDU (AP7xxx series) models.

### Distributed GPIO (Future Ready)
The system is architected to handle both local and potentially remote GPIO states, although currently focused on local execution via `rpi-gpio`.

## Web Interface

Once started, the web server is accessible at:
- `http://localhost:3000`
- `http://<your-raspberry-pi-ip>:3000`

The interface features a "Power Control" title which acts as a fuzzy search bar. Use it to filter by group name, outlet name, or PDU location.

## License

MIT
