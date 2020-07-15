#!/usr/bin/env node

/**
 * Generate baseline json to be used in future compare runs.
 *
 * This file is mostly a copy of compare.ts, which I don't love.
 * compare.ts is designed to work by comparing two servers, this
 * script only runs against one server and saves the output to a json file.
 *
 * Adding more clauses to compare.ts seemed ugly, but I will probably
 * attempt it at some point
 */
/* eslint-disable camelcase */
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
  const oldResponse = await runQuery(oldApiEnv, query, argv.timeout);

  return {
    query,
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
  const oldStatusCodes: Record<number, number> = {};

  await Bluebird.map(
    queries,
    async (query: Query) => {
      const change = await runOneQuery({
        oldApiEnv,
        query,
        argv,
      });
      formatter.queryCompleted(change);
      oldResponseTimes.push((change.oldResponse as any).duration);

      if (!oldStatusCodes[change.oldResponse.status]) {
        oldStatusCodes[change.oldResponse.status] = 0;
      }

      oldStatusCodes[change.oldResponse.status] += 1;
    },
    { concurrency: argv.concurrency },
  );
  formatter.finished({
    old: {
      responseTimes: oldResponseTimes,
      statusCodes: oldStatusCodes,
    },
  });
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
