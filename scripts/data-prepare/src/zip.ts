import { open } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

/**
 * The files in a zip, read from its central directory, for a source that
 * hands out a zip whose CSV must be decoded before DuckDB reads it, as GIAS
 * does: GDAL reads a CSV inside a zip only as UTF-8. Only what a zip of a few
 * files needs: stored and deflated files, without Zip64.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

export interface ZipEntry {
  name: string;
  /** Its contents, uncompressed. */
  read: () => Buffer;
}

const notAZip = (why: string) =>
  new Error(`Not a zip file we can read: ${why}`);

/** Lists the files in a zip, each read only when asked for. Throws if it isn't one. */
export const zipEntries = (zip: Buffer): ZipEntry[] => {
  // The end record is at least 22 bytes from the end, before any comment.
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== END_OF_CENTRAL_DIRECTORY) end--;
  if (end < 0) throw notAZip("it has no central directory");
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);

  return Array.from({ length: count }, () => {
    if (zip.readUInt32LE(at) !== CENTRAL_DIRECTORY_HEADER) {
      throw notAZip("its central directory is broken");
    }
    const method = zip.readUInt16LE(at + 10);
    const compressedSize = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const localHeader = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (compressedSize === 0xffffffff) {
      throw notAZip(`${name} needs Zip64`);
    }

    return {
      name,
      read: () => {
        if (zip.readUInt32LE(localHeader) !== LOCAL_FILE_HEADER) {
          throw notAZip(`${name} has no header`);
        }
        const start =
          localHeader +
          30 +
          zip.readUInt16LE(localHeader + 26) +
          zip.readUInt16LE(localHeader + 28);
        const data = zip.subarray(start, start + compressedSize);
        if (method === STORED) return Buffer.from(data);
        if (method === DEFLATED) return inflateRawSync(data);
        throw notAZip(`${name} is compressed in a way we can't read`);
      },
    };
  });
};

/**
 * The names of the files in a zip, from its central directory alone, for a
 * zip too large to read whole, such as OS Open UPRN's or HM Land Registry's
 * CCOD. Only what a zip of a few files needs: no Zip64, and a comment
 * shorter than 64 KB.
 */
export const zipMemberNames = async (zip: string) => {
  const file = await open(zip);
  try {
    const { size } = await file.stat();
    const tailLength = Math.min(size, 22 + 0xffff);
    const tail = Buffer.alloc(tailLength);
    await file.read(tail, 0, tailLength, size - tailLength);
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) throw new Error(`${zip} is not a zip.`);
    const count = tail.readUInt16LE(end + 10);
    const directory = Buffer.alloc(tail.readUInt32LE(end + 12));
    await file.read(
      directory,
      0,
      directory.length,
      tail.readUInt32LE(end + 16),
    );
    const names = [];
    for (let at = 0, index = 0; index < count; index++) {
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      names.push(directory.toString("utf8", at + 46, at + 46 + nameLength));
      at += 46 + nameLength + extraLength + commentLength;
    }
    return names;
  } finally {
    await file.close();
  }
};
