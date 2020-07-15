#!/usr/bin/env node

/* eslint-disable camelcase */
import * as Bluebird from 'bluebird';

import * as jsondiffpatch from 'jsondiffpatch';
import { AxiosResponse } from 'axios';
import { ApiEnv, argvToApiEnv } from '../apiEnv';
import runQuery, { AxiosResponseWithDuration } from '../run-query';
import { Change } from './change';
import { CompareFormatter } from './formatters/compare-formatter';
import {
  parseArgv, OLD_KEY, NEW_KEY, ParsedArgs,
} from './argv';
import getFormatter from './formatters/get-formatter';
import QueryReader from './query-reader';
import { Query } from './query';

type CompareArgs = Pick<ParsedArgs, 'concurrency' | 'ignored_fields' | 'extra_params' | 'timeout'>;

/**
 * Compare one query against two ApiEnvs, returning a Change object
 *
 * @param {ApiEnv} oldApiEnv old env to run query against
 * @param {ApiEnv} newApiEnv new env to run query against
 * @param {Query} query query to compare
 * @param {CompareArgs} argv global command line args that affect running queries
 * @returns {Promise<Change>} output of running query against both envs
 */
async function compareQuery({
  oldApiEnv,
  newApiEnv,
  query,
  argv,
}: {
  oldApiEnv: ApiEnv;
  newApiEnv?: ApiEnv;
  query: Query;
  argv: CompareArgs;
}): Promise<Change> {
  // if the query has a baseline response (running from a golden json file), use that
  // otherwise run it against the old server
  const oldResponse = query.baselineResponse
    ? ({ data: query.baselineResponse } as AxiosResponse<unknown>)
    : await runQuery(oldApiEnv, query, argv.timeout);
  const newResponse = newApiEnv ? await runQuery(newApiEnv, query, argv.timeout) : undefined;

  const differ = jsondiffpatch.create({
    propertyFilter(name) {
      return !(argv.ignored_fields || []).includes(name);
    },
  });

  const delta = newResponse ? differ.diff(oldResponse.data, newResponse.data) : undefined;

  return {
    query,
    delta,
    oldResponse,
    newResponse,
  };
}

/**
 * Compare and output many queries against two ApiEnvs. Passing along
 * the changes for output to a ChangeFormatter.
 *
 * @param {ApiEnv} oldApiEnv old env to run query against
 * @param {ApiEnv} newApiEnv new env to run query against
 * @param {Query[]} queries queries to compare
 * @param {CompareArgs} argv global command line args that affect running queries
 * @param {CompareFormatter} formatter formatter to use for output
 * @returns {Promise<void>} side effect only - outputs to output_file or stdout
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
  argv: CompareArgs;
  formatter: CompareFormatter;
}): Promise<void> {
  const oldResponseTimes: number[] = [];
  const newResponseTimes: number[] = [];
  const oldStatusCodes: Record<number, number> = {};
  const newStatusCodes: Record<number, number> = {};

  await Bluebird.map(
    queries,
    async (query: Query) => {
      const change = await compareQuery({
        oldApiEnv,
        newApiEnv,
        query,
        argv,
      });

      formatter.queryCompleted(change);

      oldResponseTimes.push((change.oldResponse as AxiosResponseWithDuration).duration);
      newResponseTimes.push((change.newResponse as AxiosResponseWithDuration)?.duration);

      if (!oldStatusCodes[change.oldResponse.status]) {
        oldStatusCodes[change.oldResponse.status] = 0;
      }
      if (!newStatusCodes[change.newResponse?.status]) {
        newStatusCodes[change.newResponse?.status] = 0;
      }

      oldStatusCodes[change.oldResponse.status] += 1;
      newStatusCodes[change.newResponse?.status] += 1;
    },
    { concurrency: argv.concurrency },
  );
  formatter.finished({
    old: {
      responseTimes: oldResponseTimes,
      statusCodes: oldStatusCodes,
    },
    new: {
      responseTimes: newResponseTimes,
      statusCodes: newStatusCodes,
    },
  });
}

/** Main logic - parses command line, creates a formatter, runs queries and
 * generates output.
 *
 * @returns {Promise<void>} on completion
 */
function main(): Promise<void> {
  const argv = parseArgv() as ParsedArgs;

  const oldApiEnv = argvToApiEnv(argv[OLD_KEY]);
  const newApiEnv = argvToApiEnv(argv[NEW_KEY]);

  const queries = QueryReader(argv);

  const formatter = getFormatter(argv.output_mode, {
    oldApiEnv,
    newApiEnv,
    argv,
    totalQueries: queries.length,
  });

  return compareQueries({
    oldApiEnv,
    newApiEnv,
    queries,
    argv,
    formatter,
  });
}

main();
