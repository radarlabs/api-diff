import axios from "axios";
import * as fs from "fs";
import * as _ from "lodash";
import * as queryString from "query-string";
import * as Bluebird from "bluebird";

const c = require("ansi-colors");
const parseCsvSync = require("csv-parse/lib/sync");

export type Change = {
  quality: "good" | "bad" | "neutral";
  name: string;
};

const good = (name: string): Change => {
  return { quality: "good", name };
};
const bad = (name: string): Change => {
  return { quality: "bad", name };
};

const OLD_KEY = "old";
const NEW_KEY = "new";

export const globalCommandLineOptions = {
  method: {
    choices: ["GET", "POST", "PUT"],
    default: "GET",
    description: "what http method to use",
  },
  color: {
    type: "boolean",
    default: true,
    description: "turns on/off colorized output"
  }
};

export const apiEnvCommandLineOptions: Record<string, any> = {
  host: {
    type: "string",
    description: "Host/port",
    // required: true,
  },
  protocol: {
    choices: ["http", "https"],
    default: "http",
    description:
      "What protocol to use (if not specified in url), defaults to http for local, https otherwise",
  },
  // key: {
  //   type: 'string',
  //   description: `Authorization key, if not specified will try to find one in the env, in ${ENV_FILENAME} or, in local mode, directly in mongo`,
  // }
};

function parseArgv() {
  const yargs = require("yargs").strict();

  _.forEach(globalCommandLineOptions, (val, key) => {
    yargs.option(key, val);
  });

  yargs.option(OLD_KEY);
  yargs.hide(OLD_KEY);
  yargs.option(NEW_KEY);
  yargs.hide(NEW_KEY);

  const oldParams = [];
  const newParams = [];
  _.forEach(apiEnvCommandLineOptions, (val, key) => {
    yargs.option(`${OLD_KEY}.${key}`, {
      ...val,
      alias: val.alias ? `${OLD_KEY}.${val.alias}` : null,
    });
    oldParams.push(`${OLD_KEY}.${key}`);
    yargs.option(`${NEW_KEY}.${key}`, {
      ...val,
      alias: val.alias ? `${NEW_KEY}.${val.alias}` : null,
    });
    newParams.push(`${NEW_KEY}.${key}`);
    // if (val.required) {
    //   yargs.required(`${OLD_KEY}.${key}`);
    //   yargs.required(`${NEW_KEY}.${key}`);
    // }
  });

  yargs.option("input_params", {
    type: "array",
    description: "A file containing url encoded query params, requires --endpoint",
  });

  yargs.option("extra_params", {
    type: "string",
    description: "Extra static parameters that will be added to each query, maybe something like limit=2 to make diffs less noisy",
  });

  yargs.option("input_csv", {
    type: "array",
    description: "A file containingquery params in a csv, first line is , requires --endpoint",
  });

  yargs.option("endpoint", {
    description: "Endpoint to query using query param strings from --input_params",
  });

  yargs.option("input_queries", {
    description: "A file containing endpoints + queries, one per line",
  });

  yargs.option("ignored_fields", {
    type: "array",
    description:
      "field names to ignore when diffing responses. geometry latitude longitude are common for geocode compare runs",
  });

  yargs.group(["input_params", "endpoint", "input_queries", "input_csv"], "Query options:");
  yargs.group(oldParams, 'Options for "old" server to compare:');
  yargs.group(newParams, 'Options for "new" server to compare:');
  yargs.implies("input_csv", "endpoint");
  yargs.implies("input_params", "endpoint");

  yargs.usage(`This tool takes in a set of queries to compare against two radar api servers. 
It has a bunch of options, here are some examples:

./run.sh compare --old.prod --new.local --endpoint /search/autocomplete --input_params input.txt
   Compares /search/autocomplete on prod vs local, using query string in input.txt

./run.sh compare --old.prod --new.local --new.key_env=staging --endpoint /search/autocomplete --input_params input.txt
    Same, but looks for a staging key in the env var STAGING_TEST_RADAR_API_KEY in the env or in 
  
./run.sh compare --old.prod --new.me --new.key_env=staging --input_queries input.txt
   Runs queries.txt against prod & api-MY_USERNAME-staging.radar.io. queries.txt is expected to be a file that contains lines with path + query like /endpoint/path?p1=a&p2=b

There are other ways to configure old and new, look in the help for more. These options are the same as to ./run.sh api, just with new & old prepended
  `);

  return yargs.argv;
}

export interface ApiEnv {
  protocol: string;
  host: string;
}

export function argvToApiEnv(argv: any): ApiEnv {
  const apiEnv: Partial<ApiEnv> = _.clone(argv);

  if (argv.host.startsWith("http")) {
    const url = new URL(argv.host);
    argv.host = url.host;
    argv.protocol = url.protocol;
  }

  if (!apiEnv.protocol) {
    if (apiEnv.host.includes("localhost") || apiEnv.host.includes("127.0.0.1")) {
      apiEnv.protocol = "http";
    } else {
      apiEnv.protocol = "https";
    }
  }

  return apiEnv as ApiEnv;
}

