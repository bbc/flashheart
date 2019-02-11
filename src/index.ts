import { RequestTransport } from '@bbc/http-transport';
import * as _ from 'lodash';
import { CircuitBreaker } from './circuitBreaker/circuitBreaker';
import { ClientParams } from './core/clientParams';
import { RestClient } from './core/restClient';
import { HttpTransportClient } from './httpTransport/client';

export function createClient(params?: ClientParams): RestClient {
  const paramsWithDefaults = _.defaults({}, params, { name: 'flashheart' });
  const client = new HttpTransportClient(paramsWithDefaults);

  if (paramsWithDefaults.circuitbreaker) {
    return new CircuitBreaker(client, paramsWithDefaults);
  }

  return client;
}

export { ClientParams } from './core/clientParams';
export { RestClient } from './core/restClient';
export { RequestTransport };
