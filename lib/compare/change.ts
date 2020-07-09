/* eslint-disable camelcase */
import { AxiosResponse } from 'axios';
import * as queryString from 'query-string';

export type Change = {
  params: queryString.ParsedQuery;
  delta: unknown;
  oldResponse: AxiosResponse;
  newResponse: AxiosResponse;
};

type OutputMode = 'html' | 'text';

export type ParsedArgs = {
  input_params?: string;
  input_csv?: string;
  input_queries?: string;
  endpoint: string;
  extra_params: string;
  method: string;
  ignored_fields: string[];
  concurrency: number;
  unchanged: boolean;
  key_map: string[];
  output_mode: OutputMode;
};
