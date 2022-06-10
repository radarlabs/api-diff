/* eslint-disable camelcase */
import { AxiosResponse } from 'axios';
import { Query } from './query';

export type Change = {
  oldQuery: Query,
  newQuery: Query,
  delta?: unknown;
  oldResponse: AxiosResponse;
  newResponse?: AxiosResponse;
};
