export type Query = {
  params: Record<string, string>;
  method: string;
  endpoint: string;
  baselineResponse?: any;
};
