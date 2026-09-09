// Download the highest-quality image URLs produced by inventory_images.ts.
//
// Usage:
//   bun run scripts/download_images.ts
//   bun run scripts/download_images.ts --input output/images/download-list.tsv

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  link,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { parseArgs } from "node:util";

const DEFAULT_INPUT = "output/images/download-list.tsv";
const DEFAULT_OUTPUT = "output/images/assets";
const DEFAULT_REPORT = "output/images/download-report.json";
const DEFAULT_MANIFEST = "output/images/manifest.json";
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const SCHEMA_VERSION = 1;

interface DownloadEntry {
  assetId: string;
  url: string;
}

interface InventoryMetadata {
  canonicalUrl: string | null;
  expectedBytes: number | null;
  expectedMimeType: string | null;
  expectedWidth: number | null;
  expectedHeight: number | null;
  maxAdvertisedWidth: number | null;
}

interface DetectedImage {
  mimeType: string;
  extension: string;
  width: number | null;
  height: number | null;
}

type DownloadStatus = "downloaded" | "skipped" | "failed";

type DimensionVerification =
  | "matches-url-dimensions"
  | "matches-url-dimensions-rotated"
  | "at-least-largest-advertised-width"
  | "smaller-than-largest-advertised-width"
  | "url-dimensions-mismatch"
  | "dimensions-detected"
  | "dimensions-unavailable";

interface DownloadVerification {
  isImage: boolean;
  contentLengthMatches: boolean | null;
  expectedBytesMatches: boolean | null;
  expectedMimeTypeMatches: boolean | null;
  dimensions: DimensionVerification;
}

interface DownloadResult {
  assetId: string;
  sourceUrl: string;
  finalUrl: string | null;
  status: DownloadStatus;
  attempts: number;
  filePath: string | null;
  mimeType: string | null;
  extension: string | null;
  bytes: number | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  expectedBytes: number | null;
  expectedMimeType: string | null;
  expectedWidth: number | null;
  expectedHeight: number | null;
  maxAdvertisedWidth: number | null;
  verification: DownloadVerification | null;
  warnings: string[];
  duplicateContentOf: string | null;
  deduplicated: boolean;
  error: string | null;
}

interface DownloadReport {
  schemaVersion: number;
  generatedAt: string;
  inputFile: string;
  outputDirectory: string;
  summary: {
    requested: number;
    downloaded: number;
    skipped: number;
    failed: number;
    warnings: number;
    contentDuplicates: number;
    hardlinkedDuplicates: number;
    totalBytes: number;
  };
  downloads: DownloadResult[];
}

interface PriorDownload {
  assetId: string;
  sourceUrl: string;
  finalUrl: string | null;
  filePath: string | null;
  mimeType: string | null;
  sha256: string | null;
}

interface PriorDownloadReport {
  downloads?: unknown;
}

interface InventoryManifest {
  assets?: Array<{
    assetId?: unknown;
    canonicalUrl?: unknown;
    byteEstimate?: unknown;
    mimeType?: unknown;
    srcsetCandidates?: unknown;
    pictureSources?: unknown;
  }>;
}

class HttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfter: string | null = null
  ) {
    super(message);
    this.name = "HttpError";
  }
}

class ByteLimitTransform extends Transform {
  private bytes = 0;

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    this.bytes += chunk.length;
    if (this.bytes > maxBytes) {
      callback(new HttpError(`response exceeded --max-bytes (${maxBytes})`, false));
      return;
    }
    callback(null, chunk);
  }
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    input: { type: "string", default: DEFAULT_INPUT },
    output: { type: "string", default: DEFAULT_OUTPUT },
    report: { type: "string", default: DEFAULT_REPORT },
    manifest: { type: "string", default: DEFAULT_MANIFEST },
    concurrency: { type: "string", default: String(DEFAULT_CONCURRENCY) },
    retries: { type: "string", default: String(DEFAULT_RETRIES) },
    timeout: { type: "string", default: String(DEFAULT_TIMEOUT_MS) },
    "max-bytes": { type: "string", default: String(DEFAULT_MAX_BYTES) },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`Usage: bun run scripts/download_images.ts [options]

Options:
  --input <path>          Headerless asset-id/URL TSV (${DEFAULT_INPUT})
  --output <directory>   Download destination (${DEFAULT_OUTPUT})
  --report <path>        JSON result report (${DEFAULT_REPORT})
  --manifest <path>      Inventory manifest used for verification (${DEFAULT_MANIFEST})
  --concurrency <count>  Simultaneous downloads (${DEFAULT_CONCURRENCY})
  --retries <count>      Retries after the initial request (${DEFAULT_RETRIES})
  --timeout <ms>         Per-attempt timeout (${DEFAULT_TIMEOUT_MS})
  --max-bytes <count>    Maximum bytes accepted per image (${DEFAULT_MAX_BYTES})
  -h, --help             Show this help`);
  process.exit(0);
}

