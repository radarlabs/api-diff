/* eslint-disable no-console */
import chalk from 'chalk';
import yargs from 'yargs';

/**
 * @param msg
 */
export function failedExit(msg: string): void {
  console.error(chalk.red('PROCESS FAILED'));
  console.error(chalk.yellow(msg));
  process.exit(1);
}

export const globalCommandLineOptions: Record<string, yargs.Options> = {
  method: {
    choices: ['GET', 'POST', 'PUT'],
    default: 'GET',
    description: 'what http method to use',
  },
  timeout: {
    type: 'number',
    description: 'request timeout in milliseconds',
    default: 30000,
  },
};
