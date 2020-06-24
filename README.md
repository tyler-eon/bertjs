# bert.ws

A JavaScript library for encoding and decoding _BERT_ data. Primarily targeted for use with web sockets, but it can work with any transport protocol.

## What is BERT?

In short, BERT is a special binary format for use with Erlang/Elixir applications.

In a slightly longer explanation: BERT stands for _Binary ERlang Term_. It's a concise means of representing the native data types present in Erlang/Elixir, specifically designed for efficient communication of these _terms_, as Erlang calls them, over the wire.

If you want even more detailed explanation, you can refer to the BERT-RPC spec or the official Erlang External Term Format:

- [BERT and BERT-RPC](http://bert-rpc.org/)
- [Erlang External Term Format](http://erlang.org/doc/apps/erts/erl_ext_dist.html)

## Installation

Two methods: manual and npm.

1. To install manually, simply copy `bert.js` into your project. Done! Unfortunately, if the file is ever updated it's on you to keep track of the version manually and update the file accordingly.
2. To install via npm, simply do `npm install bert.ws`. You can also add it as a dependency to `packages.json` and let npm manage version locking for you. Fun times!

Why `bert.ws`? Both `bert` and `bert.js` are taken by packages equally as old as this one that will also probably never receive an update. However, mine has the advantage of including a web socket module that simplifies integration for that protocol, thus the `.ws` suffix.

## Usage

Two core methods exist:

1. `Bert.encode/1`
2. `Bert.decode/1`

Obviously the first one encodes JavaScript into BERT and the second one decodes BERT into JavaScript. The main constraints are:

- To `encode` data you **should** pass in a `BertObj`. If you don't, a function called `smartCast/1` will be used to try to "intelligently" determine the appropriate associated Erlang type. But because JavaScript has fewer types than Erlang, chances are that something might be cast incorrectly, so explicitly creating Bert helper objects is recommended. But not required.
- To `decode` data you **must** pass in a string or an array. This assumes that you're dealing with data from a `blob` or `arraybuffer`, the two type options for web sockets when sending and receiving data.

Helper functions exist to quickly and easily create `BertObj` instances. I shall reiterate: it is _highly_ recommended that you use these helpers instead of passing raw JavaScript objects to the encoder. It's the only way to create and encode atoms and tuples, for example. Not using the helper functions will seriously limit what kind of Erlang types you can send upstream.

e.g.

```javascript
// Encode string as a binary
Bert.encode("strings are encoded as erlang binary values")
Bert.encode(Bert.Binary("explicitly mark a string as a binary"))

// Encode string as a "string" (char list)
Bert.encode(Bert.String("becomes a char list"))

// Encode a list of values
Bert.encode(["binary", 42, Bert.Atom("atom")])
Bert.encode(Bert.List( [ ... ] ))

// Encode a map of key-value pairs
Bert.encode({ one: "two", two: Bert.Atom("three"), three: [] })
Bert.encode(Bert.Map( { ... } ))
```

## Maps

A note about using the `Map` BERT type:

JavaScript does not have a way to iterate over the keys in a Map while retaining the key _type_. In JavaScript, retrieving keys from a regular object will always return a list of strings. If you **need** to use typed keys and can't have strings, then you should pass in an array of arrays, where each inside array has two elements: a key and a value, in that order. This will construct a special kind of Map that can be used to preserve key types during encoding.

e.g.

```javascript
// All keys become binary strings (values are encoded correctly though)
Bert.Map({
  swamp: "thing",
  42: "the answer",
  key: Bert.Atom("value"),
})

// Preserve key types when encoding a "map"
// Notice we can still take advantage of smart casting with this approach
Bert.Map([
  [Bert.Atom("swamp"), "thing"],
  [42, "the answer"],
  ["key", Bert.Atom("value")],
])
```

It's also worth noting that decoding an Erlang Map to JavaScript will result in either `Number` or `String` "keys" for the resulting object. For string keys, the dot notation (e.g. `obj.some_key`) will work but for number keys the index operator must be used (e.g. `obj[42]`). The index operator may still be used with string keys (e.g. `obj["some_key"]`).

## WebSockets

I spoke about how I was targeting WebSockets earlier. I've included an additional JavaScript file, called `bertws.js`, which shows a basic implementation of using `bert.js` to read and write BERT data over a WebSocket connection.

The basic concept, though, is that you set the WebSocket to use `"arraybuffer"` as your binary type. The default is `"blob"`, but that's more like working with a file. It's doable, but I like the idea of working with a `Uint8Array` because it is more akin to a "byte array." So we use an array buffer to generate a typed array which we then pass to `Bert.decode`. And because `Bert.encode` returns a typed array we can send it directly over the wire; no need to transform the array further because the WebSocket implementation handles that for us.

## TODO

- Cleanup code. The current implementation works great and looks good thanks to ES6, but it could be even better.
