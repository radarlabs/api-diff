/* eslint-disable no-console */
import chalk from 'chalk';
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
    const outputLines = `${JSON.stringify(change.query.params)}
    ${apiEnvToApiSh(this.oldApiEnv)} ${change.oldResponse.request?.res?.responseUrl}
    ${apiEnvToApiSh(this.newApiEnv)} ${change.newResponse.request.res.responseUrl}`;

    if (!change.delta) {
      this.writeln(chalk.cyan(`Unchanged: ${outputLines}`));
    } else {
      this.writeln(chalk.yellow(`Changed: ${outputLines}`));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (jsondiffpatch.console as any).log(change.delta);
  }

  queryRan(): void {
    this.numQueriesRun += 1;
    if (this.numQueriesRun % 10 === 0) {
      this.writeln(`IN PROGRESS. ${this.numQueriesRun}/${this.totalQueries} run`);
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
     * @param {number[]} responseTimes array of response times in milliseconds
     */
    const logResponseTimes = (responseTimes: number[]) => {
      this.writeln(`  P99: ${stats.percentile(responseTimes, 0.99)}ms`);
      this.writeln(`  P95: ${stats.percentile(responseTimes, 0.95)}ms`);
      this.writeln(`  P90: ${stats.percentile(responseTimes, 0.90)}ms`);
      this.writeln(`  P95: ${stats.percentile(responseTimes, 0.50)}ms`);
    };

    this.writeln(`DONE. ${this.numQueriesChanged}/${this.numQueriesRun} changed`);

    this.writeln(`Elapsed: ${(Date.now() - this.startDate.getTime()) / 1000} seconds`);

    this.writeln('OLD responseTimes');
    logResponseTimes(oldResponseTimes);

    this.writeln('NEW responseTimes');
    logResponseTimes(newResponseTimes);

    this.writeln('');
  }
}
