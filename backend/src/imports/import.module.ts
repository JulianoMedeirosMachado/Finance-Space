import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
@Module({
  imports: [DatabaseModule, AuthModule, FinanceModule],
  providers: [ImportService],
  controllers: [ImportController],
})
export class ImportModule {}
