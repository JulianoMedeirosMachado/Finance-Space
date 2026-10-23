import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { FinanceModule } from './finance/finance.module';
import { IntegrationModule } from './integrations/integration.module';

@Module({ imports: [AuthModule, FinanceModule, IntegrationModule] })
export class AppModule {}
