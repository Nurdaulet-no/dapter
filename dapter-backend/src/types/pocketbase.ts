export type PocketBaseDocumentStatus = "PROCESSING" | "COMPLETED" | "FAILED";

export type PocketBaseStageStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export type PocketBaseDocumentType = "PDF" | "PPTX";

export interface PocketBaseCollectionFieldSpec {
  name: string;
  type:
    | "text"
    | "number"
    | "bool"
    | "json"
    | "date"
    | "url"
    | "email"
    | "file"
    | "relation"
    | "select";
  required?: boolean;
  maxSize?: number;
  min?: number;
  max?: number;
  options?: string[];
  relation?: {
    collection: string;
    maxSelect?: number;
    cascadeDelete?: boolean;
  };
}

export interface PocketBaseCollectionSchema {
  collection: string;
  type: "base" | "auth";
  fields: PocketBaseCollectionFieldSpec[];
}

export interface PocketBaseSchemaMapping {
  notes: {
    purpose: string;
    compatibility: string[];
  };
  collections: PocketBaseCollectionSchema[];
}
