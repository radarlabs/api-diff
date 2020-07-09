/* eslint-disable camelcase */
import * as fs from 'fs';
import * as _ from 'lodash';
import * as queryString from 'query-string';
import * as Bluebird from 'bluebird';
import * as chalk from 'chalk';
import * as parseCsvSync from 'csv-parse/lib/sync';
import * as jsondiffpatch from 'jsondiffpatch';
import { ApiEnv, argvToApiEnv } from '../apiEnv';
import runQuery from '../run-query';
import { failedExit } from '../cli-utils';
import { Change, ParsedArgs } from './change';
import { CompareFormatter } from './formatters/compare-formatter';
import { parseArgv, OLD_KEY, NEW_KEY } from './argv';
import getFormatter from './formatters/get-formatter';

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
}): Promise<Change> {
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

  return {
    params,
    delta,
    oldResponse,
    newResponse,
  };
}

/**
 * @param root0
 * @param root0.oldApiEnv
 * @param root0.newApiEnv
 * @param root0.queries
 * @param root0.argv
 * @param root0.formatter
 */
async function compareQueries({
  oldApiEnv,
  newApiEnv,
  queries,
  argv,
  formatter,
}: {
  oldApiEnv: ApiEnv;
  newApiEnv: ApiEnv;
  queries: string[];
  argv: ParsedArgs;
  formatter: CompareFormatter
}) {
  const oldResponseTimes: number[] = [];
  const newResponseTimes: number[] = [];

  await Bluebird.map(
    queries,
    async (query: string) => {
      formatter.queryRan();

      const change = await compareQuery({
        oldApiEnv,
        newApiEnv,
        query,
        argv,
      });
      if (change.delta || argv.unchanged) {
        formatter.logChange(change);
      }
      oldResponseTimes.push((change.oldResponse as any).duration);
      newResponseTimes.push((change.newResponse as any).duration);
    },
    { concurrency: argv.concurrency },
  );
  formatter.finished({ oldResponseTimes, newResponseTimes });
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

const formatter = getFormatter(argv.output_mode, {
  oldApiEnv, newApiEnv, argv, totalQueries: queries.length,
});

compareQueries({
  oldApiEnv,
  newApiEnv,
  queries,
  argv,
  formatter,
});
