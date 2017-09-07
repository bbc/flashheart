var Client = require('./lib/client');
var CachingClient = require('./lib/cachingClient');
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

module.exports.createClientAsync = function (opts, callback) {
  opts = opts || {};
  var client = new Client(opts);
  var error = null;

  if (!_.isUndefined(opts.cache)) {
    opts.cache.start(function(err) {
      client = new CachingClient(client, opts);
      error = err;
    });
  }

  return callback(error, client);
};

module.exports.Client = Client;
