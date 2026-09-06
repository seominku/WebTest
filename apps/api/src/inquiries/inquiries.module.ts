import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InquiriesController } from './inquiries.controller.js';
import { InquiriesService } from './inquiries.service.js';

@Module({
  controllers: [InquiriesController],
  imports: [AuthModule],
  providers: [InquiriesService],
})
export class InquiriesModule {}
