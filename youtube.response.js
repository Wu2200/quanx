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

function decodeFields(bytes) {
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
            fields.push({ fieldNumber, wireType, rawData: bytes.subarray(offset, v.nextOffset) });
            offset = v.nextOffset;
        } else if (wireType === 1) {
            if (offset + 8 > bytes.length) return null;
            fields.push({ fieldNumber, wireType, rawData: bytes.subarray(offset, offset + 8) });
            offset += 8;
        } else if (wireType === 2) {
            const len = readVarint(bytes, offset);
            offset = len.nextOffset;
            const length = Number(len.value);
            if (offset + length > bytes.length) return null;
            fields.push({ fieldNumber, wireType, rawData: bytes.subarray(offset, offset + length) });
            offset += length;
        } else if (wireType === 5) {
            if (offset + 4 > bytes.length) return null;
            fields.push({ fieldNumber, wireType, rawData: bytes.subarray(offset, offset + 4) });
            offset += 4;
        } else {
            return null;
        }
    }
    return fields;
}

function encodeFields(fields) {
    const chunks = [];
    for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const tagVal = (BigInt(f.fieldNumber) << 3n) | BigInt(f.wireType);
        chunks.push(writeVarint(tagVal));
        if (f.wireType === 2) {
            chunks.push(writeVarint(f.rawData.length));
        }
        chunks.push(f.rawData);
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

const UPLOAD_KEYWORDS = [
    "FEuploads",
    "FEcreate",
    "PIVOT_BAR_ITEM_IDENTIFIER_CREATE",
    "create_post",
    "openUploadEndpoint",
    "upload_video",
    "createSheetEndpoint",
    "pivot_upload",
    "FEshorts_creation"
].map(stringToBytes);

const KEEP_KEYWORDS = [
    "FEwhat_to_watch",
    "FEshorts",
    "FEsubscriptions",
    "FEaccount",
    "FElibrary"
].map(stringToBytes);

function containsAny(data, targets) {
    for (let i = 0; i < targets.length; i++) {
        if (bytesIndexOf(data, targets[i]) !== -1) {
            return true;
        }
    }
    return false;
}

function isUploadNode(data) {
    if (data.length > 8192) return false;
    if (!containsAny(data, UPLOAD_KEYWORDS)) return false;
    if (containsAny(data, KEEP_KEYWORDS)) return false;
    return true;
}

function filterProtobuf(data) {
    const fields = decodeFields(data);
    if (!fields || fields.length === 0) return data;
    const result = [];
    for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        if (f.wireType === 2) {
            if (isUploadNode(f.rawData)) {
                continue;
            }
            if (containsAny(f.rawData, UPLOAD_KEYWORDS)) {
                const subFields = decodeFields(f.rawData);
                if (subFields && subFields.length > 0) {
                    f.rawData = filterProtobuf(f.rawData);
                }
            }
        }
        result.push(f);
    }
    return encodeFields(result);
}

function isUploadString(str) {
    return /FEuploads|FEcreate|PIVOT_BAR_ITEM_IDENTIFIER_CREATE|create_post|openUploadEndpoint|upload_video|createSheetEndpoint|pivot_upload|FEshorts_creation/.test(str);
}

function isKeepString(str) {
    return /FEwhat_to_watch|FEshorts|FEsubscriptions|FEaccount|FElibrary/.test(str);
}

function filterJson(obj) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
        const filtered = [];
        for (let i = 0; i < obj.length; i++) {
            const item = obj[i];
            const str = JSON.stringify(item);
            if (isUploadString(str) && !isKeepString(str)) {
                continue;
            }
            filtered.push(filterJson(item));
        }
        return filtered;
    }
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            obj[key] = filterJson(obj[key]);
        }
    }
    return obj;
}

let rawData = null;
let isBinary = false;

if (typeof $response.bodyBytes !== "undefined" && $response.bodyBytes !== null) {
    rawData = new Uint8Array($response.bodyBytes);
    isBinary = true;
} else if (typeof $response.body === "object" && $response.body !== null) {
    if ($response.body instanceof Uint8Array) {
        rawData = $response.body;
        isBinary = true;
    } else if ($response.body instanceof ArrayBuffer) {
        rawData = new Uint8Array($response.body);
        isBinary = true;
    }
} else if (typeof $response.body === "string") {
    try {
        const json = JSON.parse($response.body);
        const modifiedJson = filterJson(json);
        $done({ body: JSON.stringify(modifiedJson) });
    } catch (e) {
        rawData = stringToBytes($response.body);
    }
}

if (rawData && rawData.length > 0) {
    const modifiedData = filterProtobuf(rawData);
    if (isBinary || typeof $response.bodyBytes !== "undefined") {
        $done({ bodyBytes: modifiedData.buffer });
    } else {
        let str = "";
        for (let i = 0; i < modifiedData.length; i++) {
            str += String.fromCharCode(modifiedData[i]);
        }
        $done({ body: str });
    }
} else {
    $done({});
}
