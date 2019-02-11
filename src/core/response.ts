export interface Response {
  readonly body: ReadableStream | string | object | null;
  readonly headers: Headers | Map<string, string>;
  readonly ok: boolean;
  readonly redirected: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
}
