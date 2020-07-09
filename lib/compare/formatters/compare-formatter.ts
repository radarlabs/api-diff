import { Change, ParsedArgs } from '../change';
import { ApiEnv } from '../../apiEnv';

export type FormatterArgv = Pick<ParsedArgs, 'output_mode'>

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

  abstract finished(): void;

  oldApiEnv: ApiEnv;

  newApiEnv: ApiEnv;

  constructor({
    oldApiEnv,
    newApiEnv,
    totalQueries,
  }: FormatterConstructorParams) {
    this.oldApiEnv = oldApiEnv;
    this.newApiEnv = newApiEnv;
    this.totalQueries = totalQueries;
  }
}
