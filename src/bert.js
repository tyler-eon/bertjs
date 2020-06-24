// bertjs - Encode and Decode BERT data
// Copyright (C) 2015-2020  Tyler Eon
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Most of these tokens map to a function for encoding/decoding.
// This is subset of allowed tokens in the Erlang external term format.
// Yup. Magic numbers.
const BERT_TOKENS = {
  131: "start",
  70:  "NewFloat",
  77:  "BitString",
  97:  "SmallInt",
  98:  "Int",
  99:  "Float",
  100: "Atom",
  102: "Port",
  103: "Pid",
  104: "SmallTuple",
  105: "Tuple",
  106: "Nil",
  107: "String",
  108: "List",
  109: "Binary",
  110: "SmallBig",
  111: "Big",
  115: "SmallAtom",
  116: "Map",
  118: "AtomUtf8",
  119: "SmallAtomUtf8",
}

/**
 * Represents a Bert object. That is to say, it is the JavaScript representation
 * of an Erlang native type.
 *
 * Although the encoder could perform "clever" conversions, like a regular
 * JavaScript array to an Erlang list type, it doesn't. The reason being that
 * an array could be a tuple or a list, or even an Erlang string! And strings
 * can be strings or binaries or atoms. Don't even get me started on numbers.
 * Forcing explicit typing like this causes less errors during encoding.
 */
class BertObj {
  constructor(type, value) {
    this.type = type
    this.value = value
  }
}

/**
 * The "BertClass" object is used to create a Bert object that can encode and
 * decode data using Erlang's external term format. It is a binary format, and
 * so the decoder expects inputs to be either strings, with each character being
 * one byte of data, or an array, with each element being one byte of data. The
 * encoding process will generate an array of byte data given a BertObj object.
 */
class Bert {
  static Nil() { return new BertObj("Nil", []) }
  static Int(value) { return new BertObj("Int", value) }
  static Float(value) { return new BertObj("NewFloat", value) }
  static Atom(value) { return new BertObj("Atom", value) }
  static String(value) { return new BertObj("String", value) }
  static Binary(value) { return new BertObj("Binary", value) }
  static Tuple(value) {
    if (!(value instanceof Array))
      throw "Must use an array to create tuples."
    return new BertObj("Tuple", value)
  }
  static Map(value) {
    if (!(value instanceof Object || value instanceof Array))
      throw "Must use an object or an array to create maps."
    return new BertObj("Map", value)
  }
  static List(value) {
    if (!(value instanceof Array))
      throw "Must use an array to create lists."
    return new BertObj("List", value)
  }
  static IntList(value) {
    if (!(value instanceof Array))
      throw "Must use an array to create lists."
    return new BertObj("String", value)
  }

  static fourByteMaxNumber() { return 134217727 }

  // Get the next "token" based on the data type.
  static nextToken(data) {
    if (typeof(data) == "string")
      return [data.charCodeAt(0), data.substring(1)]
    else
      return [data[0], data.slice(1)]
  }

  // Splits the data in two, where the first part of the split is `length`
  // long and the second part are all remaining elements after that.
  static split(data, length) {
    if (length == null) { length = 1 }
    if (typeof(data) == "string")
      return [data.substring(0, length), data.substring(length)]
    else
      return [data.slice(0, length), data.slice(length)]
  }

  // Decode a string or array into a JavaScript object.
  static decode(data) {
    var parts = this.nextToken(data)
    if (BERT_TOKENS[parts[0]] != "start")
      throw "Data must begin with an appropriate start token, actually starts with " + parts[0]
    var result = this.decodeData(parts[1])
    return result[0].value
  }

  static decodeData(data) {
    var parts  = this.nextToken(data),
        token  = parts[0],
        data   = parts[1],
        type   = BERT_TOKENS[token],
        result = this["decode" + type](data)
    return this.handleResult(type, result)
  }

  static handleResult(type, result) {
    return [new BertObj(type, result[0]), result[1]]
  }

  // Attribution: This code is effectively what you'll find in the node.js `Buffer` module. The primary difference is that this doesn't take endianness into consideration and always assumes the client machine is using little-endian despite the server always sending the encoded float in big-endian format.
  // If I could find a way to account for client-side endianness better, I would do so, but for now this will have to do.
  static decodeNewFloat(data) {
    var fa = new Float64Array(1)
    var ifa = new Uint8Array(fa.buffer)
    var [float, rest] = this.split(data, 8)
    for (var i = 0; i < 8; i++) {
      ifa[7 - i] = float[i]
    }
    return [fa[0], rest]
  }

