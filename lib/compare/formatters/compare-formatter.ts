import * as fs from 'fs';
import * as stats from 'stats-lite';
import { Change } from '../change';
import { ApiEnv } from '../../apiEnv';
import { ParsedArgs } from '../argv';

export type FormatterArgv = Pick<ParsedArgs, 'output_mode' | 'output_file'>

export type FormatterConstructorParams = {
  oldApiEnv: ApiEnv;
  newApiEnv: ApiEnv;
  argv: FormatterArgv;
  totalQueries: number;
}

export abstract class CompareFormatter {
  totalQueries: number;

  abstract logChange(change: Change): void;

  abstract queryRan(): void;

  abstract finished({ oldResponseTimes, newResponseTimes }:
    { oldResponseTimes: number[], newResponseTimes: number[] }): void;

  oldApiEnv: ApiEnv;

  newApiEnv: ApiEnv;

  startDate: Date;

  outputStream: fs.WriteStream;

  writeln(s: string): void{
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
    oldApiEnv,
    newApiEnv,
    totalQueries,
    argv,
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
