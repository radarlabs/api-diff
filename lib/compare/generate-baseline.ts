/* eslint-disable camelcase */
import * as queryString from 'query-string';
import * as Bluebird from 'bluebird';

import { ApiEnv, argvToApiEnv } from '../apiEnv';
import runQuery from '../run-query';
import { Change } from './change';
import { CompareFormatter } from './formatters/compare-formatter';
import {
  parseArgv, OLD_KEY, ParsedArgs,
} from './argv';
import getFormatter from './formatters/get-formatter';
import QueryReader from './query-reader';
import { Query } from './query';

/**
 * @param root0
 * @param root0.oldApiEnv
 * @param root0.newApiEnv
 * @param root0.query
 * @param root0.argv
 */
async function runOneQuery({
  oldApiEnv,
  query,
  argv,
}: {
  oldApiEnv: ApiEnv;
  query: Query;
  argv: ParsedArgs;
}): Promise<Change> {
  const extraParams = queryString.parse(`${argv.extra_params}`) as Record<string, string>;
  delete extraParams.undefined;
  const params = { ...query.params, ...extraParams };
  const queryWithExtraParams = {
    endpoint: query.endpoint,
    method: query.method,
    params,
  };

  const oldResponse = await runQuery(oldApiEnv, queryWithExtraParams, argv.timeout);

  return {
    query: queryWithExtraParams,
    delta: undefined,
    oldResponse,
    newResponse: undefined,
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
async function runQueries({
  oldApiEnv,
  queries,
  argv,
  formatter,
}: {
  oldApiEnv: ApiEnv;
  queries: Query[];
  argv: ParsedArgs;
  formatter: CompareFormatter
}) {
  const oldResponseTimes: number[] = [];

  await Bluebird.map(
    queries,
    async (query: Query) => {
      const change = await runOneQuery({
        oldApiEnv,
        query,
        argv,
      });
      formatter.queryRan();
      formatter.logChange(change);
      oldResponseTimes.push((change.oldResponse as any).duration);
    },
    { concurrency: argv.concurrency },
  );
  formatter.finished({ oldResponseTimes, newResponseTimes: undefined });
}

const argv = parseArgv([OLD_KEY]) as ParsedArgs;

const oldApiEnv = argvToApiEnv(argv[OLD_KEY]);

const queries = QueryReader(argv);

const formatter = getFormatter('json', {
  oldApiEnv,
  newApiEnv: undefined,
  argv,
  totalQueries: queries.length,
});

runQueries({
  oldApiEnv,
  queries,
  argv,
  formatter,
});
