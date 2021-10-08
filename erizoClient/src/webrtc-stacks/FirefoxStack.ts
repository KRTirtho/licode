/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


import Logger from '../utils/Logger';
import BaseStack, { RTCBaseStack, RTCBaseStackOptions } from './BaseStack';

const log = Logger.module('FirefoxStack');

export interface RTCFirefoxStack extends RTCBaseStack {
  prepareCreateOffer(): Promise<void>
}

const FirefoxStack = (specInput: RTCBaseStackOptions) => {
  log.debug('message: Starting Firefox stack');
  const that = {
    ...BaseStack(specInput),
    prepareCreateOffer: () => Promise.resolve()
  };

  that.addStream = (streamInput) => {
    const nativeStream = streamInput.stream;
    nativeStream.transceivers = [];
    nativeStream.getTracks().forEach(async (track) => {
      let options: Record<any, any> = {};
      if (track.kind === 'video' && streamInput.simulcast) {
        options = {
          sendEncodings: [],
        };
      }
      options.streams = [nativeStream];
      const transceiver = that.peerConnection.addTransceiver(track, options);
      nativeStream.transceivers.push(transceiver);
      const parameters = transceiver.sender.getParameters() || {};
      parameters.encodings = streamInput.generateEncoderParameters();
      return transceiver.sender.setParameters(parameters);
    });
  };

  return that;
};

export default FirefoxStack;
