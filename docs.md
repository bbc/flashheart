# RestClient

>  A fully-featured REST client built for ease-of-use and resilience

## Features

* [Circuit breaker](#circuit-breaker)
* [Caching](#caching)
* [Retries](#retries)
* [Timeout](#timeout)
* [Logging](#logging)
* [Parses JSON responses](#json)
* [Understands HTTP errors](#errors)
* [Rate Limiting](#rate-limiting)
* [StatsD integration](#stats)


### Circuit breaker

By default the client implements a circuit breaker using the [Levee](https://github.com/totherik/levee) library. It is configured to trip after 100 failures and resets after 10 seconds. This can be configured using the `circuitBreakerMaxFailures` and `circuitBreakerResetTimeout` properties.

For example to trip after 200 failures and try to reset after 30 seconds:

```js
 const restClient = require('flashheart');
 const StatsD = require('node-statsd');

 const client = restClient.createClient({
    name: 'my-client',
    circuitbreaker: {
      maxFailures: 200,
      resetTimeout: 30000
    }
  });
```

### Caching

The client will optionally cache response with a `max-age` directive. You can specify the caching storage with an instance of [Catbox](https://github.com/hapijs/catbox) using the `cache` parameter.

```js
const Catbox = require('catbox').Client;
const Memory = require('catbox-memory');
const storage = new Catbox(new Memory());
const flashheart = require('flashheart')

const client = flashheart.createClient({
  cache: storage
});
```

Optionally, you can enable `staleIfError` which will also start listening to the `stale-if-error` directive. This stores the response for the duration of the `stale-if-error` directive as well as the `max-age` and will try to retrieve them in this order:

* `max-age` stored version
* fresh version
* `stale-if-error` version

This is enabled simply by passing in the `staleIfError` parameter to `createClient`:

```js
const flashheart = require('flashheart')

const client = flashheart.createClient({
  cache: storage
});
```

The cache varies on _all_ request options (and therefore, headers) by default. If you don't want to vary on a particular header, use the `doNotVary` option:

```js
const client = require('flashheart').createClient({
  cache: storage,
  doNotVary: ['Request-Id']
});
```
