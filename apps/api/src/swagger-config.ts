import { DocumentBuilder } from '@nestjs/swagger';

/// Shared so the served documentation and the generated frontend types come
/// from one definition and cannot describe different APIs.
export function swaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Bastolk')
    .setDescription(
      'Bookkeeping suggestions for bank transactions, reviewed by a person',
    )
    .setVersion('0.1')
    .addGlobalParameters({
      name: 'x-company-id',
      in: 'header',
      required: true,
      schema: { type: 'string' },
      description: 'The company every scoped request is resolved against',
    })
    .build();
}
