var async = require('async');
var nock = require('nock');
var sinon = require('sinon');
var assert = require('chai').assert;
var sandbox = sinon.sandbox.create();
var Client = require('..');

var api = nock('http://www.example.com');

var url = 'http://www.example.com/';
var responseBody = {
  foo: 'bar'
};

var nockElapsedTime = sinon.match.number;
var expectedCachedResponse = {
  statusCode: 200,
  headers: {
    'cache-control': 'max-age=60',
    'content-type': 'application/json'
  },
  elapsedTime: nockElapsedTime
};

describe('Caching', function () {
  var stats;
  var logger;
  var client;
  var catbox;

  var headers = {
    'cache-control': 'max-age=60'
  };

  var expectedKey = {
    segment: 'flashheart:' + require('../package').version,
    id: url
  };

  beforeEach(function () {
    nock.cleanAll();
    api.get('/').reply(200, responseBody, headers);
    catbox = {
      set: sandbox.stub(),
      get: sandbox.stub(),
      start: sandbox.stub()
    };
    stats = {
      increment: sandbox.stub(),
      timing: sandbox.stub()
    };
    logger = {
      info: sandbox.stub(),
      warn: sandbox.stub()
    };
    catbox.get.yields(null);
    client = Client.createClient({
      cache: catbox,
      stats: stats,
      logger: logger,
      retries: 0
    });
  });

  it('caches the body and the response based on its max-age header', function (done) {
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.calledWith(catbox.set, expectedKey, {
        body: responseBody,
        response: expectedCachedResponse
      }, 60000);
      done();
    });
  });

  it('returns the response from the cache if it exists', function (done) {
    var cachedResponseBody = {
      foo: 'baz'
    };

    catbox.get.withArgs(expectedKey).yields(null, {
      item: {
        body: cachedResponseBody,
        response: expectedCachedResponse
      }
    });
    client.get(url, function (err, body, res) {
      assert.ifError(err);
      assert.deepEqual(body, cachedResponseBody);
      assert.deepEqual(res, expectedCachedResponse);
      sinon.assert.notCalled(catbox.set);
      done();
    });
  });

  it('caches HTTP error responses', function (done) {
    var errorResponseCode = 503;
    var errorResponseBody = {
      error: 'An error'
    };
    var errorHeaders = {
      'cache-control': 'max-age=5',
      'content-type': 'application/json',
      'www-authenticate': 'Bearer realm="/"'
    };

    var cacheHeaders = errorHeaders;

    nock.cleanAll();
    api.get('/').reply(errorResponseCode, errorResponseBody, errorHeaders);
    client.get(url, function (err) {
      assert.ok(err);
      assert.equal(err.statusCode, errorResponseCode);
      sinon.assert.calledWith(catbox.set, expectedKey, {
        error: {
          message: 'Received HTTP code 503 for GET http://www.example.com/',
          statusCode: errorResponseCode,
          body: errorResponseBody,
          headers: errorHeaders
        },
        response: {
          statusCode: errorResponseCode,
          headers: cacheHeaders,
          elapsedTime: sinon.match.number
        }
      });
      done();
    });
  });

  it('returns an error from the cache if it exists', function (done) {
    var errorResponseBody = {
      error: 'An error'
    };

    var headers = {
      'cache-control': 'max-age=5',
      'content-type': 'application/json',
      'www-authenticate': 'Bearer realm="/"'
    };

    catbox.get.withArgs(expectedKey).yields(null, {
      item: {
        error: {
          statusCode: 503,
          message: 'Received HTTP code 503 for GET http://www.example.com/',
          body: errorResponseBody,
          headers: headers
        }
      }
    });
    client.get(url, function (err) {
      assert.ok(err);
      assert.equal(err.statusCode, 503);
      assert.deepEqual(err.body, errorResponseBody);
      assert.deepEqual(err.headers, headers);
      done();
    });
  });

  it('makes a request when the value stored in the cache doesn\'t contain the response body', function (done) {
    catbox.get.withArgs(expectedKey).yields(null, {
      item: {
        not: 'the json you were looking for'
      }
    });
    client.get(url, function (err, body) {
      assert.ifError(err);
      assert.deepEqual(body, responseBody);
      done();
    });
  });

  it('returns the response when writing to the cache fails', function (done) {
    catbox.set.withArgs(expectedKey).returns(new Error('Good use of Sheeba!'));
    client.get(url, function (err, body) {
      assert.ifError(err);
      sinon.assert.calledWith(catbox.set, expectedKey, {
        body: responseBody,
        response: expectedCachedResponse
      }, 60000);
      assert.deepEqual(responseBody, body);
      done();
    });
  });

  it('logs a warning when writing to the cache fails', function (done) {
    catbox.set.withArgs(expectedKey).yields(new Error('Good use of Sheeba!'));
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.calledWith(logger.warn, 'Cache error:', 'Good use of Sheeba!');
      done();
    });
  });

  it('increments a counter writing to the cache fails', function (done) {
    catbox.set.withArgs(expectedKey).yields(new Error('Good use of Sheeba!'));
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.calledWith(stats.increment, 'http.cache.errors');
      done();
    });
  });

  it('returns the response when reading from the cache fails', function (done) {
    catbox.get.withArgs(expectedKey).yields(new Error('Experienced write error. Sheeba Sheeba!'));
    client.get(url, function (err, body) {
      assert.ifError(err);
      sinon.assert.calledWith(catbox.set, expectedKey, {
        body: responseBody,
        response: expectedCachedResponse
      }, 60000);
      assert.deepEqual(responseBody, body);
      done();
    });
  });

  it('logs a warning when reading from the cache fails', function (done) {
    catbox.get.withArgs(expectedKey).yields(new Error('Failed to get'));
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.calledWith(logger.warn, 'Cache error:', 'Failed to get');
      done();
    });
  });

  it('caches the response using a key comprised of the url and the stringified request options', function (done) {
    var opts = {
      foo: 'bar'
    };

    var keyWithOpts = {
      segment: 'flashheart:' + require('../package').version,
      id: url + JSON.stringify(opts)
    };

    client.get(url, opts, function (err, body) {
      assert.ifError(err);
      sinon.assert.calledWith(catbox.set, keyWithOpts, {
        body: responseBody,
        response: expectedCachedResponse
      }, 60000);
      assert.deepEqual(responseBody, body);
      done();
    });
  });

  it('does not cache the response if the cache-control header is not present', function (done) {
    nock.cleanAll();
    api.get('/').reply(200);
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.notCalled(catbox.set);
      done();
    });
  });

  it('does not cache the response if the max-age value is not present', function (done) {
    var headers = {
      'cache-control': ''
    };

    nock.cleanAll();
    api.get('/').reply(200, responseBody, headers);
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.notCalled(catbox.set);
      done();
    });
  });

  it('does not cache the response if the max-age value is zero', function (done) {
    var headers = {
      'cache-control': 'max-age=0'
    };

    nock.cleanAll();
    api.get('/').reply(200, responseBody, headers);
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.notCalled(catbox.set);
      done();
    });
  });

  it('does not cache the response if the max-age value is invalid', function (done) {
    var headers = {
      'cache-control': 'max-age=invalid'
    };

    nock.cleanAll();
    api.get('/').reply(200, responseBody, headers);
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.notCalled(catbox.set);
      done();
    });
  });

  it('respects the doNotVary option when creating a cache key', function (done) {
    var reqheaders = {
      'Request-ID': 'bar',
      'I-Should-Vary': 'foo'
    };

    nock.cleanAll();
    nock('http://www.example.com', {
      reqheaders: reqheaders
    }).get('/').reply(200, responseBody, headers);

    client = Client.createClient({
      cache: catbox,
      doNotVary: ['Request-ID']
    });

    var opts = {
      headers: reqheaders
    };
    var optsWithoutIgnoredHeaders = {
      headers: {
        'I-Should-Vary': 'foo'
      }
    };

    client.get(url, opts, function (err, body) {
      assert.ifError(err);
      sinon.assert.calledWith(catbox.set, sinon.match({
        id: url + JSON.stringify(optsWithoutIgnoredHeaders)
      }), sinon.match.object, 60000);
      assert.deepEqual(responseBody, body);
      done();
    });
  });

  it('ignores case in the doNotVary option', function (done) {
    client = Client.createClient({
      cache: catbox,
      doNotVary: ['Request-ID']
    });

    var opts = {
      headers: {
        'request-id': 'bar'
      }
    };
    var optsWithoutIgnoredHeaders = {
      headers: {}
    };

    client.get(url, opts, function (err, body) {
      assert.ifError(err);
      sinon.assert.calledWith(catbox.set, sinon.match({
        id: url + JSON.stringify(optsWithoutIgnoredHeaders)
      }), sinon.match.object, 60000);
      assert.deepEqual(responseBody, body);
      done();
    });
  });

  it('handles requests without headers when using the doNotVary option', function (done) {
    client = Client.createClient({
      cache: catbox,
      doNotVary: ['Request-ID']
    });

    var opts = {};

    client.get(url, opts, function (err, body) {
      assert.ifError(err);
      sinon.assert.calledWith(catbox.set, sinon.match({
        id: url
      }), sinon.match.object, 60000);
      assert.deepEqual(responseBody, body);
      done();
    });
  });

  it('does not cache response if the cache-control header is set to private', function (done) {
    var headers = {
      'cache-control': 'private, max-age=50'
    };

    nock.cleanAll();
    api.get('/').reply(200, responseBody, headers);
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.notCalled(catbox.set);
      done();
    });
  });

  it('does not cache response if no-cache directive is present', function (done) {
    var headers = {
      'cache-control': 'no-cache, max-age=10'
    };

    nock.cleanAll();
    api.get('/').reply(200, responseBody, headers);
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.notCalled(catbox.set);
      done();
    });
  });

  it('increments a counter for each cache hit', function (done) {
    catbox.get.withArgs(expectedKey).yields(null, {
      item: {
        body: responseBody
      }
    });
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.calledWith(stats.increment, 'http.cache.hits');
      done();
    });
  });

  it('increments a counter for each cache miss', function (done) {
    client.get(url, function (err) {
      assert.ifError(err);
      sinon.assert.calledWith(stats.increment, 'http.cache.misses');
      done();
    });
  });

  it('supports the circuit breaker', function (done) {
    client = Client.createClient({
      cache: catbox,
      retries: 0,
      circuitBreakerMaxFailures: 3
    });

    nock.cleanAll();
    api.get('/').times(6).reply(500);

    async.times(5, function (i, cb) {
      client.get(url, function () {
        cb();
      });
    }, function () {
      client.get(url, function (err) {
        assert(err);
        assert.include(err.message, 'Circuit breaker is open');
        done();
      });
    });
  });

  it('supports the HEAD method', function (done) {
    api.head('/').reply(200);
    client.head(url, {}, done);
  });

  it('supports the PUT method', function (done) {
    api.put('/', {}).reply(200);
    client.put(url, {}, done);
  });

  it('supports the POST method', function (done) {
    api.post('/', {}).reply(200);
    client.post(url, {}, done);
  });

  it('supports the PATCH method', function (done) {
    api.patch('/', {}).reply(204);
    client.patch(url, {}, done);
  });

  it('supports the DELETE method', function (done) {
    api.delete('/').reply(204);
    client.delete(url, done);
  });
});
