import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ViewingsController } from './viewings.controller.js';
import { ViewingsService } from './viewings.service.js';

@Module({
  controllers: [ViewingsController],
  imports: [AuthModule],
  providers: [ViewingsService],
})
export class ViewingsModule {}
