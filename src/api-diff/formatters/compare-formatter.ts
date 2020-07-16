/* eslint-disable no-console */
import * as fs from 'fs';
import { Change } from '../change';
import { ApiEnv } from '../../apiEnv';
import { ParsedArgs } from '../argv';

export type FormatterArgv = Pick<ParsedArgs, 'output_mode' | 'output_file' | 'unchanged'>;

export type FormatterConstructorParams = {
  oldApiEnv: ApiEnv;
  newApiEnv: ApiEnv;
  argv: FormatterArgv;
  totalQueries: number;
};

export type PerHostFinishedStats = {
  statusCodes: Record<number, number>,
}

export type FinishedStats = {
  new?: PerHostFinishedStats,
  old: PerHostFinishedStats
}

export abstract class CompareFormatter {
  /** constructor params */
  oldApiEnv: ApiEnv;

  newApiEnv: ApiEnv;

  startDate: Date;

  outputStream: fs.WriteStream;

  showUnchanged: boolean;

  /** internal counts */
  totalQueries = 0;

  numQueriesRun = 0;

  /** Called when a query has actually changed */
  abstract logChange(change: Change): void;

  /**
   * Called each time a query completes. Change is a bit of a misnomer.
   * This is called even when there was no diff. It's up to the formatter
   * what to do with it. Calls the formatter implementation of logChange if
   * there is a diff or --unchanged is specified
   *
   * @param {Change} change query + old response + new response to log
   */
  queryCompleted(change: Change): void {
    this.numQueriesRun += 1;
    if (this.numQueriesRun % 10 === 0) {
      console.error(`IN PROGRESS. ${this.numQueriesRun}/${this.totalQueries} run`);
    }

    if (!change.delta && !this.showUnchanged) {
      return;
    }

    this.logChange(change);
  }

  /** Called when all queries are finished running */
  abstract finished(stats: FinishedStats): void;

  /**
   * Helper to deal with output redirection
   *
   * @param {string} s string to output with newline
   */
  writeln(s: string): void {
    this.write(`${s}\n`);
  }

  /**
   * Helper to deal with output redirection
   *
   * @param {string} s string to output
   */
  write(s: string): void {
    if (this.outputStream) {
      this.outputStream.write(s);
    } else {
      process.stdout.write(s);
    }
  }

  constructor({
    oldApiEnv, newApiEnv, totalQueries, argv,
  }: FormatterConstructorParams) {
    this.oldApiEnv = oldApiEnv;
    this.newApiEnv = newApiEnv;
    this.totalQueries = totalQueries;
    this.startDate = new Date();
    this.showUnchanged = argv.unchanged;

    const outputFilename = argv.output_file;
    if (outputFilename && outputFilename !== '-') {
      this.outputStream = fs.createWriteStream(outputFilename);
    }
  }
}
