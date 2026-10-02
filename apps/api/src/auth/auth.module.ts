import { Global, Module } from '@nestjs/common';
import { OidcAuthGuard } from './oidc-auth.guard.js';
import { OidcAuthService } from './oidc-auth.service.js';

@Global()
@Module({
  providers: [OidcAuthService, OidcAuthGuard],
  exports: [OidcAuthService, OidcAuthGuard],
})
export class AuthModule {}
