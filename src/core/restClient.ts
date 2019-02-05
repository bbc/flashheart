import { Response } from './response';

export interface RequestOptions {
  headers?: Map<string, string> | object;
  qs?: Map<string, string | string[]> | object;
  json?: boolean;
}

export type RequestBody = string | object;

export interface RestClient {
  patch(uri: string, body: RequestBody, opts?: RequestOptions): Promise<Response>;
  get(uri: string, opts?: RequestOptions): Promise<Response>;
  post(uri: string, body: RequestBody, opts?: RequestOptions): Promise<Response>;
  put(uri: string, body: RequestBody, opts?: RequestOptions): Promise<Response>;
  head(uri: string, opts?: RequestOptions): Promise<Response>;
  delete(uri: string, opts?: RequestOptions): Promise<Response>;
}
