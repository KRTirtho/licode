/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


import BaseStack, { RTCBaseStack, RTCBaseStackOptions } from './BaseStack';
import SdpHelpers from '../utils/SdpHelpers';
import { Logger } from '../utils/Logger';

const log = Logger.module('ChromeStableStack');

export interface RTCChromeStableStack extends RTCBaseStack {
  mediaConstraints?: {
    offerToReceiveVideo?: boolean
    offerToReceiveAudio?: boolean
  },
  video?: boolean;
  prepareCreateOffer(): Promise<void>,
}

export interface RTCChromeStableStackOptions extends RTCBaseStackOptions {
  startVideoBW?: number;
  hardMinVideoBW?: number;
}

const ChromeStableStack = (specInput: RTCChromeStableStackOptions) => {
  log.debug(`message: Starting Chrome stable stack, spec: ${JSON.stringify(specInput)}`);
  const spec = specInput;
  const that: RTCChromeStableStack = {
    ...BaseStack(specInput),
    prepareCreateOffer: () => Promise.resolve(),
    mediaConstraints: {
      offerToReceiveVideo: true,
      offerToReceiveAudio: true,
    }
  };


  that.setStartVideoBW = (sdpInfo) => {
    if (that.video && spec.startVideoBW) {
      log.debug(`message: startVideoBW, requested: ${spec.startVideoBW}`);
      SdpHelpers.setParamForCodecs(sdpInfo, 'video', 'x-google-start-bitrate', spec.startVideoBW);
    }
  };

  that.setHardMinVideoBW = (sdpInfo) => {
    if (that.video && spec.hardMinVideoBW) {
      log.debug(`message: hardMinVideoBW, requested: ${spec.hardMinVideoBW}`);
      SdpHelpers.setParamForCodecs(sdpInfo, 'video', 'x-google-min-bitrate', spec.hardMinVideoBW);
    }
  };

  return that;
};

export default ChromeStableStack;
