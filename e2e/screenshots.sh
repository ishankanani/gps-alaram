#!/usr/bin/env bash
# Drives the release app on an Android emulator through a whole trip and saves screenshots.
# Usage: e2e/screenshots.sh <apk> <output dir>. Run by .github/workflows/screenshots.yml.
set -euo pipefail

APK=$1
OUT=$2
PKG=com.ishankanani.gpsalarm
FLOWS=$(cd "$(dirname "$0")" && pwd)
RUNS=$(mktemp -d)
FEEDER=
mkdir -p "$OUT"

# Maestro saves screenshots in its own folder for each run; gather the named ones.
collect() {
  find "$RUNS" "$HOME/.maestro/tests" -name '[0-9][0-9]-*.png' -exec cp {} "$OUT/" \; 2>/dev/null || true
}

run_flow() {
  local dir="$RUNS/${1%.yaml}"
  mkdir -p "$dir"
  (cd "$dir" && maestro test "$FLOWS/$1")
  collect
}

# Like a real phone, the emulator reports a position every second, moving along the current route.
# Usage: route from-lat from-lon to-lat to-lon seconds. Replaced in one step, so it is never read half-written.
route() { echo "$1 $2 $3 $4 $5 $(date +%s)" > "$RUNS/route.new" && mv "$RUNS/route.new" "$RUNS/route"; }
feed() {
  while true; do
    if read -r lat1 lon1 lat2 lon2 secs since < "$RUNS/route"; then
      # shellcheck disable=SC2046 # "longitude latitude" are two arguments
      adb emu geo fix $(awk -v a="$lat1" -v b="$lon1" -v c="$lat2" -v d="$lon2" -v s="$secs" -v t="$(($(date +%s) - since))" \
        'BEGIN { f = s > 0 ? t / s : 1; if (f > 1) f = 1; printf "%.6f %.6f", b + (d - b) * f, a + (c - a) * f }') >/dev/null 2>&1 || true
    fi
    sleep 1
  done
}

on_exit() {
  local status=$?
  kill "$FEEDER" 2>/dev/null || true
  collect
  echo "::group::Map log"
  adb logcat -d | grep -iE "mbgl|maplibre|glyph|sprite" | tail -80 || true
  echo "::endgroup::"
  if [ "$status" -ne 0 ]; then
    echo "::group::App log"
    adb logcat -d | grep -E "ReactNativeJS|AndroidRuntime|TripService|TripAlarm|MapLibre|FATAL" | tail -200 || true
    echo "::endgroup::"
    # Maestro also keeps a picture of the screen a flow failed on.
    find "$HOME/.maestro/tests" -name '*.png' ! -name '[0-9][0-9]-*.png' -print0 2>/dev/null |
      while IFS= read -r -d '' f; do cp "$f" "$OUT/debug-$(basename "$f" | tr -cd 'A-Za-z0-9._-')"; done
  fi
}
trap on_exit EXIT

adb install -r "$APK"
adb shell cmd location set-location-enabled true || true
adb shell appops set "$PKG" SCHEDULE_EXACT_ALARM allow || true
adb shell appops set "$PKG" USE_FULL_SCREEN_INTENT allow || true
adb shell dumpsys deviceidle whitelist "+$PKG" || true

# The layout of a 1080 x 2400 phone (411 dp wide) with smaller files, and a tidy status bar.
adb shell wm size 720x1600
adb shell wm density 280
adb shell settings put global sysui_demo_allowed 1
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null || true; }
demo enter
demo clock -e hhmm 0815
demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4
demo network -e mobile show -e datatype lte -e level 4
demo notifications -e visible false

# Odeonsplatz in Munich, about 1.3 km from München Hbf.
route 48.1426 11.5775 48.1426 11.5775 0
feed &
FEEDER=$!
run_flow 1-start-trip.yaml

# Head for the station at bus speed (about 15 km/h), so "2 min before" is still minutes away.
route 48.1426 11.5775 48.1402 11.5600 300
sleep 25
run_flow 2-trip.yaml

# Arrive at München Hbf.
route 48.1402 11.5600 48.1402 11.5600 0
run_flow 3-alarm.yaml

# The alarm is dismissed by dragging the slider from its left end to the right.
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
read -r x1 y1 x2 y2 < <(
  adb exec-out cat /sdcard/ui.xml | tr '>' '\n' | grep 'class="android.widget.SeekBar"' |
    sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/'
)
y=$(((y1 + y2) / 2))
inset=$(((y2 - y1) / 2))
adb shell input swipe $((x1 + inset)) "$y" $((x2 - inset)) "$y" 900

run_flow 4-after-trip.yaml
ls -la "$OUT"
