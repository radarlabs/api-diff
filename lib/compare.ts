/* eslint-disable no-console */
/* eslint-disable camelcase */
import * as fs from 'fs';
import * as _ from 'lodash';
import * as queryString from 'query-string';
import * as Bluebird from 'bluebird';
import * as chalk from 'chalk';
import * as parseCsvSync from 'csv-parse/lib/sync';
import * as jsondiffpatch from 'jsondiffpatch';
import { getApiEnvCommandLineOptions, ApiEnv, argvToApiEnv } from './apiEnv';
import runQuery from './run-query';
import { globalCommandLineOptions, failedExit } from './cli-utils';
import { Change } from './compare-types';

const OLD_KEY = 'old';
const NEW_KEY = 'new';

type OutputMode = 'html' | 'text';

type ParsedArgs = {
  input_params?: string;
  input_csv?: string;
  input_queries?: string;
  endpoint: string;
  extra_params: string;
  method: string;
  ignored_fields: string[];
  concurrency: number;
  unchanged: boolean;
  key_map: string[];
  output_mode: OutputMode;
};

/**
 *
 */
function parseArgv() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const yargs = require('yargs').strict();

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

  yargs.option('input_params', {
    type: 'array',
    description: 'A file containing url encoded query params, requires --endpoint',
  });

  yargs.option('extra_params', {
    type: 'string',
    description:
      'Extra static parameters that will be added to each query, maybe something like limit=2 to make diffs less noisy',
  });

  yargs.option('input_csv', {
    type: 'array',
    description: 'A file containingquery params in a csv, first line is , requires --endpoint',
  });

  yargs.option('endpoint', {
    description: 'Endpoint to query using query param strings from --input_params',
  });

  yargs.option('input_queries', {
    description: 'A file containing endpoints + queries, one per line',
  });

  yargs.option('ignored_fields', {
    type: 'array',
    default: [],
    description:
      'field names to ignore when diffing responses. geometry latitude longitude are common for geocode compare runs',
  });

  yargs.option('concurrency', {
    type: 'number',
    default: 10,
    description: 'concurrency of api queries per host to run',
  });

  yargs.option('unchanged', {
    type: 'boolean',
    default: false,
    description: 'whether or not to print all queries, even unchanged ones',
  });

  yargs.option('key_map', {
    type: 'array',
    default: [],
    description:
      'a mapping of csv columns to parameter names in the format csv_header1=param1 csv_header2=param2, if all numbers, are assumed to be csv column numbers',
  });

  yargs.option('output_mode', {
    choices: ['html', 'text'],
    description: 'what kind of output to generate',
  });

  yargs.group(['input_params', 'endpoint', 'input_queries', 'input_csv'], 'Query options:');
  yargs.group(oldParams, 'Options for "old" server to compare:');
  yargs.group(newParams, 'Options for "new" server to compare:');
  yargs.implies('input_csv', 'endpoint');
  yargs.implies('input_params', 'endpoint');

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

/**
 * @param argv
 */
function generateQueries(argv: ParsedArgs) {
  const hasInputFile = argv.input_params || argv.input_csv;
  if ((argv.endpoint && !hasInputFile) || (!argv.endpoint && hasInputFile)) {
    console.error(
      chalk.red(
        'Must specify both --endpoint and (--input_params or --input_csv) , perhaps you wanted --input_queries?',
      ),
    );
  }

  if (argv.endpoint && argv.input_params) {
    const { endpoint } = argv;
    return _.flatMap(argv.input_params, (input_param_file: string) => fs
      .readFileSync(input_param_file)
      .toString()
      .split('\n')
      .filter((line) => !!line)
      .map((line) => `${endpoint}?${line}`));
  }
  if (argv.endpoint && argv.input_csv) {
    const { endpoint } = argv;
    return _.flatMap(argv.input_csv, (input_csv_file: string) => {
      const fileLines = fs.readFileSync(input_csv_file).toString();

      const keyMap: Record<string, string> = {};

      argv.key_map.forEach((str: string) => {
        const parts = str.split('=');
        if (parts.length !== 2) {
          failedExit(`invalid keymap ${str}, must be of form csv_column_name=param_name`);
        }
        const [csvHeader, paramName] = parts;
        keyMap[csvHeader] = paramName;
      });
      const hasNumericKeyMap = _.every(_.keys(keyMap), (k) => /^\d+$/.test(k));

      const records = parseCsvSync(fileLines, {
        columns: !hasNumericKeyMap,
        skip_empty_lines: true,
      });

      return records.map((record) => {
        const modifiedRecord = record;

        delete modifiedRecord[''];

        _.forEach(keyMap, (paramName, csvHeader) => {
          if (!_.includes(_.keys(modifiedRecord), csvHeader)) {
            failedExit(
              `CSV input is missing specified header ${csvHeader}, sample row: ${JSON.stringify(
                record,
              )}`,
            );
          }
          modifiedRecord[paramName] = modifiedRecord[csvHeader];
          delete modifiedRecord[csvHeader];
        });

        return `${endpoint}?${queryString.stringify(modifiedRecord)}`;
      });
    });
  }
  if (argv.input_queries) {
    return _.flatMap(argv.input_queries, (input_queries_file: string) => fs
      .readFileSync(input_queries_file)
      .toString()
      .split('\n')
      .filter((line) => !!line));
  }

  return [];
}

