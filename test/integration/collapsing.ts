import { events } from '@bbc/http-transport-request-collapse';
import { assert } from 'chai';
import * as nock from 'nock';
import * as sinon from 'sinon';
import { createClient } from '../../src';

const host = 'http://localhost:5555';
const requestOptions = { headers: { body: { x: 1 } } };

describe('Request collapsing', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.cleanAll();
  });

  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('does not collapse requests when `collapsing` disabled', async () => {
    const times = 4;
    nock(host)
      .get('/path')
      .times(times)
      .reply(200, { x: 1 }, { 'Cache-Control': 'max-age=10' });

    const client = createClient({ name: 'testing' });
    const pending = [];
    for (let i = 0; i < times; i++) {
      pending.push(await client.get(`${host}/path`, requestOptions));
    }
    await Promise.all(pending);
  });

  it('collapses requests when `collapsing` enabled', async () => {
    const times = 10;
    nock(host)
      .get('/path')
      .delay(100)
      .times(1)
      .reply(200, { x: 1 }, { 'Cache-Control': 'max-age=10' });

    const client = createClient({ name: 'testing', collapsing: { window: 0 } });
    const pending = [];
    for (let i = 0; i < times; i++) {
      pending.push(client.get(`${host}/path`, requestOptions));
    }
    await Promise.all(pending);
  });

  it('emits request collapsed event when making a request', async () => {
    const clientParams = {
      name: 'testing',
      collapsing: {
        window: 0
      },
      stats: {
        increment: sinon.spy(),
        timing: () => {}
      }
    };

    nock(host)
      .get('/path')
      .delay(100)
      .times(1)
      .reply(200, { x: 1 }, { 'Cache-Control': 'max-age=10' });

    let collapsed = false;
    events.on('collapsed-testing', () => {
      collapsed = true;
    });

    const client = createClient(clientParams);

    const requests = (n) => {
      const pending = [];
      for (let i = 0; i < n; ++i) {
        pending.push(client.get(`${host}/path`));
      }
      return pending;
    }

    await Promise.all(requests(20));

    assert.ok(collapsed);
    assert.deepEqual(clientParams.stats.increment.calledWith('testing.collapsing.collapsed'), true);
  });
});
