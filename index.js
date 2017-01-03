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

module.exports.Client = Client;
