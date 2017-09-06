var Client = require('./lib/client');
var CachingClient = require('./lib/cachingClient');
var Promise = require('bluebird');
var _ = require('lodash');

module.exports.createClient = function (opts) {
  opts = opts || {};
  var client = new Client(opts);

  if (!_.isUndefined(opts.cache)) {
    opts.cache.start(_.noop);
    client = new CachingClient(client, opts);
  }

  return client;
};

module.exports.createClientAsync = function (opts) {
  opts = opts || {};
  var client = new Client(opts);

  if (!_.isUndefined(opts.cache)) {

    var start = Promise.promisify(opts.cache.start, { context: opts.cache });

    return start().then(function() {
      return new CachingClient(client, opts);
    });
  }

  return new Promise(function(resolve) {
    resolve(client);
  });
};

module.exports.Client = Client;
