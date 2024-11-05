import { createClient } from '../../src';
import { RequestOptions } from '../../src/core/restClient';
import { createServer } from './fakeServer';

const defaultHost = 'http://localhost:5555';
const rateLimit = 3;
const rateLimitInterval = 1000;
const defaultParams = { name: 'testing' };
const rateLimitParams = { ...defaultParams, rateLimit, rateLimitInterval };

function checkNumberRequests(resolve: any, reject: any, actualRequest: number, expectingRequest: number): void {
  if (actualRequest === expectingRequest) {
    resolve();
  } else {
    reject(`number of requests: expecting=${expectingRequest}, actual=${actualRequest}`);
  }
}

describe('Rate limiting integration', () => {
  let fakeServer;

  beforeEach((done) => {
    fakeServer = createServer(done);
  });

  afterEach(() => {
    fakeServer.close();
  });

  it('no rate limitation by default', async () => {
    const client = createClient(defaultParams);

    let actualRequest = 0;
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => {
        checkNumberRequests(resolve, reject, actualRequest, rateLimit * 2);
      }, rateLimitInterval);
    });

    for (let i = 0; i < rateLimit * 2; i++) {
      await client.get(defaultHost, { headers: { Status: 200 } });
      actualRequest++;
    }

    await timeout;
  });

  it('rate limiting for HTTP GET', async () => {
    const client = createClient(rateLimitParams);

    let actualRequest = 0;
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => {
        checkNumberRequests(resolve, reject, actualRequest, rateLimit);
      }, rateLimitInterval);
    });

    for (let i = 0; i < rateLimit * 2; i++) {
      await client.get(defaultHost, { headers: { Status: 200 } });
      actualRequest++;
    }

    await timeout;
  });

  it('rate limiting for HTTP POST', async () => {
    const client = createClient(rateLimitParams);

    let actualRequest = 0;
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => {
        checkNumberRequests(resolve, reject, actualRequest, rateLimit);
      }, rateLimitInterval);
    });

    for (let i = 0; i < rateLimit * 2; i++) {
      await client.post(defaultHost, null, { headers: { Status: 200 } });
      actualRequest++;
    }

    await timeout;
  });

  it('rate limiting for HTTP PUT', async () => {
    const client = createClient(rateLimitParams);

    let actualRequest = 0;
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => {
        checkNumberRequests(resolve, reject, actualRequest, rateLimit);
      }, rateLimitInterval);
    });

    for (let i = 0; i < rateLimit * 2; i++) {
      await client.put(defaultHost, null, { headers: { Status: 200 } });
      actualRequest++;
    }

    await timeout;
  });

  it('rate limiting for HTTP PATCH', async () => {
    const client = createClient(rateLimitParams);

    let actualRequest = 0;
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => {
        checkNumberRequests(resolve, reject, actualRequest, rateLimit);
      }, rateLimitInterval);
    });

    for (let i = 0; i < rateLimit * 2; i++) {
      await client.patch(defaultHost, null, { headers: { Status: 200 } });
      actualRequest++;
    }

    await timeout;
  });

  it('rate limiting for HTTP DELETE', async () => {
    const client = createClient(rateLimitParams);

    let actualRequest = 0;
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => {
        checkNumberRequests(resolve, reject, actualRequest, rateLimit);
      }, rateLimitInterval);
    });

    for (let i = 0; i < rateLimit * 2; i++) {
      await client.delete(defaultHost, { headers: { Status: 200 } });
      actualRequest++;
    }

    await timeout;
  });

  it('rate limiting for HTTP GET/POST/PUT/PATCH/DELETE', async () => {
    const client = createClient(rateLimitParams);

    let actualRequest = 0;
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => {
        checkNumberRequests(resolve, reject, actualRequest, rateLimit);
      }, rateLimitInterval);
    });

    const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];
    const opts: RequestOptions = { headers: { Status: 200 } };
    for (let i = 0; i < rateLimit * 2; i++) {
      const httpMethod = httpMethods[Math.floor(Math.random() * httpMethods.length)];
      if (httpMethod === 'get' || httpMethod === 'delete') {
        await client[httpMethod](defaultHost, opts);
      } else {
        await client[httpMethod](defaultHost, null, opts);
      }

      actualRequest++;
    }

    await timeout;
  });
});
