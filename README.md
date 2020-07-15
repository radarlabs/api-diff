# api-diff

This is a tool for comparing one json http server to another. It supports a wide variety of input formats as well as the ability to save a baseline run to compare against future runs.

This tool is probably most useful in scenarios involving search/ranking problems, where there are alogrithm and data changes over time that require manual evaluation of the wins and losses.

It also includes a script for talking to json http services with saved configurations.

## tl;dr

### Compare two servers

```
yarn api-diff \
  --new.host pelias-staging.apicom.com \ # defaults to http, port 80
  --old.host pelias-prod.apicom.com \
  --input_csv ~/geocode-acceptance-tests/input/addresses.csv \ # run these queries against our server based on their column headings, could also have used 
  --input_queries, --input_params or --input_json_baseline
  --key_map query=text  \ # remap column "query" to cgi parameter "text"
  --endpoint /v1/search \ # run against /v1/search on our hosts
  --extra_params size=1 sources=oa,osm \ # extra options to append to every query
  --ignored_fields bbox geometry attribution timestamp \ # ignore all fields named these things in computing our diff
  --output_mode html \ # output an interactive html diff. other options are text and json
  > diffs.html
```

### Generate a baseline

```
yarn generate-baseline \
   --old.host pelias-prod.api.com \ # the host to run against
   --input_csv ~/geoocde-acceptance-tests/input/addresses.csv \ # input csv file with headers corresponding to cgi params
   --key_map query=text  \ # remap the "query" header in our csv to the "text" cgi param
   --endpoint /v1/search \ # run queries against this endpoint
   --extra_params size=1 sources=osm,oa \ # add an extra cgi param to every query, in this case, to 

   > addresses-baseline.json
```

### Compare against a baseline
```
yarn api-diff \
  --new.host pelias-staging.apicom.com \ # defaults to http, port 80
  --input_json_baseline addresses-baseline.json \
  --ignored_fields bbox geometry attribution timestamp \ 
  --output_mode html \ 
  > diffs.html
```

### Use api tool with a [config file](#configuration)
```
COMPARE_CONFIG_FILE=config.hjson yarn api-tool \ # use config.hjson
  --prod \ # use the "prod" host entry from config.json
  --endpoint /geocode/forward \ # run against /geocode/endpoint
  near="40.74,-74" "query=30 jay st" # use these as query parameters
```

### Use compare tool with a [config file](#configuration)
COMPARE_CONFIG_FILE=config.hjson yarn api-diff \ # use config.hjson
  --old.staging \
  --new.local \
  --input_csv ~/geoocde-acceptance-tests/input/addresses.csv

This also works with a url because I've defined in my config file how auth works and where to find the keys, and what kinds of keys different hosts need

```
COMPARE_CONFIG_FILE=config.hjson yarn api-tool \
  "http://api.radar.io/v1/geocode/forward?query=30 jay st"
```

Because I've defined a "prod" entry in config.hjson, and put keys into .env, this command will execute wth the necessary authentication.


## Output

### [text (console) output](https://radarlabs.github.io/compare/demos/text-diff-as-html.html)
```yarn api-diff --new.host localhost:4100  --old.host localhost:3100 --input_csv addresses.csv --endpoint /v1/search --extra_params size=1 sources=osm,gn,wof --ignored_fields bbox geometry attribution timestamp via parsed_text gid id source_id --output_mode text --color > out.txt```

