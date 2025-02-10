import { Injectable, OnModuleInit } from '@nestjs/common';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { ConfigService } from '@nestjs/config';
import { Buffer } from 'buffer';
import { Storage } from '@google-cloud/storage';

@Injectable()
export class DocumentAIService implements OnModuleInit {
  private client: DocumentProcessorServiceClient;
  private storage: Storage;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      const projectId = process.env.PROJECT_ID;
      const projectIdGCP= process.env.GCP_PROJECT_ID;
      const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
      const private_key = process.env.GCP_PRIVATE_KEY.replace(/\\n/g, '\n');

      if (!projectId || !serviceAccountEmail || !private_key) {
        console.error('Missing GCP credentials in environment variables!');
        return;
      }

      this.storage = new Storage({
        projectId: projectIdGCP,
        keyFilename: null,

        credentials: {
          client_email: serviceAccountEmail,
          private_key,
        },
      });

      this.client = new DocumentProcessorServiceClient({
        projectId: projectIdGCP,
        credentials: {
          client_email: serviceAccountEmail,
          private_key,
        },
      });

      console.log('Google Cloud Storage Client Started');
    } catch (error) {
      console.error('Error Starting Google Cloud Storage:', error);
    }
  }

  async processDocument(
    fileBuffer: Buffer,
    mimeType: string,
    projectId: string,
    location: string,
    processorId: string,
  ) {
    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

    const encodedImage = Buffer.from(fileBuffer).toString('base64');

    const request = {
      name,
      rawDocument: {
        content: encodedImage,
        mimeType,
      },
      processOptions: {
        ocrConfig: {
          enableImageQualityScores: true,
        },
      },
    };

    const [result] = await this.client.processDocument(request);

    return result.document;
  }
}
