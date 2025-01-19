import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 4447;
  await app.listen(port);
  console.log(`App Running on port: ${port}`)
}
bootstrap();
