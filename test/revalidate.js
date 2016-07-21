var nock = require('nock');
var assert = require('chai').assert;
var async = require('async');
var Client = require('..');

var api = nock('http://www.example.com');
var url = 'http://www.example.com/';

describe('Caching - revalidation', function () {
  var client;
  var stats;

  // a dumb cache with hit counts
  var simpleCache = {
      start : function(){
          this.storage = {};
          this.cacheHits = 0;
      },
      get : function(key, cb){
          if (this.storage[key])
              this.cacheHits++;
          cb( null, { item : this.storage[key] } );
      },
      set : function(key, value, ttl, cb){
          this.storage[key] = value;
          cb();
      }
  };

  var firstResponseBody = 'first';
  var secondResponseBody = 'second';
  var thirdResponseBody = 'third';

  var swrHeaders = {
      'cache-control': 'max-age=60, stale-while-revalidate=0.001'
  };
  var noSwrHeaders = {
      'cache-control': 'max-age=60'
  };

  beforeEach(function () {
      nock.cleanAll();
      stats = {
          stat : {},
          increment: function(key){ 
              this.stat[key] = (this.stat[key]||0) + 1;
          },
          timing : function(){}
      };
  });

  var validate = function (client, resp1, resp2, resp3, cacheHitsCount, refreshCount, done) {
    client.get(url, function (err, body) {
      assert.ifError(err);
      assert.deepEqual(body, resp1);
    });
    setTimeout(function(){
        client.get(url, function (err, body) {
            assert.ifError(err);
            assert.deepEqual(body, resp2);
            
            setTimeout( function(){
                client.get(url, function (err, body) {
                    assert.ifError(err);
                    assert.deepEqual(body, resp3);
                    assert.equal(stats.stat['http.cache.refresh'] || 0, refreshCount);
                    assert.equal(simpleCache.cacheHits, cacheHitsCount);
                    done();
                });
            }, 10);
        });
    }, 10);
  };

  var staleRequest = function(req){
      setTimeout(req, 10);
  };
    
  var concurrentValidate = function (client, resp1, resp2, resp3, cacheHitsCount, refreshCount, done) {
    client.get(url, function (err, body) {
      assert.ifError(err);
      assert.deepEqual(body, resp1);
    });

    staleRequest(function(){
        async.times(5, function() {
            client.get(url, function (err, body) {
                assert.ifError(err);
                assert.deepEqual(body, resp2);
            });
        });
                           
        staleRequest( function(){
            client.get(url, function (err, body) {
                assert.ifError(err);
                assert.deepEqual(body, resp3);
                assert.equal(refreshCount, stats.stat['http.cache.refresh'] || 0);
                assert.equal(cacheHitsCount, simpleCache.cacheHits);
                done();
            });
        });
    });
  };

  it('refreshes cache in the background if stale-while-revalidate is enabled', function (done) {
      client = Client.createClient({
          cache: simpleCache,
          stats : stats,
          swr : true,
          retries: 0
      });            
      
      nock.cleanAll();
      api.get('/').once().reply(200, firstResponseBody, swrHeaders);
      api.get('/').once().reply(200, secondResponseBody, swrHeaders);

      validate(client, firstResponseBody, firstResponseBody, secondResponseBody, 2, 2, done);
  });

  it('serves from cache if stale-while-revalidate is in response but disabled', function (done) {
      client = Client.createClient({
          stats : stats,
          cache: simpleCache,
          swr: false,
          retries: 0
      });            
      
      nock.cleanAll();
      api.get('/').once().reply(200, firstResponseBody, swrHeaders);
      api.get('/').once().reply(200, secondResponseBody, swrHeaders);

      validate(client, firstResponseBody, firstResponseBody, firstResponseBody, 2, 0, done);
  });

  it('serves from cache if stale-while-revalidate is enabled but missing from response', function (done) {
      client = Client.createClient({
          stats : stats,
          cache: simpleCache,
          swr: true,
          retries: 0
      });            
      
      nock.cleanAll();
      api.get('/').once().reply(200, firstResponseBody, noSwrHeaders);
      api.get('/').once().reply(200, secondResponseBody, noSwrHeaders);

      validate(client, firstResponseBody, firstResponseBody, firstResponseBody, 2, 0, done);
  });

  it('concurrent calls to a stale item only trigger a single refresh', function (done) {
      client = Client.createClient({
          stats : stats,
          cache: simpleCache,
          swr: true,
          retries: 0
      });            
      
      nock.cleanAll();
      api.get('/').once().reply(200, firstResponseBody, swrHeaders);
      api.get('/').once().reply(200, secondResponseBody, swrHeaders);

      concurrentValidate(client, firstResponseBody, firstResponseBody, secondResponseBody, 6, 2, done);
  });

  it('stale refreshes happen after each stale period', function (done) {
      client = Client.createClient({
          stats : stats,
          cache: simpleCache,
          swr: true,
          retries: 0
      });            
      
      nock.cleanAll();
      api.get('/').once().reply(200, firstResponseBody, swrHeaders);
      api.get('/').once().reply(200, secondResponseBody, swrHeaders);
      api.get('/').once().reply(200, thirdResponseBody, swrHeaders);

      var chain = function(expected){
          client.get(url, function (err, body) {
              assert.deepEqual(body, expected.shift());
              if (expected.length > 0){
                  staleRequest( function(){ chain(expected); } );
              } else {
                  assert.equal(stats.stat['http.cache.refresh'] || 0, 3);
                  assert.equal(simpleCache.cacheHits, 3);
                  done();
              }
          });
      };

      chain ([firstResponseBody, firstResponseBody, secondResponseBody, thirdResponseBody]);
  });
});
