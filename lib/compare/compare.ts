/* eslint-disable camelcase */
import * as queryString from 'query-string';
import * as Bluebird from 'bluebird';

import * as jsondiffpatch from 'jsondiffpatch';
import { ApiEnv, argvToApiEnv } from '../apiEnv';
import runQuery from '../run-query';
import { Change } from './change';
import { CompareFormatter } from './formatters/compare-formatter';
import {
  parseArgv, OLD_KEY, NEW_KEY, ParsedArgs,
} from './argv';
import getFormatter from './formatters/get-formatter';
import QueryReader from './query-reader';

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
  formatter: CompareFormatter;
}) {
  const oldResponseTimes: number[] = [];
  const newResponseTimes: number[] = [];

  await Bluebird.map(
    queries,
    async (query: string) => {
      const change = await compareQuery({
        oldApiEnv,
        newApiEnv,
        query,
        argv,
      });
      formatter.queryRan();
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

const argv = parseArgv([OLD_KEY, NEW_KEY]) as ParsedArgs;

const oldApiEnv = argvToApiEnv(argv[OLD_KEY]);
const newApiEnv = argvToApiEnv(argv[NEW_KEY]);

const queries = QueryReader(argv);

const formatter = getFormatter(argv.output_mode, {
  oldApiEnv,
  newApiEnv,
  argv,
  totalQueries: queries.length,
});

compareQueries({
  oldApiEnv,
  newApiEnv,
  queries,
  argv,
  formatter,
});
