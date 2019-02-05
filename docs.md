# RestClient

>  A fully-featured REST client built for ease-of-use and resilience

## Common examples

#### Configurating Flashheart
```js
 const restClient = require('flashheart');
 const StatsD = require('node-statsd');

 const client = restClient.createClient({
    name: 'my-client',
    memoryCache: { name: 'my-cache' },
    externalCache: {
      host: 'localhost',
      port: 6379
      // alternatively, use a connectionString: 'redis://:password@localhost:6379'
    },
    logger: console,
    stats: new StatsD(),
    retries: 2,
    retryDelay: 100,
    timeout: 500,
    circuitbreaker: {
      maxFailures: 100
    },
    collapsing: { window: 0 }
  });
```

#### Supported HTTP methods

Make a HTTP GET request using `.get`

```js
    const url = 'http://example.com/';
    const res = await restClient.createClient().get(url);
    console.log(res.body);
```

Make a HTTP POST request using `.post`

```js
    const url = 'http://example.com/';  
    const res = await restClient.createClient().post(url, requestBody);
    console.log(res.body);
```

PATCH, DELETE, HEAD are also supported.
