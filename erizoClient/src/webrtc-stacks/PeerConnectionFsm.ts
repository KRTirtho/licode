import Logger from '../utils/Logger';
import StateMachine, { LifecycleArgs, TransitionsConfig } from "javascript-state-machine"

const log = Logger.module('PeerConnectionFsm');
const activeStates = ['initial', 'failed', 'stable'];
const HISTORY_SIZE_LIMIT = 200;

export interface PeerConnectionMethods {
  getHistory(lifecycle: LifecycleArgs): void
  onBeforeClose(lifecycle: LifecycleArgs): void
  onBeforeAddIceCandidate(lifecycle: LifecycleArgs, candidate: RTCIceCandidate): void
  onBeforeAddStream(lifecycle: LifecycleArgs, stream: MediaStream): void
  onBeforeRemoveStream(lifecycle: LifecycleArgs, stream: MediaStream): void
  onBeforeCreateOffer(lifecycle: LifecycleArgs, isSubscribe: boolean): void
  onBeforeProcessOffer(lifecycle: LifecycleArgs, message: string): void
  onBeforeProcessAnswer(lifecycle: LifecycleArgs, message: string): void
  onBeforeNegotiateMaxBW(lifecycle: LifecycleArgs, configInput: unknown, callback: Function): void
  onStable(lifecycle: LifecycleArgs): void
  onClosed(lifecycle: LifecycleArgs): void
  onTransition(lifecycle: LifecycleArgs): void
  onError(lifecycle: LifecycleArgs, message: string): void
  onInvalidTransition(transition: string, from: string, to: string): void
  onPendingTransition(transition: string, from: string, to: string): void
}

export interface PeerConnectionData {
  baseStackCalls: any,
  history: (Omit<TransitionsConfig, "name"> & { transition: string })[]
}

// FSM
const PeerConnectionFsm = StateMachine.factory<PeerConnectionMethods, PeerConnectionData>({
  init: 'initial',
  transitions: [
    { name: 'create-offer', from: activeStates, to: 'stable' },
    { name: 'add-ice-candidate', from: activeStates, to() { return this.state; } },
    { name: 'process-answer', from: activeStates, to: 'stable' },
    { name: 'process-offer', from: activeStates, to: 'stable' },
    { name: 'negotiate-max-bw', from: activeStates, to: 'stable' },
    { name: 'add-stream', from: activeStates, to: function nextState() { return this.state; } },
    { name: 'remove-stream', from: activeStates, to: function nextState() { return this.state; } },
    { name: 'close', from: activeStates, to: 'closed' },
    { name: 'error', from: '*', to: 'failed' },
  ],
  data(baseStackCalls: any) {
    return {
      baseStackCalls,
      history: [] as any,
    };
  },
  methods: {
    getHistory() {
      return this.history;
    },

    onBeforeClose(lifecycle) {
      log.debug(`mesage: onBeforeClose, from: ${lifecycle.from}, to: ${lifecycle.to}`);
      return this.baseStackCalls.protectedClose();
    },

    onBeforeAddIceCandidate(lifecycle, candidate) {
      log.debug(`message: onBeforeAddIceCandidate, from: ${lifecycle.from}, to: ${lifecycle.to}`);
      return this.baseStackCalls.protectedAddIceCandidate(candidate);
    },

    onBeforeAddStream(lifecycle, stream) {
      log.debug(`message: onBeforeAddStream, from: ${lifecycle.from}, to: ${lifecycle.to}`);
      return this.baseStackCalls.protectedAddStream(stream);
    },

    onBeforeRemoveStream(lifecycle, stream) {
      log.debug(`message: onBeforeRemoveStream, from: ${lifecycle.from}, to: ${lifecycle.to}`);
      return this.baseStackCalls.protectedRemoveStream(stream);
    },

    onBeforeCreateOffer(lifecycle, isSubscribe) {
      log.debug(`message: onBeforeCreateOffer, from: ${lifecycle.from}, to: ${lifecycle.to}`);
      return this.baseStackCalls.protectedCreateOffer(isSubscribe);
    },

    onBeforeProcessOffer(lifecycle, message) {
      log.debug(`message: onBeforeProcessOffer, from: ${lifecycle.from}, to: ${lifecycle.to}`);
      return this.baseStackCalls.protectedProcessOffer(message);
    },

    onBeforeProcessAnswer(lifecycle, message) {
      log.debug(`message: onBeforeProcessAnswer, from: ${lifecycle.from}, to: ${lifecycle.to}`);
      return this.baseStackCalls.protectedProcessAnswer(message);
    },

    onBeforeNegotiateMaxBW(lifecycle, configInput, callback) {
      log.debug(`message: onBeforeNegotiateMaxBW, from: ${lifecycle.from}, to: ${lifecycle.to}`);
      return this.baseStackCalls.protectedNegotiateMaxBW(configInput, callback);
    },

    onStable(lifecycle) {
      log.debug(`message: reached STABLE, from: ${lifecycle.from}, to: ${lifecycle.to}`);
    },

    onClosed(lifecycle) {
      log.debug(`message: reached close, from: ${lifecycle.from}, to: ${lifecycle.to}`);
    },

    onTransition(lifecycle) {
      log.info(`message: onTransition, transition: ${lifecycle.transition}, from: ${lifecycle.from}, to: ${lifecycle.to}`);
      this.history?.push(
        { from: lifecycle.from, to: lifecycle.to, transition: lifecycle.transition });
      if (this.history && this.history.length > HISTORY_SIZE_LIMIT) {
        this.history.shift();
      }
    },

    onError(lifecycle, message) {
      log.warning(`message: Error Transition Failed, message: ${message}, from: ${lifecycle.from}, to: ${lifecycle.to}, printing history`);
      this.history?.forEach((item) => {
        log.warning(`message: Error Transition Failed continuation, item: ${JSON.stringify(item)}`);
      });
    },

    onInvalidTransition(transition, from, to) {
      if (from === 'closed') {
        log.debug(`message:Trying to transition a closed state, transition: ${transition}, from: ${from}, to: ${to}`);
        return;
      }
      log.warning(`message: Error Invalid transition, transition: ${transition}, from: ${from}, to: ${to}`);
    },

    onPendingTransition(transition, from, to) {
      const lastTransition = this.history && this.history.length > 0 ? this.history[this.history.length - 1].transition : 'none';
      log.warning(`message: Error Pending transition, transition: ${transition}, from: ${from}, to: ${to}, lastTransition: ${lastTransition}`);
    },
  },
});

export default PeerConnectionFsm;
