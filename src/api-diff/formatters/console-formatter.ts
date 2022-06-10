/* eslint-disable no-console */
import chalk from 'chalk';
import * as jsondiffpatch from 'jsondiffpatch';
import { table } from 'table';
import * as _ from 'lodash';

import * as config from '../../config';
import { Change } from '../change';
import {
  CompareFormatter,
  FinishedStats,
} from './compare-formatter';
import { ApiEnv } from '../../apiEnv';

export default class ConsoleFormatter extends CompareFormatter {
  changes: Change[] = [];

  logChange(change: Change): void {
    this.changes.push(change);
  }

  writeChangeToConsole(change: Change): void {
    const apiEnvToApiSh = (apiEnv: ApiEnv): string => {
      const commandParts: string[] = [];

      if (config.CONFIG_FILE_ENV_VARIABLE && config.API_DIFF_CONFIG_FILE) {
        commandParts.push(
          `${config.CONFIG_FILE_ENV_VARIABLE}=${config.API_DIFF_CONFIG_FILE}`,
        );
      }

      if (_.some(process.argv, (arg) => arg.includes('ts-node'))) {
        // assume this is being run from the source tree
        commandParts.push('yarn api-tool');
      } else {
        // assume this is being run from npm dist
        commandParts.push('api-tool');
      }

      if (apiEnv.keyEnv) {
        commandParts.push(`--keyEnv ${apiEnv.keyEnv}`);
      }
      return commandParts.join(' ');
    };
    const outputLines = `${JSON.stringify(change.newQuery.params)}
    ${JSON.stringify(change.oldQuery.params)}
    ${apiEnvToApiSh(this.oldApiEnv)} ${
      change.oldResponse.request?.res?.responseUrl
}
    ${apiEnvToApiSh(this.newApiEnv)} ${
  change.newResponse.request.res.responseUrl
}`;

    if (!change.delta) {
      this.writeln(chalk.cyan(`Unchanged: ${outputLines}`));
    } else {
      this.writeln(chalk.yellow(`Changed: ${outputLines}`));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (jsondiffpatch.console as any).log(change.delta);
  }

  onFinished(finishedStats: FinishedStats): Promise<void> {
    this.changes.forEach((change) => this.writeChangeToConsole(change));

    this.writeln(
      `Elapsed: ${(Date.now() - this.startDate.getTime()) / 1000} seconds`,
    );

    // this.writeln('');

    // // Response times table
    // this.writeln('Response times');
    // const oldResponseTimes = makeResponseTimesHistogram(finishedStats.old.responseTimes);
    // const newResponseTimes = makeResponseTimesHistogram(finishedStats.new.responseTimes);

    // const responseTimesTable = [['', 'old', 'new']];
    // _.keys(oldResponseTimes).forEach((key) => {
    //   responseTimesTable.push([
    //     key,
    //     oldResponseTimes[key].toString(),
    //     newResponseTimes[key].toString(),
    //   ]);
    // });

    // this.writeln(table(responseTimesTable));

    // Status codes table
    // Only output this if there's a reason to, that we had some non-200 codes
    if (
      !_.isEqual(_.keys(finishedStats.new.statusCodes), ['200'])
      || !_.isEqual(_.keys(finishedStats.old.statusCodes), ['200'])
    ) {
      this.writeln('Status codes');

      const statusCodesTable = [['', 'old', 'new']];
      _.keys(finishedStats.old.statusCodes).forEach((key) => {
        statusCodesTable.push([
          key,
          finishedStats.old.statusCodes[key].toString(),
          finishedStats.new.statusCodes[key].toString(),
        ]);
      });

      this.writeln(table(statusCodesTable));
    }

    return Promise.resolve();
  }
}
