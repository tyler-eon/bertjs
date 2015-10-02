var BertWS = function(url, handlers) {
    ws = new WebSocket(url);

    // We want to parse arrays, not blobs.
    ws.binaryType = "arraybuffer";

    // Assign handles, using a basic default handler when one is missing.
    if (handlers.ws_open != null) { ws.onopen = handlers.ws_open; }
    else {
        ws.onopen = function(e) {
            "WebSocket connection to " + ws.url + " opened.";
        }
    }
    if (handlers.ws_close != null) { ws.onclose = handlers.ws_close; }
    else {
        ws.onclose = function(e) {
            "WebSocket connection to " + ws.url + " closed (" + e.code + ")";
        }
    }
    if (handlers.ws_error != null) { ws.onerror = handlers.ws_error; }
    else {
        ws.onerror = function(e) {
            "WebSocket connection to " + ws.url + " has thrown an error.";
        }
    }

    // Ideally we should have checked that these exist, as these handlers are
    // required, but this is just a "demo" file so we aren't going to.
    ws.handle_success = handlers.success;
    ws.handle_error = handlers.error;

    // When we receive message from the WebSocket...
    ws.onmessage = function(e) {
        // Create a "byte array" of the data that we can parse.
        var dv = new DataView(e.data);
        var arr = new Uint8Array(dv.byteLength);
        for (var i = dv.byteOffset; i < arr.length; i++) {
            arr[i] = dv.getUint8(i);
        }
        // Use Bert to decode the byte array.
        var message = Bert.decode(arr);
        // We check for errors by looking for the common tuple: {:error, term}
        if (message instanceof Array && message[0] == "error") {
            ws.handle_error(message);
        }
        else {
            ws.handle_success(message);
        }
    };

    // When we want to send a Bert object over the WebSocket...
    ws.send_bert = function(bertObj, success, error) {
        // Create a "byte array" of the data that we can send.
        var data = new Uint8Array(Bert.encode(bertObj));

        // Individual functions can temporarily override the handle given during
        // WebSocket creation.
        var original_success = ws.handle_success;
        if (success != null) {
            ws.handle_success = function(message) {
                ws.handle_success = original_success;
                success(message);
            };
        }
        var original_error = ws.handle_error;
        if (error != null) {
            ws.handle_error = function(message) {
                ws.handle_error = original_error;
                error(message);
            };
        }

        // Beam me up, Scotty!
        ws.send(data);
    };

    return ws;
};
