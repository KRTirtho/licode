class FunctionQueue {
  _enqueueingTimeout: any;
  _enqueuing: boolean;
  _queuedArgs: { protectedFunction: Function, args: any[] }[];
  constructor(public maxEnqueueingTime = 30000, public onEnqueueingTimeout: (step?: number) => void = () => { }) {
    this._enqueuing = false;
    this._queuedArgs = [];
  }

  protectFunction(protectedFunction: Function) {
    return this._protectedFunction.bind(this, protectedFunction);
  }

  isEnqueueing() {
    return this._enqueuing;
  }

  startEnqueuing(step: number) {
    this._enqueuing = true;
    clearTimeout(this._enqueueingTimeout);
    this._enqueueingTimeout = setTimeout(() => {
      if (this.onEnqueueingTimeout) {
        this.onEnqueueingTimeout(step);
      }
    }, this.maxEnqueueingTime);
  }

  stopEnqueuing() {
    this._enqueuing = false;
    clearTimeout(this._enqueueingTimeout);
  }

  nextInQueue() {
    if (this._queuedArgs.length > 0) {
      const removed = this._queuedArgs.shift();
      if (removed?.protectedFunction) removed?.protectedFunction(...removed?.args);
    }
  }

  dequeueAll() {
    const queuedArgs = this._queuedArgs;
    this._queuedArgs = [];
    queuedArgs.forEach(({ protectedFunction, args }) => {
      protectedFunction(...args);
    });
  }

  _protectedFunction(protectedFunction: Function, ...args: any[]) {
    if (this.isEnqueueing()) {
      this._enqueue(protectedFunction, ...args);
      return;
    }
    protectedFunction(...args);
  }

  _enqueue(protectedFunction: Function, ...args: any[]) {
    this._queuedArgs.push({ protectedFunction, args });
  }
}

export default FunctionQueue;
