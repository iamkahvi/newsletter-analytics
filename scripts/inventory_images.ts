// Inventory image assets referenced by exported Substack post HTML.
//
// Usage:
//   bun run scripts/inventory_images.ts
//   bun run scripts/inventory_images.ts --input substack_data_export/posts --output output/images

import { JSDOM } from "jsdom";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

const DEFAULT_INPUT = "substack_data_export/posts";
const DEFAULT_OUTPUT = "output/images";
const SCHEMA_VERSION = 1;

type Classification =
  | "post-content"
  | "tracking"
  | "avatar"
  | "publication-chrome"
  | "embed";

type InventoryStatus = "listed" | "unresolved";

interface SrcsetCandidate {
  url: string;
  descriptor: string | null;
  width: number | null;
  density: number | null;
}

interface PictureSource {
  type: string | null;
  media: string | null;
  srcset: string;
  candidates: SrcsetCandidate[];
}

interface UrlReference {
  source: string;
  url: string;
  descriptor?: string | null;
  mediaType?: string | null;
}

interface CanonicalUrl {
  url: string | null;
  source: string | null;
}

interface ImageAsset {
  assetId: string;
  postId: string;
  slug: string;
  sourceFile: string;
  elementType: "img" | "css-background" | "image-link" | "video-poster" | "svg-image";
  elementIndex: number;
  classification: Classification;
  classificationReason: string;
  inventoryStatus: InventoryStatus;
  originalReference: string;
  canonicalUrl: string | null;
  canonicalSource: string | null;
  host: string | null;
  duplicateOf: string | null;
  src: string | null;
  srcset: string | null;
  srcsetCandidates: SrcsetCandidate[];
  pictureSources: PictureSource[];
  linkedUrl: string | null;
  dataAttrs: Record<string, unknown> | null;
  alt: string | null;
  title: string | null;
  declaredWidth: number | null;
  declaredHeight: number | null;
  metadataWidth: number | null;
  metadataHeight: number | null;
  resizeWidth: number | null;
  byteEstimate: number | null;
  mimeType: string | null;
  references: UrlReference[];
}

interface ManifestSummary {
  postsScanned: number;
  assetsListed: number;
  uniqueCanonicalAssets: number;
  duplicateReferences: number;
  unresolvedAssets: number;
  byElementType: Record<string, number>;
  byClassification: Record<string, number>;
  byHost: Record<string, number>;
}

interface Manifest {
  schemaVersion: number;
  generatedAt: string;
  inputDirectory: string;
  summary: ManifestSummary;
  assets: ImageAsset[];
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    input: { type: "string", default: DEFAULT_INPUT },
    output: { type: "string", default: DEFAULT_OUTPUT },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(
    "Usage: bun run scripts/inventory_images.ts [--input <post-html-directory>] [--output <manifest-directory>]"
  );
  process.exit(0);
}

const inputDirectory = values.input ?? DEFAULT_INPUT;
const outputDirectory = values.output ?? DEFAULT_OUTPUT;

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePostFilename(filename: string): { postId: string; slug: string } {
  const basename = filename.replace(/\.html$/i, "");
  const separator = basename.indexOf(".");
  if (separator === -1) return { postId: basename, slug: basename };
  return {
    postId: basename.slice(0, separator),
    slug: basename.slice(separator + 1),
  };
}

function parseDataAttrs(element: Element): Record<string, unknown> | null {
  const raw = element.getAttribute("data-attrs");
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseSrcset(srcset: string | null): SrcsetCandidate[] {
  if (!srcset) return [];

  return srcset
    .split(/\s*,\s*/)
    .map((entry): SrcsetCandidate | null => {
      const match = entry.trim().match(/^(\S+)(?:\s+(\S+))?$/);
      if (!match) return null;
      const descriptor = match[2] ?? null;
      return {
        url: match[1],
        descriptor,
        width: descriptor?.endsWith("w")
          ? nullableNumber(descriptor.slice(0, -1))
          : null,
        density: descriptor?.endsWith("x")
          ? nullableNumber(descriptor.slice(0, -1))
          : null,
      };
    })
    .filter((candidate): candidate is SrcsetCandidate => candidate !== null);
}

function decodeSubstackCdnUrl(rawUrl: string): string | null {
  if (!rawUrl.includes("substackcdn.com/image/fetch/")) return null;

  const encodedOrigin = rawUrl.match(/\/(https?%3A%2F%2F.+)$/i)?.[1];
  if (encodedOrigin) {
    try {
      return decodeURIComponent(encodedOrigin);
    } catch {
      return null;
    }
  }

  const plainOrigin = rawUrl.match(/\/(https?:\/\/.+)$/i)?.[1];
  return plainOrigin ?? null;
}

function normalizeAbsoluteUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return null;
  }

  const candidate = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function directOrDecodedUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  const decoded = decodeSubstackCdnUrl(rawUrl);
  return normalizeAbsoluteUrl(decoded ?? rawUrl);
}

