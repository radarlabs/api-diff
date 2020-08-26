/* eslint-disable no-console */
import * as fs from 'fs';
import * as stats from 'stats-lite';
import CliProgress from 'cli-progress';

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
  statusCodes: Record<number, number>;
  responseTimes: number[];
};

export type FinishedStats = {
  new?: PerHostFinishedStats;
  old: PerHostFinishedStats;
};

/**
 * Convert list of response times to a dictionary of stats
 *
 * @param {number[]} responseTimes list of response times in milliseconds to analyze
 * @returns {Record<string, number>} map of stats names to value
 */
export function makeResponseTimesHistogram(responseTimes: number[]): Record<string, number> {
  return {
    p99: stats.percentile(responseTimes, 0.99),
    p95: stats.percentile(responseTimes, 0.95),
    p90: stats.percentile(responseTimes, 0.9),
    p50: stats.percentile(responseTimes, 0.5),
    median: stats.median(responseTimes),
  };
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

  numQueriesChanged = 0;

  /** cli output */
  progressBar: CliProgress.SingleBar;

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

    this.progressBar.update(this.numQueriesRun, {
      numChanged: this.numQueriesChanged,
    });

    if (!change.delta && !this.showUnchanged) {
      return;
    }

    if (change.delta) {
      this.numQueriesChanged += 1;
    }

    this.logChange(change);
  }

  /** Called when all queries are finished running */
  abstract onFinished(finishedStats: FinishedStats): Promise<void>;

  /**
   * Called when all queries are finished running
   *
   * @param finishedStats
   * @returns {Promise<void>} fulfilled on output finished
   */
  finished(finishedStats: FinishedStats): Promise<void> {
    console.error(`DONE. ${this.numQueriesChanged}/${this.numQueriesRun} changed`);
    return this.onFinished(finishedStats);
  }

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
   * @returns {Promise<void>} promise on finished
   */
  write(s: string): Promise<void> {
    const stream = this.outputStream || process.stdout;
    return new Promise((resolve, reject) => {
      stream.write(s);
      stream.end();
      stream.on('finish', () => { resolve(); });
      stream.on('error', reject);
    });
  }

  constructor({
    oldApiEnv, newApiEnv, totalQueries, argv,
  }: FormatterConstructorParams) {
    this.oldApiEnv = oldApiEnv;
    this.newApiEnv = newApiEnv;
    this.totalQueries = totalQueries;
    this.startDate = new Date();
    this.showUnchanged = argv.unchanged;

    this.progressBar = new CliProgress.SingleBar({
      etaBuffer: 250,
      format:
        'progress [{bar}] {percentage}% | ETA: {eta}s | {value}/{total} | {numChanged} changed',
    });
    this.progressBar.start(totalQueries, 0, {
      numChanged: 0,
    });

    const outputFilename = argv.output_file;
    if (outputFilename && outputFilename !== '-') {
      this.outputStream = fs.createWriteStream(outputFilename);
    }
  }
}
