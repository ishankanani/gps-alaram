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

# Like a real phone, the emulator reports a position (and its speed) every second along the route.
# Usage: route from-lat from-lon to-lat to-lon seconds. Replaced in one step, so it is never read half-written.
route() { echo "$1 $2 $3 $4 $5 $(date +%s)" > "$RUNS/route.new" && mv "$RUNS/route.new" "$RUNS/route"; }
# Prints "longitude latitude knots" for the current moment of the route.
position() {
  local lat1 lon1 lat2 lon2 secs since
  read -r lat1 lon1 lat2 lon2 secs since < "$RUNS/route" || return 1
  awk -v a="$lat1" -v b="$lon1" -v c="$lat2" -v d="$lon2" -v s="$secs" -v t="$(($(date +%s) - since))" 'BEGIN {
    f = s > 0 ? t / s : 1; if (f > 1) f = 1
    dx = (d - b) * cos(a * 3.14159265 / 180) * 111320; dy = (c - a) * 110540
    knots = (s > 0 && f < 1) ? sqrt(dx * dx + dy * dy) / s * 1.943844 : 0
    printf "%.6f %.6f %.1f", b + (d - b) * f, a + (c - a) * f, knots
  }'
}
# "latitude longitude" of where the phone is now, to start the next route from.
here() { position | awk '{ print $2, $1 }'; }
feed() {
  local p lon lat knots out
  while true; do
    if p=$(position); then
      read -r lon lat knots <<< "$p"
      # Altitude 0 m, 12 satellites, speed in knots. Without a speed the GPS would report 0.
      out=$(adb emu geo fix "$lon" "$lat" 0 12 "$knots" 2>&1) || true
      case "$out" in *KO*) adb emu geo fix "$lon" "$lat" >/dev/null 2>&1 || true ;; esac
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
# A freshly booted emulator's launcher is sometimes slow to start, and its "isn't responding"
# dialog would cover the app.
adb shell settings put global hide_error_dialogs 1 || true
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null || true
adb shell cmd location set-location-enabled true || true
adb shell appops set "$PKG" SCHEDULE_EXACT_ALARM allow || true
adb shell appops set "$PKG" USE_FULL_SCREEN_INTENT allow || true
adb shell dumpsys deviceidle whitelist "+$PKG" || true
# The emulator is set to US English, which means miles. Run the app like an English speaker
# living in Germany: English texts, kilometres.
adb shell cmd locale set-app-locales "$PKG" --locales en-DE || true

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
# The locate button waits for a GPS fix before the map moves there.
sleep 8
run_flow 2-map-and-stop.yaml

# Head for the station at bus speed (about 15 km/h), so "2 min before" is still minutes away.
route 48.1426 11.5775 48.1402 11.5600 300
sleep 25
run_flow 3-trip.yaml

# Speed up like a train: the alarm should ring about 2 minutes before arriving.
# shellcheck disable=SC2046 # here prints two arguments
route $(here) 48.1402 11.5600 75
run_flow 4-alarm.yaml

# The alarm is dismissed by dragging the slider from its left end to the right.
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
read -r x1 y1 x2 y2 < <(
  adb exec-out cat /sdcard/ui.xml | tr '>' '\n' | grep 'class="android.widget.SeekBar"' |
    sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/'
)
y=$(((y1 + y2) / 2))
inset=$(((y2 - y1) / 2))
adb shell input swipe $((x1 + inset)) "$y" $((x2 - inset)) "$y" 900

run_flow 5-after-trip.yaml
run_flow 6-countries-pro.yaml
ls -la "$OUT"
