import { Module } from '@nestjs/common';
import { FileValidationService } from './file-validation/file-validation.service';
import { DocumentAIService } from './document-ai/document-ai.service';

@Module({
  providers: [
    FileValidationService,
    DocumentAIService,
  ],
  exports: [
    FileValidationService,
    DocumentAIService,
  ],
})
export class ServicesModule {}