/* eslint-disable no-console */
import * as fs from 'fs';
import * as path from 'path';
import JsonFormatter from './json-formatter';

export default class HtmlFormatter extends JsonFormatter {
  finished({
    oldResponseTimes,
    newResponseTimes,
  }: {
    oldResponseTimes: number[];
    newResponseTimes: number[];
  }): void {
    const filePath = path.join(__dirname, 'compare.html');
    const html = fs.readFileSync(filePath).toString();
    this.write(
      html.replace('JSON_GO_HERE', JSON.stringify(this.finishedDict({
        oldResponseTimes,
        newResponseTimes,
      }), null, 2)),
    );
  }
}
