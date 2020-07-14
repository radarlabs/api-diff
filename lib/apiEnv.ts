/* eslint-disable no-param-reassign */
/** An ApiEnv is the object we create that explains how to query an api host -
 * its host:port, protocol, timeout and authorization methods. This file contains logic
 * both for constructing the command line flags to specify one, and for interpreting the
 * values of those command line flags into an ApiEnv object
 */
import * as _ from 'lodash';
import yargs from 'yargs';
import logger from './logger';
import config, { ConfigHostEntry } from './config';
import { failedExit } from './cli-utils';

// load .env - api keys might be in there
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();

export interface ApiEnv {
  key: string;
  protocol: string;
  host: string;
  keyEnv: string;
  keyType?: string;
}

type YargsOptionMapping = Record<string, yargs.Options>;

/** non-conifg dependent ways to configure an api env */
const apiEnvCommandLineOptions: YargsOptionMapping = {
  host: {
    type: 'string',
    description: 'host/port',
  },
  protocol: {
    choices: ['http', 'https'],
    description:
      'What protocol to use (if not specified in url), defaults to http for local, https otherwise',
  },
  key: {
    type: 'string',
    description:
      'Authorization key, if not specified will try to find one in the env, in .env or, in local mode, directly in mongo',
  },
};

/**
 * Generates parts of the apiEnv command line parameters based on our config file.
 * For example, if our config file has entries in the host section called "prod"
 * and "staging", this returns options to be able to specify --prod and --staging
 *
 * @returns {YargsOptionMapping} mapping of string to yargs option config
 */
export function getApiEnvCommandLineOptions(): YargsOptionMapping {
  if (config.keyTypes) {
    apiEnvCommandLineOptions.key_type = {
      choices: config.keyTypes,
      default: config.keyTypes[0],
      description: 'authorization key type to use',
    };
  }

  if (config.hosts) {
    apiEnvCommandLineOptions.env = {
      choices: [..._.keys(config.hosts), ..._.flatMap(config.hosts, (v) => v.aliases || [])],
      description: 'api host to talk to',
    };

    _.forEach(config.hosts, (hostEntry: ConfigHostEntry, key: string) => {
      apiEnvCommandLineOptions[key] = {
        alias: hostEntry.aliases,
        description: `set host to ${hostEntry.host}`,
      };
    });
  }
  return apiEnvCommandLineOptions;
}

/**
 * Find an api key from the environment based on the parts of the ApiEnv passed in
 *
 * @param {string} keyEnv - the key environment, like "prod" or "staging"
 * @param {string} keyType - the key type, like "live" or "test" (optional)
 * @returns {string} found api key, exits if not found
 */
export function findApiKey({ keyEnv, keyType }: Pick<ApiEnv, 'keyEnv' | 'keyType'>): string {
  const envVariableName = [config.name, keyEnv, keyType, 'KEY']
    .filter((s) => !_.isEmpty(s))
    .join('_')
    .toUpperCase();
  logger.info(`Looking for key in env ${envVariableName}`);
  const key = process.env[envVariableName];
  if (!key) {
    failedExit(`No key found for ${envVariableName} in .env and --key not specified`);
  }
  return key;
}

/**
 * Construct an ApiEnv from command line args
 * Fills in missing information from defaults and config where necessary.
 *
 * @param {Partial<ApiEnv> | undefined} argv assume a partial apienv from commandline args
 * @returns {ApiEnv} filled in ApiEnv
 */
export function argvToApiEnv(argv: Partial<ApiEnv> | undefined): ApiEnv {
  let apiEnv: Partial<ApiEnv> = _.clone(argv) || {};

  let aliasedHostEntry: ConfigHostEntry;
  _.forEach(config.hosts, (hostEntry: ConfigHostEntry, hostKey: string) => {
    // look through our config file for named host entries,
    // see if one of them like prod: {} was specified on the commandline
    if (argv[hostKey]) {
      // This gets triggered if a user specifies more than one hostEntry command
      // line option, like --prod and --staging (if both are defined in their config)
      if (aliasedHostEntry) {
        throw new Error(`Can only specify one of ${_.keys(config.hosts).join(',')}`);
      }

      // If this entry takes an argument, replace uppercase(hostConfigEntryName)
      // with the argument specified
      // so user: { takesArg: true, host: 'api-USER-dev.foo.io'}
      // specified by --user blackmad becomes api-blackmad-dev.foo.io
      if (hostEntry.takesArg) {
        const toReplace = hostKey.toUpperCase();
        hostEntry.host = hostEntry.host.replace(toReplace, argv[hostKey]);
      }

      // keyEnv is either the env specified in the hostEntry or just the
      // name of the hostConfig. For example, localhost might specify keyEnv: staging,
      // while the hostConfig for "staging" wouldn't need to do so
      hostEntry.keyEnv = hostEntry.keyEnv || hostKey;

      hostEntry.keyType = hostEntry.keyType || _.first(config.keyTypes);

      aliasedHostEntry = hostEntry;
    }
  });

  if (aliasedHostEntry) {
    apiEnv = {
      ...aliasedHostEntry,
      ...apiEnv,
    };
  }

  if (apiEnv?.host?.startsWith('http')) {
    const url = new URL(apiEnv.host);
    apiEnv.host = url.host;
    apiEnv.protocol = url.protocol.replace(':', '');
  }

  apiEnv.protocol = apiEnv?.protocol || 'http';

  if (config.authStyle) {
    apiEnv.key = apiEnv.key
      || findApiKey({ keyEnv: apiEnv.keyEnv, keyType: apiEnv.keyType });
  }

  if (!apiEnv.host) {
    failedExit(`Could not find host via arguments specified ${JSON.stringify(argv, null, 2)}`);
  }

  return apiEnv as ApiEnv;
}
