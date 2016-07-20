var _ = require('lodash');
var wreck = require('wreck');
var version = require('../package').version;

function CachingClient(delegate, opts) {
  this.delegate = delegate;
  this.cache = opts.cache;
  this.swrEnabled = _.isUndefined(opts.swr) ? false : opts.swr;  
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

function getStaleWhileRevalidate(res) {
  var swr = 0;
  var cacheControl = getCacheControl(res);

  if (cacheControl) {
    swr = (cacheControl['stale-while-revalidate'] || 0) * 1000;
  }

  return swr;
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
  var doNotVary = this.doNotVary;
  var cacheKey = createKeyObject(url, opts, doNotVary);
  this._getCachedOrFetch(url, opts, function (err, body, res, servedFromCache) {
      if (!servedFromCache){
          client._cacheResponse(cacheKey, err, body, res);
      }
      cb(err, body, res);
  });
};

CachingClient.prototype._cacheResponse = function (cacheKey, err, body, res){
    var cache = this.cache;
    var client = this;
    if (res && isCacheable(res)){
        var maxAge = getMaxAge(res);
        var staleWhileRevalidate = getStaleWhileRevalidate(res);
        var cachedObject = {};

        if (body) {
            cachedObject.body = body;
        }
        
        cachedObject.response = res;

        if (err && err.statusCode) {
            cachedObject.error = {
                message: err.message,
                statusCode: err.statusCode,
                body: err.body
            };
        }
        if (staleWhileRevalidate > 0){
            cachedObject.revalidateTimestamp = new Date().getTime() + staleWhileRevalidate;
        }

        cache.set(cacheKey, cachedObject, maxAge, client._handleCacheError.bind(client));
    }
};

CachingClient.prototype._getCachedOrFetch = function (url, opts, cb) {
  var client = this;
  var cache = this.cache;
  var delegate = this.delegate;
  var doNotVary = this.doNotVary;
  var cacheKey = createKeyObject(url, opts, doNotVary);
  cache.get(cacheKey, function (err, cached) {
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

      if (client.swrEnabled === true && cached.item.revalidateTimestamp !== undefined && cached.item.revalidateTimestamp < new Date().getTime()){
        if (delegate.stats) delegate.stats.increment(delegate.name + '.cache.refresh');

        delegate.getWithResponse(url, opts, _.partial(client._cacheResponse, cacheKey).bind(client));
      }

      return cb(err, cached.item.body, cached.item.response, true);
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
