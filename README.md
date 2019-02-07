# flashheart

<br/><p align="center"><img width="350" src="https://rawgit.com/bbc/flashheart/master/logo.png?a" alt="Flashheart"></p><br/>

[![Build Status](https://travis-ci.org/bbc/flashheart.svg?branch=master)](https://travis-ci.org/bbc/flashheart) 
[![Code Climate](https://codeclimate.com/github/bbc/flashheart/badges/gpa.svg)](https://codeclimate.com/github/bbc/flashheart) 
[![Test Coverage](https://codeclimate.com/github/bbc/flashheart/badges/coverage.svg)](https://codeclimate.com/github/bbc/flashheart/coverage)

> A fully-featured Node.js REST client built for ease-of-use and resilience

`flashheart` is built on [http-transport](https://github.com/bbc/http-transport) to provide everything you need to build HTTP-based services with confidence.

## Installation

```
npm install --save flashheart
```

## Usage

```js
const flashheart = require('flashheart');

const client = flashheart.createClient({
  name: 'my_service',
  logger: console
});

const response = await client.get('http://echo.jsontest.com/key/value/');
console.log(response.body);
// {key: "value"}
```

## Documentation
For more examples and API details, see [API documentation](https://bbc.github.io/flashheart)

## Test

```
npm test
```

To generate a test coverage report:

```
npm run coverage
```
