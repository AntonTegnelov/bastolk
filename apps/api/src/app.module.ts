import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';

@Module({
  imports: [CommonModule],
})
export class AppModule {}
