/** Opaque metadata preserves future OKF fields and type vocabularies. */
export interface SourceLink {
  href: string;
  sourceFragment: string | null;
  line?: number;
  column?: number;
}
export interface ResolvedLink {
  url: string;
  external?: boolean;
  target?: string;
  targetPath?: string;
  fragment?: string | null;
  warning?: string;
}
export interface Document {
  id: string; path: string; kind: 'index' | 'log' | 'concept'; title: string;
  description: string; type: string | null; metadata: Record<string, unknown>;
  body: string; source: string; headings: string[];
  links: (SourceLink & Partial<ResolvedLink> & { sourcePath?: string })[];
}
export interface Bundle {
  documents: Document[]; assets: Map<string, Uint8Array>; errors: string[]; warnings: string[];
}
export interface SiteDocument extends Document { url: string; sourceUrl: string }
export interface SiteOptions { root?: string; base?: string }
export interface GenerateOptions extends SiteOptions { docsDir?: string; publicDir?: string; presentation?: 'plain' | 'starlight' }
export interface ManifestDocument extends Omit<SiteDocument, 'body' | 'source'> {}
export interface SiteManifest { format: 'okf-site-manifest'; version: 1; documents: ManifestDocument[] }
export interface LoadedSite {
  bundle: Bundle; documents: SiteDocument[]; manifest: SiteManifest;
  pages: Map<string, string>; raw: Map<string, string | Uint8Array>;
}

/** Advisory OKF 0.3 interpretation; raw metadata stays on Document.metadata. */
export interface MetadataState {
  tags: string[];
  sources: Record<string, unknown>[];
  parameters: Record<string, unknown>[];
  verified: Record<string, unknown>[];
  currentVerifications: Record<string, unknown>[];
  trustTier: 'unverified' | 'machine-confirmed' | 'human-reviewed';
  freshness: 'unspecified' | 'fresh' | 'stale' | 'malformed';
  status: unknown;
  current: boolean;
  warnings: string[];
}
