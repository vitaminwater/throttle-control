# Drone Throttle Control

A training webapp for maintaining stable throttle while yawing a quadcopter. Connect a radio transmitter (USB gamepad mode) or standard game controller and practice coordinated stick inputs with real-time 3D feedback.

## Features

- **3D quadcopter** rendered with Three.js — yaw, altitude, roll, and pitch respond to stick input
- **Gamepad / RC transmitter** support via the browser Gamepad API (Mode 2 layout)
- **Throttle hold** — lock altitude/throttle, then yaw freely without throttle drift
- **Training metrics** — deviation bar shows how much your throttle moves while yawing
- **Keyboard fallback** for testing without hardware

## Quick Start

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`). Click the page once so the browser can capture gamepad input, then move a stick on your controller.

## Controls

| Input | Action |
|-------|--------|
| Left stick vertical | Throttle |
| Left stick horizontal | Yaw |
| Right stick | Roll / Pitch |
| **Enable Hold** button | Lock throttle at current value |
| **Set Target** button | Mark current throttle as training target |
| `H` | Toggle throttle hold |
| `T` | Set training target |
| `W`/`S` | Throttle (keyboard) |
| `A`/`D` | Yaw (keyboard) |

## Build

```bash
npm run build
npm run preview
```
