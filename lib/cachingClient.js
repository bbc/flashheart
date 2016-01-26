var _ = require('lodash');
var wreck = require('wreck');
var version = require('../package').version;

function CachingClient(delegate, opts) {
  this.delegate = delegate;
  this.cache = opts.cache;
  this.doNotVary = opts.doNotVary || [];
}

function isCacheable(res) {
  var cacheControl = getCacheControl(res);

  if (cacheControl) {
    return !cacheControl['no-cache'] && !cacheControl.private && cacheControl['max-age'] > 0;
  }

  return false;
}

function getMaxAge(res) {
  var maxAge = -1;
  var cacheControl = getCacheControl(res);

  if (cacheControl) {
    maxAge = (cacheControl['max-age'] || 0) * 1000;
  }

  return maxAge;
}

function getCacheControl(res) {
  var cacheControl = res.headers['cache-control'];
  if (!cacheControl) return;

  return wreck.parseCacheControl(cacheControl);
}

function createKeyObject(url, opts, doNotVary) {
  var id = url;
  var optsCopy = _.cloneDeep(opts);

  doNotVary.forEach(function (doNotVaryHeader) {
    if (optsCopy.headers) {
      Object.keys(optsCopy.headers).forEach(function (header) {
        if (header.toLowerCase() === doNotVaryHeader.toLowerCase()) {
          delete optsCopy.headers[header];
        }
      });
    }
  });

  if (Object.keys(optsCopy).length > 0) {
    id += JSON.stringify(optsCopy);
  }

  return {
    id: id,
    segment: 'flashheart:' + version
  };
}

CachingClient.prototype.get = function (url, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  var client = this;
  var cache = this.cache;
  var doNotVary = this.doNotVary;

  this._getCachedOrFetch(url, opts, function (err, body, res) {
    var cachedObject;
    var maxAge;

    if (res && isCacheable(res)) {
      maxAge = getMaxAge(res);
      cachedObject = {};

      if (body) {
        cachedObject.body = body;
      }

      if (res) {
        cachedObject.response = res;
      } else {
        cachedObject.response = {};
      }

      if (err && err.statusCode) {
        cachedObject.error = {
          message: err.message,
          statusCode: err.statusCode,
          body: err.body
        };
      }

      cache.set(createKeyObject(url, opts, doNotVary), cachedObject, maxAge, client._handleCacheError.bind(client));
    }

    cb(err, body, res);
  });
};

CachingClient.prototype._getCachedOrFetch = function (url, opts, cb) {
  var client = this;
  var cache = this.cache;
  var delegate = this.delegate;
  var doNotVary = this.doNotVary;

  cache.get(createKeyObject(url, opts, doNotVary), function (err, cached) {
    if (err) client._handleCacheError(err);

    var cacheHit = cached && cached.item && (cached.item.body || cached.item.error);
    var cachedError;

    if (cacheHit) {
      if (delegate.stats) delegate.stats.increment(delegate.name + '.cache.hits');

      if (cached.item.error) {
        cachedError = cached.item.error;
        err = new Error(cachedError.message);
        err.statusCode = cachedError.statusCode;
        err.body = cachedError.body;
      }

      return cb(err, cached.item.body, cached.item.response);
    }

    if (delegate.stats) delegate.stats.increment(delegate.name + '.cache.misses');

    delegate.getWithResponse(url, opts, cb);
  });
};

CachingClient.prototype._handleCacheError = function (err) {
  if (err) {
    if (this.delegate.logger) this.delegate.logger.warn('Cache error:', err.message);
    if (this.delegate.stats) this.delegate.stats.increment(this.delegate.name + '.cache.errors');
  }
};

CachingClient.prototype.put = function () {
  this.delegate.put.apply(this.delegate, arguments);
};

CachingClient.prototype.post = function () {
  this.delegate.post.apply(this.delegate, arguments);
};

CachingClient.prototype.patch = function () {
  this.delegate.patch.apply(this.delegate, arguments);
};

CachingClient.prototype.delete = function () {
  this.delegate.delete.apply(this.delegate, arguments);
};

module.exports = CachingClient;
