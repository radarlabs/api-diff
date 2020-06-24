import * as fs from "fs";
import * as _ from "lodash";
import * as queryString from "query-string";
import * as Bluebird from "bluebird";
import { getApiEnvCommandLineOptions, ApiEnv, argvToApiEnv } from "./apiEnv";
import { runQuery } from "./run-query";

const c = require("ansi-colors");
const parseCsvSync = require("csv-parse/lib/sync");

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
    description: "turns on/off colorized output, defaults to true for stdin, false for redirected output"
  },
  concurrency: {
    type: "number",
    description: "query concurrency",
    default: 10,
  }
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
  _.forEach(getApiEnvCommandLineOptions(), (val, key) => {
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
    default: [],
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
  
There are other ways to configure old and new, look in the help for more. These options are the same as to ./run.sh api, just with new & old prepended
  `);

  return yargs.argv;
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

  const outputLines = `${JSON.stringify(params)}
  ./api.sh --keyEnv ${oldApiEnv.keyEnv} ${oldResponse.url}
  ./api.sh api --keyEnv ${newApiEnv.keyEnv} ${newResponse.url}`;
  
  if (!delta) {
    if (argv.unchanged) {
      console.log(c.cyan(`Unchanged: ${outputLines}`));
    }
    return { didChange: false };
  }

  console.log(c.yellow(`Changed: ${outputLines}`));
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

  await Bluebird.map(
    queries,
    async (query: string) => {
      if (numQueriesRun % 10 === 0) {
        console.log(`IN PROGRESS. ${numQueriesRun}/${queries.length} run`);
      }
      numQueriesRun += 1;
      const { didChange } = await compareQuery({ oldApiEnv, newApiEnv, query });
      if (didChange) {
        numQueriesChanged += 1;
      }
    },
    { concurrency: argv.concurrency }
  );
  console.log(`DONE. ${numQueriesChanged}/${numQueriesRun} changed`);
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
