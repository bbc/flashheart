import { defaultTransport } from '@bbc/http-transport';
import { assert } from 'chai';
import * as nock from 'nock';
import * as request from 'request';
import * as sinon from 'sinon';
import * as restClient from '../src';
import { Stats } from '../src/core/clientParams';

const host = 'https://example.api.co.uk';
const sandbox = sinon.createSandbox();

describe('Flashheart', () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    sandbox.restore();
  });

  describe('.get', () => {
    it('executes a HTTP GET request', async () => {
      nock(host)
        .get('/')
        .reply(200, { foo: 'bar' });

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.get(host);

      assert.equal(response.status, 200);
      return assert.deepEqual(response.body, { foo: 'bar' });
    });

    it('defaults its name to flashheart', async () => {
      nock(host)
        .get('/')
        .reply(200, { foo: 'bar' });

      const incrementStub = sandbox.stub();
      const statsStub: Stats = {
        increment: incrementStub,
        timing: sandbox.stub()
      };

      const client = restClient.createClient({ stats: statsStub });
      await client.get(host);
      const [clientName] = incrementStub.getCalls()[0].args[0].split('.');

      return assert.equal(clientName, 'flashheart');
    });

    it('uses the name supplied', async () => {
      nock(host)
        .get('/')
        .reply(200, { foo: 'bar' });

      const incrementStub = sandbox.stub();
      const statsStub: Stats = {
        increment: incrementStub,
        timing: sandbox.stub()
      };

      const client = restClient.createClient({ name: 'testing', stats: statsStub });
      await client.get(host);
      const [clientName] = incrementStub.getCalls()[0].args[0].split('.');

      return assert.equal(clientName, 'testing');
    });

    it('returns an error for a non 200 response', async () => {
      nock.cleanAll();
      nock(host)
        .get('/')
        .reply(500);

      const client = restClient.createClient({ name: 'testing', retries: 0 });
      try {
        await client.get(host);
      } catch (err) {
        return assert.equal(err.message, `Received HTTP code 500 for GET ${host}`);
      }
      assert.fail('Should have thrown');
    });

    it('sends a default UA with client version', async () => {
      nock.cleanAll();

      nock(host, {
        reqheaders: {
          'User-Agent': 'tool'
        }
      })
        .get('/')
        .reply(200);

      const client = restClient.createClient({ name: 'testing', retries: 0, userAgent: 'tool' });
      await client.get(host);
    });

    it('overrides headers from request options', async () => {
      nock.cleanAll();

      nock(host, {
        reqheaders: {
          'x-provider': 'dank'
        }
      })
        .get('/')
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      await client.get(host, { headers: { 'x-provider': 'dank' } });
    });

    it('overrides headers from request options', async () => {
      nock.cleanAll();
      nock(host)
        .get('/?x=1&y=2')
        .reply(200, { foo: 'bar' });

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.get(host, { qs: { x: 1, y: 2 } });

      assert.equal(response.status, 200);
      return assert.deepEqual(response.body, { foo: 'bar' });
    });
  });

  describe('Custom configuration', () => {
    it('executes a HTTP GET request using a custom http client', async () => {
      nock(host, { reqheaders: { myToken: 'token' } })
        .get('/')
        .reply(200, { foo: 'bar' });

      const customRequest = request.defaults({
        json: true,
        headers: { myToken: 'token' }
      });
      const client = restClient.createClient({
        name: 'testing',
        httpClient: new defaultTransport(customRequest)
      });
      const response = await client.get(host);
      return assert.deepEqual(response.body, { foo: 'bar' });
    });
  });

  describe('.put', () => {
    it('executes a HTTP PUT request', async () => {
      nock(host)
        .put('/', { very: 'dank' })
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.put(host, { very: 'dank' });

      assert.equal(response.status, 200);
    });

    it('overrides headers from request options', async () => {
      nock.cleanAll();

      nock(host, {
        reqheaders: {
          'x-provider': 'dank'
        }
      })
        .put('/')
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      await client.put(host, {}, { headers: { 'x-provider': 'dank' } });
    });

    it('overrides query strings from request options', async () => {
      nock.cleanAll();
      nock(host)
        .put('/?x=1&y=2')
        .reply(200, { foo: 'bar' });

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.put(host, {}, { qs: { x: 1, y: 2 } });

      assert.equal(response.status, 200);
      return assert.deepEqual(response.body, { foo: 'bar' });
    });

    it('sets the json opt', async () => {
      nock(host)
        .put('/', 'some string')
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.put(host, 'some string', { json: false });

      assert.equal(response.status, 200);
    });
  });

  describe('.post', () => {
    it('executes a HTTP POST request', async () => {
      nock(host)
        .post('/', { very: 'dank' })
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.post(host, { very: 'dank' });

      assert.equal(response.status, 200);
    });

    it('overrides headers from request options', async () => {
      nock.cleanAll();

      nock(host, {
        reqheaders: {
          'x-provider': 'dank'
        }
      })
        .post('/')
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      await client.post(host, {}, { headers: { 'x-provider': 'dank' } });
    });

    it('overrides headers from request options', async () => {
      nock.cleanAll();
      nock(host)
        .post('/?x=1&y=2')
        .reply(200, { foo: 'bar' });

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.post(host, {}, { qs: { x: 1, y: 2 } });

      assert.equal(response.status, 200);
      return assert.deepEqual(response.body, { foo: 'bar' });
    });
  });

  describe('.patch', () => {
    it('executes a HTTP PATCH request', async () => {
      nock(host)
        .patch('/', { very: 'dank' })
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.patch(host, { very: 'dank' });

      assert.equal(response.status, 200);
    });

    it('overrides headers from request options', async () => {
      nock.cleanAll();

      nock(host, {
        reqheaders: {
          'x-provider': 'dank'
        }
      })
        .patch('/')
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      await client.patch(host, {}, { headers: { 'x-provider': 'dank' } });
    });

    it('overrides headers from request options', async () => {
      nock.cleanAll();
      nock(host)
        .patch('/?x=1&y=2')
        .reply(200, { foo: 'bar' });

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.patch(host, {}, { qs: { x: 1, y: 2 } });

      assert.equal(response.status, 200);
      return assert.deepEqual(response.body, { foo: 'bar' });
    });
  });

  describe('.head', () => {
    it('executes a HTTP HEAD request', async () => {
      nock(host)
        .head('/')
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.head(host);

      assert.equal(response.status, 200);
    });

    it('overrides headers from request options', async () => {
      nock.cleanAll();

      nock(host, {
        reqheaders: {
          'x-provider': 'dank'
        }
      })
        .head('/')
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      await client.head(host, { headers: { 'x-provider': 'dank' } });
    });

    it('overrides headers from request options', async () => {
      nock.cleanAll();
      nock(host)
        .head('/?x=1&y=2')
        .reply(200, { foo: 'bar' });

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.head(host, { qs: { x: 1, y: 2 } });

      assert.equal(response.status, 200);
      return assert.deepEqual(response.body, { foo: 'bar' });
    });
  });

  describe('.delete', () => {
    it('executes a HTTP DELETE request', async () => {
      nock(host)
        .delete('/')
        .reply(204);

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.delete(host);

      assert.equal(response.status, 204);
    });

    it('overrides headers from request options', async () => {
      nock.cleanAll();

      nock(host, {
        reqheaders: {
          'x-provider': 'dank'
        }
      })
        .delete('/')
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      await client.delete(host, { headers: { 'x-provider': 'dank' } });
    });

    it('overrides headers from request options', async () => {
      nock.cleanAll();
      nock(host)
        .delete('/?x=1&y=2')
        .reply(200, { foo: 'bar' });

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.delete(host, { qs: { x: 1, y: 2 } });

      assert.equal(response.status, 200);
      return assert.deepEqual(response.body, { foo: 'bar' });
    });
  });

  describe('retries', () => {
    it('retries a given number of times for failed requests', async () => {
      nock.cleanAll();
      nock(host)
        .get('/')
        .times(2)
        .reply(500);

      nock(host)
        .get('/')
        .reply(200);

      const client = restClient.createClient({ name: 'testing', retries: 2 });
      const response = await client.get(host);

      assert.equal(response.status, 200);
    });

    it('retries once by default', async () => {
      nock.cleanAll();
      nock(host)
        .get('/')
        .times(1)
        .reply(500);

      nock(host)
        .get('/')
        .reply(200);

      const client = restClient.createClient({ name: 'testing' });
      const response = await client.get(host);

      assert.equal(response.status, 200);
    });

    it('disables retries', async () => {
      nock.cleanAll();
      nock(host)
        .get('/')
        .times(1)
        .reply(500);

      const client = restClient.createClient({ name: 'testing', retries: 0 });
      try {
        await client.get(host);
      } catch (err) {
        return assert.equal(err.message, `Received HTTP code 500 for GET ${host}`);
      }
      assert.fail('Should have thrown');
    });

    it('overrides the retry wait time between retries', async () => {
      nock.cleanAll();
      nock(host)
        .get('/')
        .times(1)
        .reply(500);

      nock(host)
        .get('/')
        .reply(200);

      const retryDelay = 200;
      const client = restClient.createClient({ name: 'testing', retries: 1, retryDelay });
      const startTime = Date.now();
      const res = await client.get(host);
      const timeTaken = Date.now() - startTime;

      assert.isAbove(timeTaken, retryDelay, 'retryDelay too low.');
      assert.equal(res.status, 200);
    });
  });

  describe('timeout', () => {
    it('times out a request', async () => {
      nock.cleanAll();
      nock(host)
        .get('/')
        .socketDelay(1000)
        .reply(200);

      const client = restClient.createClient({
        name: 'testing',
        retries: 0,
        timeout: 20
      });

      try {
        await client.get(host);
      } catch (err) {
        return assert.equal(err.message, 'Request failed for GET https://example.api.co.uk: ESOCKETTIMEDOUT');
      }
      assert.fail('Should have thrown');
    });
  });
});
