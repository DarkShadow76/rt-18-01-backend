export const testConfig = {
  database: {
    url: process.env.SUPABASE_URL || 'https://test.supabase.co',
    apiKey: process.env.SUPABASE_ANON_KEY || 'test-key'
  },
  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'test-project',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    processorId: process.env.GOOGLE_CLOUD_PROCESSOR_ID || 'test-processor',
    credentials: {
      clientEmail: process.env.GOOGLE_CLOUD_CLIENT_EMAIL || 'test@test.com',
      privateKey: process.env.GOOGLE_CLOUD_PRIVATE_KEY || 'test-key'
    }
  },
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB for tests
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
    storageLocation: './test-uploads'
  },
  logging: {
    level: 'error', // Reduce noise in tests
    enableConsole: false,
    enableFile: false
  }
};

export const createTestModule = async (providers: any[] = []) => {
  const { Test } = await import('@nestjs/testing');
  
  return Test.createTestingModule({
    providers: [
      {
        provide: 'CONFIG',
        useValue: testConfig
      },
      ...providers
    ]
  });
};