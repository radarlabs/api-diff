/* eslint-disable no-console */
/* eslint-disable camelcase */

import * as queryString from 'query-string';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as chalk from 'chalk';
import parseCsvSync from 'csv-parse/lib/sync';
import { failedExit } from '../cli-utils';
import { ParsedArgs } from './argv';

type QueryReaderArgs = Pick<ParsedArgs, 'input_queries' | 'endpoint' | 'input_params' | 'input_csv' | 'key_map'>

/**
 * @param argv
 */
function readQueriesHelper(argv: QueryReaderArgs): string[] {
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
 * @param argv
 */
function readQueries(argv: QueryReaderArgs): string[] {
  const queries = readQueriesHelper(argv);

  if (!queries || queries.length === 0) {
    failedExit(
      'No queries found, did you specify one of: --input_params, --input_csv, --input_queries?',
    );
  }

  return queries;
}

export = readQueries;
