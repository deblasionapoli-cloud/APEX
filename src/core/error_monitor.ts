export type ErrorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  severity: ErrorSeverity;
  module: string;
}

class ErrorMonitor {
  private logs: LogEntry[] = [];
  private listeners: Set<(logs: LogEntry[]) => void> = new Set();
  private maxLogs = 50;

  public report(message: string, severity: ErrorSeverity = 'MEDIUM', module: string = 'CORE'): void {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      message,
      severity,
      module,
    };

    this.logs = [entry, ...this.logs].slice(0, this.maxLogs);
    this.notify();

    if (severity === 'CRITICAL') {
      console.error(`[CRITICAL_${module}] ${message}`);
    }
  }

  public getLogs(): LogEntry[] {
    return this.logs;
  }

  public subscribe(callback: (logs: LogEntry[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.logs);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback(this.logs));
  }
}

export const errorMonitor = new ErrorMonitor();

// Global handler initialization
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    errorMonitor.report(event.message, 'HIGH', 'WINDOW');
  });

  window.addEventListener('unhandledrejection', (event) => {
    errorMonitor.report(event.reason?.message || 'Unhandled Promise Rejection', 'HIGH', 'PROMISE');
  });
}