function largestSrcsetCandidate(candidates: SrcsetCandidate[]): SrcsetCandidate | null {
  if (candidates.length === 0) return null;
  const widthCandidates = candidates.filter((candidate) => candidate.width !== null);
  const comparableCandidates = widthCandidates.length > 0 ? widthCandidates : candidates;
  return [...comparableCandidates].sort((a, b) => {
    const aSize = a.width ?? a.density ?? 0;
    const bSize = b.width ?? b.density ?? 0;
    return bSize - aSize;
  })[0];
}

function chooseCanonicalUrl(options: {
  src: string | null;
  linkedUrl: string | null;
  dataAttrs: Record<string, unknown> | null;
  srcsetCandidates: SrcsetCandidate[];
  pictureSources: PictureSource[];
}): CanonicalUrl {
  const srcNoWatermark = nullableString(options.dataAttrs?.srcNoWatermark);
  if (srcNoWatermark) {
    const canonical = directOrDecodedUrl(srcNoWatermark);
    if (canonical) {
      return { url: canonical, source: "data-attrs.srcNoWatermark" };
    }
  }

  const metadataSrc = nullableString(options.dataAttrs?.src);
  if (metadataSrc) {
    const canonical = directOrDecodedUrl(metadataSrc);
    if (canonical) return { url: canonical, source: "data-attrs.src" };
  }

  if (options.src) {
    const canonical = directOrDecodedUrl(options.src);
    if (canonical) return { url: canonical, source: "img.src" };
  }

  const candidates = [
    ...options.srcsetCandidates,
    ...options.pictureSources.flatMap((source) => source.candidates),
  ];
  const largest = largestSrcsetCandidate(candidates);
  if (largest) {
    const canonical = directOrDecodedUrl(largest.url);
    if (canonical) return { url: canonical, source: "largest-srcset-candidate" };
  }

  if (options.linkedUrl && looksLikeImageUrl(options.linkedUrl)) {
    const canonical = directOrDecodedUrl(options.linkedUrl);
    if (canonical) return { url: canonical, source: "linked-image.href" };
  }

  return { url: null, source: null };
}

function getHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function classifyElement(
  element: Element,
  width: number | null,
  height: number | null
): { classification: Classification; reason: string } {
  const context = [
    element.tagName,
    element.getAttribute("id") ?? "",
    element.getAttribute("class") ?? "",
    element.getAttribute("alt") ?? "",
    element.parentElement?.getAttribute("id") ?? "",
    element.parentElement?.getAttribute("class") ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if ((width !== null && width <= 1) || (height !== null && height <= 1)) {
    return { classification: "tracking", reason: "one-pixel declared dimension" };
  }
  if (/\b(tracking|tracker|beacon|pixel)\b/.test(context)) {
    return { classification: "tracking", reason: "tracking identifier" };
  }
  if (/\b(avatar|profile[-_ ]?(photo|image)|user[-_ ]?(photo|image)|headshot)\b/.test(context)) {
    return { classification: "avatar", reason: "avatar/profile identifier" };
  }
  if (
    element.closest(
      '.youtube-wrap, .twitter-tweet, [data-component-name*="Youtube"], [data-component-name*="Spotify"], [data-component-name*="Podcast"], [data-component-name*="Embed"]'
    )
  ) {
    return { classification: "embed", reason: "inside embedded-media container" };
  }
  if (/\b(publication[-_ ]?logo|newsletter[-_ ]?logo|brand[-_ ]?logo|app[-_ ]?icon)\b/.test(context)) {
    return { classification: "publication-chrome", reason: "publication UI identifier" };
  }
  return { classification: "post-content", reason: "image appears in exported post body" };
}

function addReference(
  references: UrlReference[],
  source: string,
  url: string | null,
  details: Pick<UrlReference, "descriptor" | "mediaType"> = {}
): void {
  if (!url) return;
  const duplicate = references.some(
    (reference) => reference.source === source && reference.url === url
  );
  if (!duplicate) references.push({ source, url, ...details });
}

function pictureSourcesForImage(image: Element): PictureSource[] {
  const picture = image.closest("picture");
  if (!picture) return [];

  return Array.from(picture.querySelectorAll("source[srcset]")).map((source) => {
    const srcset = source.getAttribute("srcset") ?? "";
    return {
      type: source.getAttribute("type"),
      media: source.getAttribute("media"),
      srcset,
      candidates: parseSrcset(srcset),
    };
  });
}

function referencesForImage(
  src: string | null,
  srcsetCandidates: SrcsetCandidate[],
  pictureSources: PictureSource[],
  linkedUrl: string | null,
  dataAttrs: Record<string, unknown> | null
): UrlReference[] {
  const references: UrlReference[] = [];
  addReference(references, "img.src", src);
  for (const candidate of srcsetCandidates) {
    addReference(references, "img.srcset", candidate.url, {
      descriptor: candidate.descriptor,
    });
  }
  for (const source of pictureSources) {
    for (const candidate of source.candidates) {
      addReference(references, "picture.source.srcset", candidate.url, {
        descriptor: candidate.descriptor,
        mediaType: source.type,
      });
    }
  }
  addReference(references, "linked-image.href", linkedUrl);
  addReference(
    references,
    "data-attrs.srcNoWatermark",
    nullableString(dataAttrs?.srcNoWatermark)
  );
  addReference(references, "data-attrs.src", nullableString(dataAttrs?.src));
  addReference(references, "data-attrs.href", nullableString(dataAttrs?.href));
  addReference(
    references,
    "data-attrs.internalRedirect",
    nullableString(dataAttrs?.internalRedirect)
  );
  return references;
}

function createImageAsset(
  image: Element,
  post: { postId: string; slug: string; sourceFile: string },
  elementIndex: number
): ImageAsset {
  const dataAttrs = parseDataAttrs(image);
  const src = image.getAttribute("src");
  const srcset = image.getAttribute("srcset");
  const srcsetCandidates = parseSrcset(srcset);
  const pictureSources = pictureSourcesForImage(image);
  const linkedUrl = image.closest("a[href]")?.getAttribute("href") ?? null;
  const canonical = chooseCanonicalUrl({
    src,
    linkedUrl,
    dataAttrs,
    srcsetCandidates,
    pictureSources,
  });
  const declaredWidth = nullableNumber(image.getAttribute("width"));
  const declaredHeight = nullableNumber(image.getAttribute("height"));
  const classification = classifyElement(image, declaredWidth, declaredHeight);

  return {
    assetId: `${post.postId}-img-${String(elementIndex).padStart(3, "0")}`,
    ...post,
    elementType: "img",
    elementIndex,
    classification: classification.classification,
    classificationReason: classification.reason,
    inventoryStatus: canonical.url ? "listed" : "unresolved",
    originalReference: src ?? "",
    canonicalUrl: canonical.url,
    canonicalSource: canonical.source,
    host: getHost(canonical.url),
    duplicateOf: null,
    src,
    srcset,
    srcsetCandidates,
    pictureSources,
    linkedUrl,
    dataAttrs,
    alt: image.getAttribute("alt"),
    title: image.getAttribute("title"),
    declaredWidth,
    declaredHeight,
    metadataWidth: nullableNumber(dataAttrs?.width),
    metadataHeight: nullableNumber(dataAttrs?.height),
    resizeWidth: nullableNumber(dataAttrs?.resizeWidth),
    byteEstimate: nullableNumber(dataAttrs?.bytes),
    mimeType: nullableString(dataAttrs?.type),
    references: referencesForImage(
      src,
      srcsetCandidates,
      pictureSources,
      linkedUrl,
      dataAttrs
    ),
  };
}

function extractCssUrls(style: string): string[] {
  const urls: string[] = [];
  const pattern = /url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*\)/gi;
  for (const match of style.matchAll(pattern)) {
    const url = (match[2] ?? match[3] ?? "").trim();
    if (url) urls.push(url);
  }
  return urls;
}

