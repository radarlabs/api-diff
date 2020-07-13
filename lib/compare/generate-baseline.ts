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

  return {
    params,
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
  queries: string[];
  argv: ParsedArgs;
  formatter: CompareFormatter
}) {
  const oldResponseTimes: number[] = [];

  await Bluebird.map(
    queries,
    async (query: string) => {
      formatter.queryRan();

      const change = await runOneQuery({
        oldApiEnv,
        query,
        argv,
      });
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
