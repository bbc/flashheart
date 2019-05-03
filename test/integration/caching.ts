import { events } from '@bbc/http-transport-cache';
import * as Catbox from 'catbox';
import * as Memory from 'catbox-memory';
import { assert } from 'chai';
import * as nock from 'nock';
import * as sinon from 'sinon';
import { ClientParams, createClient } from '../../src';
import * as memoryCache from '../../src/caching/memory';

function sleep(ms: number = 200): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

const sandbox = sinon.createSandbox();

const host = 'http://localhost:5555';
const requestOptions = { headers: { body: { x: 1 } } };
const memoryCacheParams = { 
  name: 'testing',
  memoryCache: {
    maxSize: 1000
  },
  stats: {
    increment: sinon.spy(),
    timing: () => {}
  }
};

function createStubbedCatbox(): any {
  return {
    set: sandbox.stub(),
    get: sandbox.stub(),
    start: sandbox.stub(),
    isReady: () => { return true; }
  };
}

function createParamsWithMultiCache(): any {
  return {
    name: 'testing',
    memoryCache: { maxSize: 1000 },
    externalCache: {
      cache: new Catbox.Client(new Memory())
    }
  };
}

function createParamsWithStubbedCache(): ClientParams {
  return {
    name: 'testing',
    memoryCache: { maxSize: 1000 },
    externalCache: {
      cache: createStubbedCatbox()
    }
  };
}

function createParamsWithExternalCache(): ClientParams {
  return {
    name: 'testing',
    externalCache: {
      cache: new Catbox.Client(new Memory())
    }
  };
}

