import * as _ from 'lodash';
import logger from './logger';
import config, { ConfigHostEntry } from './config';

import { failedExit } from './cli-utils';

const apiEnvCommandLineOptions: Record<string, any> = {
  host: {
    type: 'string',
    description: 'Host/port - will override --env',
  },
  protocol: {
    choices: ['http', 'https'],
    description:
      'What protocol to use (if not specified in url), defaults to http for local, https otherwise',
  },
  key: {
    type: 'string',
    description: 'Authorization key, if not specified will try to find one in the env, in .env or, in local mode, directly in mongo',
  },
};

/**
 *
 */
export function getApiEnvCommandLineOptions(): Record<string, any> {
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

export interface ApiEnv {
  key: string;
  protocol: string;
  host: string;
  keyEnv: string;
  keyType?: string;
}

type KeyParams = Pick<ApiEnv, 'keyEnv' | 'keyType'>;

/**
 * @param root0
 * @param root0.keyEnv
 * @param root0.keyType
 */
function findKey({ keyEnv, keyType }: KeyParams): string {
  const envVariableName = [keyEnv, keyType, 'API_KEY']
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
 * @param apiEnv
 */
export function fixApiEnvKey(apiEnv: Partial<ApiEnv>): void {
  // eslint-disable-next-line no-param-reassign
  apiEnv.key = apiEnv.key
    || findKey({ keyEnv: apiEnv.keyEnv || '', keyType: apiEnv.keyType || config.keyTypes?.[0] });
}

/**
 * @param argv
 */
export function argvToApiEnv(argv: Partial<ApiEnv> | undefined): ApiEnv {
  let apiEnv: Partial<ApiEnv> = _.clone(argv) || {};

  let aliasedHostEntry: ConfigHostEntry;
  _.forEach(config.hosts, (hostEntry: ConfigHostEntry, key: string) => {
    // look through our config file for named host entries,
    // see if one of them like prod: {} was specified on the commandline
    if (argv[key]) {
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
        const toReplace = key.toUpperCase();
        // eslint-disable-next-line no-param-reassign
        hostEntry.host = hostEntry.host.replace(toReplace, argv[key]);
      }

      // keyEnv is either the env specified in the hostEntry or just the
      // name of the hostConfig. For example, localhost might specify keyEnv: staging,
      // while the hostConfig for "staging" wouldn't need to do so
      // eslint-disable-next-line no-param-reassign
      hostEntry.keyEnv = hostEntry.keyEnv || key;

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
    fixApiEnvKey(apiEnv);
  }

  return apiEnv as ApiEnv;
}