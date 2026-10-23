import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { FinanceModule } from './finance/finance.module';

@Module({ imports: [AuthModule, FinanceModule] })
export class AppModule {}
