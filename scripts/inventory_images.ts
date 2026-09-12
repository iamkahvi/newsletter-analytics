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
const DEFAULT_ARCHIVE_API =
  "https://www.newsletter.kahvipatel.com/api/v1/archive";
const DEFAULT_ARCHIVE_PAGE_SIZE = 12;
const SCHEMA_VERSION = 2;

type Classification =
  | "post-content"
  | "post-cover"
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
  elementType:
    | "img"
    | "css-background"
    | "image-link"
    | "video-poster"
    | "svg-image"
    | "post-cover";
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
  archivePostsScanned: number;
  coverAssets: number;
  postsWithoutCover: number;
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
    "archive-api": { type: "string", default: DEFAULT_ARCHIVE_API },
    "archive-page-size": {
      type: "string",
      default: String(DEFAULT_ARCHIVE_PAGE_SIZE),
    },
    "no-covers": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(
    `Usage: bun run scripts/inventory_images.ts [options]

Options:
  --input <path>             Exported post HTML directory (substack_data_export/posts)
  --output <directory>       Manifest directory (output/images)
  --archive-api <url>        Substack archive API (${DEFAULT_ARCHIVE_API})
  --archive-page-size <n>    Posts per archive API request (${DEFAULT_ARCHIVE_PAGE_SIZE})
  --no-covers                Skip cover inventory from the archive API
  -h, --help                 Show this help`
  );
  process.exit(0);
}

const inputDirectory = values.input ?? DEFAULT_INPUT;
const outputDirectory = values.output ?? DEFAULT_OUTPUT;
const archiveApi = values["archive-api"] ?? DEFAULT_ARCHIVE_API;
const archivePageSize = Number(values["archive-page-size"]);
if (
  !Number.isInteger(archivePageSize) ||
  archivePageSize < 1 ||
  archivePageSize > 12
) {
  throw new Error("--archive-page-size must be an integer between 1 and 12");
}
const includeCovers = !values["no-covers"];

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
    .split(/,\s*(?=(?:https?:)?\/\/)/i)
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

function dimensionsFromUrl(url: string | null): {
  width: number | null;
  height: number | null;
} {
  if (!url) return { width: null, height: null };
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const match = pathname.match(/_(\d+)x(\d+)(?:\.[^./]+)?$/i);
    return match
      ? { width: Number(match[1]), height: Number(match[2]) }
      : { width: null, height: null };
  } catch {
    return { width: null, height: null };
  }
}

function mimeTypeFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const extension = decodeURIComponent(new URL(url).pathname)
      .split(".")
      .pop()
      ?.toLowerCase();
    if (!extension) return null;
    if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
    if (extension === "png") return "image/png";
    if (extension === "webp") return "image/webp";
    if (extension === "gif") return "image/gif";
    if (extension === "heic") return "image/heic";
    if (extension === "avif") return "image/avif";
  } catch {
    // Leave the MIME type unknown when the URL is malformed.
  }
  return null;
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

interface ArchivePost {
  id: number | string;
  slug: string;
  title?: string | null;
  canonical_url?: string | null;
  cover_image?: string | null;
}

