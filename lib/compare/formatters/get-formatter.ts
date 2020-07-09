import { CompareFormatter, FormatterConstructorParams } from './compare-formatter';
import { failedExit } from '../../cli-utils';
import ConsoleFormatter from './console-formatter';
import JsonFormatter from './json-formatter';
import HtmlFormatter from './html-formatter';
import { OutputMode } from '../argv';

/**
 * @param outputMode the output mode specified on the commandlin
 * @param params data required to construct a compare formater
 * @returns {CompareFormatter} the compare formatter
 */
export default function getFormatter(
  outputMode: OutputMode,
  params: FormatterConstructorParams,
): CompareFormatter {
  switch (outputMode) {
    case 'html':
      return new HtmlFormatter(params);
    case 'text':
      return new ConsoleFormatter(params);
    case 'json':
      return new JsonFormatter(params);
    default:
      throw failedExit(`Unknown output_mode: ${outputMode}`);
  }
}
