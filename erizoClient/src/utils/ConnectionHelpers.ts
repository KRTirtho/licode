/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


import { Logger } from './Logger';

const log = Logger.module('ConnectionHelpers');

const getBrowser = () => {
  let browser = 'none';

  if ((typeof module !== 'undefined' && module.exports)) {
    browser = 'fake';
  } else if (window.navigator.userAgent.match('Firefox') !== null) {
    // Firefox
    browser = 'mozilla';
  } else if (window.navigator.userAgent.match('Chrome') !== null) {
    browser = 'chrome-stable';
    if (window.navigator.userAgent.match('Electron') !== null) {
      browser = 'electron';
    }
  } else if (window.navigator.userAgent.match('Safari') !== null) {
    browser = 'safari';
  } else if (window.navigator.userAgent.match('AppleWebKit') !== null) {
    browser = 'safari';
  }
  return browser;
};

export interface CommonMediaTrackConstraints extends MediaTrackConstraints {
  mandatory?: {
    chromeMediaSource?: string | 'desktop',
    chromeMediaSourceId?: string,
  }
  mediaSource?: 'window' | 'screen'
}

export interface CommonMediaStreamConstraints {
  audio?: boolean | CommonMediaTrackConstraints,
  video?: boolean | CommonMediaTrackConstraints,
  desktopStreamId?: string;
  extensionId?: string;
  screen?: boolean
  fake?: boolean
}


const GetUserMedia = (config: CommonMediaStreamConstraints, callback?: (stream: MediaStream) => void, error?: <T>(err?: T) => void) => {
  let screenConfig: CommonMediaStreamConstraints = {};

  const getUserMedia = (userMediaConfig: MediaStreamConstraints, cb?: (stream: MediaStream) => void, errorCb?: (error: Error) => void) => {
    navigator.mediaDevices.getUserMedia(userMediaConfig).then(cb).catch(errorCb);
  };

  const getDisplayMedia = (userMediaConfig: DisplayMediaStreamConstraints, cb?: (stream: MediaStream) => void, errorCb?: (error: Error) => void) => {
    navigator.mediaDevices.getDisplayMedia(userMediaConfig).then(cb).catch(errorCb);
  };

  const configureScreensharing = () => {
    switch (getBrowser()) {
      case 'electron':
        log.debug('message: Screen sharing in Electron');
        if (typeof config.video === "object") Object.assign(screenConfig, {
          video: {
            ...config.video,
            mandatory: {
              ...config?.video?.mandatory,
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: config.desktopStreamId,
            }
          }
        })

        getUserMedia(screenConfig, callback, error);
        break;
      case 'mozilla':
        log.debug('message: Screen sharing in Firefox');
        screenConfig = {};
        if (config.video !== undefined) {
          screenConfig.video = config.video;
          if (typeof screenConfig.video === "object" && !screenConfig.video.mediaSource) {
            screenConfig.video.mediaSource = 'window' || 'screen';
          }
        } else {
          screenConfig = {
            audio: config.audio,
            video: { mediaSource: 'window' || 'screen' },
          };
        }
        getUserMedia(screenConfig, callback, error);
        break;

      case 'chrome-stable':
        log.debug('message: Screen sharing in Chrome');
        screenConfig = {};
        if (config.desktopStreamId && typeof config.video === "object") {
          Object.assign(screenConfig, {
            video: {
              ...config.video,
              mandatory: {
                ...config?.video?.mandatory,
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: config.desktopStreamId,
              }
            }
          })
          getUserMedia(screenConfig, callback, error);
        } else {
          // Default extensionId - this extension is only usable in our server,
          // please make your own extension based on the code in
          // erizo_controller/erizoClient/extras/chrome-extension
          let extensionId = 'okeephmleflklcdebijnponpabbmmgeo';
          if (config.extensionId) {
            log.debug(`message: extensionId supplied, extensionId: ${config.extensionId}`);
            extensionId = config.extensionId;
          }
          log.debug('message: Screen access on chrome stable looking for extension');
          try {
            chrome.runtime.sendMessage(extensionId, { getStream: true },
              (response) => {
                if (response === undefined) {
                  log.error('message: Access to screen denied');
                  const theError = { code: 'Access to screen denied' };
                  error?.(theError);
                  return;
                }
                const theId = response.streamId;
                if (typeof config.video === "object" && config.video?.mandatory !== undefined) {
                  Object.assign(screenConfig, {
                    video: {
                      ...config.video,
                      mandatory: {
                        ...config?.video?.mandatory,
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: theId.desktopStreamId,
                      }
                    }
                  })
                } else {
                  screenConfig = {
                    video: {
                      mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: theId
                      }
                    }
                  };
                }
                getUserMedia(screenConfig, callback, error);
              });
          } catch (e) {
            log.debug('message: Screensharing plugin is not accessible');
            const theError = { code: 'no_plugin_present' };
            error?.(theError);
          }
        }
        break;
      default:
        log.error('message: This browser does not support ScreenSharing');
    }
  };

  if (config.screen) {
    if (config.desktopStreamId || config.extensionId) {
      log.debug('message: Screen access requested using GetUserMedia');
      configureScreensharing();
    } else {
      log.debug('message: Screen access requested using GetDisplayMedia');
      getDisplayMedia(config, callback, error);
    }
  } else if (typeof module !== 'undefined' && module.exports) {
    log.error('message: Video/audio streams not supported in erizofc yet');
  } else {
    log.debug(`message: Calling getUserMedia, config: ${JSON.stringify(config)}`);
    getUserMedia(config, callback, error);
  }
};


export const ConnectionHelpers = { GetUserMedia, getBrowser };
