# compare

This is a simple tool for comparing one json http server to another.

A pretty normal run of this looks like

npx ts-node compare.ts \
  --old.host localhost:3100 \
  --new.host normal-prod-url.elasticbeanstalk.com \
  --input_csv directionals.csv \ # the column names will be used as the parameters names to the endpoint
  --endpoint /v1/search  \ # the queries will be run against this
  --ignored_fields attribution timestamp bbox # ignore these fields in the diff
