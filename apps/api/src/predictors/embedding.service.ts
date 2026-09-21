import { Injectable, Logger } from '@nestjs/common';
import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
} from '@huggingface/transformers';

/// Multilingual, 384 dimensions, which is what the vector column declares.
const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

/// Embeddings run on the CPU inside the Node process. Embeddings from Ollama
/// would be simpler to call and would occupy the GPU that training needs.
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private extractor: Promise<FeatureExtractionPipeline> | null = null;

  constructor() {
    // Model files belong on the container volume, not in the bind-mounted
    // checkout.
    env.cacheDir =
      process.env.TRANSFORMERS_CACHE ?? '/home/dev/.cache/transformers';
  }

  /// Loaded on first use rather than at boot, so the API starts immediately
  /// and only the first prediction pays for the download.
  private load(): Promise<FeatureExtractionPipeline> {
    if (!this.extractor) {
      this.logger.log(`Loading embedding model ${MODEL}`);
      this.extractor = pipeline('feature-extraction', MODEL, { dtype: 'fp32' });
    }
    return this.extractor;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const extractor = await this.load();
    const output = await extractor([...texts], {
      pooling: 'mean',
      normalize: true,
    });

    return output.tolist() as number[][];
  }

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.embed([text]);
    return vector;
  }
}
