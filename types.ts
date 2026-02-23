export interface Author {
  name: string;
  affiliation: string;
  email?: string;
  isCorresponding?: boolean;
}

export interface Figure {
  id: string;
  name: string; // e.g., "Figure 1"
  file: File;
  previewUrl: string;
}

export interface ArticleData {
  title: string;
  articleType: string; // e.g., "Original Research", "Review", "Case Report"
  authors: Author[];
  abstract: string;
  keywords: string[];
  content: string; // Markdown content
  doi?: string;
  receivedDate?: string;
  revisedDate?: string;
  acceptedDate?: string;
  publishedDate?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  figures: Figure[];
  logoUrl?: string; // New field for custom journal logo
  licenseLogoUrl?: string; // New field for custom license logo
  geminiApiKey?: string;
  geminiModel?: string;
}

export enum EditorTab {
  METADATA = 'METADATA',
  CONTENT = 'CONTENT',
  FIGURES = 'FIGURES',
  AI_TOOLS = 'AI_TOOLS',
  QC = 'QC'
}