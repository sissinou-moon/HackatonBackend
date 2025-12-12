/**
 * Query operation logging utility.
 * Tracks timing and steps for each query processing pipeline.
 */

import logger from './logger';

export interface OperationStep {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  details?: Record<string, any>;
}

export interface QueryLog {
  queryId: string;
  originalQuery: string;
  refinedQuery?: string;
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  steps: OperationStep[];
  cacheHit: boolean;
  resultCount: number;
}

// Store logs for recent queries (keep last 100)
const queryLogs: QueryLog[] = [];
const MAX_LOGS = 100;

/**
 * Create a new query log entry.
 */
export function createQueryLog(query: string): QueryLog {
  const log: QueryLog = {
    queryId: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    originalQuery: query,
    startTime: Date.now(),
    steps: [],
    cacheHit: false,
    resultCount: 0
  };
  
  queryLogs.unshift(log);
  
  // Trim old logs
  if (queryLogs.length > MAX_LOGS) {
    queryLogs.length = MAX_LOGS;
  }
  
  logger.log(`${'='.repeat(60)}`);
  logger.log(`[QueryLog] New query: "${query}"`);
  logger.log(`[QueryLog] Query ID: ${log.queryId}`);
  logger.log(`${'='.repeat(60)}`);
  
  return log;
}

/**
 * Start timing an operation step.
 */
export function startStep(log: QueryLog, stepName: string, details?: Record<string, any>): OperationStep {
  const step: OperationStep = {
    name: stepName,
    startTime: Date.now(),
    details
  };
  
  log.steps.push(step);
  logger.log(`[${log.queryId}] ⏱️  START: ${stepName}`);
  
  return step;
}

/**
 * End timing an operation step.
 */
export function endStep(log: QueryLog, step: OperationStep, additionalDetails?: Record<string, any>): void {
  step.endTime = Date.now();
  step.duration = step.endTime - step.startTime;
  
  if (additionalDetails) {
    step.details = { ...step.details, ...additionalDetails };
  }
  
  logger.log(`[${log.queryId}] ✅ END: ${step.name} (${step.duration}ms)`);
  
  if (step.details && Object.keys(step.details).length > 0) {
    logger.log(`[${log.queryId}]    Details:`, JSON.stringify(step.details));
  }
}

/**
 * Finalize the query log.
 */
export function finalizeQueryLog(log: QueryLog, resultCount: number): void {
  log.endTime = Date.now();
  log.totalDuration = log.endTime - log.startTime;
  log.resultCount = resultCount;
  
  logger.log(`[${log.queryId}] 📊 QUERY COMPLETE`);
  logger.log(`[${log.queryId}] Total Duration: ${log.totalDuration}ms`);
  logger.log(`[${log.queryId}] Cache Hit: ${log.cacheHit}`);
  logger.log(`[${log.queryId}] Results: ${log.resultCount}`);
  logger.log(`[${log.queryId}] Steps breakdown:`);
  
  for (const step of log.steps) {
    const duration = step.duration ?? 'ongoing';
    logger.log(`[${log.queryId}]   - ${step.name}: ${duration}ms`);
  }
  
  logger.log(`${'='.repeat(60)}`);
}

/**
 * Mark query as cache hit.
 */
export function markCacheHit(log: QueryLog): void {
  log.cacheHit = true;
  logger.log(`[${log.queryId}] 🎯 CACHE HIT!`);
}

/**
 * Set refined query.
 */
export function setRefinedQuery(log: QueryLog, refinedQuery: string): void {
  log.refinedQuery = refinedQuery;
}

/**
 * Get recent query logs.
 */
export function getRecentQueryLogs(limit: number = 10): QueryLog[] {
  return queryLogs.slice(0, limit);
}

/**
 * Get a specific query log by ID.
 */
export function getQueryLog(queryId: string): QueryLog | undefined {
  return queryLogs.find(log => log.queryId === queryId);
}

/**
 * Get timing statistics across recent queries.
 */
export function getTimingStats(): {
  avgTotalDuration: number;
  avgStepDurations: Record<string, number>;
  cacheHitRate: number;
} {
  const completedLogs = queryLogs.filter(log => log.totalDuration !== undefined);
  
  if (completedLogs.length === 0) {
    return {
      avgTotalDuration: 0,
      avgStepDurations: {},
      cacheHitRate: 0
    };
  }
  
  // Calculate average total duration
  const avgTotalDuration = completedLogs.reduce((sum, log) => sum + (log.totalDuration || 0), 0) / completedLogs.length;
  
  // Calculate average step durations
  const stepDurations: Record<string, number[]> = {};
  for (const log of completedLogs) {
    for (const step of log.steps) {
      if (step.duration !== undefined) {
        if (!stepDurations[step.name]) {
          stepDurations[step.name] = [];
        }
        stepDurations[step.name].push(step.duration);
      }
    }
  }
  
  const avgStepDurations: Record<string, number> = {};
  for (const [name, durations] of Object.entries(stepDurations)) {
    avgStepDurations[name] = durations.reduce((a, b) => a + b, 0) / durations.length;
  }
  
  // Calculate cache hit rate
  const cacheHitRate = completedLogs.filter(log => log.cacheHit).length / completedLogs.length;
  
  return {
    avgTotalDuration: Math.round(avgTotalDuration),
    avgStepDurations: Object.fromEntries(
      Object.entries(avgStepDurations).map(([k, v]) => [k, Math.round(v)])
    ),
    cacheHitRate: Math.round(cacheHitRate * 100) / 100
  };
}
