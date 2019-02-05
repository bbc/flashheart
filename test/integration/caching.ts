import * as Catbox from 'catbox';
import * as Memory from 'catbox-memory';
import { assert } from 'chai';
import * as nock from 'nock';
import * as redis from 'redis';
import * as sinon from 'sinon';
import { createClient } from '../../src';
import * as memoryCache from '../../src/caching/memory';

function sleep(ms: number = 200): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

const host = 'http://localhost:5555';
const requestOptions = { headers: { body: { x: 1 } } };
const memoryCacheParams = { name: 'testing', memoryCache: { maxSize: 1000 } };
const externalCacheParams = { name: 'testing', externalCache: { host: 'localhost', port: 6379 } };
const multiLayeredCacheParams = {
  name: 'testing',
  memoryCache: { maxSize: 1000 },
  externalCache: { host: 'localhost', port: 6379 }
};

const redisClient = redis.createClient();
const { promisify } = require('util');
const getKeys = promisify(redisClient.keys).bind(redisClient);

describe.skip('Caching integration', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.cleanAll();
    redisClient.flushdb();
  });

  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe('Memory caching', () => {
    it('caches based on max-age', async () => {
      nock(host)
        .get('/path')
        .times(1)
        .reply(200, { x: 1 }, { 'Cache-Control': 'max-age=10' });

      const client = createClient(memoryCacheParams);
      const res = await client.get(`${host}/path`, requestOptions);
      const cachedRes = await client.get(`${host}/path`, requestOptions);
      assert.deepEqual(res.body, { x: 1 });
      assert.deepEqual(cachedRes.body, { x: 1 });
    });

    it('returns an error after cached entry has expired', async () => {
      nock(host)
        .get('/path')
        .reply(200, { x: 2 }, { 'Cache-Control': 'max-age=1' });

      nock(host)
        .get('/path')
        .reply(500);

      const client = createClient({ name: 'testing', memoryCache: { maxSize: 1000 } });
      await client.get(`${host}/path`);

      await sleep(1000);

      try {
        await client.get(`${host}/path`, requestOptions);
      } catch (err) {
        return assert.ok(err);
      }
      assert.fail('Expected to have thrown');
    });

    it('returns stale on error', async () => {
      nock(host)
        .get('/path')
        .reply(200, { x: 2 }, { 'Cache-Control': 'max-age=1,stale-if-error=2' });

      nock(host)
        .get('/path')
        .reply(500);

      const client = createClient({ name: 'testing', memoryCache: { maxSize: 1000 } });
      await client.get(`${host}/path`);

      await sleep(1000);

      const staleRes = await client.get(`${host}/path`);
      assert.deepEqual(staleRes.body, { x: 2 });
    });
  });

  describe('External caching', () => {
    it('caches based on max-age', async () => {
      nock(host)
        .get('/path')
        .times(1)
        .reply(200, { x: 1 }, { 'Cache-Control': 'max-age=10' });

      const client = createClient(externalCacheParams);
      const res = await client.get(`${host}/path`, requestOptions);
      const cachedRes = await client.get(`${host}/path`, requestOptions);
      assert.deepEqual(res.body, { x: 1 });
      assert.deepEqual(cachedRes.body, { x: 1 });
    });

    it('returns an error after cached entry has expired', async () => {
      nock(host)
        .get('/path')
        .reply(200, { x: 2 }, { 'Cache-Control': 'max-age=1' });

      nock(host)
        .get('/path')
        .reply(500);

      const client = createClient(externalCacheParams);
      await client.get(`${host}/path`);

      await sleep(1000);

      try {
        await client.get(`${host}/path`, requestOptions);
      } catch (err) {
        return assert.ok(err);
      }
      assert.fail('Expected to have thrown');
    });

    it('returns stale on error', async () => {
      nock(host)
        .get('/path')
        .reply(200, { x: 2 }, { 'Cache-Control': 'max-age=1,stale-if-error=2' });

      nock(host)
        .get('/path')
        .reply(500);

      const client = createClient(externalCacheParams);
      await client.get(`${host}/path`);

      await sleep(1000);

      const staleRes = await client.get(`${host}/path`);
      assert.deepEqual(staleRes.body, { x: 2 });
    });

    it('generates a valid cache key', async () => {
      nock.cleanAll();
      nock('https://example.api.co.uk')
        .get('/episodes')
        .reply(200, { x: 1 }, { 'Cache-Control': 'max-age=30' });

      const client = createClient(externalCacheParams);
      await client.get('https://example.api.co.uk/episodes');

      const keys = await getKeys('*');
      assert.equal(keys.length, 1);
      assert.match(keys[0], /rest_client:http-transport.*body:GET%3Ahttps%3A%2F%2Fexample.api.co.uk%2Fepisodes/);
    });

    it('generates a valid cache key using query strings', async () => {
      nock.cleanAll();
      nock('https://example.api.co.uk')
        .get('/episodes?fast-mode=true')
        .reply(200, { x: 1 }, { 'Cache-Control': 'max-age=30' });

      const client = createClient(externalCacheParams);
      await client.get('https://example.api.co.uk/episodes?fast-mode=true');

      const keys = await getKeys('*');
      assert.equal(keys.length, 1);
      assert.match(keys[0], /rest_client:http-transport.*body:GET%3Ahttps%3A%2F%2Fexample.api.co.uk%2Fepisodes%3Ffast-mode%3Dtrue/);
    });

    it('supports connection strings', async () => {
      nock(host)
        .get('/path')
        .times(1)
        .reply(200, { x: 1 }, { 'Cache-Control': 'max-age=10' });

      const connectionStringParams = { name: 'testing', externalCache: { connectionString: 'redis://localhost:6379' } };
      const client = createClient(connectionStringParams);
      const res = await client.get(`${host}/path`, requestOptions);
      const cachedRes = await client.get(`${host}/path`, requestOptions);
      assert.deepEqual(res.body, { x: 1 });
      assert.deepEqual(cachedRes.body, { x: 1 });
    });
  });

  describe('Multi-layered caching', () => {
    it('returns cached response', async () => {
      const expectedResponse = { x: 1 };
      const responseHeaders = { 'Cache-Control': 'max-age=2' };

      nock(host)
        .get('/path')
        .times(1)
        .reply(200, expectedResponse, responseHeaders);

      const client = createClient(multiLayeredCacheParams);
      const res = await client.get(`${host}/path`, requestOptions);
      const cachedRes = await client.get(`${host}/path`, requestOptions);

      assert.deepEqual(res.body, { x: 1 });
      assert.deepEqual(cachedRes.body, { x: 1 });
    });

    it('uses memory cache before external cache', async () => {
      const expectedResponse = { x: 1 };
      const responseHeaders = { 'Cache-Control': 'max-age=1' };

      nock(host)
        .get('/path')
        .once()
        .reply(200, expectedResponse, responseHeaders);

      const client = createClient(multiLayeredCacheParams);
      await client.get(`${host}/path`, requestOptions);

      redisClient.flushall(); // ensure no external cache entry

      const fromMemoryCache = await client.get(`${host}/path`, requestOptions);
      assert.deepEqual(fromMemoryCache.body, { x: 1 });
    });

    it('uses external cache when memory cache has expired', async () => {
      const cache = new Catbox.Client(new Memory({}));
      const getSpy = sinon.stub(cache, 'get').resolves(null); // simulate cache MISS
      sinon.stub(memoryCache, 'createCache').returns(cache);

      const expectedResponse = { x: 1 };
      const responseHeaders = { 'Cache-Control': 'max-age=1' };

      nock(host)
        .get('/path')
        .once()
        .reply(200, expectedResponse, responseHeaders);

      const client = createClient(multiLayeredCacheParams);
      await client.get(`${host}/path`, requestOptions);

      const fromExternalCache = await client.get(`${host}/path`, requestOptions);
      assert.deepEqual(fromExternalCache.body, { x: 1 });
      sinon.assert.called(getSpy);
    });
  });
});
