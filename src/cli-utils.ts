/* eslint-disable no-console */
import chalk from 'chalk';
import yargs from 'yargs';

/**
 * @param {string} msg exit message to be displayed
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
  retries: {
    type: 'number',
    description: 'how many time to retry on http errors. set to 0 for none',
    default: 2,
  },
};