const inputFile = values.input ?? DEFAULT_INPUT;
const outputDirectory = values.output ?? DEFAULT_OUTPUT;
const reportFile = values.report ?? DEFAULT_REPORT;
const manifestFile = values.manifest ?? DEFAULT_MANIFEST;
const concurrency = parseIntegerOption(
  "concurrency",
  values.concurrency,
  1,
  64
);
const retries = parseIntegerOption("retries", values.retries, 0, 20);
const timeoutMs = parseIntegerOption("timeout", values.timeout, 1, 3_600_000);
const maxBytes = parseIntegerOption(
  "max-bytes",
  values["max-bytes"],
  1,
  Number.MAX_SAFE_INTEGER
);

function parseIntegerOption(
  name: string,
  value: string | undefined,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `--${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
  return parsed;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDownloadList(contents: string): DownloadEntry[] {
  const entries: DownloadEntry[] = [];
  const seenAssetIds = new Set<string>();

  for (const [index, rawLine] of contents.split("\n").entries()) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line) continue;

    const separator = line.indexOf("\t");
    if (separator === -1) {
      throw new Error(`Invalid TSV at line ${index + 1}: expected two columns`);
    }

    const assetId = line.slice(0, separator);
    const url = line.slice(separator + 1);
    if (!/^[a-zA-Z0-9._-]+$/.test(assetId)) {
      throw new Error(`Invalid asset ID at line ${index + 1}: ${assetId}`);
    }
    if (seenAssetIds.has(assetId)) {
      throw new Error(`Duplicate asset ID at line ${index + 1}: ${assetId}`);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL at line ${index + 1}: ${url}`);
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new Error(`Unsupported URL protocol at line ${index + 1}: ${url}`);
    }

    seenAssetIds.add(assetId);
    entries.push({ assetId, url });
  }

  if (entries.length === 0) throw new Error(`No downloads found in ${inputFile}`);
  return entries;
}

function collectCandidateWidths(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const width = (candidate as { width?: unknown }).width;
    return typeof width === "number" && Number.isFinite(width) ? [width] : [];
  });
}

function dimensionsFromUrl(url: string | null): {
  width: number | null;
  height: number | null;
} {
  if (!url) return { width: null, height: null };
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch {
    return { width: null, height: null };
  }

  const match = pathname.match(/_(\d+)x(\d+)(?:\.[^./]+)?$/i);
  return match
    ? { width: Number(match[1]), height: Number(match[2]) }
    : { width: null, height: null };
}

async function loadInventoryMetadata(
  path: string
): Promise<Map<string, InventoryMetadata>> {
  let parsed: InventoryManifest;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as InventoryManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`Verification manifest not found: ${path}`);
      return new Map();
    }
    throw new Error(`Could not read verification manifest ${path}: ${String(error)}`);
  }

  const metadata = new Map<string, InventoryMetadata>();
  for (const asset of parsed.assets ?? []) {
    const assetId = asNullableString(asset.assetId);
    if (!assetId) continue;
    const canonicalUrl = asNullableString(asset.canonicalUrl);
    const urlDimensions = dimensionsFromUrl(canonicalUrl);
    const widths = collectCandidateWidths(asset.srcsetCandidates);

    if (Array.isArray(asset.pictureSources)) {
      for (const source of asset.pictureSources) {
        if (!source || typeof source !== "object") continue;
        widths.push(
          ...collectCandidateWidths(
            (source as { candidates?: unknown }).candidates
          )
        );
      }
    }

    metadata.set(assetId, {
      canonicalUrl,
      expectedBytes: asNullableNumber(asset.byteEstimate),
      expectedMimeType: asNullableString(asset.mimeType),
      expectedWidth: urlDimensions.width,
      expectedHeight: urlDimensions.height,
      maxAdvertisedWidth: widths.length > 0 ? Math.max(...widths) : null,
    });
  }
  return metadata;
}

