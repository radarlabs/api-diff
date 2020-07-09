/* eslint-disable camelcase */
import * as _ from 'lodash';
import { getApiEnvCommandLineOptions } from '../apiEnv';
import { globalCommandLineOptions } from '../cli-utils';

export type OutputMode = 'html' | 'text' | 'json';

export type ParsedArgs = {
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
  output_file: string;
};

export const OLD_KEY = 'old';
export const NEW_KEY = 'new';

/**
 *
 */
export function parseArgv() {
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
    choices: ['html', 'text', 'json'],
    default: 'text',
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
