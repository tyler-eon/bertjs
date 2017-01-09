# bertjs

A JavaScript library for encoding and decoding BERT data. Primarily targeted for use with WebSocket.

This project has been converted to ECMAScript 6, which all major browsers appear to support at the time of this change.

## Why

I originally tried [rustyio/BERT-JS](https://github.com/rustyio/BERT-JS), and
noticed an [update](https://github.com/mgechev/bert.js) of the project, but I
had two main issues with both of them:

1. I did not like the way integers were being encoded and decoded. I'm not sure
if the method in my own code is faster, but it's certainly more concise and
operates in what I believe to be a more logical manner.
2. I was having trouble using it to decode/encode data arrays for use in
WebSockets, which was the target method of communication for the project that
spawned this.

## How

Two core methods exist:

1. `Bert.encode/1`
2. `Bert.decode/1`

Obviously the first one encodes JavaScript into BERT and the second one decodes
BERT into JavaScript. The main constraints are:

- To `encode` data you **must** pass in a `BertObj`.
- To `decode` data you **must** pass in a string or an array.

The `BertObj` exists to ensure the encoder knows which Erlang type you are
mapping a JavaScript object to, instead of guessing and getting it wrong. I have
included helper functions to generate correctly-type BERT wrapper objects:

- `Bert.Int`
- `Bert.Float`
- `Bert.Atom`
- `Bert.String`
- `Bert.Binary`
- `Bert.Tuple`
- `Bert.List`

Pass in a JavaScript object to any of those functions and the encoder will
attempt to encode the value given as the associated type, or throw an error if
something goes wrong (or possibly fail silently and build you an incorrect BERT
payload).

## WebSockets

I spoke about how I was targeting WebSockets earlier. I've included an
additional JavaScript file, called `bertws.js`, which shows a basic
implementation of using `bert.js` to read and write BERT data over a WebSocket
connection.

The basic concept, though, is that you set the WebSocket to use `"arraybuffer"`
as your binary type. The default is `"blob"`, but that's more like working with
a file. It's doable, but I like the idea of working with a `Uint8Array` because
it is more akin to a "byte array." So we use an array buffer to generate a typed
array which we then pass to `Bert.decode`. And because `Bert.encode` returns a
typed array we can send it directly over the wire; no need to transform the
array further because the WebSocket implementation handles that for us.

## TODO

- Implement encoders for `List`, `Float`, `String` types.
- Implement `Bert.Map` helper, decoder, and encoder.
- Cleanup code. The "second" iteration works great but looks better thanks to ES6, but it could be even better.

## references

[BERT and BERT-RPC](http://bert-rpc.org/)

[Erlang External Term Format](http://erlang.org/doc/apps/erts/erl_ext_dist.html)
