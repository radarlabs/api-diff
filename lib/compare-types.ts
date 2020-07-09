import { AxiosResponse } from 'axios';
import * as queryString from 'query-string';

export type Change = {
  params: queryString.ParsedQuery;
  delta: unknown;
  oldResponse: AxiosResponse;
  newResponse: AxiosResponse;
};
