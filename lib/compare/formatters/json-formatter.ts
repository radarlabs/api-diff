/* eslint-disable no-console */
import * as md5 from 'md5';
import * as stats from 'stats-lite';
import { Change } from '../change';
import { CompareFormatter } from './compare-formatter';

type JsonChange = { id: string; old: unknown; new: unknown; oldUrl: string; newUrl: string } & Pick<
  Change,
  'delta' | 'params'
>;

export default class JsonFormatter extends CompareFormatter {
  numQueriesRun = 0;

  numQueriesChanged = 0;

  changes: JsonChange[] = [];

  logChange(change: Change): void {
    this.numQueriesChanged += 1;
    this.changes.push({
      id: md5(JSON.stringify({ delta: change.delta, params: change.params })),
      delta: change.delta,
      params: change.params,
      old: change.oldResponse.data,
      new: change.newResponse.data,
      oldUrl: change.oldResponse.request.res.responseUrl,
      newUrl: change.newResponse.request.res.responseUrl,
    });
  }

  queryRan(): void {
    this.numQueriesRun += 1;
    if (this.numQueriesRun % 10 === 0) {
      console.error(`IN PROGRESS. ${this.numQueriesRun}/${this.totalQueries} run`);
    }
  }

  finishedDict({
    oldResponseTimes,
    newResponseTimes,
  }: {
    oldResponseTimes: number[];
    newResponseTimes: number[];
  }): any {
    /**
     * @param responseTimes
     */
    function makeResponseTimes(responseTimes: number[]) {
      return {
        p99: stats.percentile(responseTimes, 0.99),
        p95: stats.percentile(responseTimes, 0.95),
        p90: stats.percentile(responseTimes, 0.90),
        p50: stats.percentile(responseTimes, 0.50),
        median: stats.median(responseTimes),
      };
    }

    return {
      startTime: this.startDate.toISOString(),
      endTime: new Date().toISOString(),
      command: process.argv.join(' '),
      totalQueries: this.totalQueries,
      numQueriesRun: this.numQueriesRun,
      changes: this.changes,
      oldApiEnv: this.oldApiEnv,
      newApiEnv: this.newApiEnv,
      old: {
        apiEnv: this.oldApiEnv,
        responseTimes: makeResponseTimes(oldResponseTimes),
      },
      new: {
        apiEnv: this.newApiEnv,
        responseTimes: makeResponseTimes(newResponseTimes),
      },

    };
  }

  finished({
    oldResponseTimes,
    newResponseTimes,
  }: {
    oldResponseTimes: number[];
    newResponseTimes: number[];
  }): void {
    console.log(JSON.stringify(this.finishedDict({ oldResponseTimes, newResponseTimes })));
  }
}
