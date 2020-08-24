#!/usr/bin/env node

import * as _ from 'lodash';
import * as queryString from 'querystring';
import * as chalk from 'chalk';
import { failedExit, globalCommandLineOptions } from './cli-utils';
import {
  argvToApiEnv, getApiEnvCommandLineOptions, findApiKey,
} from './apiEnv';
import runQuery from './run-query';
import config, { API_DIFF_CONFIG_FILE } from './config';

/**
 * Return parsed commandline arguments
 *
 * @returns {any} the parsed commandline arguments
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseArgv(): any {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const yargs = require('yargs').strict();

  _.forEach(globalCommandLineOptions, (val, key) => {
    yargs.option(key, val);
  });

  _.forEach(getApiEnvCommandLineOptions(), (val, key) => {
    yargs.option(key, val);
  });

  yargs.option('endpoint', {
    description: 'Endpoint to query',
  });

  return yargs.argv;
}

const argv = parseArgv();

// hack. if you say --local http://radar.io/fff/fffff that url will be
// added to the --local param, which we dont' want
// None of the keys currently take http urls as args, so pluck them out
Object.keys(argv).forEach((key) => {
  if (key === '_') {
    return;
  }
  if (argv[key]?.toString().startsWith('http')) {
    argv._.push(argv[key]);
    argv[key] = true;
  }
});

let apiEnv = argvToApiEnv(argv);

let params: Record<string, string> = {};

let { endpoint } = argv;

console.log(argv);
if (_.last(argv._)?.toString().startsWith('http')) {
  // The user specified a full url, they probably just want to run it with the
  // right api key. So infer all the params from the passed url
  const url = new URL(argv._[0]);
  apiEnv = {
    protocol: url.protocol.replace(':', ''),
    host: url.host,
    ...apiEnv,
  };

  if (!apiEnv.keyEnv) {
    const hostEntry = _.find(config.hosts, (v) => v.host === url.host);
    if (!hostEntry) {
      failedExit(
        `Could not find entry for host ${url.host} in ${API_DIFF_CONFIG_FILE} please check your configuration`,
      );
    }
    apiEnv.keyEnv = hostEntry.keyEnv;
    apiEnv.keyType = hostEntry.keyType || _.first(config.keyTypes);
    console.log('2', apiEnv);
  }

  apiEnv.key = apiEnv.key || findApiKey({ keyEnv: apiEnv.keyEnv, keyType: apiEnv.keyType });

  console.log('3', apiEnv);

  endpoint = url.pathname;
  params = queryString.parse(url.search.substring(1)) as Record<string, string>;
} else {
  argv._.forEach((datum: string) => {
    if (!datum.includes('=')) {
      // eslint-disable-next-line no-console
      console.error(`data argument ${datum} did not have =, exiting`);
      process.exit(1);
    }
    const key = datum.split('=')[0];
    const value = datum.split('=')[1];
    params[key] = value;
  });
}

if (!endpoint) {
  failedExit('no --endpoint specified and argument was not a full http url with endpoint, exiting');
}

runQuery(
  apiEnv,
  {
    params,
    method: argv.method,
    endpoint,
    // eslint-disable-next-line no-console
  },
  { timeout: argv.timeout, retries: argv.retries },
).then(({ data }) => {
  console.dir(data, { depth: null, colors: chalk.level > 0 });
});
