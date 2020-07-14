#!/bin/sh
echo $CONFIG_FILE
bash -c "./node_modules/.bin/ts-node lib/api.ts $(printf ' %q' "$@")"
