import { z } from "zod";

export const CruiseStatusSchema = z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]);

export const CreateCruiseSchema = z
  .object({
    shipId: z.string(),
    title: z.string().min(3).max(200),
    theme: z.string().min(2).max(60),
    description: z.string().max(2000).optional(),
    embarkationDate: z.coerce.date(),
    disembarkationDate: z.coerce.date(),
    embarkationPortId: z.string(),
    disembarkationPortId: z.string(),
    coverImageUrl: z.string().url().optional(),
  })
  .refine((data) => data.disembarkationDate > data.embarkationDate, {
    message: "A data de desembarque precisa ser depois da data de embarque.",
    path: ["disembarkationDate"],
  });
export type CreateCruiseInput = z.infer<typeof CreateCruiseSchema>;

/**
 * Edicao NAO inclui `status` de proposito — trocar o estado do cruzeiro
 * (publicar/despublicar) tem regras de negocio proprias (ver
 * CruiseStatusPolicy) e endpoints dedicados (`POST /cruises/:id/publish` e
 * `/unpublish`), nao um PATCH generico.
 */
export const UpdateCruiseSchema = z
  .object({
    title: z.string().min(3).max(200).optional(),
    description: z.string().max(2000).optional(),
    theme: z.string().min(2).max(60).optional(),
    embarkationDate: z.coerce.date().optional(),
    disembarkationDate: z.coerce.date().optional(),
    coverImageUrl: z.string().url().optional(),
  })
  .refine(
    (data) =>
      !data.embarkationDate ||
      !data.disembarkationDate ||
      data.disembarkationDate > data.embarkationDate,
    {
      message: "A data de desembarque precisa ser depois da data de embarque.",
      path: ["disembarkationDate"],
    },
  );
export type UpdateCruiseInput = z.infer<typeof UpdateCruiseSchema>;

export const CruiseSortBySchema = z.enum(["embarkationDate", "title", "createdAt", "price"]);
export const SortOrderSchema = z.enum(["asc", "desc"]);

export const CruiseQuerySchema = z
  .object({
    theme: z.string().max(60).optional(),
    destination: z.string().max(150).optional(),
    embarkationFrom: z.coerce.date().optional(),
    embarkationTo: z.coerce.date().optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    organizerId: z.string().optional(),
    status: CruiseStatusSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: CruiseSortBySchema.default("embarkationDate"),
    sortOrder: SortOrderSchema.default("asc"),
  })
  .refine((data) => !data.minPrice || !data.maxPrice || data.maxPrice >= data.minPrice, {
    message: "maxPrice precisa ser maior ou igual a minPrice.",
    path: ["maxPrice"],
  });
export type CruiseQuery = z.infer<typeof CruiseQuerySchema>;
