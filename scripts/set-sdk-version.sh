#!/bin/sh
# Usage: sh scripts/set-sdk-version.sh 12.x.y   — bumps the Firebase JS SDK version used by all CDN imports.
# Check the latest release first: https://firebase.google.com/support/release-notes/js
[ -z "$1" ] && { echo "Pass a version, e.g. 12.0.0"; exit 1; }
grep -rl "gstatic.com/firebasejs/" "$(dirname "$0")/../public/js" | xargs sed -i -E "s#(gstatic.com/firebasejs/)[0-9]+\.[0-9]+\.[0-9]+#\1$1#g"
echo "SDK version set to $1"
