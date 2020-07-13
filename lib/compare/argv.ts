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
 * @param envs
 * @returns {ParsedArgs} parsed commandline args
 */
export function parseArgv(envs: string[]): ParsedArgs {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const yargs = require('yargs').strict();

  _.forEach(globalCommandLineOptions, (val, key) => {
    yargs.option(key, val);
  });

  // env is "old" + "new" in compare, and just "old" in generate-baseline
  envs.forEach((env) => {
    // this is a workaround for yargs
    yargs.option(env);
    yargs.hide(env);

    const envParams = [];
    _.forEach(getApiEnvCommandLineOptions(), (val, key) => {
      const envKey = `${env}.${key}`;
      yargs.option(envKey, {
        ...val,
        alias: val.alias ? `${env}.${val.alias}` : null,
      });
      envParams.push(envKey);
    });

    yargs.group(envParams, `Configuration for "${env}" server:`);
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

  yargs.option('output_file', {
    alias: 'o',
    description: 'output file, if unspecified or -, output to stdout',
  });

  yargs.group(['input_params', 'endpoint', 'input_queries', 'input_csv'], 'Query options:');
  yargs.implies('input_csv', 'endpoint');
  yargs.implies('input_params', 'endpoint');

  yargs.usage('REWRITE ME');

  return yargs.argv;
}
