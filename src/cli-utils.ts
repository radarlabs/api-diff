/* eslint-disable no-console */
import chalk from 'chalk';

/**
 * @param msg
 */
export function failedExit(msg: string): void {
  console.error(chalk.red('PROCESS FAILED'));
  console.error(chalk.yellow(msg));
  process.exit(1);
}

export const globalCommandLineOptions = {
  method: {
    choices: ['GET', 'POST', 'PUT'],
    default: 'GET',
    description: 'what http method to use',
  },
  color: {
    type: 'boolean',
    description: 'turns on/off colorized output, defaults to true for stdin, false for redirected output',
  },
  timeout: {
    type: 'number',
    description: 'request timeout in milliseconds',
    default: 30000,
  },
};
