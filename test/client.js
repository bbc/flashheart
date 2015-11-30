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

function nockRetries(retry) {
  nock.cleanAll();
  api.get(path).times(retry).reply(500);
  api.get(path).reply(200);
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

    it('returns an error when the request fails', function (done) {
      nock.cleanAll();
      api.get('/').delayConnection(1000).reply(200, responseBody);
      client.get(url, {
        timeout: 20
      }, function (err) {
        assert(err);
        assert.equal(err.message, 'Request failed for http://www.example.com/ ETIMEDOUT');
        done();
      });
    });

    it('logs each request at info level when a logger is passed in', function (done) {
      client = Client.createClient({
        logger: logger
      });

      client.get(url, function (err) {
        assert.ifError(err);
        sinon.assert.calledWith(logger.info, 'GET', url, 200);
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

    it('increments a request counter counter with the name of the client and feed if provided', function (done) {
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
      var url = util.format('http://%s:%d', server.address().address, server.address().port);
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
        timeout: 50
      });

      nock.cleanAll();

      api.get('/')
        .delayConnection(1000)
        .reply(200, responseBody);

      client.get(url, function (err) {
        assert(err);
        assert.equal(err.message, 'Request failed for http://www.example.com/ ETIMEDOUT');
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
      api.put(path, requestBody).reply(500, responseBody);
      api.put(path, requestBody).reply(500, responseBody);
      api.put(path, requestBody).reply(201, responseBody);
      client.put(url, requestBody, done);
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
      api.post(path, requestBody).reply(500, responseBody);
      api.post(path, requestBody).reply(500, responseBody);
      api.post(path, requestBody).reply(201, responseBody);
      client.post(url, requestBody, done);
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
      api.delete(path).reply(500, responseBody);
      api.delete(path).reply(500, responseBody);
      api.delete(path).reply(204, responseBody);
      client.delete(url, done);
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
  });
});
