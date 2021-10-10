/*
 * API to write logs based on traditional logging mechanisms: debug, trace, info, warning, error
 */

type OutputFunction = (...args: any[]) => void;

export const Logger = (() => {
  const DEBUG = 0;
  const TRACE = 1;
  const INFO = 2;
  const WARNING = 3;
  const ERROR = 4;
  const NONE = 5;
  let logPrefix = '';

  let outputFunction: OutputFunction;

  // It sets the new log level. We can set it to NONE if we do not want to print logs
  const setLogLevel = (level: number) => {
    let targetLevel = level;
    if (level > Logger.NONE) {
      targetLevel = Logger.NONE;
    } else if (level < Logger.DEBUG) {
      targetLevel = Logger.DEBUG;
    }
    Logger.logLevel = targetLevel;
  };

  outputFunction = (args) => {
    // eslint-disable-next-line no-console
    console.log(...args);
  };

  const setOutputFunction = (newOutputFunction: OutputFunction) => {
    outputFunction = newOutputFunction;
  };

  const setLogPrefix = (newLogPrefix: string) => {
    logPrefix = newLogPrefix;
  };

  // Generic function to print logs for a given level:
  //  Logger.[DEBUG, TRACE, INFO, WARNING, ERROR]
  const log = (level: number, ...args: any[]) => {
    let out = logPrefix;
    if (level === Logger.DEBUG) {
      out = `${out}DEBUG`;
    } else if (level === Logger.TRACE) {
      out = `${out}TRACE`;
    } else if (level === Logger.INFO) {
      out = `${out}INFO`;
    } else if (level === Logger.WARNING) {
      out = `${out}WARNING`;
    } else if (level === Logger.ERROR) {
      out = `${out}ERROR`;
    }
    out = `${out}: `;
    const tempArgs = [out].concat(args);
    if ((Logger as any).panel !== undefined) {
      let tmp = '';
      for (let idx = 0; idx < tempArgs.length; idx += 1) {
        tmp += tempArgs[idx];
      }
      (Logger as any).panel.value = `${(Logger as any).panel.value}\n${tmp}`;
    } else {
      outputFunction.apply(Logger, [tempArgs]);
    }
  };

  const logFromModule = (moduleName: string, moduleMinLevel: number, logLevel: number, ...args: any[]) => {
    if (moduleMinLevel === undefined && logLevel >= Logger.logLevel) {
      log(logLevel, `(${moduleName})`, ...args);
    } else if (logLevel >= moduleMinLevel) {
      log(logLevel, `(${moduleName})`, ...args);
    }
  };

  class ModuleLogger {
    level: number = DEBUG;

    constructor(public name: string) { }

    setLogLevel(level: number) { this.level = level; }

    debug(...args: any[]) { logFromModule(this.name, this.level, Logger.DEBUG, ...args); }
    trace(...args: any[]) { logFromModule(this.name, this.level, Logger.TRACE, ...args); }
    info(...args: any[]) { logFromModule(this.name, this.level, Logger.INFO, ...args); }
    warning(...args: any[]) { logFromModule(this.name, this.level, Logger.WARNING, ...args); }
    error(...args: any[]) { logFromModule(this.name, this.level, Logger.ERROR, ...args); }
  }

  const modules = new Map();

  const module = (moduleName: string) => {
    if (modules.has(moduleName)) {
      return modules.get(moduleName);
    }
    const newModule = new ModuleLogger(moduleName);
    modules.set(moduleName, newModule);
    return newModule;
  };

  return {
    logLevel: DEBUG,
    DEBUG,
    TRACE,
    INFO,
    WARNING,
    ERROR,
    NONE,
    setLogLevel,
    setOutputFunction,
    setLogPrefix,
    module,
  };
})();