async function fetchArchivePosts(): Promise<ArchivePost[]> {
  const posts: ArchivePost[] = [];
  let offset = 0;

  for (;;) {
    const url = new URL(archiveApi);
    url.searchParams.set("sort", "new");
    url.searchParams.set("limit", String(archivePageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Archive API returned HTTP ${response.status}: ${url}`);
    }

    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      throw new Error(`Archive API returned a non-array response: ${url}`);
    }

    const page = body.filter(
      (post): post is ArchivePost =>
        post !== null &&
        typeof post === "object" &&
        (typeof (post as ArchivePost).id === "string" ||
          typeof (post as ArchivePost).id === "number") &&
        typeof (post as ArchivePost).slug === "string"
    );
    posts.push(...page);

    if (body.length < archivePageSize) break;
    offset += body.length;
  }

  return posts;
}

function createCoverAsset(post: ArchivePost): ImageAsset {
  const originalReference = nullableString(post.cover_image);
  const canonicalUrl = directOrDecodedUrl(originalReference);
  const dimensions = dimensionsFromUrl(canonicalUrl);
  const postId = String(post.id);

  return {
    assetId: `${postId}-cover-001`,
    postId,
    slug: post.slug,
    sourceFile: archiveApi,
    elementType: "post-cover",
    elementIndex: 1,
    classification: "post-cover",
    classificationReason: "cover_image from the Substack archive API",
    inventoryStatus: canonicalUrl ? "listed" : "unresolved",
    originalReference: originalReference ?? "",
    canonicalUrl,
    canonicalSource: "archive.cover_image",
    host: getHost(canonicalUrl),
    duplicateOf: null,
    src: null,
    srcset: null,
    srcsetCandidates: [],
    pictureSources: [],
    linkedUrl: nullableString(post.canonical_url),
    dataAttrs: null,
    alt: null,
    title: null,
    declaredWidth: null,
    declaredHeight: null,
    metadataWidth: dimensions.width,
    metadataHeight: dimensions.height,
    resizeWidth: null,
    byteEstimate: null,
    mimeType: mimeTypeFromUrl(canonicalUrl),
    references: originalReference
      ? [{ source: "archive.cover_image", url: originalReference }]
      : [],
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

function summarize(
  assets: ImageAsset[],
  postsScanned: number,
  archivePosts: ArchivePost[]
): ManifestSummary {
  const canonicalUrls = new Set(
    assets.flatMap((asset) => (asset.canonicalUrl ? [asset.canonicalUrl] : []))
  );
  return {
    postsScanned,
    archivePostsScanned: archivePosts.length,
    coverAssets: assets.filter((asset) => asset.elementType === "post-cover").length,
    postsWithoutCover: archivePosts.filter((post) => !post.cover_image).length,
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

function toDownloadList(
  assets: ImageAsset[],
  assetType: "body" | "cover"
): string {
  const rows = assets.flatMap((asset) => {
    const isCover = asset.elementType === "post-cover";
    const belongsInList = assetType === "cover" ? isCover : !isCover;
    const isDuplicate = assetType === "cover" ? false : asset.duplicateOf !== null;
    return belongsInList &&
      !isDuplicate &&
      asset.inventoryStatus === "listed" &&
      asset.canonicalUrl
      ? [`${asset.assetId}\t${asset.canonicalUrl}`]
      : [];
  });
  return `${rows.join("\n")}\n`;
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

  const archivePosts = includeCovers ? await fetchArchivePosts() : [];
  if (includeCovers) {
    assets.push(
      ...archivePosts
        .filter((post) => post.cover_image)
        .map((post) => createCoverAsset(post))
    );
  }
  markDuplicates(assets);

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    inputDirectory,
    summary: summarize(assets, htmlFiles.length, archivePosts),
    assets,
  };

  await mkdir(outputDirectory, { recursive: true });
  const jsonPath = join(outputDirectory, "manifest.json");
  const csvPath = join(outputDirectory, "manifest.csv");
  const downloadListPath = join(outputDirectory, "download-list.tsv");
  const coverDownloadListPath = join(outputDirectory, "cover-download-list.tsv");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(csvPath, toCsv(assets)),
    writeFile(downloadListPath, toDownloadList(assets, "body")),
    writeFile(coverDownloadListPath, toDownloadList(assets, "cover")),
  ]);

  console.log(`Scanned ${manifest.summary.postsScanned} exported posts`);
  if (includeCovers) {
    console.log(
      `Inventoried ${manifest.summary.coverAssets} covers from ${manifest.summary.archivePostsScanned} archive posts (${manifest.summary.postsWithoutCover} without covers)`
    );
  }
  console.log(
    `Listed ${manifest.summary.assetsListed} assets (${manifest.summary.uniqueCanonicalAssets} unique, ${manifest.summary.duplicateReferences} duplicate references, ${manifest.summary.unresolvedAssets} unresolved)`
  );
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${csvPath}`);
  console.log(`Wrote ${downloadListPath}`);
  console.log(`Wrote ${coverDownloadListPath}`);
}

main().catch((error) => {
  console.error("Image inventory failed:", error);
  process.exit(1);
});