function looksLikeImageUrl(rawUrl: string): boolean {
  const decoded = decodeSubstackCdnUrl(rawUrl) ?? rawUrl;
  if (/substack-post-media|substackcdn\.com\/image\/fetch|\/public\/images\//i.test(decoded)) {
    return true;
  }
  try {
    return /\.(?:avif|bmp|gif|jpe?g|png|svg|tiff?|webp)$/i.test(
      new URL(decoded).pathname
    );
  } catch {
    return /\.(?:avif|bmp|gif|jpe?g|png|svg|tiff?|webp)(?:[?#]|$)/i.test(decoded);
  }
}

function createSimpleAsset(options: {
  element: Element;
  elementType: ImageAsset["elementType"];
  post: { postId: string; slug: string; sourceFile: string };
  elementIndex: number;
  rawUrl: string;
  referenceSource: string;
}): ImageAsset {
  const canonicalUrl = directOrDecodedUrl(options.rawUrl);
  const classification = classifyElement(options.element, null, null);
  const typeToken = options.elementType.replace(/[^a-z]/g, "").slice(0, 6);

  return {
    assetId: `${options.post.postId}-${typeToken}-${String(options.elementIndex).padStart(3, "0")}`,
    ...options.post,
    elementType: options.elementType,
    elementIndex: options.elementIndex,
    classification: classification.classification,
    classificationReason: classification.reason,
    inventoryStatus: canonicalUrl ? "listed" : "unresolved",
    originalReference: options.rawUrl,
    canonicalUrl,
    canonicalSource: options.referenceSource,
    host: getHost(canonicalUrl),
    duplicateOf: null,
    src: options.elementType === "svg-image" ? options.rawUrl : null,
    srcset: null,
    srcsetCandidates: [],
    pictureSources: [],
    linkedUrl: options.elementType === "image-link" ? options.rawUrl : null,
    dataAttrs: parseDataAttrs(options.element),
    alt: options.element.getAttribute("alt"),
    title: options.element.getAttribute("title"),
    declaredWidth: nullableNumber(options.element.getAttribute("width")),
    declaredHeight: nullableNumber(options.element.getAttribute("height")),
    metadataWidth: null,
    metadataHeight: null,
    resizeWidth: null,
    byteEstimate: null,
    mimeType: null,
    references: [{ source: options.referenceSource, url: options.rawUrl }],
  };
}

async function inventoryPost(filename: string): Promise<ImageAsset[]> {
  const sourceFile = join(inputDirectory, filename);
  const html = await readFile(sourceFile, "utf8");
  const document = new JSDOM(html).window.document;
  const parsed = parsePostFilename(filename);
  const post = { ...parsed, sourceFile };
  const assets: ImageAsset[] = [];

  Array.from(document.querySelectorAll("img")).forEach((image, index) => {
    assets.push(createImageAsset(image, post, index + 1));
  });

  let backgroundIndex = 0;
  for (const element of Array.from(document.querySelectorAll("[style]"))) {
    const style = element.getAttribute("style") ?? "";
    for (const url of extractCssUrls(style)) {
      backgroundIndex += 1;
      assets.push(
        createSimpleAsset({
          element,
          elementType: "css-background",
          post,
          elementIndex: backgroundIndex,
          rawUrl: url,
          referenceSource: "style.url",
        })
      );
    }
  }

  let linkIndex = 0;
  for (const link of Array.from(document.querySelectorAll("a[href]"))) {
    if (link.querySelector("img, picture, source")) continue;
    const href = link.getAttribute("href") ?? "";
    if (!looksLikeImageUrl(href)) continue;
    linkIndex += 1;
    assets.push(
      createSimpleAsset({
        element: link,
        elementType: "image-link",
        post,
        elementIndex: linkIndex,
        rawUrl: href,
        referenceSource: "anchor.href",
      })
    );
  }

  let posterIndex = 0;
  for (const video of Array.from(document.querySelectorAll("video[poster]"))) {
    const poster = video.getAttribute("poster") ?? "";
    if (!poster) continue;
    posterIndex += 1;
    assets.push(
      createSimpleAsset({
        element: video,
        elementType: "video-poster",
        post,
        elementIndex: posterIndex,
        rawUrl: poster,
        referenceSource: "video.poster",
      })
    );
  }

  let svgImageIndex = 0;
  for (const image of Array.from(document.querySelectorAll("svg image"))) {
    const href =
      image.getAttribute("href") ?? image.getAttribute("xlink:href") ?? "";
    if (!href) continue;
    svgImageIndex += 1;
    assets.push(
      createSimpleAsset({
        element: image,
        elementType: "svg-image",
        post,
        elementIndex: svgImageIndex,
        rawUrl: href,
        referenceSource: "svg-image.href",
      })
    );
  }

  return assets;
}

function markDuplicates(assets: ImageAsset[]): void {
  const firstByUrl = new Map<string, string>();
  for (const asset of assets) {
    if (!asset.canonicalUrl) continue;
    const firstAssetId = firstByUrl.get(asset.canonicalUrl);
    if (firstAssetId) asset.duplicateOf = firstAssetId;
    else firstByUrl.set(asset.canonicalUrl, asset.assetId);
  }
}

function countBy(
  assets: ImageAsset[],
  getKey: (asset: ImageAsset) => string
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const key = getKey(asset);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
}

function summarize(assets: ImageAsset[], postsScanned: number): ManifestSummary {
  const canonicalUrls = new Set(
    assets.flatMap((asset) => (asset.canonicalUrl ? [asset.canonicalUrl] : []))
  );
  return {
    postsScanned,
    assetsListed: assets.length,
    uniqueCanonicalAssets: canonicalUrls.size,
    duplicateReferences: assets.filter((asset) => asset.duplicateOf !== null).length,
    unresolvedAssets: assets.filter((asset) => asset.inventoryStatus === "unresolved").length,
    byElementType: countBy(assets, (asset) => asset.elementType),
    byClassification: countBy(assets, (asset) => asset.classification),
    byHost: countBy(assets, (asset) => asset.host ?? "(unresolved)"),
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(assets: ImageAsset[]): string {
  const columns: Array<[string, (asset: ImageAsset) => unknown]> = [
    ["asset_id", (asset) => asset.assetId],
    ["post_id", (asset) => asset.postId],
    ["slug", (asset) => asset.slug],
    ["source_file", (asset) => asset.sourceFile],
    ["element_type", (asset) => asset.elementType],
    ["element_index", (asset) => asset.elementIndex],
    ["classification", (asset) => asset.classification],
    ["classification_reason", (asset) => asset.classificationReason],
    ["inventory_status", (asset) => asset.inventoryStatus],
    ["original_reference", (asset) => asset.originalReference],
    ["canonical_url", (asset) => asset.canonicalUrl],
    ["canonical_source", (asset) => asset.canonicalSource],
    ["host", (asset) => asset.host],
    ["duplicate_of", (asset) => asset.duplicateOf],
    ["src", (asset) => asset.src],
    ["srcset", (asset) => asset.srcset],
    ["srcset_candidates", (asset) => asset.srcsetCandidates],
    ["picture_sources", (asset) => asset.pictureSources],
    ["linked_url", (asset) => asset.linkedUrl],
    ["data_attrs", (asset) => asset.dataAttrs],
    ["alt", (asset) => asset.alt],
    ["title", (asset) => asset.title],
    ["declared_width", (asset) => asset.declaredWidth],
    ["declared_height", (asset) => asset.declaredHeight],
    ["metadata_width", (asset) => asset.metadataWidth],
    ["metadata_height", (asset) => asset.metadataHeight],
    ["resize_width", (asset) => asset.resizeWidth],
    ["byte_estimate", (asset) => asset.byteEstimate],
    ["mime_type", (asset) => asset.mimeType],
    ["references", (asset) => asset.references],
  ];

  const rows = [columns.map(([name]) => csvCell(name)).join(",")];
  for (const asset of assets) {
    rows.push(columns.map(([, getValue]) => csvCell(getValue(asset))).join(","));
  }
  return `${rows.join("\n")}\n`;
}

async function main(): Promise<void> {
  const entries = await readdir(inputDirectory, { withFileTypes: true });
  const htmlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  if (htmlFiles.length === 0) {
    throw new Error(`No HTML files found in ${inputDirectory}`);
  }

  const assets: ImageAsset[] = [];
  for (const filename of htmlFiles) {
    assets.push(...(await inventoryPost(filename)));
  }
  markDuplicates(assets);

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    inputDirectory,
    summary: summarize(assets, htmlFiles.length),
    assets,
  };

  await mkdir(outputDirectory, { recursive: true });
  const jsonPath = join(outputDirectory, "manifest.json");
  const csvPath = join(outputDirectory, "manifest.csv");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(csvPath, toCsv(assets)),
  ]);

  console.log(`Scanned ${manifest.summary.postsScanned} posts`);
  console.log(
    `Listed ${manifest.summary.assetsListed} assets (${manifest.summary.uniqueCanonicalAssets} unique, ${manifest.summary.duplicateReferences} duplicate references, ${manifest.summary.unresolvedAssets} unresolved)`
  );
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${csvPath}`);
}

main().catch((error) => {
  console.error("Image inventory failed:", error);
  process.exit(1);
});
