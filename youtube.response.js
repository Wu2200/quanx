function readVarint(bytes, offset) {
    let res = 0n;
    let shift = 0n;
    let pos = offset;
    while (pos < bytes.length) {
        const b = BigInt(bytes[pos]);
        res |= (b & 0x7fn) << shift;
        pos++;
        if ((b & 0x80n) === 0n) break;
        shift += 7n;
        if (shift >= 64n) break;
    }
    return { value: res, nextOffset: pos };
}

function writeVarint(val) {
    let v = BigInt(val);
    const buf = [];
    while (v >= 0x80n) {
        buf.push(Number((v & 0x7fn) | 0x80n));
        v >>= 7n;
    }
    buf.push(Number(v & 0x7fn));
    return new Uint8Array(buf);
}

function parseProto(bytes) {
    const fields = [];
    let offset = 0;
    while (offset < bytes.length) {
        const tag = readVarint(bytes, offset);
        if (tag.nextOffset === offset) return null;
        offset = tag.nextOffset;
        const fieldNumber = Number(tag.value >> 3n);
        const wireType = Number(tag.value & 0x07n);
        if (fieldNumber === 0) return null;
        if (wireType === 0) {
            const v = readVarint(bytes, offset);
            fields.push({ fieldNumber, wireType, data: v.value });
            offset = v.nextOffset;
        } else if (wireType === 1) {
            if (offset + 8 > bytes.length) return null;
            fields.push({ fieldNumber, wireType, data: bytes.subarray(offset, offset + 8) });
            offset += 8;
        } else if (wireType === 2) {
            const len = readVarint(bytes, offset);
            offset = len.nextOffset;
            const length = Number(len.value);
            if (offset + length > bytes.length) return null;
            fields.push({ fieldNumber, wireType, data: bytes.subarray(offset, offset + length) });
            offset += length;
        } else if (wireType === 5) {
            if (offset + 4 > bytes.length) return null;
            fields.push({ fieldNumber, wireType, data: bytes.subarray(offset, offset + 4) });
            offset += 4;
        } else {
            return null;
        }
    }
    return fields;
}

function serializeProto(fields) {
    const chunks = [];
    for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const tagVal = (BigInt(f.fieldNumber) << 3n) | BigInt(f.wireType);
        chunks.push(writeVarint(tagVal));
        if (f.wireType === 0) {
            chunks.push(writeVarint(f.data));
        } else if (f.wireType === 1 || f.wireType === 5) {
            chunks.push(f.data);
        } else if (f.wireType === 2) {
            chunks.push(writeVarint(f.data.length));
            chunks.push(f.data);
        }
    }
    let totalLen = 0;
    for (let i = 0; i < chunks.length; i++) {
        totalLen += chunks[i].length;
    }
    const out = new Uint8Array(totalLen);
    let cur = 0;
    for (let i = 0; i < chunks.length; i++) {
        out.set(chunks[i], cur);
        cur += chunks[i].length;
    }
    return out;
}

function bytesIndexOf(haystack, needle) {
    if (haystack.length < needle.length) return -1;
    for (let i = 0; i <= haystack.length - needle.length; i++) {
        let match = true;
        for (let j = 0; j < needle.length; j++) {
            if (haystack[i + j] !== needle[j]) {
                match = false;
                break;
            }
        }
        if (match) return i;
    }
    return -1;
}

function stringToBytes(str) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i) & 0xff;
    }
    return bytes;
}

const UPLOAD_TARGETS = [
    stringToBytes("FEuploads"),
    stringToBytes("FEcreate"),
    stringToBytes("PIVOT_BAR_ITEM_IDENTIFIER_CREATE"),
    stringToBytes("create_post"),
    stringToBytes("openUploadEndpoint"),
    stringToBytes("upload_video"),
    stringToBytes("createSheetEndpoint"),
    stringToBytes("pivot_upload")
];

const KEEP_TARGETS = [
    stringToBytes("FEwhat_to_watch"),
    stringToBytes("FEshorts"),
    stringToBytes("FEsubscriptions"),
    stringToBytes("FEaccount"),
    stringToBytes("FElibrary")
];

function containsAny(data, targets) {
    for (let i = 0; i < targets.length; i++) {
        if (bytesIndexOf(data, targets[i]) !== -1) {
            return true;
        }
    }
    return false;
}

function isUploadItem(bytes) {
    if (bytes.length > 4096) return false;
    if (!containsAny(bytes, UPLOAD_TARGETS)) return false;
    if (containsAny(bytes, KEEP_TARGETS)) return false;
    return true;
}

function filterProto(bytes) {
    const fields = parseProto(bytes);
    if (!fields) return bytes;
    const result = [];
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        if (field.wireType === 2) {
            if (isUploadItem(field.data)) {
                continue;
            }
            if (containsAny(field.data, UPLOAD_TARGETS)) {
                field.data = filterProto(field.data);
            }
        }
        result.push(field);
    }
    return serializeProto(result);
}

function patchPlayerProto(bytes) {
    const fields = parseProto(bytes);
    if (!fields) return bytes;
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        if (field.fieldNumber === 2 && field.wireType === 2) {
            const playability = parseProto(field.data);
            if (playability) {
                let foundPip = false;
                for (let j = 0; j < playability.length; j++) {
                    if (playability[j].fieldNumber === 5) {
                        playability[j].wireType = 0;
                        playability[j].data = 1n;
                        foundPip = true;
                    }
                }
                if (!foundPip) {
                    playability.push({ fieldNumber: 5, wireType: 0, data: 1n });
                }
                field.data = serializeProto(playability);
            }
        }
    }
    return serializeProto(fields);
}

const url = $request.url;
let rawData = null;

if (typeof $response.bodyBytes !== "undefined" && $response.bodyBytes !== null) {
    rawData = new Uint8Array($response.bodyBytes);
} else if (typeof $response.body === "object" && $response.body !== null) {
    if ($response.body instanceof Uint8Array) {
        rawData = $response.body;
    } else if ($response.body instanceof ArrayBuffer) {
        rawData = new Uint8Array($response.body);
    }
} else if (typeof $response.body === "string") {
    rawData = stringToBytes($response.body);
}

if (!rawData || rawData.length === 0) {
    $done({});
} else {
    let modifiedData = rawData;
    if (url.indexOf("/youtubei/v1/player") !== -1) {
        modifiedData = patchPlayerProto(rawData);
    } else if (url.indexOf("/youtubei/v1/browse") !== -1 || url.indexOf("/youtubei/v1/guide") !== -1 || url.indexOf("/youtubei/v1/next") !== -1 || url.indexOf("/youtubei/v1/account/get_setting") !== -1) {
        modifiedData = filterProto(rawData);
    }

    if (typeof $response.bodyBytes !== "undefined") {
        $done({ bodyBytes: modifiedData.buffer });
    } else if (typeof $response.body === "string") {
        let str = "";
        for (let i = 0; i < modifiedData.length; i++) {
            str += String.fromCharCode(modifiedData[i]);
        }
        $done({ body: str });
    } else {
        $done({ bodyBytes: modifiedData.buffer });
    }
}
