#!/bin/bash
# Bundles the fixture renderer and its client half against the app's real
# source, so both sides exercise the shipped components. next/font/google
# is a build-time transform with no runtime, so it is stubbed; everything
# else is the real module.
set -euo pipefail
APP="$1"; FX="$2"
COMMON=(--bundle --jsx=automatic --loader:.tsx=tsx --loader:.ts=ts
        --alias:@="$APP/src" --alias:next/font/google="$FX/next-font-stub.ts"
        --tsconfig-raw={} --log-level=warning)
"$APP/node_modules/.bin/esbuild" "$FX/render.tsx" "${COMMON[@]}" \
  --platform=node --format=esm --target=node20 \
  --external:react --external:react-dom \
  --outfile="$FX/out/render.mjs"
"$APP/node_modules/.bin/esbuild" "$FX/client.ts" "${COMMON[@]}" \
  --platform=browser --format=iife --target=es2020 \
  --define:process.env.NODE_ENV='"production"' \
  --minify --outfile="$FX/out/prefetch.js"
echo "bundled"
