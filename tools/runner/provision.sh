#!/usr/bin/env bash
# Provisions the WSL2 distribution that hosts PartBuddy's self-hosted GitHub Actions runners
# (ADR 0022). Runs as root inside the distribution; setup-runner.ps1 copies it in and starts it.
# Safe to run again: every step checks what is already there.
#
# RUNNER_COUNT (default 4) runner instances live in ~runner/actions-runner-<n>, each with its own
# workspace, so the jobs of one push run in parallel and never share a checkout.
set -euo pipefail

readonly RUNNER_VERSION="2.338.2"
readonly RUNNER_SHA256="baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40"
readonly RUNNER_USER="runner"
readonly RUNNER_HOME="/home/${RUNNER_USER}"
readonly RUNNER_COUNT="${RUNNER_COUNT:-4}"
# Each instance gets its own port for the click dummy's Vite server (5180, 5181, ...).
readonly CLICKDUMMY_BASE_PORT=5180

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
cat >/etc/wsl.conf <<'WSLCONF'
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
WSLCONF

echo "==> Installing ${RUNNER_COUNT} GitHub Actions runner instances (${RUNNER_VERSION})"
archive=""
for ((i = 1; i <= RUNNER_COUNT; i++)); do
  dir="${RUNNER_HOME}/actions-runner-${i}"
  if [[ ! -x "${dir}/run.sh" ]]; then
    if [[ -z "${archive}" ]]; then
      archive="$(mktemp --suffix=.tar.gz)"
      curl -fsSL -o "${archive}" \
        "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
      echo "${RUNNER_SHA256}  ${archive}" | sha256sum --check --strict
    fi
    install -d -o "${RUNNER_USER}" -g "${RUNNER_USER}" "${dir}"
    tar -xzf "${archive}" -C "${dir}"
    chown -R "${RUNNER_USER}:${RUNNER_USER}" "${dir}"
  fi

  # Job environment of this instance (the runner reads .env when it starts). Each key is
  # replaced; other lines (LANG from the runner's env.sh) stay.
  env_file="${dir}/.env"
  touch "${env_file}"
  sed -i -e '/^CLICKDUMMY_PORT=/d' -e '/^ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/d' "${env_file}"
  {
    echo "CLICKDUMMY_PORT=$((CLICKDUMMY_BASE_PORT + i - 1))"
    echo "ACTIONS_RUNNER_HOOK_JOB_COMPLETED=${RUNNER_HOME}/job-completed.sh"
  } >>"${env_file}"
  chown "${RUNNER_USER}:${RUNNER_USER}" "${env_file}"
done
if [[ -n "${archive}" ]]; then rm -f "${archive}"; fi
# The runner's own system dependencies (libicu and friends), the same for every instance.
"${RUNNER_HOME}/actions-runner-1/bin/installdependencies.sh" </dev/null

echo "==> Writing the helper scripts"
# Registers one instance. Reads the short-lived registration token from stdin so that it never
# appears on a command line; the runner takes it from ACTIONS_RUNNER_INPUT_TOKEN.
cat >"${RUNNER_HOME}/register.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
dir="$1"; url="$2"; name="$3"; labels="$4"
IFS= read -r token
token="${token%$'\r'}"  # PowerShell pipes CRLF
cd "$HOME/$dir"
ACTIONS_RUNNER_INPUT_TOKEN="$token" ./config.sh --unattended --replace \
  --url "$url" --name "$name" --labels "$labels" --work _work
SCRIPT

# Removes the registration of every instance; one remove token works for several runners.
cat >"${RUNNER_HOME}/unregister.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
IFS= read -r token
token="${token%$'\r'}"  # PowerShell pipes CRLF
for dir in "$HOME"/actions-runner-*/; do
  if [[ -f "$dir/.runner" ]]; then
    (cd "$dir" && ACTIONS_RUNNER_INPUT_TOKEN="$token" ./config.sh remove)
  fi
done
SCRIPT

# Starts every registered instance in the foreground; runner-control.ps1 keeps this alive from
# one hidden wsl.exe process. Logs are rotated at 10 MB.
cat >"${RUNNER_HOME}/start-listener.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
for dir in "$HOME"/actions-runner-*/; do
  [[ -f "$dir/.runner" ]] || continue
  log="$HOME/$(basename "$dir").log"
  if [[ -f "$log" && $(stat -c %s "$log") -gt 10485760 ]]; then
    mv -f "$log" "$log.1"
  fi
  (cd "$dir" && exec ./run.sh >>"$log" 2>&1) &
done
wait
SCRIPT

# Job-completed hook (ACTIONS_RUNNER_HOOK_JOB_COMPLETED): one tab-separated line per finished job.
# tools/runner/watch-pr-checks.sh follows this file and reports a pull request once all of its
# checks are done, without polling GitHub on a timer.
cat >"${RUNNER_HOME}/job-completed.sh" <<'SCRIPT'
#!/usr/bin/env bash
log="$HOME/job-events.log"
if [[ -f "$log" && $(stat -c %s "$log") -gt 1048576 ]]; then
  mv -f "$log" "$log.1"
fi
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${RUNNER_NAME:-}" \
  "${GITHUB_REPOSITORY:-}" "${GITHUB_REF:-}" "${GITHUB_RUN_ID:-}" "${GITHUB_WORKFLOW:-}" \
  "${GITHUB_JOB:-}" >>"$log"
SCRIPT

for script in register.sh unregister.sh start-listener.sh job-completed.sh; do
  chown "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_HOME}/${script}"
  chmod 0750 "${RUNNER_HOME}/${script}"
done

echo "==> Provisioning finished"
