import { CompareFormatter, FormatterConstructorParams } from './compare-formatter';
import { failedExit } from '../../cli-utils';
import ConsoleFormatter from './console-formatter';
import JsonFormatter from './json-formatter';

/**
 * @param outputMode
 * @param params
 */
export default function getFormatter(
  outputMode: string,
  params: FormatterConstructorParams,
): CompareFormatter {
  switch (outputMode) {
    case 'html':
      throw failedExit('HTML Not Implemented');
    case 'text':
      return new ConsoleFormatter(params);
    case 'json':
      return new JsonFormatter(params);
    default:
      throw failedExit(`Unknown output_mode: ${outputMode}`);
  }
}
