var YouTubeHandler = (function () {
    var globalEnv = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this;
    
    function Reader(buffer) {
        this.buf = buffer;
        this.pos = 0;
        this.len = buffer.length;
    }

    Reader.prototype.uint32 = function () {
        var value = 4294967295;
        value = (this.buf[this.pos] & 127) >>> 0;
        if (this.buf[this.pos++] < 128) return value;
        value = (value | (this.buf[this.pos] & 127) << 7) >>> 0;
        if (this.buf[this.pos++] < 128) return value;
        value = (value | (this.buf[this.pos] & 127) << 14) >>> 0;
        if (this.buf[this.pos++] < 128) return value;
        value = (value | (this.buf[this.pos] & 127) << 21) >>> 0;
        if (this.buf[this.pos++] < 128) return value;
        value = (value | (this.buf[this.pos] & 15) << 28) >>> 0;
        if (this.buf[this.pos++] < 128) return value;
        if ((this.pos += 5) > this.len) {
            this.pos = this.len;
            throw new Error("index out of range");
        }
        return value;
    };

    Reader.prototype.skip = function (length) {
        if (typeof length === "number") {
            if (this.pos + length > this.len) throw new Error("index out of range");
            this.pos += length;
        } else {
            do {
                if (this.pos >= this.len) throw new Error("index out of range");
            } while (this.buf[this.pos++] & 128);
        }
    };

    Reader.prototype.skipType = function (wireType) {
        switch (wireType) {
            case 0:
                this.skip();
                break;
            case 1:
                this.skip(8);
                break;
            case 2:
                this.skip(this.uint32());
                break;
            case 3:
                while ((wireType = this.uint32() & 7) !== 4) {
                    this.skipType(wireType);
                }
                break;
            case 5:
                this.skip(4);
                break;
            default:
                throw new Error("invalid wire type " + wireType);
        }
    };

    Reader.prototype.bytes = function () {
        var length = this.uint32();
        var start = this.pos;
        var end = this.pos + length;
        if (end > this.len) throw new Error("index out of range");
        this.pos = end;
        return this.buf.subarray(start, end);
    };

    function Writer() {
        this.chunks = [];
        this.length = 0;
    }

    Writer.prototype.uint32 = function (value) {
        while (value > 127) {
            this.chunks.push((value & 127) | 128);
            this.length++;
            value >>>= 7;
        }
        this.chunks.push(value);
        this.length++;
        return this;
    };

    Writer.prototype.raw = function (bytes) {
        for (var i = 0; i < bytes.length; i++) {
            this.chunks.push(bytes[i]);
        }
        this.length += bytes.length;
        return this;
    };

    Writer.prototype.tag = function (fieldNo, type) {
        return this.uint32((fieldNo << 3) | type);
    };

    Writer.prototype.bytes = function (bytes) {
        this.uint32(bytes.length);
        this.raw(bytes);
        return this;
    };

    Writer.prototype.finish = function () {
        var result = new Uint8Array(this.length);
        for (var i = 0; i < this.length; i++) {
            result[i] = this.chunks[i];
        }
        return result;
    };

    function decodeMessage(buf) {
        var reader = new Reader(buf);
        var fields = [];
        while (reader.pos < reader.len) {
            var tag = reader.uint32();
            var fieldNo = tag >>> 3;
            var wireType = tag & 7;
            var start = reader.pos;
            if (wireType === 0) {
                var valStart = reader.pos;
                reader.skip();
                fields.push({ no: fieldNo, type: wireType, data: reader.buf.subarray(valStart, reader.pos) });
            } else if (wireType === 1) {
                reader.skip(8);
                fields.push({ no: fieldNo, type: wireType, data: reader.buf.subarray(start, reader.pos) });
            } else if (wireType === 2) {
                var b = reader.bytes();
                fields.push({ no: fieldNo, type: wireType, data: b });
            } else if (wireType === 5) {
                reader.skip(4);
                fields.push({ no: fieldNo, type: wireType, data: reader.buf.subarray(start, reader.pos) });
            } else {
                reader.skipType(wireType);
            }
        }
        return fields;
    }

    function encodeMessage(fields) {
        var writer = new Writer();
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            writer.tag(f.no, f.type);
            if (f.type === 2) {
                writer.bytes(f.data);
            } else {
                writer.raw(f.data);
            }
        }
        return writer.finish();
    }

    function matchBytes(haystack, needle) {
        if (haystack.length < needle.length) return false;
        for (var i = 0; i <= haystack.length - needle.length; i++) {
            var found = true;
            for (var j = 0; j < needle.length; j++) {
                if (haystack[i + j] !== needle[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }

    function strToBytes(str) {
        var arr = new Uint8Array(str.length);
        for (var i = 0; i < str.length; i++) {
            arr[i] = str.charCodeAt(i) & 255;
        }
        return arr;
    }

    var UPLOAD_IDENTIFIERS = [
        strToBytes("FEuploads"),
        strToBytes("FEcreate"),
        strToBytes("PIVOT_BAR_ITEM_IDENTIFIER_CREATE"),
        strToBytes("create_post"),
        strToBytes("openUploadEndpoint"),
        strToBytes("upload_video"),
        strToBytes("createSheetEndpoint"),
        strToBytes("pivot_upload"),
        strToBytes("FEshorts_creation")
    ];

    var PROTECTED_IDENTIFIERS = [
        strToBytes("FEwhat_to_watch"),
        strToBytes("FEshorts"),
        strToBytes("FEsubscriptions"),
        strToBytes("FEaccount"),
        strToBytes("FElibrary")
    ];

    function isUploadNode(data) {
        if (data.length > 8192) return false;
        var hasUpload = false;
        for (var i = 0; i < UPLOAD_IDENTIFIERS.length; i++) {
            if (matchBytes(data, UPLOAD_IDENTIFIERS[i])) {
                hasUpload = true;
                break;
            }
        }
        if (!hasUpload) return false;
        for (var j = 0; j < PROTECTED_IDENTIFIERS.length; j++) {
            if (matchBytes(data, PROTECTED_IDENTIFIERS[j])) {
                return false;
            }
        }
        return true;
    }

    function filterTree(data) {
        try {
            var fields = decodeMessage(data);
            if (!fields || fields.length === 0) return data;
            var newFields = [];
            for (var i = 0; i < fields.length; i++) {
                var f = fields[i];
                if (f.type === 2) {
                    if (isUploadNode(f.data)) {
                        continue;
                    }
                    var hasPotentialChild = false;
                    for (var k = 0; k < UPLOAD_IDENTIFIERS.length; k++) {
                        if (matchBytes(f.data, UPLOAD_IDENTIFIERS[k])) {
                            hasPotentialChild = true;
                            break;
                        }
                    }
                    if (hasPotentialChild) {
                        f.data = filterTree(f.data);
                    }
                }
                newFields.push(f);
            }
            return encodeMessage(newFields);
        } catch (e) {
            return data;
        }
    }

    function patchPlayer(data) {
        try {
            var fields = decodeMessage(data);
            if (!fields || fields.length === 0) return data;
            for (var i = 0; i < fields.length; i++) {
                var f = fields[i];
                if (f.no === 2 && f.type === 2) {
                    var playability = decodeMessage(f.data);
                    var hasPip = false;
                    for (var j = 0; j < playability.length; j++) {
                        if (playability[j].no === 5) {
                            playability[j].type = 0;
                            playability[j].data = new Uint8Array([1]);
                            hasPip = true;
                        }
                    }
                    if (!hasPip) {
                        playability.push({ no: 5, type: 0, data: new Uint8Array([1]) });
                    }
                    playability.push({ no: 21, type: 0, data: new Uint8Array([1]) });
                    f.data = encodeMessage(playability);
                }
            }
            return encodeMessage(fields);
        } catch (e) {
            return data;
        }
    }

    return {
        filter: filterTree,
        patchPlayer: patchPlayer
    };
})();

var url = $request.url;
var rawData = null;

if (typeof $response.bodyBytes !== "undefined" && $response.bodyBytes !== null) {
    rawData = new Uint8Array($response.bodyBytes);
} else if (typeof $response.body === "object" && $response.body !== null) {
    if ($response.body instanceof Uint8Array) {
        rawData = $response.body;
    } else if ($response.body instanceof ArrayBuffer) {
        rawData = new Uint8Array($response.body);
    }
} else if (typeof $response.body === "string") {
    var arr = new Uint8Array($response.body.length);
    for (var i = 0; i < $response.body.length; i++) {
        arr[i] = $response.body.charCodeAt(i) & 255;
    }
    rawData = arr;
}

if (!rawData || rawData.length === 0) {
    $done({});
} else {
    var resultData = rawData;
    if (url.indexOf("/youtubei/v1/player") !== -1) {
        resultData = YouTubeHandler.patchPlayer(rawData);
    } else if (
        url.indexOf("/youtubei/v1/browse") !== -1 ||
        url.indexOf("/youtubei/v1/guide") !== -1 ||
        url.indexOf("/youtubei/v1/next") !== -1 ||
        url.indexOf("/youtubei/v1/account/get_setting") !== -1
    ) {
        resultData = YouTubeHandler.filter(rawData);
    }

    if (typeof $response.bodyBytes !== "undefined") {
        $done({ bodyBytes: resultData.buffer });
    } else if (typeof $response.body === "string") {
        var str = "";
        for (var j = 0; j < resultData.length; j++) {
            str += String.fromCharCode(resultData[j]);
        }
        $done({ body: str });
    } else {
        $done({ bodyBytes: resultData.buffer });
    }
}