const generateQueries = () => {
  const hasInputFile = argv.input_params || argv.input_csv;
  if ((argv.endpoint && !hasInputFile) || (!argv.endpoint && hasInputFile)) {
    console.error(
      c.red(
        "Must specify both --endpoint and (--input_params or --input_csv) , perhaps you wanted --input_queries?"
      )
    );
  }

  if (argv.endpoint && argv.input_params) {
    const endpoint = argv.endpoint;
    return _.flatMap(argv.input_params, (input_param_file: string) =>
      fs
        .readFileSync(input_param_file)
        .toString()
        .split("\n")
        .filter((line) => !!line)
        .map((line) => `${endpoint}?${line}`)
    );
  } else if (argv.endpoint && argv.input_csv) {
    const endpoint = argv.endpoint;
    return _.flatMap(argv.input_csv, (input_csv_file: string) => {
      const fileLines = fs.readFileSync(input_csv_file).toString();

      const records = parseCsvSync(fileLines, {
        columns: true,
        skip_empty_lines: true,
      });

      return records.map((record) => {
        delete record[""];
        return `${endpoint}?${queryString.stringify(record)}`;
      });
    });
  } else if (argv.input_queries) {
    return _.flatMap(argv.input_queries, (input_queries_file: string) => {
      return fs
        .readFileSync(input_queries_file)
        .toString()
        .split("\n")
        .filter((line) => !!line);
    });
  }
};

export async function runQuery(
  apiEnv: ApiEnv,
  {
    params,
    endpoint,
    method,
    verbose,
  }: {
    params: Record<string, any>;
    method: string;
    endpoint: string;
    verbose?: boolean;
  }
) {
  const log = (...args) => {
    if (verbose) {
      console.error.apply(this, args);
    }
  };

  // v1/xxxx ... maybe someone was lazy and didn't start with an opening slash
  if (endpoint[0] !== "/" && !endpoint.startsWith("http:")) {
    endpoint = `/${endpoint}`;
  }

  // someone was lazy and didn't specify /v1
  if (!endpoint.startsWith("/v1")) {
    endpoint = `/v1${endpoint}`;
  }

  let url = "";

  // /xxx/api.... so we need to add host
  if (endpoint[0] === "/") {
    url = apiEnv.host + endpoint;
  }

  // don't yet have a protocol in the url
  if (!url.startsWith("http:")) {
    url = `${apiEnv.protocol}://${url}`;
  }

  log(`Fetching ${url}`);

  const headers = {
    "User-Agent": "radar-compare-tool/unknown",
  };

  try {
    const response = await axios(url, {
      headers,
      params: method === "GET" ? params : undefined,
      data: method === "POST" ? params : undefined,
      method: method.toLowerCase() as any,
    });
    return response;
  } catch (e) {
    console.error(e.response.request.href);
    console.error(`Request failed: ${e.response.status}`);
    console.error(e.response.body);
    return e.response;
  }
}

async function compareQuery({
  oldApiEnv,
  newApiEnv,
  query,
}: {
  oldApiEnv: ApiEnv;
  newApiEnv: ApiEnv;
  query: string;
}) {
  const [endpoint, paramsString] = query.split("?");
  const params = queryString.parse(paramsString + '&' + argv.extra_params);
  const oldResponse = await runQuery(oldApiEnv, {
    endpoint,
    params,
    method: argv.method,
  });
  const newResponse = await runQuery(newApiEnv, {
    endpoint,
    params,
    method: argv.method,
  });

  var differ = jsondiffpatch.create({
    propertyFilter: function (name, _context) {
      return !["buildInfo", "debug", ...(argv.ignored_fields || [])].includes(name);
    },
  });

  const delta = differ.diff(oldResponse.data, newResponse.data);
  if (!delta) {
    return { didChange: false };
  }

  console.log(`Changed: ${JSON.stringify(params)}
old: ${oldResponse.request.res.responseUrl}
new: ${newResponse.request.res.responseUrl}`);
  jsondiffpatch.console.log(delta);

  return { didChange: true, specificChange: undefined };
}

async function compareQueries({
  oldApiEnv,
  newApiEnv,
  queries,
}: {
  oldApiEnv: ApiEnv;
  newApiEnv: ApiEnv;
  queries: string[];
}) {
  let numQueriesRun = 0;
  let numQueriesChanged = 0;

  const changeBuckets: Record<string, number> = {};

  await Bluebird.map(
    queries,
    async (query: string) => {
      if (numQueriesRun % 10 === 0) {
        console.log(`IN PROGRESS. ${numQueriesRun}/${queries.length} run`);
      }
      numQueriesRun += 1;
      const { didChange, specificChange } = await compareQuery({ oldApiEnv, newApiEnv, query });
      if (didChange) {
        numQueriesChanged += 1;
      }
      if (specificChange) {
        const key = JSON.stringify(specificChange);
        if (!changeBuckets[key]) {
          changeBuckets[key] = 1;
        } else {
          changeBuckets[key] += 1;
        }
      }
    },
    { concurrency: 10 }
  );
  console.log(`DONE. ${numQueriesChanged}/${numQueriesRun} changed`);

  _.forEach(changeBuckets, (val: number, key: string) => {
    const change: Change = JSON.parse(key);
    const outputString = `${val}/${numQueriesChanged} changes = ${change.name}`;
    if (change.quality === "good") {
      console.log(c.green(outputString));
    }
    if (change.quality === "bad") {
      console.log(c.red(outputString));
    }
    if (change.quality === "neutral") {
      console.log(c.yellow(outputString));
    }
  });
}

const argv = parseArgv();

const jsondiffpatch = require("jsondiffpatch");

const oldApiEnv = argvToApiEnv(argv[OLD_KEY]);
const newApiEnv = argvToApiEnv(argv[NEW_KEY]);

const queries = generateQueries();

if (!queries || queries.length === 0) {
  console.error(c.red("No queries found"));
}

compareQueries({
  oldApiEnv,
  newApiEnv,
  queries,
});
