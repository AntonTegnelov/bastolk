import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { RuleError } from '../rules/errors.js';

/// A rule failure means the tool could not build a correct entry. That is not
/// a bad request and not a crash: it is a refusal, reported as one, with the
/// detail logged rather than returned.
@Catch(RuleError)
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: RuleError, host: ArgumentsHost): void {
    this.logger.error(`Rule refused to build an entry: ${exception.message}`);

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.UNPROCESSABLE_ENTITY)
      .json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        message: exception.message,
      });
  }
}
