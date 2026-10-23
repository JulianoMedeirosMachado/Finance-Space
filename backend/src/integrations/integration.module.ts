import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { FinanceModule } from '../finance/finance.module';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { IntegrationRepository } from './integration.repository';
import { AiService } from './ai.service';
import { TelegramClient } from './telegram.client';
import { TelegramWorker } from './telegram.worker';

@Module({
  imports: [AuthModule, DatabaseModule, FinanceModule],
  controllers: [IntegrationController],
  providers: [IntegrationService, IntegrationRepository, AiService, TelegramClient, TelegramWorker],
})
export class IntegrationModule {}
