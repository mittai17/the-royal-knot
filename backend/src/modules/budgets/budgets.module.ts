import { Module } from '@nestjs/common';
import { BudgetsController, FinancialReportsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { FinancialReportsService } from './financial-reports.service';

@Module({ controllers: [BudgetsController, FinancialReportsController], providers: [BudgetsService, FinancialReportsService], exports: [BudgetsService, FinancialReportsService] })
export class BudgetsModule {}
