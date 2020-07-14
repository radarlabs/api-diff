/* eslint-disable camelcase */
import * as queryString from 'query-string';
import * as Bluebird from 'bluebird';

import * as jsondiffpatch from 'jsondiffpatch';
import { AxiosResponse } from 'axios';
import { ApiEnv, argvToApiEnv } from '../apiEnv';
import runQuery from '../run-query';
import { Change } from './change';
import { CompareFormatter } from './formatters/compare-formatter';
import {
  parseArgv, OLD_KEY, NEW_KEY, ParsedArgs,
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
async function compareQuery({
  oldApiEnv,
  newApiEnv,
  query,
  argv,
}: {
  oldApiEnv: ApiEnv;
  newApiEnv: ApiEnv;
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

  // if the query has a baseline response (running from a golden json file), use that
  // otherwise run it against the old server
  const oldResponse = query.baselineResponse
    ? ({ data: query.baselineResponse } as AxiosResponse<any>)
    : await runQuery(oldApiEnv, queryWithExtraParams);
  const newResponse = await runQuery(newApiEnv, queryWithExtraParams);

  const differ = jsondiffpatch.create({
    propertyFilter(name, _context) {
      return !(argv.ignored_fields || []).includes(name);
    },
  });

  const delta = differ.diff(oldResponse.data, newResponse.data);

  return {
    query: queryWithExtraParams,
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
  queries: Query[];
  argv: ParsedArgs;
  formatter: CompareFormatter;
}) {
  const oldResponseTimes: number[] = [];
  const newResponseTimes: number[] = [];

  await Bluebird.map(
    queries,
    async (query: Query) => {
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
