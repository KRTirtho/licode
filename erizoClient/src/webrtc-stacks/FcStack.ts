/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


import { Logger } from '../utils/Logger';

export interface RTCFcStack {
  pcConfig: RTCConfiguration,
  desc: Record<string | number, any>,
  signalCallback?: (msg?: string) => void,
  peerConnection: RTCPeerConnection,
  close(): void,
  createOffer(): void,
  addStream(stream: MediaStream & { toLog(): string }): void,
  sendSignalingMessage(msg: string): void,
  setSignalingCallback?(cb: (msg?: string) => void): void,
  processSignalingMessage(msg: string): void
}

export interface RTCFcStackOptions {
  callback(msg?: string): void
}

const log = Logger.module('FcStack');
const FcStack = (spec: RTCFcStackOptions): RTCFcStack => {
  /*
  spec.callback({
      type: sessionDescription.type,
      sdp: sessionDescription.sdp
  });
  */
  const that: RTCFcStack = {
    pcConfig: {},
    peerConnection: {} as any,
    desc: {},
    close() {
      log.debug('message: Close FcStack');
    },
    createOffer() {
      log.debug('message: CreateOffer');
    },
    addStream: (stream) => {
      log.debug(`message: addStream, ${stream.toLog()}`);
    },
    processSignalingMessage(msg) {
      log.debug(`message: processSignaling, message: ${msg}`);
      if (that.signalCallback !== undefined) {
        that.signalCallback(msg);
      }
    },
    sendSignalingMessage(msg) {
      log.debug(`message: Sending signaling Message, message: ${msg}`);
      spec.callback(msg);
    },
  };
  return {
    ...that,
    setSignalingCallback(callback = () => { }) {
      log.debug('message: Setting signalling callback');
      that.signalCallback = callback;
    }
  };
};

export default FcStack;
