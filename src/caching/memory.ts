import * as Catbox from 'catbox';
import * as Memory from 'catbox-memory';
import { InMemoryCacheConfiguration } from '../core/clientParams';

export function createCache(opts: InMemoryCacheConfiguration): any {
  const memoryCacheOpts: any = {};
  if (opts.maxSize) {
    memoryCacheOpts.maxByteSize = opts.maxSize;
  }
  return new Catbox.Client(new Memory(memoryCacheOpts));
}
