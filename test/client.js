var _ = require('lodash');
var nock = require('nock');
var assert = require('chai').assert;
var async = require('async');
var sinon = require('sinon');
var request = require('request');
var http = require('http');
var util = require('util');
var package = require('../package');
var Client = require('..');
var sandbox = sinon.sandbox.create();
var client;

var url = 'http://www.example.com/';
var host = 'http://www.example.com';
var api = nock(host);
var path = '/';
var requestBody = {
  foo: 'bar'
};
var responseBody = requestBody;

function nockRetries(retry, opts) {
  const httpMethod = _.get(opts, 'httpMethod') || 'get';
  const successCode = _.get(opts, 'successCode') || 200;

  nock.cleanAll();
  api[httpMethod](path).times(retry).reply(500);
  api[httpMethod](path).reply(successCode);
}

describe('Rest Client', function () {
  var stats;
  var logger;

  beforeEach(function () {
    nock.disableNetConnect();
    nock.cleanAll();
    stats = {
      increment: sandbox.stub(),
      timing: sandbox.stub()
    };
    logger = {
      info: sandbox.stub(),
      warn: sandbox.stub()
    };
    client = Client.createClient({
      stats: stats,
      retries: 0,
      retryTimeout: 0
    });
    api.get(path).reply(200, responseBody);
  });

  it('can be created without any options', function () {
    var client = Client.createClient();

    assert.ok(client);
  });

  it('can append default options to the existing request client', function (done) {
    var client = Client.createClient({
      defaults: {
        baseUrl: host
      }
    });

    client.get(path, function (err) {
      assert.ifError(err);
      assert.strictEqual(nock.isDone(), true);
      done();
    });
  });

  it('can override default options on the existing request client', function (done) {
    var client = Client.createClient({
      defaults: {
        time: false
      }
    });

    client.get(url, function (err, body, res) {
      assert.ifError(err);
      assert.strictEqual(res.elapsedTime, undefined);
      done();
    });
  });

  it('can throttle requests for a given time interval', function (done) {
    var time = process.hrtime();
    var client = Client.createClient({
      rateLimitLimit: 1,
      rateLimitInterval: 1000
    });

    nock.cleanAll();
    api.get(path).times(2).reply(200);

    async.times(2, function (i, cb) {
      client.get(url, function (err) {
        cb(err, {
          'status': true
        });
      });
    }, function (err, results) {
      var diff = process.hrtime(time);
      assert.ifError(err);
      assert.strictEqual(results.length, 2, 'The two requests went through');
      assert.strictEqual(diff[0], 1, 'There was one second interval between each request');
      done();
    });
  });

  describe('.get', function () {
    it('returns body of a JSON response', function (done) {
      client.get(url, function (err, body) {
        assert.ifError(err);
        assert.equal(body.foo, 'bar');
        done();
      });
    });

    it('returns an error for a non 200 response', function (done) {
      nock.cleanAll();
      api.get(path).reply(500);
      client.get(url, function (err) {
        assert(err);
        assert.equal(err.message, 'Received HTTP code 500 for GET http://www.example.com/');
        done();
      });
    });

    it('includes the status code in the error for a non 200 response', function (done) {
      nock.cleanAll();
      api.get(path).reply(500);
      client.get(url, function (err) {
        assert(err);
        assert.equal(err.statusCode, 500);
        done();
      });
    });

    it('includes the body in the error for a non 200 response', function (done) {
      nock.cleanAll();
      api.get(path).reply(500, {
        error: 'this is the body of the error'
      });
      client.get(url, function (err) {
        assert(err);
        assert.equal(err.body.error, 'this is the body of the error');
        done();
      });
    });

    it('includes the headers in the error for a non 200 response', function (done) {
      nock.cleanAll();
      api.get(path).reply(500, {
        error: 'this is the body of the error'
      }, {
        'www-authenticate': 'Bearer realm="/"'
      });
      client.get(url, function (err) {
        assert(err);
        assert.equal(err.headers['www-authenticate'], 'Bearer realm="/"');
        done();
      });
    });

    it('returns an error when the request fails', function (done) {
      nock.cleanAll();
      api.get('/').socketDelay(1000).reply(200, responseBody);
      client.get(url, {
        timeout: 20
      }, function (err) {
        assert(err);
        assert.equal(err.message, 'Request failed for http://www.example.com/ ESOCKETTIMEDOUT');
        done();
      });
    });

    it('includes the query strings in the url when a request fails', function (done) {
      nock.cleanAll();
      api.get('/?a=1&b=2').socketDelay(1000).reply(200, responseBody);
      client.get(url, {
        timeout: 20,
        qs: {
          a: 1,
          b: 2
        }
      }, function (err) {
        assert(err);
        assert.equal(err.message, 'Request failed for http://www.example.com/?a=1&b=2 ESOCKETTIMEDOUT');
        done();
      });
    });

    it('logs each request at info level when a logger is passed in', function (done) {
      client = Client.createClient({
        logger: logger
      });

      client.get(url, function (err) {
        assert.ifError(err);
        sinon.assert.called(logger.info);
        var message = logger.info.getCall(0).args[0];
        assert.match(message, /GET http:\/\/www.example.com\/ 200 \d+ ms/);
        done();
      });
    });

    it('increments counter http.requests for each request', function (done) {
      client.get(url, function (err) {
        assert.ifError(err);
        sinon.assert.calledWith(stats.increment, 'http.requests');
        done();
      });
    });

    it('increments counter a request counter with the name of the client if one is provided', function (done) {
      var client = Client.createClient({
        name: 'my_client',
        stats: stats
      });

      client.get(url, function (err) {
        assert.ifError(err);
        sinon.assert.calledWith(stats.increment, 'my_client.requests');
        done();
      });
    });

    it('increments a request counter with the name of the client and feed if provided', function (done) {
      var client = Client.createClient({
        name: 'my_client',
        stats: stats
      });

      client.get(url, {
        name: 'feed'
      }, function (err) {
        assert.ifError(err);
        sinon.assert.calledWith(stats.increment, 'my_client.feed.requests');
        done();
      });
    });

    it('increments counter response for each response', function (done) {
      client.get(url, function (err) {
        assert.ifError(err);
        sinon.assert.calledWith(stats.increment, 'http.responses.200');
        done();
      });
    });

    it('records a timer for the response time', function (done) {
      client.get(url, function (err) {
        assert.ifError(err);
        sinon.assert.calledWith(stats.timing, 'http.response_time');
        done();
      });
    });

    it('increments counter for errors', function (done) {
      nock.cleanAll();
      client.get(url, function (err) {
        assert(err);
        sinon.assert.calledWith(stats.increment, 'http.request_errors');
        done();
      });
    });

    it('increments a counter for errors with feed name in it', function (done) {
      var client = Client.createClient({
        name: 'my_client',
        stats: stats,
        retries: 0,
        retryTimeout: 0
      });
      nock.cleanAll();

      client.get(url, {
        name: 'feed'
      }, function (err) {
        assert(err);
        sinon.assert.calledWith(stats.increment, 'my_client.feed.request_errors');
        done();
      });
    });

    it('supports request options', function (done) {
      nock.cleanAll();
      api.get('/?foo=bar').reply(200, responseBody);
      client.get(url, {
        qs: {
          foo: 'bar'
        }
      }, function (err, body) {
        assert.ifError(err);
        assert.equal(body.foo, 'bar');
        done();
      });
    });

    it('supports HTTP servers as well as HTTPS', function (done) {
      var server = http.createServer(function (req, res) {
        res.writeHead(200, 'Content-Type: application/json');
        res.write('{"foo": "bar"}');
        res.end();
      });

      server.listen(0);
      var url = util.format('http://127.0.0.1:%d', server.address().port);
      nock.enableNetConnect(url.replace('http://', ''));

      client.get(url, function (err, body) {
        assert.ifError(err);
        assert.equal(body.foo, 'bar');
        done();
      });
    });

    it('retries a given number of times for failed requests', function (done) {
      client = Client.createClient({
        retries: 2,
        retryTimeout: 0
      });
      nockRetries(2);
      client.get(url, done);
    });

    it('retries failed requests default number of times', function (done) {
      client = Client.createClient({
        retryTimeout: 0
      });
      nockRetries(1);
      client.get(url, done);
    });

    it('overrides retries using method options', function (done) {
      client = Client.createClient({
        retryTimeout: 1
      });
      nockRetries(2);

      client.get(url, {
        retries: 2
      }, done);
    });

    it('does not retry 4XX errors', function (done) {
      client = Client.createClient({
        retries: 1,
        retryTimeout: 0
      });
      nock.cleanAll();
      api.get(path).reply(400);
      api.get(path).reply(200, responseBody);
      client.get(url, function (err) {
        assert.ok(err);
        done();
      });
    });

    it('records a timer for the number of attempts', function (done) {
      nockRetries(1);
      client = Client.createClient({
        stats: stats,
        retries: 1,
        retryTimeout: 0
      });
      client.get(url, function (err) {
        assert.ifError(err);
        sinon.assert.calledWith(stats.timing, 'http.attempts', 2);
        done();
      });
    });

    it('records a timer for the number of attempts to a specific feed timer', function (done) {
      nockRetries(1);
      client = Client.createClient({
        name: 'my_client',
        stats: stats,
        retries: 1,
        retryTimeout: 0
      });
      client.get(url, {
        name: 'feed'
      }, function (err) {
        assert.ifError(err);
        sinon.assert.calledWith(stats.timing, 'my_client.feed.attempts', 2);
        done();
      });
    });

    it('sends a default UA with client version', function (done) {
      nock.cleanAll();
      var client = Client.createClient();

      nock(host, {
          reqheaders: {
            'User-Agent': util.format('%s/%s', package.name, package.version)
          }
        })
        .get(path)
        .reply(200, responseBody);

      client.get(url, done);
    });

    it('sends a custom User-Agent', function (done) {
      nock.cleanAll();
      var client = Client.createClient({
        userAgent: 'MegaZord'
      });

      nock(host, {
          reqheaders: {
            'User-Agent': 'MegaZord'
          }
        })
        .get(path)
        .reply(200, responseBody);

      client.get(url, done);
    });

    it('sets the default timeout', function (done) {
      var client = Client.createClient({
        stats: stats,
        retries: 0,
        retryTimeout: 0,
        timeout: 20
      });

      nock.cleanAll();

      api.get('/')
        .socketDelay(1000)
        .reply(200, responseBody);

      client.get(url, function (err) {
        assert(err);
        assert.equal(err.message, 'Request failed for http://www.example.com/ ESOCKETTIMEDOUT');
        done();
      });
    });

    it('trips the circuit breaker when multiple requests fail', function (done) {
      client = Client.createClient({
        name: 'open-sandwich',
        retries: 0,
        circuitBreakerMaxFailures: 3
      });

      nock.cleanAll();
      api.get(path).times(6).reply(500);

      async.times(5, function (i, cb) {
        client.get(url, function () {
          // send an empty callback to avoid the error
          // from stopping the `times`
          cb();
        });
      }, function () {
        client.get(url, function (err) {
          assert(err);
          assert.equal(err.message, '[open-sandwich] Circuit breaker is open');
          done();
        });
      });
    });

    it('sends a counter when the circuit breaker trips', function (done) {
      client = Client.createClient({
        retries: 0,
        circuitBreakerMaxFailures: 1,
        name: 'breaker',
        stats: stats
      });

      nock.cleanAll();
      api.get(path).times(3).reply(500);

      async.times(2, function (i, cb) {
        client.get(url, function () {
          cb();
        });
      }, function () {
        sinon.assert.calledWith(stats.increment, 'breaker.circuit_breaker.open');
        done();
      });
    });

    it('does not trip the circuit breaker for 404s', function (done) {
      client = Client.createClient({
        retries: 0,
        circuitBreakerMaxFailures: 1,
        stats: stats
      });

      nock.cleanAll();
      api.get(path).times(3).reply(404);

      async.times(2, function (i, cb) {
        client.get(url, function () {
          cb();
        });
      }, function () {
        client.get(url, function (err) {
          assert(err);
          assert.equal(err.statusCode, 404);
          done();
        });
      });
    });

    it('uses a custom request instance when the request option is used', function (done) {
      client = Client.createClient({
        request: request.defaults({
          headers: {
            foo: 'bar'
          }
        })
      });

      nock.cleanAll();
      nock(host, {
        reqheaders: {
          foo: 'bar'
        }
      }).get(path).reply(200);

      client.get(url, done);
    });

    it('passes the response object through', function (done) {
      var statusCode = 418;
      nock.cleanAll();

      api.get(path).reply(statusCode);
      client.get(url, function (err, body, resp) {
        assert.equal(resp.statusCode, statusCode);
        done();
      });
    });
  });

  describe('.put', function () {
    it('makes a PUT request with a JSON body', function (done) {
      api.put(path, requestBody).reply(201, responseBody);
      client.put(url, requestBody, function (err, body) {
        assert.ifError(err);
        assert.deepEqual(body, responseBody);
        done();
      });
    });

    it('handles a 200 status code', function (done) {
      api.put(path, requestBody).reply(200, responseBody);
      client.put(url, requestBody, done);
    });

    it('handles a 201 status code', function (done) {
      api.put(path, requestBody).reply(201, responseBody);
      client.put(url, requestBody, done);
    });

    it('handles a 204 status code', function (done) {
      api.put(path, requestBody).reply(204);
      client.put(url, requestBody, done);
    });

    it('returns an error when the API returns a 5XX status code', function (done) {
      api.put(path, requestBody).reply(500);
      client.put(url, requestBody, function (err) {
        assert.ok(err);
        done();
      });
    });

    it('retries failed requests', function (done) {
      client = Client.createClient({
        retries: 2,
        retryTimeout: 0
      });
      nockRetries(2, {
        httpMethod: 'put'
      });

      client.put(url, requestBody, done);
    });

    it('overrides retries using method options', function (done) {
      client = Client.createClient({
        retryTimeout: 1
      });
      nockRetries(2, {
        httpMethod: 'put',
        successCode: 201
      });

      client.put(url, requestBody, {
        retries: 2
      }, done);
    });

    it('supports optional request options', function (done) {
      api.put(path + '?foo=bar', requestBody).reply(201, responseBody);

      var opts = {
        qs: {
          foo: 'bar'
        }
      };
      client.put(url, requestBody, opts, done);
    });

    it('trips the circuit breaker when multiple requests fail', function (done) {
      client = Client.createClient({
        retries: 0,
        circuitBreakerMaxFailures: 3
      });

      nock.cleanAll();
      api.put(path).times(6).reply(500);

      async.times(5, function (i, cb) {
        client.put(url, {}, function () {
          // send an empty callback to avoid the error
          // from stopping the `times`
          cb();
        });
      }, function () {
        client.put(url, {}, function (err) {
          assert(err);
          assert.include(err.message, 'Circuit breaker is open');
          done();
        });
      });
    });

    it('passes the response object through', function (done) {
      var statusCode = 418;
      api.put(path, requestBody).reply(statusCode);
      client.put(url, requestBody, function (err, body, resp) {
        assert.equal(resp.statusCode, statusCode);
        done();
      });
    });
  });

  describe('.post', function () {
    it('makes a POST request', function (done) {
      api.post(path, requestBody).reply(201, responseBody);
      client.post(url, requestBody, function (err, body) {
        assert.ifError(err);
        assert.deepEqual(body, responseBody);
        done();
      });
    });

    it('returns an error when the API returns a 5XX status code', function (done) {
      api.post(path, requestBody).reply(500);
      client.post(url, requestBody, function (err) {
        assert.ok(err);
        done();
      });
    });

    it('retries failed requests', function (done) {
      client = Client.createClient({
        retries: 2,
        retryTimeout: 0
      });
      nockRetries(2, {
        httpMethod: 'post',
        successCode: 201
      });

      client.post(url, requestBody, done);
    });

    it('overrides retries using method options', function (done) {
      client = Client.createClient({
        retryTimeout: 1
      });
      nockRetries(2, {
        httpMethod: 'post',
        successCode: 201
      });

      client.post(url, requestBody, {
        retries: 2
      }, done);
    });

    it('trips the circuit breaker when multiple requests fail', function (done) {
      client = Client.createClient({
        retries: 0,
        circuitBreakerMaxFailures: 3
      });

      nock.cleanAll();
      api.post(path).times(6).reply(500);

      async.times(5, function (i, cb) {
        client.post(url, {}, function () {
          // send an empty callback to avoid the error
          // from stopping the `times`
          cb();
        });
      }, function () {
        client.post(url, {}, function (err) {
          assert(err);
          assert.include(err.message, 'Circuit breaker is open');
          done();
        });
      });
    });

    it('passes the response object through', function (done) {
      var statusCode = 418;
      api.post(path, requestBody).reply(statusCode);

      client.post(url, requestBody, function (err, body, resp) {
        assert(err);
        assert.equal(resp.statusCode, statusCode);
        done();
      });
    });
  });

  describe('.patch', function () {
    it('makes a PATCH request', function (done) {
      api.patch(path, requestBody).reply(204);
      client.patch(url, requestBody, done);
    });

    it('returns an error when the API returns a 5XX status code', function (done) {
      api.patch(path, requestBody).reply(500);

      client.patch(url, requestBody, function (err) {
        assert.ok(err);
        done();
      });
    });

    it('retries failed requests', function (done) {
      client = Client.createClient({
        retries: 2,
        retryTimeout: 0
      });
      nockRetries(2, {
        httpMethod: 'patch',
        successCode: 204
      });

      client.patch(url, requestBody, done);
    });

    it('overrides retries using method options', function (done) {
      client = Client.createClient({
        retryTimeout: 1
      });
      nockRetries(2, {
        httpMethod: 'patch',
        successCode: 201
      });

      client.patch(url, requestBody, {
        retries: 2
      }, done);
    });

    it('trips the circuit breaker when multiple requests fail', function (done) {
      client = Client.createClient({
        retries: 0,
        circuitBreakerMaxFailures: 3
      });

      nock.cleanAll();
      api.patch(path).times(6).reply(500);

      async.times(5, function (i, cb) {
        client.patch(url, {}, function () {
          // send an empty callback to avoid the error
          // from stopping the `times`
          cb();
        });
      }, function () {
        client.patch(url, {}, function (err) {
          assert(err);
          assert.include(err.message, 'Circuit breaker is open');
          done();
        });
      });
    });

    it('passes the response object through', function (done) {
      var statusCode = 418;
      api.patch(path, requestBody).reply(statusCode);

      client.patch(url, requestBody, function (err, body, resp) {
        assert(err);
        assert.equal(resp.statusCode, statusCode);
        done();
      });
    });
  });

  describe('.delete', function () {
    it('makes a DELETE request', function (done) {
      api.delete(path).reply(204);
      client.delete(url, done);
    });

    it('retries failed requests', function (done) {
      client = Client.createClient({
        retries: 2,
        retryTimeout: 0
      });
      nockRetries(2, {
        httpMethod: 'delete',
        successCode: 204
      });

      client.delete(url, done);
    });

    it('overrides retries using method options', function (done) {
      client = Client.createClient({
        retryTimeout: 1
      });
      nockRetries(2, {
        httpMethod: 'delete',
        successCode: 204
      });

      client.delete(url, {
        retries: 2
      }, done);
    });

    it('supports optional request options', function (done) {
      api.delete(path + '?foo=bar').reply(204);

      var opts = {
        qs: {
          foo: 'bar'
        }
      };
      client.delete(url, opts, done);
    });

    it('trips the circuit breaker when multiple requests fail', function (done) {
      client = Client.createClient({
        retries: 0,
        circuitBreakerMaxFailures: 3
      });

      nock.cleanAll();
      api.delete(path).times(6).reply(500);

      async.times(5, function (i, cb) {
        client.delete(url, function () {
          // send an empty callback to avoid the error
          // from stopping the `times`
          cb();
        });
      }, function () {
        client.delete(url, function (err) {
          assert(err);
          assert.include(err.message, 'Circuit breaker is open');
          done();
        });
      });
    });

    it('passes the response object through', function (done) {
      var statusCode = 418;
      api.delete(path).reply(statusCode);

      client.delete(url, function (err, body, resp) {
        assert(err);
        assert.equal(resp.statusCode, statusCode);
        done();
      });
    });
  });

  describe('.head', function () {
    it('makes a head request', function (done) {
      api.head(path).reply(200);

      client.head(url, function (err, body, resp) {
        assert.ifError(err);
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(body, undefined);
        done();
      });
    });

    it('returns an error when the API returns a 5XX status code', function (done) {
      api.head(path).reply(500);

      client.head(url, function (err) {
        assert.ok(err);
        done();
      });
    });

    it('retries failed requests', function (done) {
      client = Client.createClient({
        retries: 2,
        retryTimeout: 0
      });
      nockRetries(2, {
        httpMethod: 'head',
        successCode: 200
      });

      client.head(url, done);
    });

    it('trips the circuit breaker when multiple requests fail', function (done) {
      client = Client.createClient({
        retries: 0,
        circuitBreakerMaxFailures: 3
      });

      nock.cleanAll();
      api.head(path).times(6).reply(500);

      async.times(5, function (i, cb) {
        client.head(url, {}, function () {
          // send an empty callback to avoid the error
          // from stopping the `times`
          cb();
        });
      }, function () {
        client.head(url, {}, function (err) {
          assert(err);
          assert.include(err.message, 'Circuit breaker is open');
          done();
        });
      });
    });
  });
});
