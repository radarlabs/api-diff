# api-diff

This is a tool for comparing one json http server to another. It supports a wide variety of input formats as well as the ability to save a baseline run to compare against future runs.

This tool is probably most useful in scenarios involving search/ranking problems, where there are alogrithm and data changes over time that require manual evaluation of the wins and losses.

It also includes a script for talking to json http services with saved configurations.

## Output / Demo

### [text (console) output](https://radarlabs.github.io/api-diff/text-diff-as-html.html)

![start of text diff](https://radarlabs.github.io/api-diff/text-output-2.png)

### [html output](https://radarlabs.github.io/api-diff/diff.html)
![html diff](http://images.ctfassets.net/f2vbu16fzuly/2izT1q1tXM4UO5VmaLAcnB/f47165fe0bd1c3a01abca54d975b6938/Screen_Shot_2020-11-13_at_8.55.29_AM.png)

Note that this is an interactive evaluation form for figuring out which queries improved and which got worse. Each result is assigned an id based on the md5 hash of the query params + delta, and scores are saved to local storage. in your web browser. This means if you're doing a lot of compares, where many of the diffs are the same between runs, you won't need to re-rank them.

## tl;dr

### Try it out yourself!

This is a contrived example because our old and new servers are the same, but they return random data, so it is a good way to quickly see diffs.


From CSV input:
```
api-diff \                                 ✔ 
  --old.host http://names.drycodes.com/ \
  --new.host http://names.drycodes.com/ \
  --endpoint "/10" \
  --extra_params separator=" " nameOptions=starwarsCharacters \
  --input_csv docs/examples/input-names-drycodes.csv
```

From a file of http paths

```
api-diff \
  --old.host http://names.drycodes.com/ \
  --new.host http://names.drycodes.com/ \
  --input_queries docs/examples/input-names-drycodes.txt
```

### Compare two servers

```
api-diff \
  `# defaults to http, port 80` \
  --new.host localhost:3100 \
  --old.host localhost:4100 \
  `# csv input, use headings as query parameter keys` \
  --input_csv ~/RadarCode/geocode-acceptance-tests/input/addresses.csv \
  `# remap csv column "query" to query param "text"` \
  --key_map query=text \
  `# run against /v1/search on our hosts` \
  --endpoint /v1/search \
  `# extra options to append to every query` \
  --extra_params size=1 sources=oa,osm \
  `# ignore all fields named these things in computing our diff` \
  --ignored_fields bbox geometry attribution timestamp \
  `# filter down responses to the first entry in the "addresses" array \
  --response_filter '$.addresses[0]' \
  `# output an interactive html diff. other options are text and json` \
  --output_mode html \
  --output_file diffs.html
```

### Generate a baseline

```
 api-diff generate-baseline \
   `# the host to run against` \
   --old.host localhost:3100 \
   `# input csv file with headers corresponding to cgi params` \
   --input_csv ~/RadarCode/geocode-acceptance-tests/input/addresses.csv \
   `# remap the "query" header in our csv to the "text" cgi param` \
   --key_map query=text  \
   `# run queries against this endpoint` \
   --endpoint /v1/search \
   `# add extra query params to every query` \
   --extra_params size=1 sources=osm,oa \
   > addresses-baseline.json
```

### Compare against a baseline
```
 api-diff \
  --new.host https://pelias-staging.apicom.com \
  --input_json_baseline addresses-baseline.json \
  --ignored_fields bbox geometry attribution timestamp \ 
  --output_mode html \ 
  > diffs.html
```

### Use api tool with a [config file](#configuration)
```
# use config.hjson which defines staging & local envs
API_DIFF_CONFIG=config.hjson api-tool \
  --prod \
  --endpoint /geocode/forward \
  near="40.74,-74" \
  query="30 jay st"
```

### Use compare tool with a [config file](#configuration)
```
# use config.hjson which defines staging & local envs
API_DIFF_CONFIG=config.hjson api-diff
  --old.staging \
  --new.local \
  --input_csv ~/geocode-acceptance-tests/input/addresses.csv
```

This also works with a url because I've defined in my config file how auth works and where to find the keys, and what kinds of keys different hosts need

```
API_DIFF_CONFIG=config.hjson api-tool \
  "http://api.radar.io/v1/geocode/forward?query=30 jay st"
```

Because I've defined a "prod" entry in config.hjson, and put keys into .env, this command will execute wth the necessary authentication.

## Installation

```
npm install -g @radarlabs/api-diff
```

Note
1) This will be changing to @radarlabs/api-diff real soon now
2) to run any of the examples in this doc from this source tree, simply run `yarn --silent command` instead of `command`, so `yarn --silent api-diff` instead of `api-diff`

## Usage

This tool might seem like it has a zillion options, but I promise, it's not that bad!

At it's core, you need to specify two servers (old and new), and an input configuration. There are a bunch of ways to do that.

## Configuration

All of the tools in this repo can load a configuration file that makes it easy to have saved defaults of servers to compare. A config file is specified via the environment variable API_DIFF_CONFIG, wth the idea that you can have multiple configs (for different services, like an api server and a geocode server) and use shell aliases to wrap the config.

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
  #     Authorization header. If your server expects a header like "Bearer XXXXXXX",
  #     then set the api key to that entire string.
  authStyle: "header",

  # only required if using authStyle="param"
  # authParam: "api_key",

  # optional, if using authStyle="header"
  # authType: "Basic",

  # first keyType listed here will be the default if a
  # keyType is not specified in the commandline options to # compare
  keyTypes: ['test', 'live'],

  hosts: {
    prod: {
      host: 'https://prod.api.com',
      aliases: ['production'],
    }
    staging: {
      host: 'https://staging.api.com',
    },
    local: {
      host: 'http://localhost:8000',
      keyEnv: 'staging',
    },
    user: {
      takesArg: true,
      host: 'https://USER-staging.api.com'
      keyEnv: 'staging',
    },
  }
}
```

This defines a pretty common server setup. There is a production API at prod.api.com, that uses https (the default is http). It implicitly defines a "prod" key env in our config. There is a staging api at staging.api.com with a "staging" key env. Additionally, developers run local apis at localhost:8000, which use staging keys and should be communicated with over http (the default). Finally, each user has their own staging env at USER-staging.api.com which again uses staging keys.

### Authorization

api-diff looks in the shell environment for api keys if needed. It loads `~/.api-keys.env` into its env. For this config, that file would look like:

```
# keys are name + keyEnv + keyType + KEY
# all uppercase, joined with underscores
APICOM_PROD_TEST_KEY=XXXX
APICOM_PROD_LIVE_KEY=XXXX
APICOM_STAGING_TEST_KEY=XXXX
APICOM_STAGING_LIVE_KEY=XXXX
```

If your server requires authorization in request params, set authStyle="param" and authParam to the request parameter name the server expects. If your server uses the HTTP Authoization header, then set authStyle="header" and (optionally) authType to what auth type prefix the server expects, such as "Basic" or "Bearer" - this can be omitted if your server takes bare keys in the Authoization header.

Our config defines two types of keys - test and live. It also defines two key environments. One for "prod" and one for "staging," the host configs for "local" and "user" are both configured to look in the "staging" key env"

### Specifying a server
For compare, two servers must be specified, with --new.X and --old.X options. For the api tool, the server is specifed in the same way but without the "new/old." prefix.

Servers can be specified in two ways:

- by using host entries from our config file. So `--old.prod`, `--old.staging`, `--old.user blackmad` etc would all work based on our examples (similarly, `--new.staging`, `--new.prod`, etc)
- a combination of `--old.host` (required), `--old.key` (only if auth is needed). And similarly, `--new.host`, and `--new.key`

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
