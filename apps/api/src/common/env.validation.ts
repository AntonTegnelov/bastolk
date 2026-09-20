import { plainToInstance } from 'class-transformer';
import { IsInt, IsString, Max, Min, validateSync } from 'class-validator';

/// The environment this process needs. Validated once at boot so that a
/// missing variable is a startup failure with a named cause, rather than an
/// undefined that surfaces as a confusing error on the first request.
export class EnvVars {
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  OLLAMA_URL!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const parsed = plainToInstance(EnvVars, raw, {
    enableImplicitConversion: true,
    excludeExtraneousValues: false,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }

  return parsed;
}
