import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { FinanceModule } from './finance/finance.module';
import { ImportModule } from './imports/import.module';

@Module({ imports: [AuthModule, FinanceModule, ImportModule] })
export class AppModule {}
