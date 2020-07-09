import { Change } from '../compare-types';

export interface CompareFormatter {
  logChange(change: Change);
  queryRan(numQueriesRun: number);
  finished();
}