  static decodeSmallInt(data) {
    return this.decodeInt(data, 1)
  }

  static decodeInt(data, byteLength) {
    if (byteLength == null) { byteLength = 4 }
    var parts  = this.split(data, byteLength),
        size   = 0,
        offset = 0
    for (var i = 0; i < byteLength; i++) {
      offset = (byteLength - i - 1) * 8
      size += data[i] << offset
    }
    return [size, parts[1]]
  }

  static decodeFloat(data) {
    var float = this.decodeString(data, 31)
    return [parseFloat(float[0]), float[1]]
  }

  static decodeAtom(data) {
    return this.decodeString(data, 2)
  }

  static decodePort(data) {
    var atom     = this.decodeData(data),
        id       = this.decodeInt(atom[1], 4),
        creation = this.decodeInt(id[1], 1)
    return [atom[0] + "<" + id[0] + ">", creation[1]]
  }

  static decodePid(data) {
    var atom     = this.decodeData(data),
        id       = this.decodeInt(atom[1], 4),
        serial   = this.decodeInt(id[1], 4),
        creation = this.decodeInt(serial[1], 1)
    return [atom[0] + "<" + id[0] + ">", creation[1]]
  }

  static decodeSmallTuple(data) {
    return this.decodeTuple(data, 1)
  }

  static decodeTuple(data, byteLength) {
    if (byteLength == null) { byteLength = 4 }
    var parts    = this.decodeInt(data, byteLength),
        arity    = parts[0],
        elements = parts[1],
        tuple    = []
    for (var i = 0; i < arity; i++) {
      parts = this.decodeData(elements)
      tuple.push(parts[0].value)
      elements = parts[1]
    }
    return [tuple, elements]
  }

  static decodeNil(data) {
    return [[], data]
  }

  static decodeString(data, byteLength) {
    if (byteLength == null) { byteLength = 2 }
    var parts  = this.decodeInt(data, byteLength),
        length = parts[0],
        atom   = ""
    parts = this.split(parts[1], length)
    for (var i = 0; i < length; i++) {
      atom += String.fromCharCode(parts[0][i])
    }
    return [atom, parts[1]]
  }

  static decodeList(data) {
    var parts    = this.decodeInt(data, 4),
        length   = parts[0],
        elements = parts[1],
        arr      = []
    for (var i = 0; i < length; i++) {
      parts = this.decodeData(elements)
      arr.push(parts[0].value)
      elements = parts[1]
    }
    var removenil = this.decodeData(elements)
    if (removenil[0].type != "Nil")
      throw "Lists parsed by this tool are expected to end properly, with a nil terminator."
    return [arr, removenil[1]]
  }

  static decodeBinary(data) {
    return this.decodeString(data, 4)
  }

  static decodeSmallBig(data) {
    return this.decodeBig(data, 1)
  }

  static decodeBig(data, byteLength) {
    if (byteLength == null) { byteLength = 4 }
    var arity    = this.decodeInt(data, byteLength),
        length   = arity[0],
        sign     = this.decodeInt(arity[1], 1),
        parts    = this.split(sign[1], length),
        elements = parts[0],
        num      = 0
    for (var i = 0; i < length; i++) {
      num += elements[i] * Math.pow(256, i)
    }
    if (sign[0] != 0) { num *= -1 }
    return [num, parts[1]]
  }

  static decodeSmallAtom(data) {
    return this.decodeString(data, 1)
  }

  static decodeMap(data) {
    var parts = this.decodeInt(data, 4),
        arity = parts[0],
        pairs = parts[1],
        map = {},
        result, key, value
    for (var i = 0; i < arity; i++) {
      result = this.decodeData(pairs)
      key = result[0].value
      result = this.decodeData(result[1])
      value = result[0].value
      map[key] = value
      pairs = result[1]
    }
    return [map, pairs]
  }

  static decodeAtomUtf8(data) {
    return this.decodeAtom(data)
  }

  static decodeSmallAtomUtf8(data) {
    return this.decodeSmallAtom(data)
  }

  // Encode an object into an array of byte data.
  static encode(obj) {
    var buffer = [131]
    return this.encodeData(obj, buffer)
  }

  static smartCast(obj) {
    if (obj == null)
      return this.Nil()

    var type = typeof(obj)
    if (type == 'number') {
      if (obj % 1 === 0)
        return this.Int(obj)
      else
        return this.Float(obj)
    }
    else if (type == 'string')
      return this.Binary(obj)
    else if (type == 'array') {
      if (obj.length == 0)
        return this.Nil()
      return this.List(obj)
    }
    else if (type == 'object')
      return this.Map(obj)
    else
      throw "Invalid object type: " + type + ". Cannot encode."
  }

