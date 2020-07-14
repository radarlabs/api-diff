/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
import axios, { Method, AxiosResponse, AxiosRequestConfig } from 'axios';
import { ApiEnv } from './apiEnv';
import { Query } from './compare/query';
import config from './config';

type AxiosMetadata = {
  startTime: number
}

type WithAxiosMetadata = {
  metadata: AxiosMetadata
}

type AxiosResponseWithDuration =
  AxiosResponse & {config: WithAxiosMetadata} & { duration: number}

// Response time middleware. Tracks the duration of the axios request/response
axios.interceptors.request.use((axiosConfig: AxiosRequestConfig & WithAxiosMetadata) => {
  axiosConfig.metadata = { startTime: Date.now() };
  return axiosConfig;
});
axios.interceptors.response.use((response: AxiosResponseWithDuration) => {
  response.duration = Date.now() - response.config.metadata.startTime;
  return response;
});

/**
 * Run one query against specified apiEnv
 *
 * @param {ApiEnv} apiEnv apiEnv to run against
 * @param {Query} query query to run
 * @param {number} timeout request timeout in milliseconds
 * @returns {Promise<AxiosResponse>} server response
 */
export default async function runQuery(
  apiEnv: ApiEnv,
  query: Query,
  timeout?: number,
): Promise<AxiosResponse> {
  const { params, method } = query;
  let { endpoint } = query;

  // v1/xxxx ... maybe someone was lazy and didn't start with an opening slash
  if (endpoint[0] !== '/' && !endpoint.startsWith('http:')) {
    endpoint = `/${endpoint}`;
  }

  // someone was lazy and didn't specify /v1
  if (!endpoint.startsWith('/v1')) {
    endpoint = `/v1${endpoint}`;
  }

  let url = '';

  // /xxx/api.... so we need to add host
  if (endpoint[0] === '/') {
    url = apiEnv.host + endpoint;
  }

  // don't yet have a protocol in the url
  if (!url.startsWith('http:')) {
    url = `${apiEnv.protocol}://${url}`;
  }

  // logger.info(`Fetching ${url}`);

  const headers: Record<string, string> = {
    'User-Agent': 'radar-compare-tool/unknown',
  };

  if (config.authStyle === 'header') {
    headers.Authorization = apiEnv.key;
  } else if (config.authStyle === 'param') {
    params[config.authParam] = apiEnv.key;
  }

  try {
    const response = await axios(url, {
      headers,
      params: method === 'GET' ? params : undefined,
      data: method === 'POST' ? params : undefined,
      method: method as Method,
      timeout,
    });
    return response;
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`Got error code: ${error.response.status}`);
      return error.response;
    }
    if (error.request) {
      // TODO(blackmad): maybe shouldn't throw?
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      console.error(error.toJSON());
      throw error;
    } else {
      // TODO(blackmad): maybe shouldn't throw?
      // Something happened in setting up the request that triggered an Error
      console.error('Error', error.message);
      throw error;
    }
  }
}
