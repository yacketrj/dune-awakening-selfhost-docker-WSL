<p align="center">
  <img src="assets/cover.png" alt="RedBlink Dune Docker Console" width="100%">
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-server_console-blue">
  <img alt="Guided setup" src="https://img.shields.io/badge/setup-guided%20browser%20wizard-orange">
  <img alt="Docker managed" src="https://img.shields.io/badge/Docker-checked%20automatically-2496ED">
</p>

# RedBlink Dune Docker Console

RedBlink Dune Docker Console is a browser-based admin console for running the Dune Awakening dedicated server stack on your own self-hosted server.

It is built for fresh servers and first-time admins. The installer prepares the host, starts the Web UI on port `8088`, generates a strong local admin password, and then the browser setup wizard walks through the rest. Running directly on Linux is the most efficient option, but Docker Desktop on Windows/WSL2 and virtual machines can also work when networking and resources are configured correctly.

This project is unofficial. It is not affiliated with, endorsed by, sponsored by, or supported by Funcom.

## First-Time Install

Download the latest release from:

```text
https://github.com/Red-Blink/dune-awakening-selfhost-docker/releases/latest
```

Unpack it on the server, then run the included installer, `install.sh`.

The installer is meant to do the setup work for you:

- checks whether Docker is installed
- installs Docker automatically on supported Linux servers
- starts and enables Docker when it is installed but not running
- checks Docker Compose
- starts the RedBlink Dune Docker Console Web UI so you can open it remotely
- prints the browser address to open
- tells the local server admin where the generated first-login password was saved

The README does not publish the password location. The installer and local console output show it only on the server that created it.

## What Happens In The Browser

Open the Web UI address shown by the installer and sign in with the generated admin password. The Web UI listens on `0.0.0.0:8088` by default so you can finish installation from your browser on another machine. First-time setup stays focused on the wizard; the main operational menu remains hidden until setup is complete.

The wizard guides you through:

1. checking the server
2. fixing missing requirements where the installer can do that safely
3. naming the Dune server
4. choosing region and network mode
5. saving the Funcom self-host token
6. reviewing ports and firewall expectations
7. initializing and starting the Dune server stack
8. opening the dashboard when the server is ready

If Docker is missing, stopped, unavailable, or missing Compose, the setup flow detects that automatically. On supported Linux servers, the installer handles those repairs before the Web UI starts. On Docker Desktop, Windows/WSL2, or VM setups, the wizard points out what still needs attention, such as starting Docker Desktop, assigning enough resources, or forwarding ports.

## Server Requirements

Best experience:

- Linux server, VPS, dedicated machine, or home server
- Docker running directly on the host
- enough CPU, memory, disk, and network capacity for your server size

Also supported with extra care:

- Docker Desktop on Windows/WSL2
- Linux inside a virtual machine
- other VM software that exposes CPU features, storage, and ports correctly

You will need:

- Funcom self-host token
- AVX/AVX2-capable CPU
- enough RAM and disk space
- browser access to the Web UI from a trusted network
- router/firewall access if players connect from the internet

## Ports

The Web UI listens on all network interfaces by default for first-time setup. Use a strong generated password, and restrict access with your server firewall, VPN, protected reverse proxy, or allowlisting when possible.

| Port | Purpose | Exposure |
|---|---|---|
| `8088/tcp` | Web admin console | Remote admin setup; restrict to trusted admins |
| `7777-7810/udp` | Normal Dune game traffic | Forward for public servers |
| `31982/tcp` | Game stack messaging | Forward only when your setup requires it |
| `15432/tcp` | Local database | Never public |
| `31983/tcp`, `32573/tcp` | Internal admin services | Never public |
| `7888+/udp` | Internal map traffic | Keep private for normal single-host installs |

The wizard repeats the important port guidance during setup.

## After Setup

Once setup is complete, the dashboard unlocks the normal tools:

| Task | Where |
|---|---|
| Status and readiness | Home |
| Service control | Services |
| Logs | Logs |
| Backups | Backups |
| Updates | Updates |
| Player admin tools | Players |
| Care Packages | Care Package |
| Maps, sietches, Deep Desert, memory, autoscaler | Maps |
| Read-only database browser | Database |
| Item, vehicle, skill, and command history tools | Admin Tools |

## Safety

RedBlink Dune Docker Console controls Docker and game admin operations. Treat it like a private server admin panel.

- Keep authentication enabled.
- The Web UI starts on all interfaces so remote browser setup works. Restrict access to trusted admins as soon as practical.
- Do not share the admin password.
- Back up before destructive actions.
- The console uses Docker access to manage the stack, so only trusted admins should use it.
- Dangerous actions require backend confirmation phrases, not only browser prompts.

## Troubleshooting

The installer and wizard are designed to explain problems in plain language. The most common cases are:

| What happened | What the installer or wizard does |
|---|---|
| Docker is not installed | Installs Docker automatically on supported Linux servers |
| Docker is installed but not running | Starts and enables Docker on supported Linux servers |
| Docker is running but your user cannot access it | Fixes Linux group access when possible, then asks you to sign out and back in |
| Docker Compose is missing | Installs the Compose plugin on supported Linux servers |
| Docker Desktop is stopped | Asks you to start Docker Desktop |
| VM networking is incomplete | Points you back to the VM/router port settings |

If the Web UI does not load, check the installer output first. It prints the address the console is listening on.

## License

MIT. See [LICENSE](LICENSE).
