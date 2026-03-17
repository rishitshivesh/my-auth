import { Injectable } from '@nestjs/common';
import * as os from 'os';

@Injectable()
export class StatsService {
  getSystemStats() {
    return {
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      memoryUsage: process.memoryUsage(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpuUsage: os.cpus(),
    };
  }
}
