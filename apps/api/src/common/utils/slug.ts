function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // remove acentos (ex: "ã" -> "a" depois do NFD)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'item'
  );
}

/**
 * Gera um slug unico consultando `exists` ate encontrar um livre —
 * usado tanto para Organizer quanto para Cruise (mesma logica, ids
 * diferentes).
 */
export async function generateUniqueSlug(
  text: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(text);
  let slug = base;
  let attempt = 1;

  while (await exists(slug)) {
    attempt += 1;
    slug = `${base}-${attempt}`;
  }

  return slug;
}
