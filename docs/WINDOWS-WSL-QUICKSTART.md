# Windows / WSL Quick Install

This command must be run from an **Administrative PowerShell** window.

To open PowerShell as Administrator:

1. Press the **Windows** key.
2. Type `PowerShell`.
3. Right-click **Windows PowerShell**.
4. Select **Run as administrator**.
5. Click **Yes** on the Windows security prompt.
6. Confirm the window title starts with **Administrator:**.

Paste this command into that Administrator PowerShell window:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; $ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $root=Join-Path $env:USERPROFILE 'dune-awakening-selfhost-docker'; New-Item -ItemType Directory -Force -Path $root | Out-Null; Set-Location $root; $installer=Join-Path $root 'install.ps1'; Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/Red-Blink/dune-awakening-selfhost-docker/main/install.ps1' -OutFile $installer; powershell -NoProfile -ExecutionPolicy Bypass -File $installer -RepoUrl 'https://github.com/Red-Blink/dune-awakening-selfhost-docker.git' -RepoRef 'main'
```

Do not wrap this command in another `powershell -Command "..."` call. It is meant to be pasted directly into an already-open Administrator PowerShell window.

This command:

1. Creates `%USERPROFILE%\dune-awakening-selfhost-docker`.
2. Downloads `install.ps1` directly.
3. Runs the downloaded `install.ps1`.
4. The installer prepares WSL2, Ubuntu 26.04, Docker Engine inside Ubuntu, and delegates final server startup to the existing Linux `install.sh`.

For the full guide, see [WINDOWS-WSL-INSTALL.md](WINDOWS-WSL-INSTALL.md).
