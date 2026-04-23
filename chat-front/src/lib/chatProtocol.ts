'use client';

import DiffMatchPatch from 'diff-match-patch';
import pako from 'pako';

import type { FileAttachment, PackEntry } from '@/types/chat';

const dmp = new DiffMatchPatch.diff_match_patch();
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function rotr(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256Fallback(input: Uint8Array) {
  const primes = [
    1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748,
    2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206,
    2614888103, 3248222580, 3835390401, 4022224774, 264347078, 604807628, 770255983,
    1249150122, 1555081692, 1996064986, 2554220882, 2821834349, 2952996808, 3210313671,
    3336571891, 3584528711, 113926993, 338241895, 666307205, 773529912, 1294757372,
    1396182291, 1695183700, 1986661051, 2177026350, 2456956037, 2730485921, 2820302411,
    3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344, 430227734,
    506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779,
    1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479,
    3329325298,
  ];

  const initial = [
    1779033703, 3144134277, 1013904242, 2773480762,
    1359893119, 2600822924, 528734635, 1541459225,
  ];

  const bitLength = input.length * 8;
  const withOne = input.length + 1;
  const paddedLength = withOne + ((64 - ((withOne + 8) % 64)) % 64) + 8;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;

  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  padded[padded.length - 8] = (high >>> 24) & 0xff;
  padded[padded.length - 7] = (high >>> 16) & 0xff;
  padded[padded.length - 6] = (high >>> 8) & 0xff;
  padded[padded.length - 5] = high & 0xff;
  padded[padded.length - 4] = (low >>> 24) & 0xff;
  padded[padded.length - 3] = (low >>> 16) & 0xff;
  padded[padded.length - 2] = (low >>> 8) & 0xff;
  padded[padded.length - 1] = low & 0xff;

  const hash = [...initial];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      words[index] =
        (padded[start] << 24) |
        (padded[start + 1] << 16) |
        (padded[start + 2] << 8) |
        padded[start + 3];
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 = rotr(words[index - 15], 7) ^ rotr(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotr(words[index - 2], 17) ^ rotr(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + primes[index] + words[index]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  const output = new Uint8Array(32);
  hash.forEach((value, index) => {
    const base = index * 4;
    output[base] = (value >>> 24) & 0xff;
    output[base + 1] = (value >>> 16) & 0xff;
    output[base + 2] = (value >>> 8) & 0xff;
    output[base + 3] = value & 0xff;
  });

  return output;
}

async function sha256Bytes(input: Uint8Array) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digestInput = new Uint8Array(input.byteLength);
    digestInput.set(input);
    return new Uint8Array(await subtle.digest('SHA-256', digestInput.buffer));
  }

  return sha256Fallback(input);
}

export function createClientTag() {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  if (typeof webCrypto?.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function stableMetadata(metadata: {
  timestamp: number;
  senderId: string;
  conversationId: string;
  clientTag: string;
  streamId?: string;
  attachmentIds?: string[];
}) {
  return JSON.stringify({
    client_tag: metadata.clientTag,
    conversation_id: metadata.conversationId,
    sender_id: metadata.senderId,
    stream_id: metadata.streamId ?? '',
    timestamp: metadata.timestamp,
    attachment_ids: metadata.attachmentIds ?? [],
  });
}

export async function createMessageId(
  content: string,
  metadata: Parameters<typeof stableMetadata>[0],
) {
  const digest = await sha256Bytes(textEncoder.encode(`${content}\u001f${stableMetadata(metadata)}`));

  return Array.from(digest)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function readUint64(view: DataView, offset: number) {
  return Number(view.getBigUint64(offset, false));
}

export async function decodePackfile(packet: Uint8Array) {
  if (packet.length < 48) {
    throw new Error('Pack is too small');
  }

  const compressed = packet.slice(0, -32);
  const checksum = packet.slice(-32);
  const decompressed = pako.inflate(compressed);
  const computed = await sha256Bytes(decompressed);

  if (bytesToHex(computed) !== bytesToHex(checksum)) {
    throw new Error('Checksum mismatch');
  }

  const view = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);
  const header = textDecoder.decode(decompressed.slice(0, 4));
  if (header !== 'PACK') {
    throw new Error('Invalid pack header');
  }

  const version = view.getUint16(4, false);
  if (version !== 1) {
    throw new Error(`Unsupported pack version ${version}`);
  }

  const entryCount = view.getUint32(8, false);
  let offset = 16;
  const entries: PackEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    const type = ['base', 'delta', 'reference'][view.getUint8(offset)] as PackEntry['type'];
    offset += 1;
    const flags = view.getUint8(offset);
    offset += 1;
    const id = bytesToHex(decompressed.slice(offset, offset + 32));
    offset += 32;
    const baseIdHex = bytesToHex(decompressed.slice(offset, offset + 32));
    const baseId = /^0+$/.test(baseIdHex) ? null : baseIdHex;
    offset += 32;
    const timestamp = readUint64(view, offset);
    offset += 8;
    const sequence = readUint64(view, offset);
    offset += 8;
    const chunkIndex = view.getUint32(offset, false);
    offset += 4;
    const totalChunks = view.getUint32(offset, false);
    offset += 4;
    const senderLength = view.getUint16(offset, false);
    offset += 2;
    const conversationLength = view.getUint16(offset, false);
    offset += 2;
    const clientTagLength = view.getUint16(offset, false);
    offset += 2;
    const streamIdLength = view.getUint16(offset, false);
    offset += 2;
    const payloadLength = view.getUint32(offset, false);
    offset += 4;

    const senderId = textDecoder.decode(decompressed.slice(offset, offset + senderLength));
    offset += senderLength;
    const conversationId = textDecoder.decode(
      decompressed.slice(offset, offset + conversationLength),
    );
    offset += conversationLength;
    const clientTag = textDecoder.decode(decompressed.slice(offset, offset + clientTagLength));
    offset += clientTagLength;
    const streamId = textDecoder.decode(decompressed.slice(offset, offset + streamIdLength));
    offset += streamIdLength;
    const payload = textDecoder.decode(decompressed.slice(offset, offset + payloadLength));
    offset += payloadLength;

    entries.push({
      id,
      type,
      baseId,
      timestamp,
      sequence,
      chunkIndex,
      totalChunks,
      senderId,
      conversationId,
      clientTag,
      streamId,
      isFinal: (flags & 1) === 1,
      payload,
    });
  }

  return entries;
}

export function applyDelta(baseContent: string, delta: string) {
  const patches = dmp.patch_fromText(delta);
  const [result] = dmp.patch_apply(patches, baseContent);
  return result;
}

export function parseEntryPayload(
  entry: PackEntry,
  fallbackAttachments: FileAttachment[] = [],
): { content: string; attachments: FileAttachment[]; delta?: string } {
  if (!entry.payload) {
    return {
      content: '',
      attachments: fallbackAttachments,
    };
  }

  const parsed = JSON.parse(entry.payload);
  return {
    content: parsed.content || '',
    delta: parsed.delta || '',
    attachments: Array.isArray(parsed.attachments) ? parsed.attachments : fallbackAttachments,
  };
}
