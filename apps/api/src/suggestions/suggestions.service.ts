import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ExampleSource,
  type BankTransaction,
  type Company,
  type Prisma,
  type Suggestion,
  type VatTreatment,
} from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import {
  PREDICTOR,
  type Prediction,
  type Predictor,
} from '../predictors/predictor.interface.js';
import { TrainingExamplesService } from '../predictors/training-examples.service.js';
import {
  buildJournalLines,
  type JournalLineDraft,
} from '../rules/build-entry.js';
import { RuleError } from '../rules/errors.js';
import type { DecideDto } from './dto/decide.dto.js';

export interface GenerateResult {
  considered: number;
  suggested: number;
  withoutCandidate: number;
}

export interface SuggestionView {
  transactionId: string;
  bookedOn: string;
  text: string;
  amountOre: number;
  decided: boolean;
  suggestion: {
    id: string;
    predictor: string;
    confidence: number;
    accountNumber: string;
    vatTreatment: VatTreatment;
    evidence: unknown;
    /// The balanced entry this suggestion would produce. Built by the rules
    /// module, never by the model. Empty when the stored proposal predates a
    /// rule change and can no longer be built, which is reported rather than
    /// hidden.
    lines: JournalLineDraft[];
    buildError: string | null;
  } | null;
}

/// Asks the rules module whether a judgement can become a correct entry.
/// Returns the lines or the refusal, never a partial entry.
function tryBuild(
  accountNumber: string,
  vatTreatment: VatTreatment,
  amountOre: number,
): { lines: JournalLineDraft[]; error: null } | { lines: []; error: string } {
  try {
    return {
      lines: buildJournalLines({
        counterAccountNumber: accountNumber,
        vatTreatment,
        amountOre,
      }),
      error: null,
    };
  } catch (error) {
    // A rule refusal is an answer to the question asked. Anything else is a
    // bug and is allowed to propagate.
    if (error instanceof RuleError) {
      return { lines: [], error: error.message };
    }
    throw error;
  }
}

