import * as express from 'express';

const app = express();

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head'];
const DEFAULT_RESPONSE = { x: 1 };

HTTP_METHODS.forEach((method) => {
  app[method]('/', (req, res) => {
    const status = req.headers.status || 500;
    res.sendStatus(status);
  });
});

HTTP_METHODS.forEach((method) => {
  app[method]('/success', (req, res) => {
    res.json(DEFAULT_RESPONSE);
  });
});

export function createServer(cb: () => {}, port: number = 5555): void {
  return app.listen(port, cb);
}