  static encodeData(obj, buffer) {
    if (!(obj instanceof BertObj))
      obj = this.smartCast(obj)
    return this["encode" + obj.type](obj.value, buffer)
  }

  static encodeNewFloat(num, buffer) {
    var fa = new Float64Array([num])
    var ifa = new Uint8Array(fa.buffer)
    buffer.push(70)
    for (var i = 0; i < 8; i++) {
      buffer.push(ifa[7 - i])
    }
    return buffer
  }

  static encodeNum(num, byteLength, buffer) {
    var value = 0
    for (var offset = (byteLength - 1) * 8; offset >= 0; offset -= 8) {
      value = num >> offset
      buffer.push(value)
      num = num - (value << offset)
    }
    return buffer
  }

  static encodeSmallInt(data, buffer) {
    if (data > 255)
      return this.encodeInt(data, buffer)
    buffer.push(97)
    return this.encodeNum(data, 1, buffer)
  }

  static encodeInt(data, buffer) {
    if (data > this.fourByteMaxNumber())
      this.maxNumberError()
    else if (data < 256)
      return this.encodeSmallInt(data, buffer)
    else
      buffer.push(98)
      return this.encodeNum(data, 4, buffer)
  }

  static encodeNil(data, buffer) {
    buffer.push(106)
    return buffer
  }

  static encodeAtom(data, buffer) {
    var length = data.length
    if (length >= 256)
      throw "Atoms may only be up to 255 bytes."
    buffer.push(100)
    buffer.push(0)
    buffer.push(length)
    this.encodeStringToBuffer(data, buffer)
    return buffer
  }

  static encodeString(data, buffer) {
    var length = data.length, bytes = 2
    if (length > 65535)
      return this.encodeList(data, buffer)

    buffer.push(107)
    this.encodeNum(length, bytes, buffer)
    for (var i = 0; i < length; i++) {
      buffer.push(data.charCodeAt(i))
    }
    return buffer
  }

  static encodeList(data, buffer) {
    var length = data.length, bytes = 4
    if (length > this.fourByteMaxNumber())
      this.maxNumberError()

    buffer.push(108)
    this.encodeNum(length, bytes, buffer)
    for (var i = 0; i < length; i++) {
      this.encodeData(data[i], buffer)
    }
    this.encodeNil(this.Nil(), buffer)
    return buffer
  }

  static encodeTuple(data, buffer) {
    var length = data.length, bytes = 0
    if (length > this.fourByteMaxNumber())
      this.maxNumberError()
    else if (length < 256) {
      buffer.push(104)
      bytes = 1
    }
    else {
      buffer.push(105)
      bytes = 4
    }
    this.encodeNum(length, bytes, buffer)
    for (var i = 0; i < length; i++) {
      this.encodeData(data[i], buffer)
    }
    return buffer
  }

  static encodeMap(data, buffer) {
    buffer.push(116)

    if (data instanceof Array)
      return this.encodeMapFromArray(data, buffer)
    else
      return this.encodeMapFromObject(data, buffer)
  }

  static encodeMapFromArray(data, buffer) {
    let length = data.length
    if (length > this.fourByteMaxNumber())
      this.maxNumberError()

    this.encodeNum(length, 4, buffer)
    for (var i = 0; i < length; i++) {
      let pair = data[i]
      this.encodeData(pair[0], buffer)
      this.encodeData(pair[1], buffer)
    }
    return buffer
  }

  static encodeMapFromObject(data, buffer) {
    let keys   = Object.keys(data),
        length = keys.length
    if (length > this.fourByteMaxNumber())
      this.maxNumberError()

    this.encodeNum(length, 4, buffer)
    for (var i = 0; i < length; i++) {
      let key = keys[i]
      this.encodeBinary(key, buffer)
      this.encodeData(data[key], buffer)
    }
    return buffer
  }

  static encodeBinary(data, buffer) {
    if (data.length > this.fourByteMaxNumber())
      this.maxNumberError()

    buffer.push(109)
    this.encodeNum(data.length, 4, buffer)
    return this.encodeStringToBuffer(data, buffer)
  }

  static encodeStringToBuffer(str, buffer) {
    for (var i = 0; i < str.length; i++) {
      buffer.push(str.charCodeAt(i))
    }
    return buffer
  }

  static maxNumberError() {
    throw "Your data is too long. Seriously, way too long."
  }
}

export default Bert
