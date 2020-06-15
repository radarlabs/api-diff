# compare

This is a simple tool for comparing one json http server to another.

A pretty normal run of this looks like

```
npx ts-node compare.ts \
  --color \ # defaults to color on for terminal, off for redirect. adding --color forces ansi color escape codes in all output
  --old.host localhost:3100 \
  --new.host normal-prod-url.elasticbeanstalk.com \
  --input_csv directionals.csv \ # the column names will be used as the parameters names to the endpoint
  --endpoint /v1/search  \ # the queries will be run against this
  --extra_params size=1 \ # added to every query, useful for truncating results to reduce noise
  --ignored_fields attribution timestamp bbox # ignore these fields in the diff
```
