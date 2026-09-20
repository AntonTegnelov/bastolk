import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service.js';
import {
  CompositePredictor,
  type CompositeSettings,
} from './composite.predictor.js';
import { EmbeddingService } from './embedding.service.js';
import { KnnPredictor } from './knn.predictor.js';
import { LlmPredictor } from './llm.predictor.js';
import { PREDICTOR } from './predictor.interface.js';
import { TrainingExamplesService } from './training-examples.service.js';

/// The composition root for the models. This is the only file that knows which
/// implementation answers a prediction: everything downstream injects
/// PREDICTOR and cannot tell the difference, which is what lets the end-to-end
/// tests run with no GPU and what makes comparing the two models configuration
/// rather than a code change.
@Module({
  providers: [
    EmbeddingService,
    TrainingExamplesService,
    KnnPredictor,
    LlmPredictor,
    {
      provide: CompositePredictor,
      inject: [KnnPredictor, LlmPredictor, PrismaService, ConfigService],
      useFactory: (
        knn: KnnPredictor,
        llm: LlmPredictor,
        prisma: PrismaService,
        config: ConfigService,
      ) => {
        const settings: CompositeSettings = {
          knnConfidenceThreshold:
            config.get<number>('KNN_CONFIDENCE_THRESHOLD') ?? 0.6,
        };
        return new CompositePredictor(knn, llm, prisma, settings);
      },
    },
    {
      provide: PREDICTOR,
      inject: [ConfigService, KnnPredictor, LlmPredictor, CompositePredictor],
      useFactory: (
        config: ConfigService,
        knn: KnnPredictor,
        llm: LlmPredictor,
        composite: CompositePredictor,
      ) => {
        switch (config.get<string>('PREDICTOR_STRATEGY') ?? 'composite') {
          case 'knn':
            return knn;
          case 'llm':
            return llm;
          default:
            return composite;
        }
      },
    },
  ],
  exports: [
    PREDICTOR,
    TrainingExamplesService,
    EmbeddingService,
    KnnPredictor,
    LlmPredictor,
  ],
})
export class PredictorsModule {}
