var _ = require('lodash');
var retry = require('retry');
var util = require('util');
var Levee = require('levee');
var debug = require('debug')('flashheart');

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

  this.sharedExecutionCallbacks = (_.isUndefined(opts.sharedExecution) || opts.sharedExecution === false) ? undefined : {};

  if (opts.defaults) {
    this.request = this.request.defaults(opts.defaults);
  }

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

function buildResponse(requestRes) {
  return {
    statusCode: requestRes.statusCode,
    headers: requestRes.headers,
    elapsedTime: requestRes.elapsedTime
  };
}

function createFetchKey(url, opts) {
  var id = url;
  if (Object.keys(opts).length > 0) {
    id += JSON.stringify(opts);
  }

  return id;
}

Client.prototype._log = function (res) {
  var message = util.format(res.request.method, res.request.href, res.statusCode, res.elapsedTime, 'ms');

  debug(message);

  if (this.logger) {
    this.logger.info(message);
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

  opts = _.merge({
    timeout: this.timeout,
    headers: {
      'User-Agent': this.userAgent
    }
  }, opts);

  this.request[method](url, opts, function (err, requestRes, body) {
    var statsName;

    if (err) {
      if (client.stats) {
        statsName = getStatsName(client.name, opts.name);
        client.stats.increment(statsName + '.request_errors');
      }

      err = new Error(util.format('Request failed for %s %s', url, err.message));

      return cb(err);
    }

    var res = buildResponse(requestRes);

    client._log(requestRes);
    client._recordStats(requestRes, opts.name);

    if (requestRes.statusCode >= 400) {
      err = new Error(util.format('Received HTTP code %d for %s %s', requestRes.statusCode, requestRes.request.method, requestRes.request.href));
      err.statusCode = requestRes.statusCode;
      err.body = body;

      return cb(err, res);
    }

    cb(null, res, body);
  });
};

Client.prototype.getWithResponse = function (url, opts, cb ){
    var client = this;
    if (!this.sharedExecutionCallbacks){
        this._getWithResponse(url, opts, cb);
    } else {
        var fetchKey = createFetchKey(url, opts);
        if (!this.sharedExecutionCallbacks[fetchKey]){
            var handler = function(err, body, res){
                var cbs = client.sharedExecutionCallbacks[fetchKey];
                delete client.sharedExecutionCallbacks[fetchKey];
                for (var i = 0; i < cbs.length; i++){
                    cbs[i](err, body, res);
                }
            };
            this.sharedExecutionCallbacks[fetchKey] = [ cb ];
            this._getWithResponse(url, opts, handler);
        } else {
            this.sharedExecutionCallbacks[fetchKey].push(cb);
        }
    }
};

Client.prototype._getWithResponse = function (url, opts, cb) {
  this._requestWithCircuitBreaker(GET, url, opts, function (err, body, res) {
    cb(err, body, res);
  });
};

Client.prototype._requestWithRetries = function (method, url, opts, cb) {
  var client = this;

  var timeout = _.isUndefined(opts.retryTimeout) ? this.retryTimeout : opts.retryTimeout;
  var retries = _.isUndefined(opts.retries) ? this.retries : opts.retries;
  var operation = retry.operation({
    retries: retries,
    minTimeout: timeout,
    maxTimeout: timeout
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

  this.getWithResponse(url, opts, cb);
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
