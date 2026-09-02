/**
 * Nenhum model definido em schema.prisma ainda, entao o Prisma Client nao
 * pode ser gerado/importado agora (`prisma generate` exige pelo menos 1
 * model). Este script volta a importar `@prisma/client` normalmente assim
 * que a modelagem de dominio (ver docs/product/BACKLOG.md) for adicionada.
 */
async function main(): Promise<void> {
  console.log('Seed: nenhum model definido ainda, nada a popular.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
