#!/bin/sh
set -eu

# Native Wayland can leave the window hidden on NVIDIA systems. This must be selected before
# Electron starts; app.commandLine.appendSwitch in the main process is already too late.
if [ -n "${DISPLAY:-}" ]; then
  explicit_platform=
  for arg in "$@"; do
    case "$arg" in
      --ozone-platform|--ozone-platform=*) explicit_platform=1 ;;
    esac
  done
  if [ -z "$explicit_platform" ]; then
    set -- --ozone-platform=x11 "$@"
  fi
fi

launcher_dir=$(dirname -- "$(readlink -f -- "$0")")
exec "$launcher_dir/partbuddy-bin" "$@"