describe('Caching integration', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.cleanAll();
  });

  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  afterEach(() => {
    sandbox.restore();
  })

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

      const client = createClient(createParamsWithExternalCache());
      const res = await client.get(`${host}/path`, requestOptions);
      const cachedRes = await client.get(`${host}/path`, requestOptions);
      assert.deepEqual(res.body, { x: 1 });
      assert.deepEqual(cachedRes.body, { x: 1 });
    });

    it('returns stale on error', async () => {
      nock(host)
        .get('/path')
        .reply(200, { x: 2 }, { 'Cache-Control': 'max-age=1,stale-if-error=2' });

      nock(host)
        .get('/path')
        .reply(500);

      const client = createClient(createParamsWithExternalCache());
      await client.get(`${host}/path`);

      await sleep(1000);

      const staleRes = await client.get(`${host}/path`);
      assert.deepEqual(staleRes.body, { x: 2 });
    });

    it('generates a valid cache key', async () => {
      const catbox = createStubbedCatbox();
      const clientParams = {
        name: 'testing',
        externalCache: {
          cache: catbox
        }
      };
      nock.cleanAll();
      nock('https://example.api.co.uk')
        .get('/episodes')
        .reply(200, { x: 1 }, { 'Cache-Control': 'max-age=30' });

      const client = createClient(clientParams);
      await client.get('https://example.api.co.uk/episodes');

      sinon.assert.calledWith(catbox.set, {
        id: 'GET:https://example.api.co.uk/episodes',
        segment: 'http-transport:3.5.1:body'
      }, sinon.match.any, 30000);
    });

    it('generates a valid cache key using query strings', async () => {
      const catbox = createStubbedCatbox();

      const clientParams = {
        name: 'testing',
        externalCache: {
          cache: catbox
        }
      };
      nock.cleanAll();
      nock('https://example.api.co.uk')
        .get('/episodes?fast-mode=true')
        .reply(200, { x: 1 }, { 'Cache-Control': 'max-age=30' });

      const client = createClient(clientParams);
      await client.get('https://example.api.co.uk/episodes?fast-mode=true');

      sinon.assert.calledWith(catbox.set, {
        id: 'GET:https://example.api.co.uk/episodes?fast-mode=true',
        segment: 'http-transport:3.5.1:body'
      });
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

      const client = createClient(createParamsWithMultiCache());
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

      const params = createParamsWithStubbedCache();
      const catbox = params.externalCache.cache;
      const client = createClient(params);
      await client.get(`${host}/path`, requestOptions);

      const fromMemoryCache = await client.get(`${host}/path`, requestOptions);
      assert.deepEqual(fromMemoryCache.body, { x: 1 });
      sinon.assert.callCount(catbox.get, 1);
    });

    it('uses external cache when memory cache has expired', async () => {
      const cache = new Catbox.Client(new Memory({}));
      const getSpy = sandbox.stub(cache, 'get').resolves(null); // simulate cache MISS
      sandbox.stub(memoryCache, 'createCache').returns(cache);

      const expectedResponse = { x: 1 };
      const responseHeaders = { 'Cache-Control': 'max-age=1' };

      nock(host)
        .get('/path')
        .once()
        .reply(200, expectedResponse, responseHeaders);

      const client = createClient(createParamsWithMultiCache());
      await client.get(`${host}/path`, requestOptions);

      const fromExternalCache = await client.get(`${host}/path`, requestOptions);
      assert.deepEqual(fromExternalCache.body, { x: 1 });
      sinon.assert.called(getSpy);
    });
  });

  describe('Events', () => {
    it('emits cache miss event and reports via stats client', async () => {
      nock(host)
        .get('/path')
        .times(1)
        .reply(200);

      let cacheMiss = false;
      events.on('cache.testingmemory.miss', () => {
        cacheMiss = true;
      });

      const client = createClient(memoryCacheParams);
      const res = await client.get(`${host}/path`);

      assert.ok(cacheMiss);
      assert.equal(memoryCacheParams.stats.increment.calledWith('testing.memory_cache.misses', 1, 0.05), true);
    });

    it('emits cache hit event and reports via stats client', async () => {
      nock(host)
        .get('/path')
        .times(2)
        .reply(200, { x: '1' }, { 'Cache-Control': 'max-age=10' });

      let cacheHit = false;
      events.on('cache.testingmemory.hit', () => {
        cacheHit = true;
      });

      const client = createClient(memoryCacheParams);
      await client.get(`${host}/path`);
      await client.get(`${host}/path`);

      assert.ok(cacheHit);
      assert.equal(memoryCacheParams.stats.increment.calledWith('testing.memory_cache.hits', 1, 0.05), true);
    });

    it('emits cache stale event and reports via stats client', async () => {
      nock(host)
        .get('/path')
        .reply(200, { x: 2 }, { 'Cache-Control': 'max-age=1,stale-if-error=2' });

      nock(host)
        .get('/path')
        .reply(500);

      let cacheStale = false;
      events.on('cache.testingmemory.stale', () => {
        cacheStale = true;
      });

      const client = createClient(memoryCacheParams);
      await client.get(`${host}/path`, requestOptions);
      await sleep(1000);
      await client.get(`${host}/path`, requestOptions);

      assert.ok(cacheStale);
      assert.equal(memoryCacheParams.stats.increment.calledWith('testing.memory_cache.stale', 1, 0.05), true);
    });

    it('emits cache error event', async () => {
      const cache = new Catbox.Client(new Memory({}));
      sandbox.stub(cache, 'get').rejects(new Error('error')); // simulate cache error
      sandbox.stub(memoryCache, 'createCache').returns(cache);

      nock(host).get('/path').reply(200);
      
      let cacheError = false;
      events.on('cache.testingmemory.error', () => {
        cacheError = true;
      });

      const client = createClient(memoryCacheParams);

      try {
        await client.get(`${host}/path`);
      } catch (e) {
        assert.ok(cacheError);
        return assert.equal(memoryCacheParams.stats.increment.calledWith('testing.memory_cache.errors'), true);
      }
    });

    it('emits cache timeout event and reports via stats client', async () => {
      const clientParams = {
        ...createParamsWithExternalCache(),
        externalCache: {
          ...createParamsWithExternalCache().externalCache,
          timeout: 10
        },
        stats: {
          increment: sinon.spy(),
          timing: () => {}
        }
      };

      sandbox.stub(clientParams.externalCache.cache, 'get').callsFake(async () => {
        await sleep(1000);
      });

      nock(host)
        .get('/path')
        .reply(200);

      let cacheTimeout = false;
      events.on('cache.testing.timeout', () => {
        cacheTimeout = true;
      });

      const client = createClient(clientParams);
      await client.get(`${host}/path`);

      assert.ok(cacheTimeout);
      assert.equal(clientParams.stats.increment.calledWith('testing.cache.timeouts'), true);
    });
  });
});
