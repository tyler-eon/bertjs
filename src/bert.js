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
var BertObj = function(type, value) {this.type  = type; this.value = value;};

/**
 * The "BertClass" object is used to create a Bert object that can encode and
 * decode data using Erlang's external term format. It is a binary format, and
 * so the decoder expects inputs to be either strings, with each character being
 * one byte of data, or an array, with each element being one byte of data. The
 * encoding process will generate an array of byte data given a BertObj object.
 */
var BertClass = function() {
    /**
     * I know you thought I was going to leave you hanging with that awful to
     * use BertObj, but fear not, I have helper functions to the rescue!
     */
    this.Int = function(value) {return new BertObj("int", value);};

    this.Float = function(value) {return new BertObj("float", value);};

    this.Atom = function(value) {return new BertObj("atom", value);};

    this.String = function(value) {return new BertObj("string", value);};

    this.Binary = function(value) {return new BertObj("binary", value);};

    this.Tuple = function(value) {
        if (!(value instanceof Array)) {
            throw "Must use an array to create tuples."
        }
        return new BertObj("tuple", value);
    };

    this.List = function(value) {
        if (!(value instanceof Array)) {
            throw "Must use an array to create lists."
        }
        return new BertObj("list", value);
    };

    // Most of these tokens map to a function for encoding/decoding.
    // This is subset of allowed tokens in the Erlang external term format.
    this.TOKENS = {
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
        119: "small_atom_utf8"
    };

    // Yup. Magic numbers.
    this.four_byte_max_number = 134217727;

    // Get the next "token" based on the data type.
    this.next_token = function(data) {
        if (typeof(data) == "string") {
            return [data.charCodeAt(0), data.substring(1)];
        }
        else {
            return [data[0], data.slice(1)];
        }
    };

    // Splits the data in two, where the first part of the split is `length`
    // long and the second part are all remaining elements after that.
    this.split = function(data, length) {
        if (length == null) { length = 1; }
        if (typeof(data) == "string") {
            return [data.substring(0, length), data.substring(length)];
        }
        else {
            return [data.slice(0, length), data.slice(length)];
        }
    };

    // Decode a string or array into a JavaScript object.
    this.decode = function(data) {
        var parts = this.next_token(data);
        if (this.TOKENS[parts[0]] != "start") {
            throw "Data must begin with an appropriate start token, actually starts with " + parts[0];
        }
        var result = this.decode_data(parts[1]);
        return result[0].value;
    };

    this.decode_data = function(data) {
        var parts = this.next_token(data);
        var token = parts[0], data = parts[1];
        var type, result;
        var type = this.TOKENS[token];
        var result = this["decode_" + type](data);
        return this.handle_result(type, result);
    };

    this.handle_result = function(type, result) {
        return [new BertObj(type, result[0]), result[1]];
    };

    this.decode_small_int = function(data) {
        return this.decode_int(data, 1);
    };

    this.decode_int = function(data, byteLength) {
        if (byteLength == null) { byteLength = 4; }
        var parts = this.split(data, byteLength);
        var size = 0, offset = 0;
        for (var i = 0; i < byteLength; i++) {
            offset = (byteLength - i - 1) * 8;
            size += data[i] << offset;
        }
        return [size, parts[1]];
    };

    this.decode_float = function(data) {
        var float = this.decode_string(data, 31);
        return [parseFloat(float[0]), float[1]];
    };

    this.decode_atom = function(data) {
        return this.decode_string(data, 2);
    };

    this.decode_port = function(data) {
        var atom = this.decode_data(data);
        var id = this.decode_int(atom[1], 4);
        var creation = this.decode_int(id[1], 1);
        return [atom[0] + "<" + id[0] + ">", creation[1]];
    };

    this.decode_pid = function(data) {
        var atom = this.decode_data(data);
        var id = this.decode_int(atom[1], 4);
        var serial = this.decode_int(id[1], 4);
        var creation = this.decode_int(serial[1], 1);
        return [atom[0] + "<" + id[0] + ">", creation[1]];
    };

    this.decode_small_tuple = function(data) {
        return this.decode_tuple(data, 1);
    };

    this.decode_tuple = function(data, byteLength) {
        if (byteLength == null) { byteLength = 4; }
        var parts = this.decode_int(data, byteLength);
        var arity = parts[0];
        var elements = parts[1];
        var tuple = [];
        for (var i = 0; i < arity; i++) {
            parts = this.decode_data(elements);
            tuple.push(parts[0].value);
            elements = parts[1];
        }
        return [tuple, elements];
    };

    this.decode_nil = function(data) {
        return [[], data];
    };

    this.decode_string = function(data, byteLength) {
        if (byteLength == null) { byteLength = 2; }
        var parts = this.decode_int(data, byteLength);
        var length = parts[0];
        parts = this.split(parts[1], length);
        var atom = "";
        for (var i = 0; i < length; i++) {
            atom += String.fromCharCode(parts[0][i]);
        }
        return [atom, parts[1]];
    };

    this.decode_list = function(data) {
        var parts = this.decode_int(data, 4);
        var length = parts[0];
        var elements = parts[1];
        var arr = [];
        for (var i = 0; i < length; i++) {
            parts = this.decode_data(elements);
            arr.push(parts[0].value);
            elements = parts[1];
        }
        var removenil = this.decode_data(elements);
        if (removenil[0].type != "nil") {
            throw "Lists parsed by this tool are expected to end properly, with a nil terminator.";
        }
        return [arr, removenil[1]];
    };

    this.decode_binary = function(data) {
        return this.decode_string(data, 4);
    };

    this.decode_small_big = function(data) {
        return this.decode_big(data, 1);
    };

    this.decode_big = function(data, byteLength) {
        if (byteLength == null) { byteLength = 4; }
        var arity = this.decode_int(data, byteLength);
        var length = arity[0];
        var sign = this.decode_int(arity[1], 1);
        var parts = this.split(sign[1], length);
        var elements = parts[0];
        var num = 0;
        for (var i = 0; i < length; i++) {
            num += elements[i] * Math.pow(256, i);
        }
        if (sign[0] != 0) { num *= -1; }
        return [num, parts[1]];
    };

    this.decode_small_atom = function(data) {
        return this.decode_string(data, 1);
    };

    this.decode_map = function(data) {
        var parts = this.decode_int(data, 4);
        var arity = parts[0];
        var pairs = parts[1];
        var map = {};
        var result, key, value;
        for (var i = 0; i < arity; i++) {
            result = this.decode_data(pairs);
            key = result[0].value;
            result = this.decode_data(result[1]);
            value = result[0].value;
            map[key] = value;
            pairs = result[1];
        }
        return [map, pairs];
    };

    this.decode_atom_utf8 = function(data) {
        return this.decode_atom(data);
    };

    this.decode_small_atom_utf8 = function(data) {
        return this.decode_small_atom(data);
    };

    // Encode a BertObj into an array of byte data.
    this.encode = function(obj) {
        if (!(obj instanceof BertObj)) {
            throw "Can only encode BertObj data structures.";
        }
        var buffer = [131];
        return this.encode_data(obj, buffer);
    };

    this.encode_data = function(obj, buffer) {
        return this["encode_" + obj.type](obj.value, buffer);
    };

    this.encode_num = function(num, byteLength, buffer) {
        var value = 0;
        for (var offset = (byteLength - 1) * 8; offset >= 0; offset -= 8) {
            value = num >> offset;
            buffer.push(value);
            num = num - (value << offset);
        }
        return buffer;
    };

    this.encode_int = function(data, buffer) {
        if (data > this.four_byte_max_number) {
            throw "Can only encode integers up to " + this.four_byte_max_number;
        }
        return this.encode_num(data, 4, buffer);
    };

    this.encode_atom = function(data, buffer) {
        var length = data.length;
        if (length >= 256) {
            throw "Atoms may only be up to 255 bytes.";
        }
        buffer.push(100);
        buffer.push(0);
        buffer.push(length);
        this.encode_string_to_buffer(data, buffer);
        return buffer;
    };

    this.encode_tuple = function(data, buffer) {
        var length = data.length, bytes = 0;
        if (length > this.four_byte_max_number) {
            throw "Your list is too long. Seriously, way too long.";
        }
        else if (length < 256) {
            buffer.push(104);
            bytes = 1;
        }
        else {
            buffer.push(105);
            bytes = 4;
        }
        this.encode_num(length, bytes, buffer);
        for (var i = 0; i < length; i++) {
            this.encode_data(data[i], buffer);
        }
        return buffer;
    };

    this.encode_binary = function(data, buffer) {
        if (data.length > this.four_byte_max_number) {
            throw "Your binary string is too long. Seriously, way too long.";
        }
        buffer.push(109);
        this.encode_num(data.length, 4, buffer);
        return this.encode_string_to_buffer(data, buffer);
    };

    this.encode_string_to_buffer = function(str, buffer) {
        for (var i = 0; i < str.length; i++) {
            buffer.push(str.charCodeAt(i));
        }
        return buffer;
    };
};

// Enjoy.
var Bert = new BertClass();
