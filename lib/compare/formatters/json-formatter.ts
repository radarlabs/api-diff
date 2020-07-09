/* eslint-disable no-console */
import { Change } from '../change';
import { CompareFormatter } from './compare-formatter';

type JsonChange = { old: unknown; new: unknown, oldUrl: string, newUrl: string } & Pick<Change, 'delta' | 'params'>;

export default class JsonFormatter extends CompareFormatter {
  numQueriesRun = 0;

  numQueriesChanged = 0;

  changes: JsonChange[] = [];

  logChange(change: Change): void {
    this.numQueriesChanged += 1;
    this.changes.push({
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

  finished(): void {
    console.log(
      JSON.stringify({
        changes: this.changes,
        oldApiEnv: this.oldApiEnv,
        newApiEnv: this.newApiEnv,
      }),
    );
  }
}
