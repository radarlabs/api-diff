/**
 * @param msg
 */
export function failedExit(msg: string) {
  console.error(msg);
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
};
