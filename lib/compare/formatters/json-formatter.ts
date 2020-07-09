/* eslint-disable no-console */
import { Change } from '../change';
import { CompareFormatter } from './compare-formatter';

type JsonChange = Pick<Change,
'delta' | 'params'>

export default class JsonFormatter extends CompareFormatter {
  numQueriesRun = 0;

  numQueriesChanged = 0;

  changes: JsonChange[] = []

  logChange(change: Change): void {
    this.numQueriesChanged += 1;
    this.changes.push({ delta: change.delta, params: change.params });
  }

  queryRan(): void {
    this.numQueriesRun += 1;
    if (this.numQueriesRun % 10 === 0) {
      console.error(`IN PROGRESS. ${this.numQueriesRun}/${this.totalQueries} run`);
    }
  }

  finished(): void {
    console.log(JSON.stringify({ changes: this.changes }));
  }
}