/**
 * @param root0
 * @param root0.oldApiEnv
 * @param root0.newApiEnv
 * @param root0.query
 * @param root0.argv
 */
async function compareQuery({
  oldApiEnv,
  newApiEnv,
  query,
  argv,
}: {
  oldApiEnv: ApiEnv;
  newApiEnv: ApiEnv;
  query: string;
  argv: ParsedArgs;
}): Promise<Change | undefined> {
  const [endpoint, paramsString] = query.split('?');
  const params = queryString.parse(`${paramsString}&${argv.extra_params}`);
  delete params.undefined;
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

  const differ = jsondiffpatch.create({
    propertyFilter(name, _context) {
      return !['buildInfo', 'debug', ...(argv.ignored_fields || [])].includes(name);
    },
  });

  const delta = differ.diff(oldResponse.data, newResponse.data);

  if (!delta && !argv.unchanged) {
    return undefined;
  }

  return {
    params,
    delta,
    oldResponse,
    newResponse,
  };
}

const changes: Change[] = [];
/**
 * @param change
 */
function outputChangeHtml(change: Change) {
  changes.push(change);
}

/**
 * @param oldApiEnv
 * @param newApiEnv

 * @param change
 */
function outputChangeText(oldApiEnv: ApiEnv, newApiEnv: ApiEnv, change: Change) {
  const apiEnvToApiSh = (apiEnv: ApiEnv): string => {
    if (apiEnv.keyEnv) {
      return `./api.sh --keyEnv ${apiEnv.keyEnv}`;
    }
    return './api.sh';
  };
  const outputLines = `${JSON.stringify(change.params)}
  ${apiEnvToApiSh(oldApiEnv)} ${change.oldResponse.request.res.responseUrl}
  ${apiEnvToApiSh(newApiEnv)} ${change.newResponse.request.res.responseUrl}`;

  if (!change.delta) {
    console.log(chalk.cyan(`Unchanged: ${outputLines}`));
  } else {
    console.log(chalk.yellow(`Changed: ${outputLines}`));
  }

  (jsondiffpatch.console as any).log(change.delta);
}

/**
 * @param output_mode
 * @param oldApiEnv
 * @param newApiEnv
 * @param change
 */
function outputChange(
  output_mode: OutputMode,
  oldApiEnv: ApiEnv,
  newApiEnv: ApiEnv,
  change: Change,
) {
  if (output_mode === 'html') {
    outputChangeHtml(change);
  } else {
    outputChangeText(oldApiEnv, newApiEnv, change);
  }
}

/**
 * @param root0
 * @param root0.oldApiEnv
 * @param root0.newApiEnv
 * @param root0.queries
 * @param root0.argv
 */
async function compareQueries({
  oldApiEnv,
  newApiEnv,
  queries,
  argv,
}: {
  oldApiEnv: ApiEnv;
  newApiEnv: ApiEnv;
  queries: string[];
  argv: ParsedArgs;
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
      const change = await compareQuery({
        oldApiEnv,
        newApiEnv,
        query,
        argv,
      });
      if (change) {
        numQueriesChanged += 1;
      }
      outputChange(argv.output_mode, oldApiEnv, newApiEnv, change);
    },
    { concurrency: argv.concurrency },
  );
  console.log(`DONE. ${numQueriesChanged}/${numQueriesRun} changed`);
}

const argv = parseArgv() as ParsedArgs;

const oldApiEnv = argvToApiEnv(argv[OLD_KEY]);
const newApiEnv = argvToApiEnv(argv[NEW_KEY]);

const queries = generateQueries(argv);

if (!queries || queries.length === 0) {
  failedExit(
    'No queries found, did you specify one of: --input_params, --input_csv, --input_queries?',
  );
}

compareQueries({
  oldApiEnv,
  newApiEnv,
  queries,
  argv,
});
