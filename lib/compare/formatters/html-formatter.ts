/* eslint-disable no-console */
import * as fs from 'fs';
import * as path from 'path';
import { FinishedStats } from './compare-formatter';
import JsonFormatter from './json-formatter';

export default class HtmlFormatter extends JsonFormatter {
  finished(finishedStats: FinishedStats): void {
    const filePath = path.join(__dirname, 'compare.html');
    const html = fs.readFileSync(filePath).toString();
    this.write(
      html.replace('JSON_GO_HERE', JSON.stringify(this.finishedDict(finishedStats), null, 2)),
    );
  }
}
