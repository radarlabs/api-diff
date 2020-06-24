import axios from "axios";
import { ApiEnv } from "./apiEnv";
import config from "./config";

export async function runQuery(
  apiEnv: ApiEnv,
  {
    params,
    endpoint,
    method,
    verbose,
  }: {
    params: Record<string, any>;
    method: string;
    endpoint: string;
    verbose?: boolean;
  }
) {
  const log = (...args) => {
    if (verbose) {
      console.error.apply(this, args);
    }
  };

  // v1/xxxx ... maybe someone was lazy and didn't start with an opening slash
  if (endpoint[0] !== "/" && !endpoint.startsWith("http:")) {
    endpoint = `/${endpoint}`;
  }

  // someone was lazy and didn't specify /v1
  if (!endpoint.startsWith("/v1")) {
    endpoint = `/v1${endpoint}`;
  }

  let url = "";
  
  // /xxx/api.... so we need to add host
  if (endpoint[0] === "/") {
    url = apiEnv.host + endpoint;
  }

  // don't yet have a protocol in the url
  if (!url.startsWith("http:")) {
    url = `${apiEnv.protocol}://${url}`;
  }

  log(`Fetching ${url}`);

  const headers: any = {
    "User-Agent": "radar-compare-tool/unknown",
  };

  if (config.authStyle === 'header') {
    headers.Authorization = apiEnv.key;
  } else if (config.authStyle === 'param') {
    params[config.authParam] = apiEnv.key;
  }

  try {
    const response = await axios(url, {
      headers,
      params: method === "GET" ? params : undefined,
      data: method === "POST" ? params : undefined,
      method: method.toLowerCase() as any,
    });
    console.log({response})
    return response;
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.log(error.response.data);
      console.log(error.response.status);
      console.log(error.response.headers);
      return error.response;
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      console.log(error.toJSON());
      throw(error)
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log('Error', error.message);
      throw(error)
    }
  }
}