async function loadPriorDownloads(path: string): Promise<Map<string, PriorDownload>> {
  try {
    const report = JSON.parse(await readFile(path, "utf8")) as PriorDownloadReport;
    if (!Array.isArray(report.downloads)) return new Map();

    const downloads = report.downloads.flatMap((value): PriorDownload[] => {
      if (!value || typeof value !== "object") return [];
      const download = value as Record<string, unknown>;
      const assetId = asNullableString(download.assetId);
      const sourceUrl = asNullableString(download.sourceUrl);
      if (!assetId || !sourceUrl) return [];
      return [{
        assetId,
        sourceUrl,
        finalUrl: asNullableString(download.finalUrl),
        filePath: asNullableString(download.filePath),
        mimeType: asNullableString(download.mimeType),
        sha256: asNullableString(download.sha256),
      }];
    });
    return new Map(downloads.map((download) => [download.assetId, download]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    console.warn(`Ignoring unreadable prior report ${path}: ${String(error)}`);
    return new Map();
  }
}

function normalizeMimeType(value: string | null): string | null {
  if (!value) return null;
  const mimeType = value.split(";", 1)[0].trim().toLowerCase();
  if (mimeType === "image/jpg") return "image/jpeg";
  if (mimeType === "image/heif") return "image/heic";
  return mimeType || null;
}

function detectMimeType(buffer: Buffer, responseMimeType: string | null): {
  mimeType: string | null;
  extension: string | null;
} {
  if (buffer.length >= 12) {
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      return { mimeType: "image/png", extension: "png" };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mimeType: "image/jpeg", extension: "jpg" };
    }
    if (buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/)) {
      return { mimeType: "image/gif", extension: "gif" };
    }
    if (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return { mimeType: "image/webp", extension: "webp" };
    }
    if (buffer.subarray(0, 2).toString("ascii") === "BM") {
      return { mimeType: "image/bmp", extension: "bmp" };
    }
    if (
      buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
      buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
    ) {
      return { mimeType: "image/tiff", extension: "tiff" };
    }

    if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
      const brands = buffer.subarray(8, Math.min(buffer.length, 64)).toString("ascii");
      if (/avif|avis/.test(brands)) {
        return { mimeType: "image/avif", extension: "avif" };
      }
      if (/heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(brands)) {
        return { mimeType: "image/heic", extension: "heic" };
      }
    }
  }

  const beginning = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("utf8");
  if (/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(beginning)) {
    return { mimeType: "image/svg+xml", extension: "svg" };
  }

  const normalized = normalizeMimeType(responseMimeType);
  const extensions: Record<string, string> = {
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/tiff": "tiff",
    "image/webp": "webp",
  };
  return normalized && extensions[normalized]
    ? { mimeType: normalized, extension: extensions[normalized] }
    : { mimeType: null, extension: null };
}

function jpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (
      marker === 0x00 ||
      marker === 0x01 ||
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 2 > buffer.length) return null;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > buffer.length) return null;

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width: 1 + buffer.readUIntLE(dataOffset + 4, 3),
        height: 1 + buffer.readUIntLE(dataOffset + 7, 3),
      };
    }
    if (
      chunkType === "VP8 " &&
      chunkSize >= 10 &&
      buffer.subarray(dataOffset + 3, dataOffset + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))
    ) {
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }
    if (chunkType === "VP8L" && chunkSize >= 5 && buffer[dataOffset] === 0x2f) {
      const packed = buffer.readUInt32LE(dataOffset + 1);
      return {
        width: 1 + (packed & 0x3fff),
        height: 1 + ((packed >>> 14) & 0x3fff),
      };
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  return null;
}

function heifDimensions(buffer: Buffer): { width: number; height: number } | null {
  const marker = Buffer.from("ispe");
  const candidates: Array<{ width: number; height: number }> = [];
  let offset = 0;

  while ((offset = buffer.indexOf(marker, offset)) !== -1) {
    if (offset >= 4 && offset + 16 <= buffer.length) {
      const boxSize = buffer.readUInt32BE(offset - 4);
      const width = buffer.readUInt32BE(offset + 8);
      const height = buffer.readUInt32BE(offset + 12);
      if (boxSize >= 20 && width > 0 && height > 0) candidates.push({ width, height });
    }
    offset += marker.length;
  }

  return candidates.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}

function tiffDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 8) return null;
  const littleEndian = buffer.subarray(0, 2).toString("ascii") === "II";
  const readUInt16 = (offset: number) =>
    littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
  const readUInt32 = (offset: number) =>
    littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  const ifdOffset = readUInt32(4);
  if (ifdOffset + 2 > buffer.length) return null;

  const count = readUInt16(ifdOffset);
  let width: number | null = null;
  let height: number | null = null;
  for (let index = 0; index < count; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > buffer.length) break;
    const tag = readUInt16(entryOffset);
    const type = readUInt16(entryOffset + 2);
    const value = type === 3 ? readUInt16(entryOffset + 8) : readUInt32(entryOffset + 8);
    if (tag === 256) width = value;
    if (tag === 257) height = value;
  }
  return width && height ? { width, height } : null;
}

function svgDimensions(buffer: Buffer): { width: number; height: number } | null {
  const source = buffer.toString("utf8");
  const svg = source.match(/<svg\b([^>]*)>/i)?.[1];
  if (!svg) return null;
  const width = svg.match(/\bwidth=["']\s*([\d.]+)/i)?.[1];
  const height = svg.match(/\bheight=["']\s*([\d.]+)/i)?.[1];
  if (width && height) return { width: Number(width), height: Number(height) };

  const viewBox = svg.match(/\bviewBox=["']\s*[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
  return viewBox ? { width: Number(viewBox[1]), height: Number(viewBox[2]) } : null;
}

function detectDimensions(
  buffer: Buffer,
  mimeType: string
): { width: number; height: number } | null {
  if (mimeType === "image/png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === "image/gif" && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mimeType === "image/bmp" && buffer.length >= 26) {
    return {
      width: Math.abs(buffer.readInt32LE(18)),
      height: Math.abs(buffer.readInt32LE(22)),
    };
  }
  if (mimeType === "image/jpeg") return jpegDimensions(buffer);
  if (mimeType === "image/webp") return webpDimensions(buffer);
  if (mimeType === "image/heic" || mimeType === "image/avif") {
    return heifDimensions(buffer);
  }
  if (mimeType === "image/tiff") return tiffDimensions(buffer);
  if (mimeType === "image/svg+xml") return svgDimensions(buffer);
  return null;
}

async function inspectImage(
  path: string,
  responseMimeType: string | null
): Promise<DetectedImage & { bytes: number; sha256: string }> {
  const [buffer, fileStat] = await Promise.all([readFile(path), stat(path)]);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const detected = detectMimeType(buffer, responseMimeType);
  if (!detected.mimeType || !detected.extension) {
    throw new Error("response is not a recognized image format");
  }
  const dimensions = detectDimensions(buffer, detected.mimeType);
  return {
    mimeType: detected.mimeType,
    extension: detected.extension,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    bytes: fileStat.size,
    sha256,
  };
}

function verifyDownload(
  image: DetectedImage & { bytes: number },
  metadata: InventoryMetadata,
  contentLength: number | null
): DownloadVerification {
  let dimensionVerification: DimensionVerification;
  if (image.width === null || image.height === null) {
    dimensionVerification = "dimensions-unavailable";
  } else if (metadata.expectedWidth !== null && metadata.expectedHeight !== null) {
    if (
      image.width === metadata.expectedWidth &&
      image.height === metadata.expectedHeight
    ) {
      dimensionVerification = "matches-url-dimensions";
    } else if (
      image.width === metadata.expectedHeight &&
      image.height === metadata.expectedWidth
    ) {
      dimensionVerification = "matches-url-dimensions-rotated";
    } else {
      dimensionVerification = "url-dimensions-mismatch";
    }
  } else if (metadata.maxAdvertisedWidth !== null) {
    dimensionVerification = image.width >= metadata.maxAdvertisedWidth
      ? "at-least-largest-advertised-width"
      : "smaller-than-largest-advertised-width";
  } else {
    dimensionVerification = "dimensions-detected";
  }

  return {
    isImage: true,
    contentLengthMatches: contentLength === null ? null : contentLength === image.bytes,
    expectedBytesMatches:
      metadata.expectedBytes === null ? null : metadata.expectedBytes === image.bytes,
    expectedMimeTypeMatches:
      metadata.expectedMimeType === null
        ? null
        : normalizeMimeType(metadata.expectedMimeType) === image.mimeType,
    dimensions: dimensionVerification,
  };
}

function verificationWarnings(verification: DownloadVerification): string[] {
  const warnings: string[] = [];
  if (verification.contentLengthMatches === false) {
    warnings.push("downloaded bytes do not match Content-Length");
  }
  if (verification.expectedBytesMatches === false) {
    warnings.push("downloaded bytes do not match manifest byte estimate");
  }
  if (verification.expectedMimeTypeMatches === false) {
    warnings.push("detected MIME type does not match manifest MIME type");
  }
  if (verification.dimensions === "url-dimensions-mismatch") {
    warnings.push("actual dimensions do not match dimensions encoded in the URL");
  }
  if (verification.dimensions === "smaller-than-largest-advertised-width") {
    warnings.push("actual width is smaller than the largest advertised srcset width");
  }
  if (verification.dimensions === "dimensions-unavailable") {
    warnings.push("actual dimensions could not be detected");
  }
  return warnings;
}

function metadataForEntry(
  entry: DownloadEntry,
  metadata: Map<string, InventoryMetadata>
): InventoryMetadata {
  const inventory = metadata.get(entry.assetId);
  if (inventory && (!inventory.canonicalUrl || inventory.canonicalUrl === entry.url)) {
    return inventory;
  }

  const dimensions = dimensionsFromUrl(entry.url);
  return {
    canonicalUrl: entry.url,
    expectedBytes: null,
    expectedMimeType: null,
    expectedWidth: dimensions.width,
    expectedHeight: dimensions.height,
    maxAdvertisedWidth: null,
  };
}

function reportPath(path: string): string {
  const relativePath = relative(process.cwd(), path);
  return relativePath.startsWith("..") ? path : relativePath;
}

async function cleanupTemporaryDownloads(): Promise<void> {
  const filenames = await readdir(outputDirectory);
  const temporaryFiles = filenames.filter((filename) =>
    /\.(?:part|dedup-part)-\d+(?:-\d+)?$/.test(filename)
  );
  await Promise.all(
    temporaryFiles.map((filename) => rm(join(outputDirectory, filename), { force: true }))
  );
  if (temporaryFiles.length > 0) {
    console.log(`Removed ${temporaryFiles.length} incomplete temporary files`);
  }
}

async function existingFilesByAssetId(
  entries: DownloadEntry[],
  priorDownloads: Map<string, PriorDownload>
): Promise<Map<string, string[]>> {
  let filenames: string[];
  try {
    filenames = await readdir(outputDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }

  const result = new Map<string, string[]>();
  for (const entry of entries) {
    const prefix = `${entry.assetId}.`;
    const candidates = filenames
      .filter((filename) => filename.startsWith(prefix) && !filename.includes(".part-"))
      .map((filename) => join(outputDirectory, filename));
    const priorPath = priorDownloads.get(entry.assetId)?.filePath;
    if (priorPath) {
      candidates.sort(
        (a, b) =>
          Number(reportPath(b) === priorPath) - Number(reportPath(a) === priorPath)
      );
    }
    if (candidates.length > 0) result.set(entry.assetId, candidates);
  }
  return result;
}

async function reusableExistingDownload(options: {
  entry: DownloadEntry;
  candidates: string[];
  prior: PriorDownload | undefined;
  metadata: InventoryMetadata;
}): Promise<DownloadResult | null> {
  if (options.prior && options.prior.sourceUrl !== options.entry.url) return null;

  for (const candidate of options.candidates) {
    try {
      const image = await inspectImage(candidate, options.prior?.mimeType ?? null);
      if (options.prior?.sha256 && image.sha256 !== options.prior.sha256) continue;
      const verification = verifyDownload(image, options.metadata, null);
      if (
        !options.prior?.sha256 &&
        (verification.expectedBytesMatches === false ||
          verification.expectedMimeTypeMatches === false ||
          verification.dimensions === "url-dimensions-mismatch" ||
          verification.dimensions === "smaller-than-largest-advertised-width")
      ) {
        continue;
      }
      return {
        assetId: options.entry.assetId,
        sourceUrl: options.entry.url,
        finalUrl: options.prior?.finalUrl ?? options.entry.url,
        status: "skipped",
        attempts: 0,
        filePath: reportPath(candidate),
        mimeType: image.mimeType,
        extension: image.extension,
        bytes: image.bytes,
        sha256: image.sha256,
        width: image.width,
        height: image.height,
        expectedBytes: options.metadata.expectedBytes,
        expectedMimeType: options.metadata.expectedMimeType,
        expectedWidth: options.metadata.expectedWidth,
        expectedHeight: options.metadata.expectedHeight,
        maxAdvertisedWidth: options.metadata.maxAdvertisedWidth,
        verification,
        warnings: verificationWarnings(verification),
        duplicateContentOf: null,
        deduplicated: false,
        error: null,
      };
    } catch {
      // Ignore incomplete or non-image files and download a fresh copy.
    }
  }
  return null;
}

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 60_000);
  }
  return Math.min(500 * 2 ** (attempt - 1), 10_000);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function downloadAttempt(
  entry: DownloadEntry,
  attempt: number,
  metadata: InventoryMetadata
): Promise<DownloadResult> {
  const temporaryPath = join(
    outputDirectory,
    `${entry.assetId}.part-${process.pid}-${attempt}`
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(entry.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "newsletter-backup-image-downloader/1.0" },
    });
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new HttpError(
        `HTTP ${response.status} ${response.statusText}`,
        retryable,
        retryable ? response.headers.get("retry-after") : null
      );
    }
    if (!response.body) throw new HttpError("response had no body", true);

    const contentLengthHeader = response.headers.get("content-length");
    const parsedContentLength = contentLengthHeader === null
      ? null
      : Number(contentLengthHeader);
    const contentLength = Number.isFinite(parsedContentLength)
      ? parsedContentLength
      : null;
    if (contentLength !== null && contentLength > maxBytes) {
      throw new HttpError(
        `Content-Length ${contentLength} exceeds --max-bytes (${maxBytes})`,
        false
      );
    }

    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream),
      new ByteLimitTransform(),
      createWriteStream(temporaryPath, { flags: "w" })
    );

    const responseMimeType = response.headers.get("content-type");
    let image: Awaited<ReturnType<typeof inspectImage>>;
    try {
      image = await inspectImage(temporaryPath, responseMimeType);
    } catch (error) {
      throw new HttpError(
        error instanceof Error ? error.message : String(error),
        false
      );
    }
    if (contentLength !== null && contentLength !== image.bytes) {
      throw new HttpError(
        `downloaded ${image.bytes} bytes but Content-Length was ${contentLength}`,
        true
      );
    }

    const verification = verifyDownload(image, metadata, contentLength);
    const finalPath = join(outputDirectory, `${entry.assetId}.${image.extension}`);
    await rename(temporaryPath, finalPath);

    return {
      assetId: entry.assetId,
      sourceUrl: entry.url,
      finalUrl: response.url,
      status: "downloaded",
      attempts: attempt,
      filePath: reportPath(finalPath),
      mimeType: image.mimeType,
      extension: image.extension,
      bytes: image.bytes,
      sha256: image.sha256,
      width: image.width,
      height: image.height,
      expectedBytes: metadata.expectedBytes,
      expectedMimeType: metadata.expectedMimeType,
      expectedWidth: metadata.expectedWidth,
      expectedHeight: metadata.expectedHeight,
      maxAdvertisedWidth: metadata.maxAdvertisedWidth,
      verification,
      warnings: verificationWarnings(verification),
      duplicateContentOf: null,
      deduplicated: false,
      error: null,
    };
  } finally {
    clearTimeout(timer);
    await rm(temporaryPath, { force: true });
  }
}

