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

import Bert from "./bert"

class BertWS {
  constructor(url, handlers={}) {
    this.ws = new WebSocket(url)
    this.ws.binaryType = "arraybuffer"

    if (handlers.open != null) { this.ws.onopen = handlers.open }
    else {
      this.ws.onopen = (e) => {
        console.log("WebSocket connection to " + url + " opened.", e)
      }
    }

    if (handlers.close != null) { this.ws.onclose = handlers.close }
    else {
      this.ws.onclose = (e) => {
        console.log("WebSocket connection to " + url + " closed.", e)
      }
    }

    if (handlers.error != null) { this.ws.onerror = handlers.error }
    else {
      this.ws.onerror = (e) => {
        console.log("WebSocket connection to " + url + " has thrown an error.", e)
      }
    }

    if (handlers.on_success != null) {this.on_success = handlers.on_success }
    else {
      this.on_success = (e) => {
        console.log("WebSocket connection to " + url + " received data.", e)
      }
    }

    if (handlers.on_error != null) {this.on_error = handlers.on_error }
    else {
      this.on_error = (e) => {
        console.log("WebSocket connection to " + url + " received an error.", e)
      }
    }

    // When we receive message from the WebSocket...
    this.ws.onmessage = this.receive.bind(this)
  }

  receive(e) {
    let message = this.decode(e.data)

    // We check for errors by looking for the common tuple: {:error, term}
    if (message instanceof Array && message[0] == "error")
      this.on_error(message)
    else
      this.on_success(message)
  }

  decode(data) {
    // Create a "byte array" of the data that we can parse.
    let dview = new DataView(data),
        bytes = new Uint8Array(dview.byteLength)
    for (var i = dview.byteOffset; i < bytes.length; i++) {
      bytes[i] = dview.getUint8(i)
    }

    // Use Bert to decode the byte array.
    return Bert.decode(bytes)
  }

  send(message) {
    // Create a "byte array" of the data that we can send.
    let data = this.encode(message)
    this.ws.send(data)
  }

  encode(data) {
    return new Uint8Array(Bert.encode(data))
  }
}

export default BertWS
