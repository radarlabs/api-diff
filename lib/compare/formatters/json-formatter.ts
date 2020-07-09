/* eslint-disable no-console */
import * as md5 from 'md5';
import { Change } from '../change';
import { CompareFormatter } from './compare-formatter';

type JsonChange = { id: string, old: unknown; new: unknown, oldUrl: string, newUrl: string } & Pick<Change, 'delta' | 'params'>;

export default class JsonFormatter extends CompareFormatter {
  numQueriesRun = 0;

  numQueriesChanged = 0;

  changes: JsonChange[] = [];

  logChange(change: Change): void {
    this.numQueriesChanged += 1;
    this.changes.push({
      id: md5(JSON.stringify({ delta: change.delta, params: change.params })),
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

  finishedDict(): any {
    return {
      command: process.argv.join(' '),
      changes: this.changes,
      oldApiEnv: this.oldApiEnv,
      newApiEnv: this.newApiEnv,
    };
  }

  finished(): void {
    console.log(
      JSON.stringify(this.finishedDict()),
    );
  }
}
