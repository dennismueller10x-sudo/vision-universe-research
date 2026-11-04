#!/bin/bash
# Xcode Cloud: laeuft nach dem Klonen, VOR dem Build (Pfad ist durch Xcode Cloud vorgegeben: ci_scripts neben dem Xcode-Projekt).
# Ohne Xcode-Cloud-Einrichtung hat diese Datei keine Wirkung. Siehe docs/mobile/TESTFLIGHT_PLAN.md.
# Nur oeffentliche Werte (kein Secret): VU_SUPABASE_URL, VU_SUPABASE_PUBLISHABLE_KEY als Umgebungsvariablen des Workflows.
set -euo pipefail
cd "$CI_PRIMARY_REPOSITORY_PATH/app"

# Node (nicht vorinstalliert) und CocoaPods ueber Homebrew
brew install node@22 || true
export PATH="$(brew --prefix node@22)/bin:$PATH"
command -v pod >/dev/null || brew install cocoapods

npm ci --no-audit --no-fund
npm run build:www
npx cap sync ios

# Build-Nummer: je Lauf eindeutig steigend (TestFlight lehnt wiederholte Nummern ab)
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${CI_BUILD_NUMBER:?}" ios/App/App/Info.plist 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string ${CI_BUILD_NUMBER}" ios/App/App/Info.plist
echo "Build ${CI_BUILD_NUMBER} vorbereitet"
