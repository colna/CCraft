import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

type PngMetadata = {
  bitDepth: number;
  colorType: number;
  height: number;
  width: number;
};

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngMetadata(buffer: Buffer): PngMetadata {
  expect(buffer.subarray(0, pngSignature.length)).toEqual(pngSignature);

  let offset = pngSignature.length;
  const idatChunks: Buffer[] = [];
  let metadata: PngMetadata | undefined;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      metadata = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data.readUInt8(8),
        colorType: data.readUInt8(9)
      };
    }

    if (type === "IDAT") {
      idatChunks.push(data);
    }

    if (type === "IEND") break;
    offset = dataEnd + 4;
  }

  expect(metadata).toBeDefined();
  expect(idatChunks.length).toBeGreaterThan(0);

  const imageData = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = metadata!.colorType === 6 ? 4 : 0;
  expect(imageData.length).toBe((metadata!.width * bytesPerPixel + 1) * metadata!.height);

  return metadata!;
}

describe("Tauri icon assets", () => {
  it("keeps the default app icon as a valid 8-bit RGBA PNG", () => {
    const iconPath = resolve(process.cwd(), "src-tauri/icons/icon.png");
    const metadata = readPngMetadata(readFileSync(iconPath));

    expect(metadata).toEqual({
      width: 512,
      height: 512,
      bitDepth: 8,
      colorType: 6
    });
  });
});
