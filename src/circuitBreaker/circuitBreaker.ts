import { createBreaker } from '@bbc/http-transport-circuit-breaker';
import * as _ from 'lodash';
import { ClientParams } from '../core/clientParams';
import { RequestOptions, RestClient } from '../core/restClient';

const DEFAULT_MAX_FAILURES = 100;
const DEFAULT_RESET_TIMEOUT = 10000;
const DEFAULT_TIMEOUT = 0x7FFFFFFF;

function isFailure(err: any): boolean {
  return err && err.statusCode >= 500;
}

function getExecutor(client: RestClient): any {
  return function (...args: any[]): any { // tslint:disable-line no-function-expression
    const method = args[0];
    const rest = args.slice(1, args.length - 1);
    const cb = args[args.length - 1];

    return client[method].apply(client, rest)
      .then((result) => {
        cb(null, result);
      })
      .catch((err) => {
        cb(err);
      });
  };
}

export class CircuitBreaker implements RestClient {
  private executor: any;

  constructor(client: RestClient, params: ClientParams) {
    const maxFailures = _.get(params, 'circuitbreaker.maxFailures', DEFAULT_MAX_FAILURES);
    const resetTimeout = _.get(params, 'circuitbreaker.resetTimeout', DEFAULT_RESET_TIMEOUT);

    const opts = {
      isFailure,
      maxFailures,
      resetTimeout,
      timeout: DEFAULT_TIMEOUT,
      openErrMsg: `[${params.name}] Circuit breaker is open`
    };

    const breaker = createBreaker({ execute: getExecutor(client) }, opts);

    if (params.stats) {
      breaker.on('open', () => {
        params.stats.increment(`${params.name}.circuit_breaker.open`);
      });
    }

    this.executor = async (...args) => {
      return new Promise((resolve, reject) => {
        breaker.run(...args, (err, result) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(result);
        });
      });
    };
  }

  async get(uri: string, opts?: RequestOptions): Promise<Response> {
    return this.executor('get', ...arguments);
  }

  async patch(uri: string, body: string, opts?: RequestOptions): Promise<Response> {
    return this.executor('patch', ...arguments);
  }

  async post(uri: string, body: string, opts?: RequestOptions): Promise<Response> {
    return this.executor('post', ...arguments);
  }

  async put(uri: string, body: string, opts?: RequestOptions): Promise<Response> {
    return this.executor('put', ...arguments);
  }

  async head(uri: string, opts?: RequestOptions): Promise<Response> {
    return this.executor('head', ...arguments);
  }

  async delete(uri: string, opts?: RequestOptions): Promise<Response> {
    return this.executor('delete', ...arguments);
  }
}
