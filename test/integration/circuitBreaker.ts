import * as assert from 'assert';
import { createClient } from '../../src';
import { RequestOptions, RestClient } from '../../src/core/restClient';
import { createServer } from './fakeServer';

function sleep(ms = 200): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

const defaultHost = 'http://localhost:5555';
const defaultRequestOpts = { headers: { Status: 500 } };
const defaultParams = { name: 'testing', circuitbreaker: { resetTimeout: 100, maxFailures: 2 } };

function generateFailingCalls(client: RestClient, method = 'get', host: string = defaultHost, opts: RequestOptions = defaultRequestOpts): any {
  return async (times: number) => {
    const errors = [];
    for (let i = 0; i < times; i++) {
      try {
        await client[method](host, opts);
      } catch (e) {
        errors.push(e);
      }
    }
    return errors;
  };
}

describe('Circuit breaker integration', () => {
  let fakeServer;

  beforeEach((done) => {
    fakeServer = createServer(done);
  });

  afterEach(() => {
    fakeServer.close();
  });

  it('breaks circuit after a defined number of failed requests', async () => {
    const client = createClient(defaultParams);
    const times = generateFailingCalls(client);
    const errors = await times(3);

    assert.equal(errors[0].statusCode, 500);
    assert.equal(errors[1].statusCode, 500);
    assert.equal(errors[2].message, '[testing] Circuit breaker is open');
  });

  it('does not break the circuit for non-consecutive errors', async () => {
    const client = createClient(defaultParams);
    const times = generateFailingCalls(client);

    const errors1 = await times(1);
    const res = await client.get(defaultHost, { headers: { Status: 200 } });
    const errors2 = await times(2);

    const errors = [...errors1, ...errors2];

    assert.equal(errors[0].statusCode, 500);
    assert.equal(errors[1].statusCode, 500);
    assert.equal(errors[2].statusCode, 500);
  });

  it('resets circuit after a given time period', async () => {
    const client = createClient(defaultParams);
    const times = generateFailingCalls(client);
    const errors = await times(3);

    assert.equal(errors[0].statusCode, 500);
    assert.equal(errors[1].statusCode, 500);
    assert.equal(errors[2].message, '[testing] Circuit breaker is open');

    await sleep(150);

    const res = await client.get(defaultHost, { headers: { Status: 200 } });
    assert.equal(res.status, 200);
  });

  it('breaks circuit for HTTP PUT', async () => {
    const client = createClient(defaultParams);
    const times = generateFailingCalls(client, 'put');
    const errors = await times(3);

    assert.equal(errors[0].statusCode, 500);
    assert.equal(errors[1].statusCode, 500);
    assert.equal(errors[2].message, '[testing] Circuit breaker is open');
  });

  it('breaks circuit for HTTP POST', async () => {
    const client = createClient(defaultParams);
    const times = generateFailingCalls(client, 'post');
    const errors = await times(3);

    assert.equal(errors[0].statusCode, 500);
    assert.equal(errors[1].statusCode, 500);
    assert.equal(errors[2].message, '[testing] Circuit breaker is open');
  });

  it('breaks circuit for HTTP DELETE', async () => {
    const client = createClient(defaultParams);
    const times = generateFailingCalls(client, 'delete');
    const errors = await times(3);

    assert.equal(errors[0].statusCode, 500);
    assert.equal(errors[1].statusCode, 500);
    assert.equal(errors[2].message, '[testing] Circuit breaker is open');
  });

  it('breaks circuit for HTTP HEAD', async () => {
    const client = createClient(defaultParams);
    const times = generateFailingCalls(client, 'head');
    const errors = await times(3);

    assert.equal(errors[0].statusCode, 500);
    assert.equal(errors[1].statusCode, 500);
    assert.equal(errors[2].message, '[testing] Circuit breaker is open');
  });

  it('breaks circuit for HTTP PATCH', async () => {
    const client = createClient(defaultParams);
    const times = generateFailingCalls(client, 'patch');
    const errors = await times(3);

    assert.equal(errors[0].statusCode, 500);
    assert.equal(errors[1].statusCode, 500);
    assert.equal(errors[2].message, '[testing] Circuit breaker is open');
  });
});
