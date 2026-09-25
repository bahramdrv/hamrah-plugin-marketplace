export const REQUEST_BUDGETS = Object.freeze({
  bodyLimitBytes: 64 * 1024,
  deadlineMs: 25_000,
  maxConcurrentRequests: 16,
  maxDatasetsScanned: 500,
  rateLimitWindowMs: 60_000,
  ipRequestsPerWindow: 120,
  sessionRequestsPerWindow: 60
});

export class BudgetExceededError extends Error {
  constructor(code, message, limit) {
    super(message);
    this.code = code;
    this.limit = limit;
  }
}

export async function withDeadline(deadlineMs, run) {
  const controller = new AbortController();
  let timer;
  const expired = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new BudgetExceededError(
        "operation_deadline_exceeded",
        `The operation exceeded its ${deadlineMs} ms deadline.`,
        { limitMs: deadlineMs }
      );
      controller.abort(error);
      reject(error);
    }, deadlineMs);
  });
  try {
    return await Promise.race([run(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}
