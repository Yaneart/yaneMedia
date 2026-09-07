import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().port().default(3000),
        DATABASE_URL: Joi.string()
          .uri({ scheme: ['postgres', 'postgresql'] })
          .required(),
        SESSION_TTL_DAYS: Joi.number().integer().min(1).max(365).default(30),
        RESEND_API_KEY: Joi.string().trim().required(),
        MAIL_FROM: Joi.string().trim().required(),
        FRONTEND_ORIGIN: Joi.string()
          .uri({ scheme: ['http', 'https'] })
          .custom((value: string, helpers) => {
            if (value.includes('*') || new URL(value).origin !== value) {
              return helpers.error('any.invalid');
            }

            return value;
          })
          .required(),
      }),
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
