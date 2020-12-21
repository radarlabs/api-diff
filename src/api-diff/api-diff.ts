#!/usr/bin/env node
/* eslint-disable no-console */

import Bluebird from 'bluebird';
import * as jsondiffpatch from 'jsondiffpatch';
import { AxiosResponse } from 'axios';
import jp from 'jsonpath';
import * as _ from 'lodash';
import chalk from 'chalk';

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

type CompareArgs = Pick<
  ParsedArgs,
  | 'concurrency'
  | 'ignored_fields'
  | 'extra_params'
  | 'timeout'
  | 'retries'
  | 'response_filter'
  | 'response_filter_function'
>;

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
}): Promise<Change | undefined> {
  // if the query has a baseline response (running from a golden json file), use that
  // otherwise run it against the old server
  const oldResponse = query.baselineResponse
    ? ({ data: query.baselineResponse } as AxiosResponse<unknown>)
    : await runQuery(
      oldApiEnv,
      {
        ...query,
        params: { ...query.params, ...oldApiEnv.extraParams },
      },
      {
        timeout: argv.timeout,
        retries: argv.retries,
      },
    ).catch((e) => {
      console.error(e);
      throw e;
    });

  const newResponse = newApiEnv
    ? await runQuery(
      newApiEnv,
      {
        ...query,
        params: { ...query.params, ...newApiEnv.extraParams },
      },
      {
        timeout: argv.timeout,
        retries: argv.retries,
      },
    ).catch((e) => {
      console.error(e);
      throw e;
    })
    : undefined;

  if (argv.response_filter || argv.response_filter_function) {
    const hadData = !_.isEmpty(oldResponse.data) || !_.isEmpty(newResponse.data);

    try {
      if (argv.response_filter_function) {
        /* eslint-disable import/no-dynamic-require, global-require,
              @typescript-eslint/no-var-requires */
        const filter = require(argv.response_filter_function);
        oldResponse.data = filter(oldResponse.data);
        newResponse.data = filter(newResponse.data);
      } else {
        oldResponse.data = jp.query(oldResponse.data, argv.response_filter);
        newResponse.data = jp.query(newResponse.data, argv.response_filter);
      }
    } catch (e) {
      console.error(e);
    }

    if (hadData && _.isEmpty(oldResponse.data) && _.isEmpty(newResponse.data)) {
      console.error(
        chalk.yellow(
          `\nAfter filtering, old and new response are both falsy. Are you sure your filter is correct? ${argv.response_filter}`,
        ),
      );
    }
  }

  const differ = jsondiffpatch.create({
    propertyFilter(name) {
      return !(argv.ignored_fields || []).includes(name);
    },
  });

  const delta = newResponse
    ? differ.diff(oldResponse.data, newResponse.data)
    : undefined;

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

  let isCancelled = false;

  const queriesPromise = Bluebird.map(
    queries,
    async (query: Query) => {
      if (isCancelled) {
        return;
      }

      const change = await compareQuery({
        oldApiEnv,
        newApiEnv,
        query,
        argv,
      }).catch((e) => {
        console.error(e);
        throw e;
      });

      if (!change) {
        return;
      }

      formatter.queryCompleted(change);

      oldResponseTimes.push(
        (change.oldResponse as AxiosResponseWithDuration).duration,
      );
      newResponseTimes.push(
        (change.newResponse as AxiosResponseWithDuration)?.duration,
      );

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

  process.on('SIGINT', () => {
    console.error('Caught interrupt signal, stopping early ...');
    isCancelled = true;
  });

  await queriesPromise.catch(() => {
    console.error('Aborted diff early ... saving result ...');
  });

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

  const oldApiEnv = argvToApiEnv(argv[OLD_KEY], true);
  const queries = QueryReader(argv);

  const inGenerateBaselineMode = argv._.includes('generate-baseline');
  let newApiEnv: ApiEnv;

  if (!inGenerateBaselineMode) {
    newApiEnv = argvToApiEnv(argv[NEW_KEY], true);
  } else {
    argv.output_mode = 'json';
    argv.unchanged = true;
  }

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
