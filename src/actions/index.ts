import { defineAction, ActionError, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import { PdfAnnotations, PdfDocuments, PdfPages, and, db, eq } from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

async function getOwnedDocument(documentId: string, userId: string) {
  const [doc] = await db
    .select()
    .from(PdfDocuments)
    .where(and(eq(PdfDocuments.id, documentId), eq(PdfDocuments.userId, userId)));

  if (!doc) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "PDF document not found.",
    });
  }

  return doc;
}

async function getOwnedPage(pageId: string, documentId: string, userId: string) {
  await getOwnedDocument(documentId, userId);

  const [page] = await db
    .select()
    .from(PdfPages)
    .where(and(eq(PdfPages.id, pageId), eq(PdfPages.documentId, documentId)));

  if (!page) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "PDF page not found.",
    });
  }

  return page;
}

export const server = {
  createDocument: defineAction({
    input: z.object({
      title: z.string().optional(),
      sourceType: z.string().optional(),
      sourceUrl: z.string().optional(),
      pageCount: z.number().optional(),
      lastOpenedAt: z.date().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      const [document] = await db
        .insert(PdfDocuments)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          title: input.title,
          sourceType: input.sourceType,
          sourceUrl: input.sourceUrl,
          pageCount: input.pageCount,
          lastOpenedAt: input.lastOpenedAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return { success: true, data: { document } };
    },
  }),

  updateDocument: defineAction({
    input: z
      .object({
        id: z.string().min(1),
        title: z.string().optional(),
        sourceType: z.string().optional(),
        sourceUrl: z.string().optional(),
        pageCount: z.number().optional(),
        lastOpenedAt: z.date().optional(),
      })
      .refine(
        (input) =>
          input.title !== undefined ||
          input.sourceType !== undefined ||
          input.sourceUrl !== undefined ||
          input.pageCount !== undefined ||
          input.lastOpenedAt !== undefined,
        { message: "At least one field must be provided to update." }
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedDocument(input.id, user.id);

      const [document] = await db
        .update(PdfDocuments)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
          ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
          ...(input.pageCount !== undefined ? { pageCount: input.pageCount } : {}),
          ...(input.lastOpenedAt !== undefined ? { lastOpenedAt: input.lastOpenedAt } : {}),
          updatedAt: new Date(),
        })
        .where(eq(PdfDocuments.id, input.id))
        .returning();

      return { success: true, data: { document } };
    },
  }),

  listDocuments: defineAction({
    input: z.object({}).optional(),
    handler: async (_input, context) => {
      const user = requireUser(context);

      const documents = await db
        .select()
        .from(PdfDocuments)
        .where(eq(PdfDocuments.userId, user.id));

      return { success: true, data: { items: documents, total: documents.length } };
    },
  }),

  createPage: defineAction({
    input: z.object({
      documentId: z.string().min(1),
      pageNumber: z.number().int().min(1),
      textContent: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedDocument(input.documentId, user.id);

      const [page] = await db
        .insert(PdfPages)
        .values({
          id: crypto.randomUUID(),
          documentId: input.documentId,
          pageNumber: input.pageNumber,
          textContent: input.textContent,
          createdAt: new Date(),
        })
        .returning();

      return { success: true, data: { page } };
    },
  }),

  listPages: defineAction({
    input: z.object({
      documentId: z.string().min(1),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedDocument(input.documentId, user.id);

      const pages = await db
        .select()
        .from(PdfPages)
        .where(eq(PdfPages.documentId, input.documentId));

      return { success: true, data: { items: pages, total: pages.length } };
    },
  }),

  createAnnotation: defineAction({
    input: z.object({
      documentId: z.string().min(1),
      pageId: z.string().optional(),
      annotationType: z.string().optional(),
      selectionJson: z.string().optional(),
      comment: z.string().optional(),
      color: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedDocument(input.documentId, user.id);

      if (input.pageId) {
        await getOwnedPage(input.pageId, input.documentId, user.id);
      }

      const now = new Date();
      const [annotation] = await db
        .insert(PdfAnnotations)
        .values({
          id: crypto.randomUUID(),
          documentId: input.documentId,
          pageId: input.pageId ?? null,
          userId: user.id,
          annotationType: input.annotationType,
          selectionJson: input.selectionJson,
          comment: input.comment,
          color: input.color,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return { success: true, data: { annotation } };
    },
  }),

  updateAnnotation: defineAction({
    input: z
      .object({
        id: z.string().min(1),
        documentId: z.string().min(1),
        pageId: z.string().optional(),
        annotationType: z.string().optional(),
        selectionJson: z.string().optional(),
        comment: z.string().optional(),
        color: z.string().optional(),
      })
      .refine(
        (input) =>
          input.pageId !== undefined ||
          input.annotationType !== undefined ||
          input.selectionJson !== undefined ||
          input.comment !== undefined ||
          input.color !== undefined,
        { message: "At least one field must be provided to update." }
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedDocument(input.documentId, user.id);

      if (input.pageId !== undefined && input.pageId !== null) {
        await getOwnedPage(input.pageId, input.documentId, user.id);
      }

      const [existing] = await db
        .select()
        .from(PdfAnnotations)
        .where(and(eq(PdfAnnotations.id, input.id), eq(PdfAnnotations.documentId, input.documentId)));

      if (!existing) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Annotation not found.",
        });
      }

      const [annotation] = await db
        .update(PdfAnnotations)
        .set({
          ...(input.pageId !== undefined ? { pageId: input.pageId } : {}),
          ...(input.annotationType !== undefined ? { annotationType: input.annotationType } : {}),
          ...(input.selectionJson !== undefined ? { selectionJson: input.selectionJson } : {}),
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          updatedAt: new Date(),
        })
        .where(eq(PdfAnnotations.id, input.id))
        .returning();

      return { success: true, data: { annotation } };
    },
  }),

  deleteAnnotation: defineAction({
    input: z.object({
      id: z.string().min(1),
      documentId: z.string().min(1),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedDocument(input.documentId, user.id);

      const result = await db
        .delete(PdfAnnotations)
        .where(and(eq(PdfAnnotations.id, input.id), eq(PdfAnnotations.documentId, input.documentId)));

      if (result.rowsAffected === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Annotation not found.",
        });
      }

      return { success: true };
    },
  }),

  listAnnotations: defineAction({
    input: z.object({
      documentId: z.string().min(1),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedDocument(input.documentId, user.id);

      const annotations = await db
        .select()
        .from(PdfAnnotations)
        .where(eq(PdfAnnotations.documentId, input.documentId));

      return { success: true, data: { items: annotations, total: annotations.length } };
    },
  }),
};
