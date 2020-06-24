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
  70:  "new_float",
  77:  "bitstring",
  97:  "small_int",
  98:  "int",
  99:  "float",
  100: "atom",
  102: "port",
  103: "pid",
  104: "small_tuple",
  105: "tuple",
  106: "nil",
  107: "string",
  108: "list",
  109: "binary",
  110: "small_big",
  111: "big",
  115: "small_atom",
  116: "map",
  118: "atom_utf8",
  119: "small_atom_utf8",
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
  static Nil() { return new BertObj("nil", []) }
  static Int(value) { return new BertObj("int", value) }
  static Float(value) { return new BertObj("new_float", value) }
  static Atom(value) { return new BertObj("atom", value) }
  static String(value) { return new BertObj("string", value) }
  static Binary(value) { return new BertObj("binary", value) }
  static Tuple(value) {
    if (!(value instanceof Array))
      throw "Must use an array to create tuples."
    return new BertObj("tuple", value)
  }
  static Map(value) {
    if (!(value instanceof Object || value instanceof Array))
      throw "Must use an object or an array to create maps."
    return new BertObj("map", value)
  }
  static List(value) {
    if (!(value instanceof Array))
      throw "Must use an array to create lists."
    return new BertObj("list", value)
  }
  static IntList(value) {
    if (!(value instanceof Array))
      throw "Must use an array to create lists."
    return new BertObj("string", value)
  }

  static four_byte_max_number() { return 134217727 }

  // Get the next "token" based on the data type.
  static next_token(data) {
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
    var parts = this.next_token(data)
    if (BERT_TOKENS[parts[0]] != "start")
      throw "Data must begin with an appropriate start token, actually starts with " + parts[0]
    var result = this.decode_data(parts[1])
    return result[0].value
  }

  static decode_data(data) {
    var parts  = this.next_token(data),
        token  = parts[0],
        data   = parts[1],
        type   = BERT_TOKENS[token],
        result = this["decode_" + type](data)
    return this.handle_result(type, result)
  }

  static handle_result(type, result) {
    return [new BertObj(type, result[0]), result[1]]
  }

  // Attribution: This code is effectively what you'll find in the node.js `Buffer` module. The primary difference is that this doesn't take endianness into consideration and always assumes the client machine is using little-endian despite the server always sending the encoded float in big-endian format.
  // If I could find a way to account for client-side endianness better, I would do so, but for now this will have to do.
  static decode_new_float(data) {
    var fa = new Float64Array(1)
    var ifa = new Uint8Array(fa.buffer)
    var [float, rest] = this.split(data, 8)
    for (var i = 0; i < 8; i++) {
      ifa[7 - i] = float[i]
    }
    return [fa[0], rest]
  }

  static decode_small_int(data) {
    return this.decode_int(data, 1)
  }

  static decode_int(data, byteLength) {
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

  static decode_float(data) {
    var float = this.decode_string(data, 31)
    return [parseFloat(float[0]), float[1]]
  }

  static decode_atom(data) {
    return this.decode_string(data, 2)
  }

  static decode_port(data) {
    var atom     = this.decode_data(data),
        id       = this.decode_int(atom[1], 4),
        creation = this.decode_int(id[1], 1)
    return [atom[0] + "<" + id[0] + ">", creation[1]]
  }

  static decode_pid(data) {
    var atom     = this.decode_data(data),
        id       = this.decode_int(atom[1], 4),
        serial   = this.decode_int(id[1], 4),
        creation = this.decode_int(serial[1], 1)
    return [atom[0] + "<" + id[0] + ">", creation[1]]
  }

  static decode_small_tuple(data) {
    return this.decode_tuple(data, 1)
  }

  static decode_tuple(data, byteLength) {
    if (byteLength == null) { byteLength = 4 }
    var parts    = this.decode_int(data, byteLength),
        arity    = parts[0],
        elements = parts[1],
        tuple    = []
    for (var i = 0; i < arity; i++) {
      parts = this.decode_data(elements)
      tuple.push(parts[0].value)
      elements = parts[1]
    }
    return [tuple, elements]
  }

  static decode_nil(data) {
    return [[], data]
  }

  static decode_string(data, byteLength) {
    if (byteLength == null) { byteLength = 2 }
    var parts  = this.decode_int(data, byteLength),
        length = parts[0],
        atom   = ""
    parts = this.split(parts[1], length)
    for (var i = 0; i < length; i++) {
      atom += String.fromCharCode(parts[0][i])
    }
    return [atom, parts[1]]
  }

  static decode_list(data) {
    var parts    = this.decode_int(data, 4),
        length   = parts[0],
        elements = parts[1],
        arr      = []
    for (var i = 0; i < length; i++) {
      parts = this.decode_data(elements)
      arr.push(parts[0].value)
      elements = parts[1]
    }
    var removenil = this.decode_data(elements)
    if (removenil[0].type != "nil")
      throw "Lists parsed by this tool are expected to end properly, with a nil terminator."
    return [arr, removenil[1]]
  }

  static decode_binary(data) {
    return this.decode_string(data, 4)
  }

  static decode_small_big(data) {
    return this.decode_big(data, 1)
  }

  static decode_big(data, byteLength) {
    if (byteLength == null) { byteLength = 4 }
    var arity    = this.decode_int(data, byteLength),
        length   = arity[0],
        sign     = this.decode_int(arity[1], 1),
        parts    = this.split(sign[1], length),
        elements = parts[0],
        num      = 0
    for (var i = 0; i < length; i++) {
      num += elements[i] * Math.pow(256, i)
    }
    if (sign[0] != 0) { num *= -1 }
    return [num, parts[1]]
  }

  static decode_small_atom(data) {
    return this.decode_string(data, 1)
  }

  static decode_map(data) {
    var parts = this.decode_int(data, 4),
        arity = parts[0],
        pairs = parts[1],
        map = {},
        result, key, value
    for (var i = 0; i < arity; i++) {
      result = this.decode_data(pairs)
      key = result[0].value
      result = this.decode_data(result[1])
      value = result[0].value
      map[key] = value
      pairs = result[1]
    }
    return [map, pairs]
  }

  static decode_atom_utf8(data) {
    return this.decode_atom(data)
  }

  static decode_small_atom_utf8(data) {
    return this.decode_small_atom(data)
  }

  // Encode an object into an array of byte data.
  static encode(obj) {
    var buffer = [131]
    return this.encode_data(obj, buffer)
  }

  static smart_cast(obj) {
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

  static encode_data(obj, buffer) {
    if (!(obj instanceof BertObj))
      obj = this.smart_cast(obj)
    return this["encode_" + obj.type](obj.value, buffer)
  }

  static encode_new_float(num, buffer) {
    var fa = new Float64Array([num])
    var ifa = new Uint8Array(fa.buffer)
    buffer.push(70)
    for (var i = 0; i < 8; i++) {
      buffer.push(ifa[7 - i])
    }
    return buffer
  }

  static encode_num(num, byteLength, buffer) {
    var value = 0
    for (var offset = (byteLength - 1) * 8; offset >= 0; offset -= 8) {
      value = num >> offset
      buffer.push(value)
      num = num - (value << offset)
    }
    return buffer
  }

  static encode_small_int(data, buffer) {
    if (data > 255)
      return this.encode_int(data, buffer)
    buffer.push(97)
    return this.encode_num(data, 1, buffer)
  }

  static encode_int(data, buffer) {
    if (data > this.four_byte_max_number())
      this.max_number_error()
    else if (data < 256)
      return this.encode_small_int(data, buffer)
    else
      buffer.push(98)
      return this.encode_num(data, 4, buffer)
  }

  static encode_nil(data, buffer) {
    buffer.push(106)
    return buffer
  }

  static encode_atom(data, buffer) {
    var length = data.length
    if (length >= 256)
      throw "Atoms may only be up to 255 bytes."
    buffer.push(100)
    buffer.push(0)
    buffer.push(length)
    this.encode_string_to_buffer(data, buffer)
    return buffer
  }

  static encode_string(data, buffer) {
    var length = data.length, bytes = 2
    if (length > 65535)
      return this.encode_list(data, buffer)

    buffer.push(107)
    this.encode_num(length, bytes, buffer)
    for (var i = 0; i < length; i++) {
      buffer.push(data.charCodeAt(i))
    }
    return buffer
  }

  static encode_list(data, buffer) {
    var length = data.length, bytes = 4
    if (length > this.four_byte_max_number())
      this.max_number_error()

    buffer.push(108)
    this.encode_num(length, bytes, buffer)
    for (var i = 0; i < length; i++) {
      this.encode_data(data[i], buffer)
    }
    this.encode_nil(this.Nil(), buffer)
    return buffer
  }

  static encode_tuple(data, buffer) {
    var length = data.length, bytes = 0
    if (length > this.four_byte_max_number())
      this.max_number_error()
    else if (length < 256) {
      buffer.push(104)
      bytes = 1
    }
    else {
      buffer.push(105)
      bytes = 4
    }
    this.encode_num(length, bytes, buffer)
    for (var i = 0; i < length; i++) {
      this.encode_data(data[i], buffer)
    }
    return buffer
  }

  static encode_map(data, buffer) {
    buffer.push(116)

    if (data instanceof Array)
      return this.encode_map_from_array(data, buffer)
    else
      return this.encode_map_from_object(data, buffer)
  }

  static encode_map_from_array(data, buffer) {
    let length = data.length
    if (length > this.four_byte_max_number())
      this.max_number_error()

    this.encode_num(length, 4, buffer)
    for (var i = 0; i < length; i++) {
      let pair = data[i]
      this.encode_data(pair[0], buffer)
      this.encode_data(pair[1], buffer)
    }
    return buffer
  }

  static encode_map_from_object(data, buffer) {
    let keys   = Object.keys(data),
        length = keys.length
    if (length > this.four_byte_max_number())
      this.max_number_error()

    this.encode_num(length, 4, buffer)
    for (var i = 0; i < length; i++) {
      let key = keys[i]
      this.encode_binary(key, buffer)
      this.encode_data(data[key], buffer)
    }
    return buffer
  }

  static encode_binary(data, buffer) {
    if (data.length > this.four_byte_max_number())
      this.max_number_error()

    buffer.push(109)
    this.encode_num(data.length, 4, buffer)
    return this.encode_string_to_buffer(data, buffer)
  }

  static encode_string_to_buffer(str, buffer) {
    for (var i = 0; i < str.length; i++) {
      buffer.push(str.charCodeAt(i))
    }
    return buffer
  }

  static max_number_error() {
    throw "Your data is too long. Seriously, way too long."
  }
}

export default Bert
