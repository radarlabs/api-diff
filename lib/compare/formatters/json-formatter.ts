/* eslint-disable no-console */

import md5 from 'md5';
import * as stats from 'stats-lite';
import { Change } from '../change';
import { CompareFormatter } from './compare-formatter';

/** One half of a compare response in output */
type ApiEnvResponse = {
  response: unknown;
  url: string;
  status: number;
};
/** One compare output entry in json */
export type JsonChange = {
  id: string;
  old: ApiEnvResponse;
  new?: ApiEnvResponse;
} & Pick<Change, 'delta' | 'query'>;

/**
 * Convert list of response times to a dictionary of stats
 *
 * @param {number[]} responseTimes list of response times in milliseconds to analyze
 * @returns {Record<string, number>} map of stats names to value
 */
function makeResponseTimes(responseTimes: number[]): Record<string, number> {
  return {
    p99: stats.percentile(responseTimes, 0.99),
    p95: stats.percentile(responseTimes, 0.95),
    p90: stats.percentile(responseTimes, 0.9),
    p50: stats.percentile(responseTimes, 0.5),
    median: stats.median(responseTimes),
  };
}

/** Outputs compare run as json. HTML output is built on top of this format */
export default class JsonFormatter extends CompareFormatter {
  numQueriesRun = 0;

  numQueriesChanged = 0;

  changes: JsonChange[] = [];

  logChange(change: Change): void {
    this.numQueriesChanged += 1;

    this.changes.push({
      id: md5(JSON.stringify({ delta: change.delta, params: change.query.params })),
      query: change.query,
      delta: change.delta,
      old: {
        response: change.oldResponse.data,
        status: change.oldResponse.status,
        url: change.oldResponse.request?.res?.responseUrl,
      },
      new: change.newResponse?.data
        ? {
          response: change.newResponse.data,
          status: change.newResponse.status,
          url: change.newResponse.request.res.responseUrl,
        }
        : undefined,
    });
  }

  queryRan(): void {
    this.numQueriesRun += 1;
    if (this.numQueriesRun % 10 === 0) {
      console.error(`IN PROGRESS. ${this.numQueriesRun}/${this.totalQueries} run`);
    }
  }

  /**
   * Output the overall json object. Broken out here so html formatter can call it
   *
   * @param {number[]} oldResponseTimes final list of response times from old server
   * @param {number[]} newResponseTimes final list of response times from old server
   * @returns {unknown} top level json object
   */
  finishedDict({
    oldResponseTimes,
    newResponseTimes,
  }: {
    oldResponseTimes: number[];
    newResponseTimes: number[];
  }): unknown {
    return {
      startTime: this.startDate.toISOString(),
      endTime: new Date().toISOString(),
      command: process.argv.join(' '),
      totalQueries: this.totalQueries,
      numQueriesRun: this.numQueriesRun,
      old: {
        apiEnv: this.oldApiEnv,
        responseTimes: makeResponseTimes(oldResponseTimes),
      },
      new: this.newApiEnv
        ? {
          apiEnv: this.newApiEnv,
          responseTimes: makeResponseTimes(newResponseTimes),
        }
        : undefined,
      changes: this.changes,
    };
  }

  finished({
    oldResponseTimes,
    newResponseTimes,
  }: {
    oldResponseTimes: number[];
    newResponseTimes: number[];
  }): void {
    this.write(JSON.stringify(this.finishedDict({ oldResponseTimes, newResponseTimes }), null, 2));
  }
}
