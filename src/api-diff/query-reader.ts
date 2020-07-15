/* eslint-disable no-console */
/* eslint-disable camelcase */

import * as queryString from 'query-string';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as chalk from 'chalk';
import parseCsvSync from 'csv-parse/lib/sync';
import { failedExit } from '../cli-utils';
import { ParsedArgs } from './argv';
import { JsonChange } from './formatters/json-formatter';
import { Query } from './query';

type QueryReaderArgs = Pick<ParsedArgs, 'method' | 'input_json_baseline' | 'input_queries' | 'endpoint' | 'input_params' | 'input_csv' | 'key_map' | 'extra_params'>

/**
 * Core query reader logic. Parses argv for input files, and transforms them into Query objects.
 *
 * @param {QueryReaderArgs} argv input args for query reader
 * @returns {Query[]} list of queries read
 */
function readQueriesHelper(argv: QueryReaderArgs): Query[] {
  const hasInputFile = argv.input_params || argv.input_csv;
  if ((argv.endpoint && !hasInputFile) || (!argv.endpoint && hasInputFile)) {
    console.error(
      chalk.red(
        'Must specify both --endpoint and (--input_params or --input_csv) , perhaps you wanted --input_queries?',
      ),
    );
  }

  /**
   * Convert a /path?params=X string to a Query
   *
   * @param {string} line /path?params=X string
   * @returns {Query} parsed query
   */
  function lineToQuery(line: string): Query {
    const [endpoint, paramString] = line.split('?');
    return {
      endpoint,
      params: queryString.parse(paramString) as Record<string, string>,
      method: argv.method,
    };
  }

  if (argv.input_json_baseline) {
    return _.flatMap(argv.input_json_baseline, ((file) => {
      const contents = fs.readFileSync(file).toString();
      const json = JSON.parse(contents);
      return json.changes.map((change: JsonChange): Query => ({
        ...change.query,
        baselineResponse: change.old.response,
      }));
    }));
  } if (argv.endpoint && argv.input_params) {
    const { endpoint } = argv;
    return _.flatMap(argv.input_params, (input_param_file: string) => fs
      .readFileSync(input_param_file)
      .toString()
      .split('\n')
      .filter((line) => !!line)
      .map((line) => `${endpoint}?${line}`))
      .map(lineToQuery);
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

      // if the key mapping is all from numbers, assume the user is trying
      // to tell us that the input csv doesn't have named headers
      const hasNumericKeyMap = _.keys(keyMap).length > 0 && _.every(_.keys(keyMap), (k) => /^\d+$/.test(k));

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

        return {
          endpoint,
          method: argv.method,
          params: modifiedRecord,
        };
      });
    });
  }
  if (argv.input_queries) {
    return _.flatMap(argv.input_queries, (input_queries_file: string) => fs
      .readFileSync(input_queries_file)
      .toString()
      .split('\n')
      .filter((line) => !!line))
      .map(lineToQuery);
  }

  return [];
}

/**
 * Wraps query reader logic - exits if no queries found for any reason
 *
 * @param {QueryReaderArgs} argv QueryReaderArgs
 * @returns {Query[]} list of parsed queries
 */
export default function readQueries(argv: QueryReaderArgs): Query[] {
  const queries = readQueriesHelper(argv);

  if (!queries || queries.length === 0) {
    failedExit(
      'No queries found, did you specify one of: --input_params, --input_csv, --input_queries?',
    );
  }

  const extraParams = queryString.parse(argv.extra_params.join('&')) as Record<string, string>;
  queries.forEach((query) => {
    // eslint-disable-next-line no-param-reassign
    query.params = { ...query.params, ...extraParams };
  });

  return queries;
}
