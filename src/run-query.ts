/* eslint-disable no-console */
import axios, {
  Method,
  AxiosResponse,
  AxiosRequestConfig,
  AxiosError,
} from 'axios';
import axiosRetry from 'axios-retry';
import querystring from 'querystring';
import * as _ from 'lodash';

import { ApiEnv } from './apiEnv';
import { Query } from './api-diff/query';
import config from './config';

type AxiosMetadata = {
  startTime: number;
};

type WithAxiosMetadata = {
  metadata: AxiosMetadata;
};

export type AxiosResponseWithDuration = AxiosResponse & {
  config: WithAxiosMetadata;
} & { duration: number };

// Response time middleware. Tracks the duration of the axios request/response
axios.interceptors.request.use(
  (axiosConfig: AxiosRequestConfig & WithAxiosMetadata) => {
    // eslint-disable-next-line no-param-reassign
    axiosConfig.metadata = { startTime: Date.now() };
    return axiosConfig;
  },
);
axios.interceptors.response.use((response: AxiosResponseWithDuration) => {
  response.duration = Date.now() - response.config.metadata.startTime;
  return response;
});

type RunQueryOptions = {
  /** Request timeout in milliseconds */
  timeout: number;
  retries: number;
};

/**
 * Run one query against specified apiEnv
 *
 * @param {ApiEnv} apiEnv apiEnv to run against
 * @param {Query} query query to run
 * @param {RunQueryOptions} options options for runquery
 * @returns {Promise<AxiosResponse>} server response
 */
export default async function runQuery(
  apiEnv: ApiEnv,
  query: Query,
  options: RunQueryOptions,
): Promise<AxiosResponse> {
  const { params, method, endpoint } = query;
  const { timeout, retries } = options;

  axiosRetry(axios, { retries });

  const url = `${apiEnv.protocol}://${apiEnv.host}${endpoint}`;

  // logger.info(`Fetching ${url}`);

  const headers: Record<string, string> = {
    'User-Agent': 'radar-compare-tool/unknown',
  };

  if (config.authStyle === 'header') {
    headers.Authorization = [config.authType, apiEnv.key]
      .filter((u) => !_.isEmpty(u))
      .join(' ');
  } else if (config.authStyle === 'param') {
    params[config.authParam] = apiEnv.key;
  }

  try {
    const response = await axios(url, {
      headers,
      params: method === 'GET' ? params : undefined,
      data:
        method === 'POST' || method === 'PUT' || method === 'UPDATE'
          ? params
          : undefined,
      method: method as Method,
      timeout,
    });
    return response;
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(
        `Got error code: ${error.response.status} for ${error.response.request?.res.responseUrl}`,
      );
      return error.response;
    }
    if (error.request) {
      const axiosError = error as AxiosError<any>;
      console.error(
        `Error ${axiosError.code} on ${url}?${querystring.stringify(params)}`,
      );

      // likely a timeout, don't throw, keep soldiering on
      return {
        config: axiosError.config,
        status: 5000,
        statusText: 'NOTOK',
        headers: axiosError.config.headers,
        request: {
          ...axiosError.request,
          res: {
            ...axiosError.request?.res,
            responseUrl: url,
          },
        },
        data: {
          syntheticAxiosError: {
            message: error.message,
            code: error.code,
          },
        },
      };
    }
    // TODO(blackmad): maybe shouldn't throw?
    // Something happened in setting up the request that triggered an Error
    console.error('Error', error.message);
    throw error;
  }
}
