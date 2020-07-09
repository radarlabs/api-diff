/* eslint-disable no-console */
import * as chalk from 'chalk';
import * as jsondiffpatch from 'jsondiffpatch';
import * as stats from 'stats-lite';

import { Change } from '../change';
import { CompareFormatter } from './compare-formatter';
import { ApiEnv } from '../../apiEnv';

export default class ConsoleFormatter extends CompareFormatter {
  numQueriesRun = 0;

  numQueriesChanged = 0;

  logChange(change: Change): void {
    this.numQueriesChanged += 1;

    const apiEnvToApiSh = (apiEnv: ApiEnv): string => {
      if (apiEnv.keyEnv) {
        return `./api.sh --keyEnv ${apiEnv.keyEnv}`;
      }
      return './api.sh';
    };
    const outputLines = `${JSON.stringify(change.params)}
    ${apiEnvToApiSh(this.oldApiEnv)} ${change.oldResponse.request.res.responseUrl}
    ${apiEnvToApiSh(this.newApiEnv)} ${change.newResponse.request.res.responseUrl}`;

    if (!change.delta) {
      console.log(chalk.cyan(`Unchanged: ${outputLines}`));
    } else {
      console.log(chalk.yellow(`Changed: ${outputLines}`));
    }

    (jsondiffpatch.console as any).log(change.delta);
  }

  queryRan(): void {
    this.numQueriesRun += 1;
    if (this.numQueriesRun % 10 === 0) {
      console.log(`IN PROGRESS. ${this.numQueriesRun}/${this.totalQueries} run`);
    }
  }

  finished({
    oldResponseTimes,
    newResponseTimes,
  }: {
    oldResponseTimes: number[];
    newResponseTimes: number[];
  }): void {
    /**
     * @param responseTimes
     */
    function logResponseTimes(responseTimes: number[]) {
      console.log('  P99:', `${stats.percentile(responseTimes, 0.99)}ms`);
      console.log('  P95:', `${stats.percentile(responseTimes, 0.95)}ms`);
      console.log('  P90:', `${stats.percentile(responseTimes, 0.90)}ms`);
      console.log('  P95:', `${stats.percentile(responseTimes, 0.50)}ms`);
    }

    console.log(`DONE. ${this.numQueriesChanged}/${this.numQueriesRun} changed`);

    console.log('Elapsed:', (Date.now() - this.startDate.getTime()) / 1000, 'seconds');

    console.log('OLD responseTimes');
    logResponseTimes(oldResponseTimes);

    console.log('NEW responseTimes');
    logResponseTimes(newResponseTimes);

    console.log();
  }
}
