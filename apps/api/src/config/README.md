# config/

Carregamento tipado de variáveis de ambiente via `@nestjs/config`, validadas em runtime por um schema Zod (`env.schema.ts`). A aplicação falha ao subir se uma variável obrigatória estiver ausente ou em formato inválido — evita erros silenciosos em produção.
