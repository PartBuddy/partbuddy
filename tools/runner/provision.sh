#!/usr/bin/env bash
# Provisions the WSL2 distribution that hosts PartBuddy's self-hosted GitHub Actions runner
# (ADR 0022). Runs as root inside the distribution; setup-runner.ps1 copies it in and starts it.
# Safe to run again: every step checks what is already there.
set -euo pipefail

readonly RUNNER_VERSION="2.338.2"
readonly RUNNER_SHA256="baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40"
readonly RUNNER_USER="runner"
readonly RUNNER_HOME="/home/${RUNNER_USER}"
readonly RUNNER_DIR="${RUNNER_HOME}/actions-runner"

export DEBIAN_FRONTEND=noninteractive

echo "==> Updating the system"
apt-get update -q </dev/null
apt-get -y -q full-upgrade </dev/null

echo "==> Installing tools and the libraries Chromium and Electron need"
# Tools for checkout (Git LFS), the workflow steps and a virtual display for the Electron tests.
# libatomic1: the official Node.js builds need it; GitHub's hosted image has it preinstalled.
# The library list follows `playwright install-deps chromium` for Ubuntu 24.04, plus GTK and the
# few extras Electron loads.
apt-get install -y -q --no-install-recommends </dev/null \
  ca-certificates curl git git-lfs gnupg jq tar unzip xz-utils zstd \
  libatomic1 \
  xvfb xauth \
  libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libcairo2 libcups2t64 \
  libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 libgtk-3-0t64 libnotify4 libnspr4 libnss3 \
  libpango-1.0-0 libsecret-1-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
  libxdamage1 libxext6 libxfixes3 libxi6 libxkbcommon0 libxrandr2 libxrender1 libxshmfence1 \
  libxss1 libxtst6 \
  fontconfig fonts-freefont-ttf fonts-ipafont-gothic fonts-liberation fonts-noto-color-emoji \
  fonts-tlwg-loma-otf fonts-unifont fonts-wqy-zenhei xfonts-cyrillic xfonts-scalable
apt-get -y -q autoremove </dev/null
apt-get clean

echo "==> Creating the unprivileged runner user"
if ! id -u "${RUNNER_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${RUNNER_USER}"
fi
# No sudo for the runner: jobs never get root inside the distribution.
rm -f "/etc/sudoers.d/${RUNNER_USER}"

echo "==> Isolating the distribution from Windows"
# No Windows drives, no starting Windows programs, no Windows PATH, no systemd (less idle load).
cat >/etc/wsl.conf <<'EOF'
# PartBuddy CI runner (ADR 0022). Written by tools/runner/provision.sh.
[automount]
enabled=false
mountFsTab=false

[interop]
enabled=false
appendWindowsPath=false

[boot]
systemd=false

[user]
default=runner
EOF

echo "==> Installing the GitHub Actions runner ${RUNNER_VERSION}"
if [[ ! -x "${RUNNER_DIR}/run.sh" ]]; then
  archive="$(mktemp --suffix=.tar.gz)"
  curl -fsSL -o "${archive}" \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  echo "${RUNNER_SHA256}  ${archive}" | sha256sum --check --strict
  install -d -o "${RUNNER_USER}" -g "${RUNNER_USER}" "${RUNNER_DIR}"
  tar -xzf "${archive}" -C "${RUNNER_DIR}"
  rm -f "${archive}"
  chown -R "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_DIR}"
fi
# The runner's own system dependencies (libicu and friends).
"${RUNNER_DIR}/bin/installdependencies.sh" </dev/null

echo "==> Writing the helper scripts"
# Registers the runner. Reads the short-lived registration token from stdin so that it never
# appears on a command line; the runner takes it from ACTIONS_RUNNER_INPUT_TOKEN.
cat >"${RUNNER_HOME}/register.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
url="$1"; name="$2"; labels="$3"
IFS= read -r token
token="${token%$'\r'}"  # PowerShell pipes CRLF
cd "$HOME/actions-runner"
ACTIONS_RUNNER_INPUT_TOKEN="$token" ./config.sh --unattended --replace \
  --url "$url" --name "$name" --labels "$labels" --work _work
EOF

# Removes the registration. Same token handling as register.sh.
cat >"${RUNNER_HOME}/unregister.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
IFS= read -r token
token="${token%$'\r'}"  # PowerShell pipes CRLF
cd "$HOME/actions-runner"
ACTIONS_RUNNER_INPUT_TOKEN="$token" ./config.sh remove
EOF

# Starts the listener in the foreground; runner-control.ps1 keeps it alive from a hidden
# wsl.exe process. The log is rotated at 10 MB.
cat >"${RUNNER_HOME}/start-listener.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
log="$HOME/runner.log"
if [[ -f "$log" && $(stat -c %s "$log") -gt 10485760 ]]; then
  mv -f "$log" "$log.1"
fi
cd "$HOME/actions-runner"
exec ./run.sh >>"$log" 2>&1
EOF

chown "${RUNNER_USER}:${RUNNER_USER}" \
  "${RUNNER_HOME}/register.sh" "${RUNNER_HOME}/unregister.sh" "${RUNNER_HOME}/start-listener.sh"
chmod 0750 \
  "${RUNNER_HOME}/register.sh" "${RUNNER_HOME}/unregister.sh" "${RUNNER_HOME}/start-listener.sh"

echo "==> Provisioning finished"
