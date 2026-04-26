export type FileViewType =
  | "markdown"
  | "code"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "csv"
  | "unknown";

const CODE_EXTS = new Set([
  "txt", "py", "js", "mjs", "cjs", "ts", "tsx", "jsx", "go", "rs", "java",
  "cpp", "cc", "c", "h", "hpp", "cs", "rb", "php", "swift", "kt", "css",
  "scss", "sass", "less", "html", "htm", "json", "jsonc", "yaml", "yml",
  "sh", "bash", "zsh", "toml", "xml", "sql", "graphql", "gql", "vue",
  "svelte", "r", "lua", "dart", "tf", "hcl", "dockerfile",
]);

const CODE_FILE_NAMES = new Map([
  ["dockerfile", "Dockerfile"],
  ["makefile", "Makefile"],
  ["procfile", "Procfile"],
]);

const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "tiff",
]);

const VIDEO_EXTS = new Set([
  "mp4", "webm", "mov", "avi", "mkv", "ogv", "m4v", "flv",
]);

const AUDIO_EXTS = new Set([
  "mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus", "weba",
]);

const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/javascript",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
]);

const LANG_MAP: Record<string, string> = {
  py: "Python", js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  ts: "TypeScript", tsx: "TypeScript JSX", jsx: "JavaScript JSX",
  go: "Go", rs: "Rust", java: "Java", cpp: "C++", cc: "C++",
  c: "C", h: "Header", hpp: "C++ Header", cs: "C#", rb: "Ruby",
  php: "PHP", swift: "Swift", kt: "Kotlin", css: "CSS", scss: "SCSS",
  sass: "Sass", less: "Less", html: "HTML", htm: "HTML", json: "JSON",
  jsonc: "JSON", yaml: "YAML", yml: "YAML", sh: "Shell", bash: "Bash",
  zsh: "Zsh", toml: "TOML", xml: "XML", sql: "SQL", graphql: "GraphQL",
  gql: "GraphQL", vue: "Vue", svelte: "Svelte", r: "R", lua: "Lua",
  dart: "Dart", tf: "Terraform", hcl: "HCL", dockerfile: "Dockerfile",
  txt: "Plain Text",
};

function fileBaseName(name: string): string {
  return name.split("/").pop() ?? name;
}

export function fileExtension(name: string): string {
  const baseName = fileBaseName(name);
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) return "";
  return baseName.slice(dotIndex + 1).toLowerCase();
}

export function isPreviewableTextMimeType(mimeType?: string | null): boolean {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  return (
    normalized.startsWith("text/") ||
    TEXT_MIME_TYPES.has(normalized) ||
    normalized.endsWith("+json") ||
    normalized.endsWith("+xml")
  );
}

export function getFileViewType(name: string): FileViewType {
  const ext = fileExtension(name);
  if (CODE_FILE_NAMES.has(fileBaseName(name).toLowerCase())) return "code";
  if (ext === "md" || ext === "mdx") return "markdown";
  if (CODE_EXTS.has(ext)) return "code";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (ext === "csv") return "csv";
  return "unknown";
}

export function getCodeLanguage(name: string): string {
  const extensionlessLanguage = CODE_FILE_NAMES.get(fileBaseName(name).toLowerCase());
  if (extensionlessLanguage) return extensionlessLanguage;
  const ext = fileExtension(name);
  if (!ext) return "Plain Text";
  return LANG_MAP[ext] ?? ext.toUpperCase();
}
