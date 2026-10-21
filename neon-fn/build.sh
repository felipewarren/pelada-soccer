#!/bin/sh
# Builds dist-neon/function.zip for Neon Functions (index.mjs + public/ static files)
set -e; cd "$(dirname "$0")/.."
rm -rf dist-neon && mkdir -p dist-neon/pkg
npx --yes esbuild@0.25 neon-fn/index.mjs --bundle --platform=node --target=node24 --format=esm \
  --external:pg-native --external:bufferutil --external:utf-8-validate \
  --banner:js="import{createRequire as ___cr}from'module';import{fileURLToPath as ___f}from'url';import{dirname as ___d}from'path';const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);" \
  --outfile=dist-neon/pkg/index.mjs
cp -r public dist-neon/pkg/public
(cd dist-neon/pkg && python3 -c "import shutil; shutil.make_archive('../function', 'zip', '.')")
