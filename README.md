# compare

This is a tool for comparing one json http server to another. It supports a wide variety of input formats as well as the ability to save a baseline run to compare against future runs.

This tool is probably most useful in scenarios involving search/ranking problems, where there are alogrithm and data changes over time that require manual evaluation of the wins and losses.

It also includes a script for talking to json http services with saved configurations.

## tl;dr

### Compare two servers

```
./compare.sh \
  --new.host pelias-staging.apicom.com \ # defaults to http, port 80
  --old.host pelias-prod.apicom.com \
  --input_csv ~/geocode-acceptance-tests/input/addresses.csv \ # run these queries against our server based on their column headings, could also have used 
  --input_queries, --input_params or --input_json_baseline
  --key_map query=text  \ # remap column "query" to cgi parameter "text"
  --endpoint /v1/search \ # run against /v1/search on our hosts
  --extra_params size=1 \ # extra options to append to every query
  --ignored_fields bbox geometry attribution timestamp \ # ignore all fields named these things in computing our diff
  --output_mode html \ # output an interactive html diff. other options are text and json
  > diffs.html
```

### Generate a baseline

```
./generate-baseline.sh \
   --old.host pelias-prod.api.com \ # the host to run against
   --input_csv ~/geoocde-acceptance-tests/input/addresses.csv \ # input csv file with headers corresponding to cgi params
   --key_map query=text  \ # remap the "query" header in our csv to the "text" cgi param
   --endpoint /v1/search \ # run queries against this endpoint
   --extra_params size=1 \ # add an extra cgi param to every query, in this case, to 

   > addresses-baseline.json
```

### Compare against a baseline
```
./compare.sh \
  --new.host pelias-staging.apicom.com \ # defaults to http, port 80
  --input_json_baseline addresses-baseline.json \
  --ignored_fields bbox geometry attribution timestamp \ 
  --output_mode html \ 
  > diffs.html
```

## Usage

This tool might seem like it has a zillion options, but I promise, it's not that bad!

At it's core, you need to specify two servers (old and new), and an input configuration. There are a bunch of ways to do that.

## Configuration

All of the tools in this repo can load a configuration file that makes it easy to have saved defaults of servers to compare. A config file is specified via the environment variable COMPARE_CONFIG_FILE, wth the idea that you can have multiple configs (for different services, like an api server and a geocode server) and use shell aliases to wrap the config.

An example config looks like this
```
{
  name: "apicom",

  # "param" or "header"
  # param means the key will be sent as a cgi param with 
  #     the key authParam defined below 
  # header means the key will be sent in the http 
  #     Authorization header.
  authStyle: "header",

  # only required if using authStyle="param"
  # authParam: "api_key",

  # first keyType listed here will be the default if a
  # keyType is not specified in the commandline options to # compare
  keyTypes: ['test', 'live'],

  hosts: {
    prod: {
      host: 'prod.api.com',
      aliases: ['production'],
    }
    staging: {
      host: 'staging.api.com'
    },
    local: {
      host: 'localhost:8000',
      keyEnv: 'staging',
      protocol: 'http',
    },
    user: {
      takesArg: true,
      host: 'USER-staging.api.com'
      keyEnv: 'staging',
    },
  }
}
```

This defines a pretty common server setup. There is a production API at prod.api.com. It implicitly defines a "prod" key env in our config. There is a staging api at staging.api.com with a "staging" key env. Additionally, developers run local apis at localhost:8000, which use staging keys and should be communicated with over http (default is https). Finally, each user has their own staging env at USER-staging.api.com which again uses staging keys.

Additionally, for this config, we would add some environment variables, optionally in a .env file loaded by dotenv to make our lives even easier. That file would look like

```
# keys are name + keyEnv + keyType + KEY
# all uppercase, joined with underscores
APICOM_PROD_TEST_KEY=XXXX
APICOM_PROD_LIVE_KEY=XXXX
APICOM_STAGING_TEST_KEY=XXXX
APICOM_STAGING_LIVE_KEY=XXXX
```

Our config defines two types of keys - test and live. It also defines two key environments. One for "prod" and one for "staging," the host configs for "local" and "user" are both configured to look in the "staging" key env"

### Specifying a server



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
