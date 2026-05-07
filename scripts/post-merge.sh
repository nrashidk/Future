#!/bin/bash
set -e

NODE_BIN="/nix/store/bl6iwirn83qj9r8wng43kfdqd5mfahj8-nodejs-22.22.0/bin"
export PATH="$NODE_BIN:$PATH"

npm install
npm run db:push -- --force