![start of text diff](https://radarlabs.github.io/compare/demos/text-output-2.png)
![end of text diff](https://radarlabs.github.io/compare/demos/text-output-1.png)

- [full output as text](https://radarlabs.github.io/compare/demos/diff.txt) - this is much prettier in a terminal due to escape characters. The header links to a version of this output wrapped in an html viewer for ansi escape codes.

### [html output](https://radarlabs.github.io/compare/demos/diff.html)
```yarn api-diff --new.host localhost:4100  --old.host localhost:3100 --input_csv addresses.csv --endpoint /v1/search --extra_params size=1 sources=osm,gn,wof --ignored_fields bbox geometry attribution timestamp via parsed_text gid id source_id --output_mode html > out.html```

Note that this is an interactive evaluation form for figuring out which queries improved and which got worse. Each result is assigned an id based on the md5 hash of the query params + delta, and scores are saved to local storage. in your web browser. This means if you're doing a lot of compares, where many of the diffs are the same between runs, you won't need to re-rank them.

## Usage

This tool might seem like it has a zillion options, but I promise, it's not that bad!

At it's core, you need to specify two servers (old and new), and an input configuration. There are a bunch of ways to do that.

## Configuration

All of the tools in this repo can load a configuration file that makes it easy to have saved defaults of servers to compare. A config file is specified via the environment variable COMPARE_CONFIG_FILE, wth the idea that you can have multiple configs (for different services, like an api server and a geocode server) and use shell aliases to wrap the config.

The config file is specified in [hjson](https://hjson.github.io/) which allows for comments and trailing commas.

An example config looks like this
```
{
  # this will be uppercased as the prefix to api key env variables
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
      protocol: 'https',
    }
    staging: {
      host: 'staging.api.com',
      protocol: 'https',
    },
    local: {
      host: 'localhost:8000',
      keyEnv: 'staging',
    },
    user: {
      takesArg: true,
      host: 'USER-staging.api.com'
      keyEnv: 'staging',
    },
  }
}
```

This defines a pretty common server setup. There is a production API at prod.api.com, that uses https (the default is http). It implicitly defines a "prod" key env in our config. There is a staging api at staging.api.com with a "staging" key env. Additionally, developers run local apis at localhost:8000, which use staging keys and should be communicated with over http (the default). Finally, each user has their own staging env at USER-staging.api.com which again uses staging keys.

Additionally, for this config, we would add some environment variables, optionally in a ~/.api-keys.env file loaded by dotenv to make our lives even easier. That file would look like

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
For compare, two servers must be specified, with --new.X and --old.X options. For the api tool, the server is specifed in the same way but without the "new/old." prefix.

Servers can be specified in two ways:

- by using host entries from our config file. So `--old.prod`, `--old.staging`, `--old.user blackmad` etc would all work based on our examples (similarly, `--new.staging`, `--new.prod`, etc)
- a combination of `--old.host` (required), `--old.protocol` (defaults to http), and `--old.key` (only if auth is needed). And similarly, `--new.host`, `--new.protocol` and `--new.key`

These can be mixed! 

### Reading queries

- `--input_params` - the input file has one query per line, of the form `param1=A%20B&param2=Z`. requires `--endpoint` argument. `--method` used, defaults to GET.
- `--input_queries` - the input file has one path + params per line, like `/endpoint?param1=A%20&p2=Z`. `--method` used, defaults to GET.
- `--input_csv` - for reading csvs. Combined with `--endpoint` and `--method`
  - Assumes that the first line of the file is column headings, unless `--key_map` is used with *all numeric keys*
  - Column headings are used as parameter names
  - `--key_map` remaps column headings. `--key_map query=text` remaps the csv heading "query" to the query param "text". `--key_map 0=text 1=near` will cause the parser to assume the csv does not have named column headings (because all the keys are numbers), and will use the first column as the query param "text", the second as the query param "near"

### other options
- `--concurrency` - how many queries to run at a time per host
- `--timeout` - per query timeout, defaults to 30s
- `--unchanged` - whether or not to output unchanged queries, defaults to false
- `--ignored_fields` - fields to leave out when computing differences from server responses

### output options
- `--color` - text mode only. whether or not to colorize the output. Defaults to true if sending to stdout, false if redirecting output. Use this option to force colorized output. Suggest always using it.
- `--output_mode` - json, html or text (console output)
- `--output_file` - defaults to stdout, where to output to
