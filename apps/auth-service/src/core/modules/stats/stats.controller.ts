import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('system')
  getSystemStats() {
    return this.statsService.getSystemStats();
  }

  @Get('throughput')
  getThroughput() {
    return this.statsService.getThroughput();
  }

  // Middleware or interceptor can be added to increment the request count
  @Get('increment')
  incrementRequestCount() {
    this.statsService.incrementRequestCount();
    return { message: 'Request count incremented' };
  }
}