/// Orchestration only: predict, apply the rules, store, approve, correct. The
/// use cases live here, and keeping it thin is what shows the other modules
/// have the right shape.
@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);

  constructor(
    // The one place a caller asks for "a predictor". Which implementation
    // arrives is decided in the predictors module and is invisible here.
    @Inject(PREDICTOR) private readonly predictor: Predictor,
    private readonly prisma: PrismaService,
    private readonly trainingExamples: TrainingExamplesService,
  ) {}

  async generate(company: Company, limit: number): Promise<GenerateResult> {
    const pending = await this.prisma.bankTransaction.findMany({
      where: {
        companyId: company.id,
        suggestions: { none: {} },
        decision: null,
      },
      orderBy: { bookedOn: 'desc' },
      take: limit,
    });

    let suggested = 0;
    let withoutCandidate = 0;

    for (const transaction of pending) {
      const prediction = await this.predictor.predict(company, {
        text: transaction.text,
        amountOre: transaction.amountOre,
        bookedOn: transaction.bookedOn,
      });

      // A candidate that cannot become a balanced entry is not a suggestion,
      // for the same reason an account outside the chart is not one: reverse
      // charge on money coming in, for example, has no correct entry. It is
      // dropped before it is stored rather than breaking the review screen.
      const buildable = prediction.candidates.filter(
        (candidate) =>
          tryBuild(
            candidate.accountNumber,
            candidate.vatTreatment,
            transaction.amountOre,
          ).error === null,
      );

      if (buildable.length === 0) {
        withoutCandidate += 1;
        continue;
      }

      await this.storeSuggestion(company, transaction, {
        ...prediction,
        candidates: buildable,
      });
      suggested += 1;
    }

    this.logger.log(
      `Generated ${suggested} suggestions for ${pending.length} transactions`,
    );

    return { considered: pending.length, suggested, withoutCandidate };
  }

  private async storeSuggestion(
    company: Company,
    transaction: BankTransaction,
    prediction: Prediction,
  ): Promise<Suggestion> {
    const [best] = prediction.candidates;

    return this.prisma.suggestion.create({
      data: {
        companyId: company.id,
        bankTransactionId: transaction.id,
        candidates: prediction.candidates as unknown as Prisma.InputJsonValue,
        predictor: prediction.predictor,
        modelVersionId: prediction.modelVersionId,
        confidence: best.confidence,
        evidence: prediction.evidence as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async list(company: Company, limit: number): Promise<SuggestionView[]> {
    const transactions = await this.prisma.bankTransaction.findMany({
      where: { companyId: company.id },
      orderBy: { bookedOn: 'desc' },
      take: limit,
      include: {
        decision: true,
        suggestions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return transactions.map((transaction) => {
      const [suggestion] = transaction.suggestions;
      const candidates = (suggestion?.candidates ?? []) as unknown as {
        accountNumber: string;
        vatTreatment: VatTreatment;
      }[];
      const best = candidates[0];
      const built = best
        ? tryBuild(best.accountNumber, best.vatTreatment, transaction.amountOre)
        : { lines: [] as JournalLineDraft[], error: null };

      return {
        transactionId: transaction.id,
        bookedOn: transaction.bookedOn.toISOString().slice(0, 10),
        text: transaction.text,
        amountOre: transaction.amountOre,
        decided: transaction.decision !== null,
        suggestion:
          suggestion && best
            ? {
                id: suggestion.id,
                predictor: suggestion.predictor,
                confidence: suggestion.confidence,
                accountNumber: best.accountNumber,
                vatTreatment: best.vatTreatment,
                evidence: suggestion.evidence,
                lines: built.lines,
                buildError: built.error,
              }
            : null,
      };
    });
  }

  /// A person approves every entry. Confidence decides how much attention an
  /// entry gets, never whether it is exported, so there is no path into this
  /// that does not come from someone choosing.
  async decide(
    company: Company,
    transactionId: string,
    decision: DecideDto,
  ): Promise<{
    decisionId: string;
    journalEntryId: string;
    lines: JournalLineDraft[];
  }> {
    const transaction = await this.prisma.bankTransaction.findFirst({
      where: { id: transactionId, companyId: company.id },
      include: {
        decision: true,
        suggestions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!transaction) {
      throw new NotFoundException(
        `No transaction ${transactionId} for this company`,
      );
    }
    if (transaction.decision) {
      throw new BadRequestException(
        'This transaction has already been decided',
      );
    }

    const account = await this.prisma.account.findUnique({
      where: {
        companyId_number: {
          companyId: company.id,
          number: decision.accountNumber,
        },
      },
    });
    if (!account) {
      throw new BadRequestException(
        `Account ${decision.accountNumber} is not in this company's chart`,
      );
    }

    // Throws rather than storing an entry that does not balance.
    const lines = buildJournalLines({
      counterAccountNumber: decision.accountNumber,
      vatTreatment: decision.vatTreatment,
      amountOre: transaction.amountOre,
    });

    const [suggestion] = transaction.suggestions;
    const suggested = (suggestion?.candidates ?? []) as unknown as {
      accountNumber: string;
      vatTreatment: VatTreatment;
    }[];
    const differed =
      !suggested[0] ||
      suggested[0].accountNumber !== decision.accountNumber ||
      suggested[0].vatTreatment !== decision.vatTreatment;

    const stored = await this.prisma.$transaction(async (tx) => {
      const created = await tx.decision.create({
        data: {
          companyId: company.id,
          bankTransactionId: transaction.id,
          suggestionId: suggestion?.id ?? null,
          accountNumber: decision.accountNumber,
          vatTreatment: decision.vatTreatment,
          differedFromSuggestion: differed,
        },
      });

      const entry = await tx.journalEntry.create({
        data: {
          id: randomUUID(),
          companyId: company.id,
          decisionId: created.id,
          date: transaction.bookedOn,
          text: transaction.text,
          lines: { create: lines.map((line) => ({ ...line })) },
        },
      });

      return { decisionId: created.id, journalEntryId: entry.id };
    });

    // A correction is the most valuable training data there is, and storing it
    // as an example makes the nearest-neighbour model account for it at once.
    if (differed) {
      await this.trainingExamples.store(company.id, [
        {
          text: transaction.text,
          amountOre: transaction.amountOre,
          accountNumber: decision.accountNumber,
          vatTreatment: decision.vatTreatment,
          source: ExampleSource.CORRECTION,
          occurredOn: transaction.bookedOn,
        },
      ]);
    }

    return { ...stored, lines };
  }
}
