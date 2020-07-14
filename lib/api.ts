/* eslint-disable no-console */
import * as _ from 'lodash';
import * as queryString from 'query-string';
import * as chalk from 'chalk';
import { globalCommandLineOptions } from './cli-utils';
import {
  argvToApiEnv, getApiEnvCommandLineOptions, ApiEnv, fixApiEnvKey,
} from './apiEnv';
import runQuery from './run-query';
import config from './config';

const makeUsageString = (toolName: string) => `This tool has a lot of options, here are some examples:

${toolName} --prod /v1/endpoint param1=X param2=Y 
    query /v1/endpoint in prod, with the params specified, and look for PROD_API_KEY in the environemnt or .env

${toolName} --prod /v1/endpoint --key YYYY param1=X param2=Y 
    same thing, but will use the key specified on the commandline

${toolName} --local /v1/endpoint param1=X param2=Y 
    would run against localhost, looking for LOCAL_API_KEY or reaching into mongo to try to find one

${toolName} --local /v1/endpoint --env=staging param1=X param2=Y 
    would run against localhost, but look for STAGING_API_KEY
`;

/**
 * Return parsed commandline arguments
 *
 * @returns {any} the parsed commandline arguments
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseArgv(): any {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const yargs = require('yargs');

  yargs.usage(makeUsageString(process.argv[0]));

  _.forEach(globalCommandLineOptions, (val, key) => {
    yargs.option(key, val);
  });

  _.forEach(getApiEnvCommandLineOptions(), (val, key) => {
    yargs.option(key, val);
  });

  return yargs.argv;
}

const argv = parseArgv();

let endpoint = argv._[0];

if (!endpoint) {
  console.error('This tool requires an api endpoint to be specified');
  process.exit(1);
}

let apiEnv: ApiEnv;

let params: Record<string, string> = {};

if (argv._.length === 1 && argv._[0].startsWith('http')) {
  // The user specified a full url, they probably just want to run it with the
  // right api key. So infer all the params from the passed url
  const url = new URL(argv._[0]);
  apiEnv = {
    ...apiEnv,
    protocol: url.protocol.replace(':', ''),
    host: url.host,
  };

  if (!apiEnv.keyEnv) {
    _.forEach(config.hosts, (hostEntry) => {
      if (url.host === hostEntry.host) {
        apiEnv.keyEnv = hostEntry.keyEnv;
      }
    });
  }

  fixApiEnvKey(apiEnv);

  endpoint = url.pathname;
  params = queryString.parse(url.search) as Record<string, string>;
} else {
  apiEnv = argvToApiEnv(argv);

  argv._.slice(1).forEach((datum: string) => {
    if (!datum.includes('=')) {
      console.error(`data argument ${datum} did not have =, exiting`);
      process.exit(1);
    }
    const key = datum.split('=')[0];
    const value = datum.split('=')[1];
    params[key] = value;
  });
}

runQuery(apiEnv, {
  params, method: argv.method, endpoint,
}, argv.timeout).then(({ data }) => console.dir(data, { depth: null, colors: chalk.level > 0 }));
