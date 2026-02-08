export interface Author {
  name: string;
  affiliation: string;
  email?: string;
}

export interface Section {
  heading: string;
  content: string; // HTML or Markdown string
}

export interface ManuscriptFigure {
  id: string;
  fileUrl: string;
  caption: string;
}

export interface ManuscriptData {
  title: string;
  authors: Author[];
  abstract: string;
  keywords: string[];
  sections: Section[];
  references: string[];
  figures: ManuscriptFigure[]; // New field for images
  doi?: string;
  volume?: string;
  issue?: string;
  year?: string;
  pages?: string;
  receivedDate?: string;
  acceptedDate?: string;
  publishedDate?: string;
  logoUrl?: string;
}

export enum AppState {
  LOGIN = 'LOGIN',
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  METADATA_REVIEW = 'METADATA_REVIEW',
  PREVIEW = 'PREVIEW',
}