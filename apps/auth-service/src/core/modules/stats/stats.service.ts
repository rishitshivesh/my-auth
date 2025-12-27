import { Injectable } from '@nestjs/common';
import * as os from 'os';

@Injectable()
export class StatsService {
  private startTime: number;
  private requestCount: number;

  constructor() {
    this.startTime = Date.now();
    this.requestCount = 0;
  }

  getSystemStats() {
    const uptime = os.uptime();
    const loadAverage = os.loadavg();
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const cpuUsage = os.cpus();

    return {
      uptime,
      loadAverage,
      memoryUsage,
      totalMemory,
      freeMemory,
      cpuUsage,
    };
  }

  incrementRequestCount() {
    this.requestCount++;
  }

  getThroughput() {
    const currentTime = Date.now();
    const elapsedTime = (currentTime - this.startTime) / 1000; // in seconds
    const throughput = this.requestCount / elapsedTime;

    return {
      requestCount: this.requestCount,
      elapsedTime,
      throughput,
    };
  }
}
