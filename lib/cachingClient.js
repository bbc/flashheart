var _ = require('lodash');
var wreck = require('wreck');
var version = require('../package').version;

function CachingClient(delegate, opts) {
  this.delegate = delegate;
  this.cache = opts.cache;
  this.staleIfError = opts.staleIfError;
  this.doNotVary = opts.doNotVary || [];
}

function isCacheable(res) {
  var cacheControl = getCacheControl(res);

  if (cacheControl) {
    const hasMaxAge = cacheControl['max-age'] > 0;
    const hasStaleIfError = cacheControl['stale-if-error'] > 0;

    return !cacheControl['no-cache'] && !cacheControl.private && (hasMaxAge || hasStaleIfError);
  }

  return false;
}

function getCacheTime(res, directive) {
  var cacheControl = getCacheControl(res);

  if (cacheControl) {
    return (cacheControl[directive] || 0) * 1000;
  }

  return -1;
}

function getMaxAge(res) {
  return getCacheTime(res, 'max-age');
}

function getStaleIfError(res) {
  return getCacheTime(res, 'stale-if-error');
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

function createStaleKeyObject(url, opts, doNotVary) {
  var key = createKeyObject(url, opts, doNotVary);
  return _.extend({}, key, {
    id: 'stale:' + key.id
  });
}

CachingClient.prototype.get = function (url, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  var client = this;
  var cache = this.cache;
  var doNotVary = this.doNotVary;

  this._getCachedOrFetch(url, opts, function (err, body, res, servedFromCache) {
    var cachedObject;
    var maxAge;
    var staleIfError;

    if (!servedFromCache && res && isCacheable(res)) {
      maxAge = getMaxAge(res);
      staleIfError = getStaleIfError(res);
      cachedObject = {};

      if (body) {
        cachedObject.body = body;
      }

      cachedObject.response = res;

      if (err && err.statusCode) {
        cachedObject.error = {
          message: err.message,
          statusCode: err.statusCode,
          body: err.body,
          headers: res.headers
        };
      }

      if (maxAge) {
        // Anonymous function needed here to pass opts through, as cache only calls func(err)
        cache.set(createKeyObject(url, opts, doNotVary), cachedObject, maxAge, function(err) { 
          client._handleCacheError.call(client, err, opts);
        });
      }

      if (!err && client.staleIfError && staleIfError) {
        var staleExpiry = staleIfError + maxAge;
        // Anonymous function needed here to pass opts through, as cache only calls func(err)
        cache.set(createStaleKeyObject(url, opts, doNotVary), cachedObject, staleExpiry, function(err) { 
          client._handleCacheError.call(client, err, opts);
        });
      }
    }

    cb(err, body, res);
  });
};

function createErrorFromCache(cachedError) {
  var err = new Error(cachedError.message);

  err.statusCode = cachedError.statusCode;
  err.body = cachedError.body;
  err.headers = cachedError.headers;

  return err;
}

CachingClient.prototype._getCachedOrFetch = function (url, opts, cb) {
  var client = this;
  var cache = this.cache;
  var delegate = this.delegate;
  var doNotVary = this.doNotVary;


  cache.get(createKeyObject(url, opts, doNotVary), function (err, cached) {
    if (err) client._handleCacheError(err, opts);

    var cacheHit = cached && cached.item && (cached.item.body || cached.item.error);

    if (cacheHit) {
      if (delegate.stats) delegate.stats.increment(delegate._getStatsName(opts) + '.cache.hits');

      if (cached.item.error) {
        err = createErrorFromCache(cached.item.error);
      }

      return cb(err, cached.item.body, cached.item.response, true);
    }

    if (delegate.stats) delegate.stats.increment(delegate._getStatsName(opts) + '.cache.misses');

    delegate.getWithResponse(url, opts, function (err, body, res) {
      if (err && client.staleIfError) {
        var originalErr = err;

        return cache.get(createStaleKeyObject(url, opts, doNotVary), function (err, cached) {
          if (err) client._handleCacheError(err, opts);
          if (!cached || cached.item.error) return cb(originalErr, body, res);
          if (delegate.stats) delegate.stats.increment(delegate._getStatsName(opts) + '.cache.stale');

          cb(err, cached.item.body, cached.item.response, true);
        });
      }

      cb(err, body, res);
    });
  });
};

CachingClient.prototype._handleCacheError = function (err, opts) {
  if (err) {
    if (this.delegate.logger) this.delegate.logger.warn('Cache error:', err.message);
    if (this.delegate.stats) this.delegate.stats.increment(this.delegate._getStatsName(opts) + '.cache.errors');
  }
};

CachingClient.prototype.head = function () {
  this.delegate.head.apply(this.delegate, arguments);
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
