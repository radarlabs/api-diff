import * as _ from "lodash";
import logger from "./logger";
import { ConfigHostEntry } from "./config";
import config from "./config";
import { failedExit } from "./cli-utils";

const apiEnvCommandLineOptions: Record<string, any> = {
  host: {
    type: "string",
    description: "Host/port - will override --env",
  },
  protocol: {
    choices: ["http", "https"],
    description:
      "What protocol to use (if not specified in url), defaults to http for local, https otherwise",
  },
  key: {
    type: "string",
    description: `Authorization key, if not specified will try to find one in the env, in .env or, in local mode, directly in mongo`,
  },
};

export function getApiEnvCommandLineOptions(): Record<string, any> {
  if (config.keyTypes) {
    apiEnvCommandLineOptions.key_type = {
      choices: config.keyTypes,
      default: config.keyTypes[0],
      description: "authorization key type to use",
    };
  }

  if (config.hosts) {
    apiEnvCommandLineOptions.env = {
      choices: [..._.keys(config.hosts), ..._.flatMap(config.hosts, (v) => v.aliases || [])],
      description: `api host to talk to`,
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

type KeyParams = Pick<ApiEnv, "keyEnv" | "keyType">;

function findKey({ keyEnv, keyType }: KeyParams): string {
  require("dotenv").config();

  const env_variable_name = [keyEnv, keyType, "API_KEY"]
    .filter((s) => !_.isEmpty(s))
    .join("_")
    .toUpperCase();
  logger.info(`Looking for key in env ${env_variable_name}`);
  const key = process.env[env_variable_name];
  if (!key) {
    failedExit(`No key found for ${env_variable_name} in .env and --key not specified`);
  }
  return key;
}

export function fixApiEnvKey(apiEnv: Partial<ApiEnv>) {
  apiEnv.key =
    apiEnv.key ||
    findKey({ keyEnv: apiEnv.keyEnv || "", keyType: apiEnv.keyType || config.keyTypes?.[0] });
}

export function argvToApiEnv(argv: any): ApiEnv {
  let apiEnv: Partial<ApiEnv> = _.clone(argv);

  let aliasedHostEntry: ConfigHostEntry;
  _.forEach(config.hosts, (hostEntry: ConfigHostEntry, key: string) => {
    if (argv[key]) {
      if (aliasedHostEntry) {
        throw new Error(`Can only specify one of ${_.keys(config.hosts).join(",")}`);
      }

      if (hostEntry.takesArg) {
        const toReplace = key.toUpperCase();
        hostEntry.host = hostEntry.host.replace(toReplace, argv[key]);
      }

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

  if (apiEnv.host.startsWith("http")) {
    const url = new URL(apiEnv.host);
    apiEnv.host = url.host;
    apiEnv.protocol = url.protocol.replace(":", "");
  }

  fixApiEnvKey(apiEnv);

  return apiEnv as ApiEnv;
}
