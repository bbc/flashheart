var _ = require('lodash');
var retry = require('retry');
var util = require('util');
var Levee = require('levee');

var package = require('../package');

var request = require('request').defaults({
  json: true,
  gzip: true,
  time: true,
  forever: true
});

const DEFAULT_TIMEOUT = 1000;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_TIMEOUT = 100;
const DEFAULT_CIRCUIT_BREAKER_FAILURES = 100;
const DEFAULT_CIRCUIT_BREAKER_RESET_TIMEOUT = 10000;
const DEFAULT_CIRCUIT_BREAKER_TIMEOUT = 60000;
const GET = 'get';
const PUT = 'put';
const DELETE = 'del';
const POST = 'post';
const PATCH = 'patch';
const DEFAULT_CIRCUIT_BREAKER_OPTIONS = {
  maxFailures: DEFAULT_CIRCUIT_BREAKER_FAILURES,
  resetTimeout: DEFAULT_CIRCUIT_BREAKER_RESET_TIMEOUT,
  timeout: DEFAULT_CIRCUIT_BREAKER_TIMEOUT,
  isFailure: isCriticalError
};

function Client(opts) {
  this.request = opts.request || request;
  this.logger = opts.logger;
  this.stats = opts.stats;
  this.name = opts.name || 'http';
  this.timeout = _.isUndefined(opts.timeout) ? DEFAULT_TIMEOUT : opts.timeout;
  this.retries = _.isUndefined(opts.retries) ? DEFAULT_RETRIES : opts.retries;
  this.retryTimeout = _.isUndefined(opts.retryTimeout) ? DEFAULT_RETRY_TIMEOUT : opts.retryTimeout;
  this.userAgent = _.isUndefined(opts.userAgent) ? util.format('%s/%s', package.name, package.version) : opts.userAgent;

  var circuitBreakerOptions = _.defaults({
    maxFailures: opts.circuitBreakerMaxFailures,
    resetTimeout: opts.circuitBreakerResetTimeout
  }, DEFAULT_CIRCUIT_BREAKER_OPTIONS);

  var name = this.name;

  this.breaker = Levee.createBreaker({
    execute: this._requestWithRetries.bind(this)
  }, circuitBreakerOptions);

  this.breaker.on('open', function () {
    if (opts.stats) opts.stats.increment(name + '.circuit_breaker.open');
  });
}

function isCriticalError(err) {
  if (err && err.statusCode < 500) {
    return false;
  }

  return true;
}

function getStatsName(clientName, feedName) {
  if (feedName) {
    return clientName + '.' + feedName;
  }

  return clientName;
}

Client.prototype._log = function (res) {
  if (this.logger) {
    this.logger.info(res.request.method, res.request.href, res.statusCode, res.elapsedTime, 'ms');
  }
};

Client.prototype._recordStats = function (res, feedName) {
  var statsName;

  if (this.stats) {
    statsName = getStatsName(this.name, feedName);
    this.stats.increment(statsName + '.requests');
    this.stats.increment(statsName + '.responses.' + res.statusCode);
    this.stats.timing(statsName + '.response_time', res.elapsedTime);
  }
};

Client.prototype._request = function (method, url, opts, cb) {
  var client = this;
  var request = this.request.defaults({
    timeout: this.timeout,
    headers: {
      'User-Agent': this.userAgent
    }
  });

  request[method](url, opts, function (err, res, body) {
    var statsName,
        cacheableRes = {};

    if (res) {
      cacheableRes = {
        statusCode: res.statusCode,
        headers: res.headers,
        elapsedTime: res.elapsedTime
      };
    }

    if (err) {
      if (client.stats) {
        statsName = getStatsName(client.name, opts.name);
        client.stats.increment(statsName + '.request_errors');
      }

      err = new Error(util.format('Request failed for %s %s', url, err.message));

      return cb(err);
    }

    client._log(res);
    client._recordStats(res, opts.name);

    if (res.statusCode >= 400) {
      err = new Error(util.format('Received HTTP code %d for %s %s', res.statusCode, res.request.method, res.request.href));
      err.statusCode = res.statusCode;
      err.body = body;

      return cb(err, cacheableRes);
    }

    cb(null, cacheableRes, body);
  });
};

Client.prototype.getWithResponse = function (url, opts, cb) {
  this._requestWithCircuitBreaker(GET, url, opts, function (err, body, res) {
    cb(err, body, res);
  });
};

Client.prototype._requestWithRetries = function (method, url, opts, cb) {
  var client = this;

  var operation = retry.operation({
    retries: this.retries,
    minTimeout: this.retryTimeout,
    maxTimeout: this.retryTimeout
  });

  operation.attempt(function (currentAttempts) {
    client._request(method, url, opts, function (err, res, body) {
      var statsName;

      if (isCriticalError(err) && operation.retry(err)) {
        if (client.logger) {
          client.logger.warn('Attempt', currentAttempts, err.message);
        }
        return;
      }

      if (client.stats) {
        statsName = getStatsName(client.name, opts.name);
        client.stats.timing(statsName + '.attempts', currentAttempts);
      }

      cb(err, body, res);
    });
  });
};

Client.prototype._requestWithCircuitBreaker = function (method, url, opts, cb) {
  var name = this.name;

  this.breaker.run(method, url, opts, function (err, body, res) {
    cb(transformError(err, name), body, res);
  });
};

function transformError(err, name) {
  if (err && err.message === 'Command not available.') {
    err.message = util.format('[%s] Circuit breaker is open', name);
  }
  return err;
}

Client.prototype.get = function (url, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  this._requestWithCircuitBreaker(GET, url, opts, function (err, body, res) {
    cb(err, body, res);
  });
};

Client.prototype.post = function (url, requestBody, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  opts.body = requestBody;

  this._requestWithCircuitBreaker(POST, url, opts, function (err, body, res) {
    cb(err, body, res);
  });
};

Client.prototype.put = function (url, requestBody, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  opts.body = requestBody;

  this._requestWithCircuitBreaker(PUT, url, opts, function (err, body, res) {
    cb(err, body, res);
  });
};

Client.prototype.patch = function (url, requestBody, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  opts.body = requestBody;

  this._requestWithCircuitBreaker(PATCH, url, opts, function (err, body, res) {
    cb(err, body, res);
  });
};

Client.prototype.delete = function (url, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  this._requestWithCircuitBreaker(DELETE, url, opts, function (err, body, res) {
    cb(err, body, res);
  });
};

module.exports = Client;
