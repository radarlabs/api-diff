/* eslint-disable camelcase */
import { AxiosResponse } from 'axios';
import { Query } from './query';

export type Change = {
  query: Query,
  delta?: unknown;
  oldResponse: AxiosResponse;
  newResponse?: AxiosResponse;
};
