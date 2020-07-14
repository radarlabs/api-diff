import * as fs from 'fs';
import * as stats from 'stats-lite';
import { Change } from '../change';
import { ApiEnv } from '../../apiEnv';
import { ParsedArgs } from '../argv';

export type FormatterArgv = Pick<ParsedArgs, 'output_mode' | 'output_file'>;

export type FormatterConstructorParams = {
  oldApiEnv: ApiEnv;
  newApiEnv: ApiEnv;
  argv: FormatterArgv;
  totalQueries: number;
};

export type PerHostFinishedStats = {
  responseTimes: number[];
  statusCodes: Record<number, number>,
}

export type FinishedStats = {
  new: PerHostFinishedStats,
  old: PerHostFinishedStats
}

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
  totalQueries: number;

  abstract logChange(change: Change): void;

  abstract queryRan(): void;

  abstract finished(stats: FinishedStats): void;

  oldApiEnv: ApiEnv;

  newApiEnv: ApiEnv;

  startDate: Date;

  outputStream: fs.WriteStream;

  writeln(s: string): void {
    this.write(`${s}\n`);
  }

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

    const outputFilename = argv.output_file;
    if (outputFilename && outputFilename !== '-') {
      this.outputStream = fs.createWriteStream(outputFilename);
    }
  }
}
