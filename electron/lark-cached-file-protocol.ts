export interface LarkCachedFileRequest {
  action: "drive-download" | "drive-export";
  fileToken: string;
  fileName?: string;
  docType?: string;
  fileExtension?: string;
  freshnessKey?: string;
  prompt: string;
}

export function parseLarkCachedFileRequest(text: string): LarkCachedFileRequest | null {
  const match = text.trim().match(/^LARK_CACHED_FILE:\s*(\{.*\})$/s);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]) as Partial<LarkCachedFileRequest>;
    const action = value.action;
    if (action !== "drive-download" && action !== "drive-export") return null;
    if (!value.fileToken?.trim() || !value.prompt?.trim()) return null;
    if (action === "drive-export" && (!value.docType?.trim() || !value.fileExtension?.trim())) return null;
    return {
      action,
      fileToken: value.fileToken.trim(),
      fileName: value.fileName?.trim() || undefined,
      docType: value.docType?.trim() || undefined,
      fileExtension: value.fileExtension?.trim() || undefined,
      freshnessKey: value.freshnessKey?.trim() || undefined,
      prompt: value.prompt.trim()
    };
  } catch {
    return null;
  }
}