async function downloadWithRetries(
  entry: DownloadEntry,
  metadata: InventoryMetadata
): Promise<DownloadResult> {
  let lastError: unknown = null;
  let attempts = 0;
  const maximumAttempts = retries + 1;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    attempts = attempt;
    try {
      return await downloadAttempt(entry, attempt, metadata);
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof HttpError) || error.retryable;
      if (!retryable || attempt === maximumAttempts) break;
      const retryAfter = error instanceof HttpError ? error.retryAfter : null;
      await sleep(retryDelayMs(attempt, retryAfter));
    }
  }

  return {
    assetId: entry.assetId,
    sourceUrl: entry.url,
    finalUrl: null,
    status: "failed",
    attempts,
    filePath: null,
    mimeType: null,
    extension: null,
    bytes: null,
    sha256: null,
    width: null,
    height: null,
    expectedBytes: metadata.expectedBytes,
    expectedMimeType: metadata.expectedMimeType,
    expectedWidth: metadata.expectedWidth,
    expectedHeight: metadata.expectedHeight,
    maxAdvertisedWidth: metadata.maxAdvertisedWidth,
    verification: null,
    warnings: [],
    duplicateContentOf: null,
    deduplicated: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

function absoluteFilePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

async function deduplicateByChecksum(results: DownloadResult[]): Promise<void> {
  const firstByChecksum = new Map<string, DownloadResult>();

  for (const result of results) {
    if (!result.sha256 || !result.filePath || result.status === "failed") continue;
    const first = firstByChecksum.get(result.sha256);
    if (!first?.filePath) {
      firstByChecksum.set(result.sha256, result);
      continue;
    }

    result.duplicateContentOf = first.assetId;
    const firstPath = absoluteFilePath(first.filePath);
    const duplicatePath = absoluteFilePath(result.filePath);
    if (firstPath === duplicatePath) {
      result.deduplicated = true;
      continue;
    }

    const temporaryPath = `${duplicatePath}.dedup-part-${process.pid}`;
    try {
      const [firstStat, duplicateStat] = await Promise.all([
        stat(firstPath),
        stat(duplicatePath),
      ]);
      if (firstStat.dev === duplicateStat.dev && firstStat.ino === duplicateStat.ino) {
        result.deduplicated = true;
        continue;
      }
      await rm(temporaryPath, { force: true });
      await link(firstPath, temporaryPath);
      await rename(temporaryPath, duplicatePath);
      result.deduplicated = true;
    } catch (error) {
      result.warnings.push(
        `could not hardlink duplicate of ${first.assetId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}

async function writeReport(path: string, report: DownloadReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.part-${process.pid}`
  );
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`);
  await rename(temporaryPath, path);
}

function createReport(results: DownloadResult[]): DownloadReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    inputFile,
    outputDirectory,
    summary: {
      requested: results.length,
      downloaded: results.filter((result) => result.status === "downloaded").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      warnings: results.filter((result) => result.warnings.length > 0).length,
      contentDuplicates: results.filter(
        (result) => result.duplicateContentOf !== null
      ).length,
      hardlinkedDuplicates: results.filter((result) => result.deduplicated).length,
      totalBytes: results.reduce((sum, result) => sum + (result.bytes ?? 0), 0),
    },
    downloads: results,
  };
}

async function main(): Promise<void> {
  const entries = parseDownloadList(await readFile(inputFile, "utf8"));
  const [inventoryMetadata, priorDownloads] = await Promise.all([
    loadInventoryMetadata(manifestFile),
    loadPriorDownloads(reportFile),
  ]);

  await mkdir(outputDirectory, { recursive: true });
  await cleanupTemporaryDownloads();
  const existingFiles = await existingFilesByAssetId(entries, priorDownloads);
  const results = new Array<DownloadResult>(entries.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= entries.length) return;

      const entry = entries[index];
      const metadata = metadataForEntry(entry, inventoryMetadata);
      const existing = await reusableExistingDownload({
        entry,
        candidates: existingFiles.get(entry.assetId) ?? [],
        prior: priorDownloads.get(entry.assetId),
        metadata,
      });
      const result = existing ?? await downloadWithRetries(entry, metadata);
      results[index] = result;
      completed += 1;

      const detail = result.status === "failed"
        ? result.error
        : `${result.width ?? "?"}x${result.height ?? "?"}, ${result.bytes ?? 0} bytes${
            result.warnings.length > 0 ? `, ${result.warnings.length} warning(s)` : ""
          }`;
      console.log(`[${completed}/${entries.length}] ${result.status} ${entry.assetId}: ${detail}`);
    }
  }

  console.log(
    `Downloading ${entries.length} images with concurrency ${concurrency} (${retries} retries)`
  );
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, () => worker())
  );

  await deduplicateByChecksum(results);
  const report = createReport(results);
  await writeReport(reportFile, report);
  console.log(
    `Complete: ${report.summary.downloaded} downloaded, ${report.summary.skipped} skipped, ${report.summary.failed} failed, ${report.summary.warnings} warnings, ${report.summary.hardlinkedDuplicates} duplicates hardlinked`
  );
  console.log(`Wrote ${reportFile}`);

  if (report.summary.failed > 0 || report.summary.warnings > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Image download failed:", error);
  process.exit(1);
});
