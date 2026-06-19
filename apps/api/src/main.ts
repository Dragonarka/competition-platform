import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (process.env.WEB_URL ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const isDev = process.env.NODE_ENV !== 'production';
  app.enableCors({
    // In dev, accept any localhost port so a shifted web port (e.g. when 3000
    // is already taken) doesn't break every tRPC call. In prod, only WEB_URL.
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        (isDev && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
      ) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
void bootstrap();
