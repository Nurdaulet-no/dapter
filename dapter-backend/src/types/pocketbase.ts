export type PocketBaseRowStatus = "PROCESSING" | "COMPLETED" | "FAILED";

export interface PocketBaseCollectionFieldSpec {
  name: string;
  type:
    | "text"
    | "number"
    | "bool"
    | "json"
    | "date"
    | "autodate"
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
  onCreate?: boolean;
  onUpdate?: boolean;
}

export interface PocketBaseCollectionSchema {
  collection: string;
  type: "base" | "auth";
  fields: PocketBaseCollectionFieldSpec[];
}

export interface PocketBaseSchemaMapping {
  meta: {
    purpose: string;
    compatibility: string[];
  };
  collections: PocketBaseCollectionSchema[];
}
