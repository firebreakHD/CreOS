#!/bin/sh
set -eu
if [ -f /data/options.json ]; then
  secret="$(node -e 'const fs=require("fs");const options=JSON.parse(fs.readFileSync("/data/options.json","utf8"));process.stdout.write(String(options.home_assistant_shared_secret||""))')"
  if [ -n "$secret" ]; then export HOME_ASSISTANT_SHARED_SECRET="$secret"; fi
fi
exec node /app/ha-ingress-proxy.cjs
