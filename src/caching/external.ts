import * as Catbox from 'catbox';
import * as RedisCatbox from 'catbox-redis';
import { ClientParams, ExternalCacheConfiguration, ExternalCacheHostConfiguration, ExternalCacheStringConfiguration } from '../core/clientParams';

const Redis = require('ioredis');

const Cluster = Redis.Cluster;

function createCacheCluster(params: ExternalCacheConfiguration): any {
  let nodes = [];

  if (<ExternalCacheHostConfiguration>params) {
    const hostParams = params as ExternalCacheHostConfiguration;

    nodes = [
      {
        port: hostParams.port,
        host: hostParams.host
      }
    ];
  } else {
    const connectionParams = params as ExternalCacheStringConfiguration;

    nodes = [
      connectionParams.connectionString
    ];
  }

  const redisClusterOpts = {
    scaleReads: 'all',
    enableOfflineQueue: false,
    slotsRefreshTimeout: 2000
  };

  return new Cluster(
    nodes,
    redisClusterOpts
  );
}

function createRedisCache(params: ExternalCacheConfiguration): any {
  if ((<ExternalCacheHostConfiguration>params).host) {
    const hostParams = params as ExternalCacheHostConfiguration;
    return new Redis({
      host: hostParams.host,
      port: hostParams.port,
      enableOfflineQueue: false
    });
  } else {
    const connectionParams = params as ExternalCacheStringConfiguration;
    return new Redis(connectionParams.connectionString, { enableOfflineQueue: false });
  }
}

export function createCache(params: ClientParams): any {
  const cachingParams = params.externalCache;
  const catboxRedisOpts: any = {
    partition: 'rest_client'
  };

  if (cachingParams.cluster) {
    catboxRedisOpts.client = createCacheCluster(cachingParams);
  } else {
    catboxRedisOpts.client = createRedisCache(cachingParams);
  }

  if (params.logger) {
    const logger = params.logger;
    catboxRedisOpts.client.on('error', (err) => {
      logger.error(err);
      if (err.lastNodeError) { logger.error(err.lastNodeError); }
    });
  }

  return new Catbox.Client(new RedisCatbox(catboxRedisOpts));
}
