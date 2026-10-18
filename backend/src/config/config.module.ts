import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';

const torrServerOriginSchema = Joi.string()
  .uri({ scheme: ['http', 'https'] })
  .custom((value: string, helpers) => {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.origin !== value) {
      return helpers.error('any.invalid');
    }
    return value;
  });
const secretFileSchema = Joi.string().trim().min(1);

export const appConfigValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  SESSION_TTL_DAYS: Joi.number().integer().min(1).max(365).default(30),
  CURSOR_SECRET: Joi.string().min(32).optional(),
  PASSWORD_RESET_MIN_RESPONSE_MS: Joi.number().integer().min(0).max(5000).default(500),
  RESEND_API_KEY: Joi.string().trim().required(),
  MAIL_FROM: Joi.string().trim().required(),
  MEDIA_ASSETS_ROOT: Joi.string().trim().min(1).default('./storage/media-assets'),
  MEDIA_ASSET_CLEANUP_GRACE_DAYS: Joi.number().integer().min(1).max(3650).default(30),
  PROFILE_ASSETS_ROOT: Joi.string().trim().min(1).default('./storage/profile-assets'),
  PROFILE_ASSET_CLEANUP_GRACE_HOURS: Joi.number().integer().min(1).max(8760).default(24),
  TMDB_API_KEY: Joi.string().trim().max(4096).allow('').optional(),
  MEDIA_ENGINE_SHIKIMORI_USER_AGENT: Joi.string().trim().max(512).allow('').optional(),
  KODIK_API_KEY: Joi.string().trim().max(4096).allow('').optional(),
  FRONTEND_ORIGIN: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .custom((value: string, helpers) => {
      if (value.includes('*') || new URL(value).origin !== value) {
        return helpers.error('any.invalid');
      }

      return value;
    })
    .required(),
  TORRENT_STREAMING_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  TORRSERVER_BASE_URL: Joi.when('TORRENT_STREAMING_ENABLED', {
    is: true,
    then: torrServerOriginSchema.required(),
    otherwise: torrServerOriginSchema.optional(),
  }),
  TORRSERVER_USERNAME_FILE: Joi.when('TORRENT_STREAMING_ENABLED', {
    is: true,
    then: secretFileSchema.required(),
    otherwise: secretFileSchema.optional(),
  }),
  TORRSERVER_PASSWORD_FILE: Joi.when('TORRENT_STREAMING_ENABLED', {
    is: true,
    then: secretFileSchema.required(),
    otherwise: secretFileSchema.optional(),
  }),
  TORRENT_IDEMPOTENCY_SECRET_FILE: Joi.when('TORRENT_STREAMING_ENABLED', {
    is: true,
    then: secretFileSchema.required(),
    otherwise: secretFileSchema.optional(),
  }),
  TORRSERVER_CONNECT_TIMEOUT_MS: Joi.number().integer().min(100).max(30_000).default(3_000),
  TORRSERVER_HEADERS_TIMEOUT_MS: Joi.number().integer().min(100).max(120_000).default(30_000),
  TORRSERVER_BODY_TIMEOUT_MS: Joi.number().integer().min(100).max(120_000).default(30_000),
  TORRSERVER_METADATA_TIMEOUT_MS: Joi.number().integer().min(1_000).max(180_000).default(120_000),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      validationSchema: appConfigValidationSchema,
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
