#!/usr/bin/env bash
# ─── Lance l'app sur un émulateur / appareil Android en une commande ─────────
# Prérequis : Android Studio (ou SDK + émulateur), Java 21, .env.local rempli.
# Usage : ./run-android.sh
set -euo pipefail

cd "$(dirname "$0")"

# ── Environnement ─────────────────────────────────────────────────────────────
if [ -z "${ANDROID_HOME:-}" ]; then
  for c in "$HOME/Android/Sdk" "$HOME/Library/Android/sdk"; do
    [ -d "$c" ] && export ANDROID_HOME="$c" && break
  done
fi
if [ -z "${ANDROID_HOME:-}" ]; then
  echo "✗ ANDROID_HOME introuvable — installe Android Studio ou exporte ANDROID_HOME." >&2
  exit 1
fi
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

if [ ! -f .env.local ]; then
  echo "✗ .env.local manquant — la clé Supabase est intégrée au build." >&2
  echo "  Crée-le avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY." >&2
  exit 1
fi

# ── Émulateur : en démarrer un si aucun appareil connecté ─────────────────────
if ! adb devices | awk 'NR>1 && $2=="device"' | grep -q .; then
  AVD="$(emulator -list-avds | head -1 || true)"
  if [ -z "$AVD" ]; then
    echo "✗ Aucun appareil connecté et aucun AVD défini (Android Studio → Device Manager)." >&2
    exit 1
  fi
  echo "→ Démarrage de l'émulateur $AVD…"
  emulator -avd "$AVD" -netdelay none -netspeed full >/dev/null 2>&1 &
  adb wait-for-device
  # attendre la fin du boot
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
fi

# ── Build web (mode capacitor, sans service worker) + sync + install ─────────
echo "→ Build web + sync Capacitor…"
npm run cap:sync

echo "→ Build + installation de l'APK…"
(cd android && chmod +x gradlew && ./gradlew installDebug)

echo "→ Lancement de l'app…"
adb shell monkey -p com.climbingplanner.app -c android.intent.category.LAUNCHER 1 >/dev/null

echo "✓ Climbing Planner tourne sur l'appareil."
