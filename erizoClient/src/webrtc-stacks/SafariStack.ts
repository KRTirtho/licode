/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


import Logger from '../utils/Logger';
import ChromeStableStack, { RTCChromeStableStack, RTCChromeStableStackOptions } from './ChromeStableStack';

export interface RTCSafariStableStack extends RTCChromeStableStack {
  _updateTracksToBeNegotiatedFromStream(): void,
  tracksToBeNegotiated?: number
}

const log = Logger.module('SafariStack');
const SafariStack = (specInput: RTCChromeStableStackOptions): RTCSafariStableStack => {
  log.debug('message: Starting Safari stack');
  const that = ChromeStableStack(specInput);

  return {
    ...that,
    _updateTracksToBeNegotiatedFromStream: () => {
      if ((that as any).tracksToBeNegotiated) (that as any).tracksToBeNegotiated += 1;
    }
  };
};

export default SafariStack;
