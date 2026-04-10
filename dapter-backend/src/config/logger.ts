type LogLevel = "INFO" | "ERROR" | "DEBUG";

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return error;
};

const writeLog = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
  };
  console.log(JSON.stringify(payload));
};

export const logger = {
  info(message: string, context?: Record<string, unknown>) {
    writeLog("INFO", message, context);
  },
  debug(message: string, context?: Record<string, unknown>) {
    writeLog("DEBUG", message, context);
  },
  error(message: string, context?: Record<string, unknown>) {
    const safeContext = context
      ? Object.fromEntries(
          Object.entries(context).map(([key, value]) => [key, key === "error" ? serializeError(value) : value]),
        )
      : undefined;
    writeLog("ERROR", message, safeContext);
  },
};
