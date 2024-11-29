import * as httpTransport from '@bbc/http-transport';
import * as _ from 'lodash';
import { ClientParams, Stats } from '../core/clientParams';
import { Response } from '../core/response';
import {
  RequestBody,
  RequestOptions,
  RestClient
} from '../core/restClient';
import { configureClient, defaultRequestOptions } from './configuration';

const REDIRECT = '3';

export class HttpTransportClient implements RestClient {
  private readonly client: httpTransport.HttpTransportClient;
  private readonly params: ClientParams;
  private readonly timeout: number;

  /**
   * HttpTransport rest client implementation
   * @param {ClientParams} params - Client parameters
   * @see ClientParams
   */
  constructor(params: ClientParams) {
    this.params = params;
    this.timeout = _.get(this.params, 'timeout', defaultRequestOptions.timeout);
    this.client = configureClient(params);
  }

  public async patch(uri: string, body: RequestBody, opts?: RequestOptions): Promise<Response> {
    const req = this.client.patch(uri, body);
    const res = await req
      .headers(_.get(opts, 'headers'))
      .timeout(this.timeout)
      .query(_.get(opts, 'qs'))
      .asResponse();

    return this.toResponse(res);
  }

  /**
   * Executes a HTTP GET
   *
   * @return a Promise<Response> instance
   * @param {string} uri - uri to request
   * @param {RequestOptions} opts - optional request configuration
   */
  public async get(uri: string, opts?: RequestOptions): Promise<Response> {
    const req = this.client.get(uri);
    const res = await req
      .headers(_.get(opts, 'headers'))
      .timeout(this.timeout)
      .query(_.get(opts, 'qs'))
      .asResponse();

    return this.toResponse(res);
  }

  /**
   * Executes a HTTP POST
   *
   * @return a Promise<Response> instance
   * @param {string} uri - uri to request
   * @param {RequestBody} body - request body
   * @param {RequestOptions} opts - optional request configuration
   */
  public async post(uri: string, body: RequestBody, opts?: RequestOptions): Promise<Response> {
    const req = this.client.post(uri, body);
    const res = await req
      .headers(_.get(opts, 'headers'))
      .timeout(this.timeout)
      .query(_.get(opts, 'qs'))
      .asResponse();

    return this.toResponse(res);
  }

  /**
   * Executes a HTTP PUT
   *
   * @return a Promise<Response> instance
   * @param {string} uri - uri to request
   * @param {RequestBody} body - request body
   * @param {RequestOptions} opts - optional request configuration
   */
  public async put(uri: string, body: RequestBody, opts?: RequestOptions): Promise<Response> {
    const req = this.client;

    if (opts && opts.json !== undefined) {
      req.use(httpTransport.setContextProperty({
        json: opts.json
      }, 'opts'));
    }

    const res = await req.put(uri, body)
      .headers(_.get(opts, 'headers'))
      .timeout(this.timeout)
      .query(_.get(opts, 'qs'))
      .asResponse();

    return this.toResponse(res);
  }

  /**
   * Executes a HTTP HEAD
   *
   * @return a Promise<Response> instance
   * @param {string} uri - uri to request
   * @param {RequestOptions} opts - optional request configuration
   */
  public async head(uri: string, opts?: RequestOptions): Promise<Response> {
    const req = this.client.head(uri);
    const res = await req
      .headers(_.get(opts, 'headers'))
      .timeout(this.timeout)
      .query(_.get(opts, 'qs'))
      .asResponse();

    return this.toResponse(res);
  }

  /**
   * Executes a HTTP DELETE
   *
   * @return a Promise<Response> instance
   * @param {string} uri - uri to request
   * @param {RequestOptions} opts - optional request configuration
   */
  public async delete(uri: string, opts?: RequestOptions): Promise<Response> {
    const req = this.client.delete(uri);
    const res = await req
      .headers(_.get(opts, 'headers'))
      .timeout(this.timeout)
      .query(_.get(opts, 'qs'))
      .asResponse();

    return this.toResponse(res);
  }

  private toResponse(res: any): Response {
    return {
      body: res.body,
      headers: res.headers,
      ok: res.statusCode === 200,
      redirected: res.statusCode.toString().slice(0, 1) === REDIRECT,
      status: res.statusCode,
      statusText: _.get(res, 'httpResponse.statusMessage'),
      url: res.url
    };
  }
}
