import { crc32 } from "node:zlib";

export function isPngImage(bytes: Buffer): boolean {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return false;
  let offset = 8;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (offset + length + 12 > bytes.length) return false;
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) return false;
    if (offset === 8 && (type !== "IHDR" || length !== 13 || bytes.readUInt32BE(16) === 0 || bytes.readUInt32BE(20) === 0)) return false;
    if (type === "IDAT" && length > 0) hasImageData = true;
    offset += length + 12;
    if (type === "IEND") return length === 0 && hasImageData && offset === bytes.length;
  }
  return false;
}
