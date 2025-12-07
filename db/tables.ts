/**
 * Browser PDF Reader - open and annotate PDFs in the browser.
 *
 * Design goals:
 * - Keep metadata of documents opened by the user.
 * - Support per-page text extraction cache (for later features: search / summarise).
 * - Allow simple annotations (highlights / notes) per page.
 *
 * Note: actual PDF files likely live in some storage (S3, etc.).
 * Here we only track references (urls/keys) and structured metadata.
 */

import { defineTable, column, NOW } from "astro:db";

export const PdfDocuments = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),
    title: column.text({ optional: true }),
    sourceType: column.text({ optional: true }),       // "upload", "url"
    sourceUrl: column.text({ optional: true }),        // URL or storage key
    pageCount: column.number({ optional: true }),
    lastOpenedAt: column.date({ optional: true }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const PdfPages = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    documentId: column.text({
      references: () => PdfDocuments.columns.id,
    }),
    pageNumber: column.number(),                       // 1-based index
    textContent: column.text({ optional: true }),      // cached extracted text
    createdAt: column.date({ default: NOW }),
  },
});

export const PdfAnnotations = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    documentId: column.text({
      references: () => PdfDocuments.columns.id,
    }),
    pageId: column.text({
      references: () => PdfPages.columns.id,
      optional: true,
    }),
    userId: column.text(),                             // duplicated for quick filtering
    annotationType: column.text({ optional: true }),   // "highlight", "note", "underline"
    selectionJson: column.text({ optional: true }),    // JSON of selection coordinates/indices
    comment: column.text({ optional: true }),          // user note
    color: column.text({ optional: true }),            // highlight color hint
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const tables = {
  PdfDocuments,
  PdfPages,
  PdfAnnotations,
} as const;
