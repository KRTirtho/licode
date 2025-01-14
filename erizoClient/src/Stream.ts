/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


import { EventDispatcher, StreamEvent } from './Events';
import { ConnectionHelpers, CommonMediaTrackConstraints } from './utils/ConnectionHelpers';
import Random from './utils/Random';
import VideoPlayer, { VideoPlayerElement, VideoPlayerNestedOptions } from './views/VideoPlayer';
import AudioPlayer, { AudioPlayerElement } from './views/AudioPlayer';
import { RTCStreamEvent } from './ErizoConnectionManager';
import { RTCNativeStream } from './webrtc-stacks/BaseStack';
import { Logger } from './utils/Logger';

const log = Logger.module('Stream');

export interface ErizoStreamOptions {
  stream: RTCNativeStream,
  url: string;
  recording: string;
  // TODO: Add ErizoRoom type
  room: any;
  showing: boolean;
  local: boolean;
  video: boolean | CommonMediaTrackConstraints;
  audio: boolean | CommonMediaTrackConstraints;
  screen: boolean;
  videoSize: number | [number, number, number, number];
  videoFrameRate: number;
  extensionId: string;
  desktopStreamId: string;
  audioMuted: boolean;
  videoMuted: boolean;
  maxVideoBW: number;
  maxAudioBW: number;
  unsubscribing: {
    callbackReceived: boolean,
    pcEventReceived: boolean,
  };
  streamID?: string;
  // TODO: Create Stream `spec.attributes` type
  attributes: Record<any, any>;
  data?: boolean;
  fake?: boolean;
  label?: string
}

export type MsgCb<T = string> = (msg?: T) => void;

// IDK why the type exists
export interface ErizoStreamCheckOptions extends Partial<ErizoStreamOptions> {
  slideShowMode?: boolean;
  muteStream?: {
    audio?: boolean;
    video?: boolean;
  };
  qualityLayer?: {
    spatialLayer?: number | unknown;
    temporalLayer?: number | unknown;
  };
  slideShowBelowLayer?: {
    enabled?: boolean,
    spatialLayer?: number | unknown
  }
}

export interface ErizoStream extends Partial<ErizoStreamOptions>, EventDispatcher {
  pc?: any;
  p2p?: boolean;
  player?: VideoPlayerElement | AudioPlayerElement
  ConnectionHelpers?: typeof ConnectionHelpers;
  elementID?: string | HTMLElement
  getLabel?(): string | void;
  getID?(): string | void;
  applySenderEncoderParameters?(): void;
  getAttributes?(): unknown;
  setAttributes?(attr: unknown): void;
  toLog?(): string
  updateLocalAttributes?(attr: Record<any, any>): void;
  hasAudio?(): boolean;
  hasVideo?(): boolean;
  hasData?(): boolean;
  hasScreen?(): boolean;
  hasMedia?(): boolean;
  isExternal?(): boolean;
  getMaxVideoBW?(): number | void;
  hasSimulcast?(): boolean;
  generateEncoderParameters?(): void;
  // TODO: Find/Create addPC argument types
  addPC?(pc?: any, p2pKey?: boolean, options?: any): void;
  sendData?(msg: string): void;
  init?(): void;
  close?(): void;
  play?(elementId: string, options?: VideoPlayerNestedOptions): void;
  stop?(): void;
  show?(elementId: string, options?: VideoPlayerNestedOptions): void;
  hide?(): void;
  getVideoFrameURL?(format?: string): string | null;
  getVideoFrame?(): ImageData | null | void;
  // TODO: Find types of qualityLayer.spatialLayer & qualityLayer.temporalLayer
  checkOptions?(configInput: ErizoStreamCheckOptions, isUpdate?: boolean): void;
  muteAudio?(isMuted: boolean, cb?: MsgCb): void
  muteVideo?(isMuted: boolean, cb?: MsgCb): void;
  _setStaticQualityLayer?(spatialLayer?: number | unknown, temporalLayer?: number | unknown, callback?: MsgCb): void;
  _setDynamicQualityLayer?(cb?: MsgCb): void;
  _enableSlideShowBelowSpatialLayer?(enabled?: boolean, spatialLayer?: number | unknown, cb?: MsgCb): void;
  _setMinSpatialLayer?: ErizoStream["_enableSlideShowBelowSpatialLayer"];
  // TODO: implement the type of `Room.publisherSide`
  disableHandlers?(handlers: string | string[], publisherSide: unknown): void;
  enableHandlers?(handlers: string | string[], publisherSide: unknown): void;
  updateSimulcastLayersBitrate?(bitrates: Record<string | number, number>): void;
  updateSimulcastActiveLayers?(layersInfo: Record<string | number, number>): void;
  updateConfiguration?(config: ErizoStreamCheckOptions, cb?: MsgCb): void
}

/*
 * Class Stream represents a local or a remote Stream in the Room. It will handle the WebRTC
 * stream and identify the stream and where it should be drawn.
 */
export const Stream = (altConnectionHelpers?: typeof ConnectionHelpers, specInput?: Partial<ErizoStreamOptions>) => {
  const spec: Partial<ErizoStreamOptions> = specInput ?? {};
  const that: ErizoStream = {
    ...EventDispatcher(/* spec */),
  };
  let limitMaxVideoBW: number;
  let limitMaxAudioBW: number;

  const defaultSimulcastSpatialLayers = 3;
  const scaleResolutionDownBase = 2;
  const scaleResolutionDownBaseScreenshare = 1;

  that.stream = spec?.stream;
  that.url = spec?.url;
  that.recording = spec?.recording;
  // that.room = undefined;
  that.showing = false;
  that.local = false;
  that.video = spec?.video;
  that.audio = spec?.audio;
  that.screen = spec?.screen;
  that.videoSize = spec?.videoSize;
  that.videoFrameRate = spec?.videoFrameRate;
  that.extensionId = spec?.extensionId;
  that.desktopStreamId = spec?.desktopStreamId;
  that.audioMuted = false;
  that.videoMuted = false;
  // that.maxVideoBW = undefined;
  // that.maxAudioBW = undefined;
  that.unsubscribing = {
    callbackReceived: false,
    pcEventReceived: false,
  };
  const videoSenderLicodeParameters: Record<string | number, RTCRtpEncodingParameters> = {};
  that.p2p = false;
  that.ConnectionHelpers =
    altConnectionHelpers === undefined ? ConnectionHelpers : altConnectionHelpers;
  if (that.url !== undefined) {
    spec.label = `ei_${Random.getRandomValue()}`;
  }
  const onStreamAddedToPC = (evt: RTCStreamEvent) => {
    if (evt.stream.id === that.getLabel?.()) {
      that.emit(StreamEvent({ type: 'added', stream: evt.stream }));
    }
  };

  const onStreamRemovedFromPC = (evt: RTCStreamEvent) => {
    if (evt.stream.id === that.getLabel?.()) {
      that.emit(StreamEvent({ type: 'removed', stream: that }));
    }
  };

  const onICEConnectionStateChange = (msg: string) => {
    that.emit(StreamEvent({ type: 'icestatechanged', msg }));
  };

  if (that.videoSize !== undefined &&
    (!(that.videoSize instanceof Array) ||
      that.videoSize.length !== 4)) {
    throw Error('Invalid Video Size');
  }
  if (spec.local === undefined || spec.local === true) {
    that.local = true;
  }

  const setMaxVideoBW = (maxVideoBW: number) => {
    if (that.local) {
      // Estimate codec bitrate from connection (with overhead) bitrate - source https://datatracker.ietf.org/doc/html/rfc8829
      // using 0.90 instead of 0.95 to allow more margin to our quality selection algorithms
      const translated = (maxVideoBW * 1000 * 0.90) - (50 * 40 * 8);
      log.info(`message: Setting maxVideoBW, streamId: ${that.getID?.()}, maxVideoBW: ${maxVideoBW}, translated: ${translated}`);
      that.maxVideoBW = translated;
      // Make sure all the current parameters respect the new limit
      if (videoSenderLicodeParameters) {
        Object.keys(videoSenderLicodeParameters).forEach((key) => {
          const senderParam = videoSenderLicodeParameters[key];
          senderParam.maxBitrate = that.maxVideoBW && senderParam.maxBitrate && senderParam.maxBitrate > that.maxVideoBW ?
            that.maxVideoBW : senderParam.maxBitrate;
        });
      }
    } else {
      that.maxVideoBW = maxVideoBW;
    }
  };

  const configureParameterForLayer = (layerParameters: RTCRtpEncodingParameters, layerConfig: RTCRtpEncodingParameters) => {
    const newParameters = layerParameters;
    newParameters.maxBitrate = layerConfig.maxBitrate;
    if (layerConfig.active !== undefined) {
      newParameters.active = layerConfig.active;
    }
    return newParameters;
  };

  that.applySenderEncoderParameters = () => {
    that.stream?.transceivers.forEach((transceiver) => {
      if (transceiver.sender && transceiver.sender.track?.kind === 'video') {
        const parameters = transceiver.sender.getParameters();
        Object.keys(videoSenderLicodeParameters).forEach((layerId) => {
          if (parameters.encodings[parseInt(layerId)] === undefined) {
            log.warning(`message: Failed Configure parameters for layer, layer: ${layerId}, config: ${videoSenderLicodeParameters[layerId]}`);
          } else {
            parameters.encodings[parseInt(layerId)] = configureParameterForLayer(
              parameters.encodings[parseInt(layerId)],
              videoSenderLicodeParameters[layerId]);
          }
        });
        transceiver.sender.setParameters(parameters)
          .then((result) => {
            log.debug(`message: Success setting simulcast layer configs, result: ${result}`);
          })
          .catch((e) => {
            log.warning(`message: Error setting simulcast layer configs, error: ${e}`);
          });
      }
    });
  };

  // TODO: Create types for simulcastConfig for `initializeEncoderParameters.args.simulcastConfig`
  const initializeEncoderParameters = (simulcastConfig: any) => {
    log.info('Initializing encoder simulcastConfig', simulcastConfig, 'MaxVideoBW is ', that.maxVideoBW);
    if (!simulcastConfig) {
      videoSenderLicodeParameters[0] = { maxBitrate: that.maxVideoBW }; // No simulcast
      return;
    }
    const layersToConfigure = simulcastConfig.numSpatialLayers;
    for (let index = 0; index < layersToConfigure; index += 1) {
      videoSenderLicodeParameters[index] = {};
    }
    if (that.maxVideoBW) {
      log.debug('Setting maxVideoBW', that.maxVideoBW);
      videoSenderLicodeParameters[layersToConfigure - 1].maxBitrate = that.maxVideoBW;
    }
  };

  // TODO: Find/Create types for `configureVideoStream.args.options`
  const configureVideoStream = (options: any) => {
    log.debug('configureVideoStream', options);
    limitMaxAudioBW = options.limitMaxAudioBW;
    limitMaxVideoBW = options.limitMaxVideoBW;
    if (options.maxVideoBW) {
      setMaxVideoBW(options.maxVideoBW);
    }
    if (that.local) {
      initializeEncoderParameters(options.simulcast);
    }
  };

  // Public functions
  that.getID = () => {
    return that.local && !spec.streamID ? "local" : spec.streamID;
  };

  that.getLabel = () => {
    if (that.stream && that.stream.id) {
      return that.stream.id;
    }
    return spec.label;
  };

  // Get attributes of this stream.
  that.getAttributes = () => spec.attributes;

  // Changes the attributes of this stream in the room.
  that.setAttributes = (attrs: Record<any, any>) => {
    if (that.local) {
      that.emit(StreamEvent({ type: 'internal-set-attributes', stream: that, attrs }));
      return;
    }
    log.error(`message: Failed to set attributes data, reason: Stream has not been published, ${that.toLog?.()}`);
  };

  that.toLog = () => {
    let info = `streamId: ${that.getID?.()}, label: ${that.getLabel?.()}`;
    if (spec.attributes) {
      // TODO: Determine attributes type
      const attrKeys = Object.keys(spec.attributes as any);
      attrKeys.forEach((attrKey) => {
        info = `${info}, ${attrKey}: ${(spec.attributes as any)[attrKey]}`;
      });
    }
    return info;
  };

  that.updateLocalAttributes = (attrs) => {
    spec.attributes = attrs;
  };

  // Indicates if the stream has audio activated
  that.hasAudio = () => spec.audio !== false && spec.audio !== undefined;

  // Indicates if the stream has video activated
  that.hasVideo = () => spec.video !== false && spec.video !== undefined;

  // Indicates if the stream has data activated
  that.hasData = () => spec.data !== false && spec.data !== undefined;

  // Indicates if the stream has screen activated
  that.hasScreen = () => spec.screen ?? false;

  that.hasMedia = () => !!(spec.audio || spec.video || spec.screen);

  that.isExternal = () => that.url !== undefined || that.recording !== undefined;

  that.getMaxVideoBW = () => that.maxVideoBW;
  that.hasSimulcast = () => Object.keys(videoSenderLicodeParameters).length > 1;

  that.generateEncoderParameters = () => {
    const nativeSenderParameters: RTCRtpEncodingParameters[] = [];
    const requestedLayers = Object.keys(videoSenderLicodeParameters).length ||
      defaultSimulcastSpatialLayers;
    const isScreenshare = that.hasScreen?.();
    const base = isScreenshare ? scaleResolutionDownBaseScreenshare : scaleResolutionDownBase;

    for (let layer = 1; layer <= requestedLayers; layer += 1) {
      const layerConfig = Object.assign({}, videoSenderLicodeParameters[layer - 1]);
      layerConfig.rid = (layer).toString();
      layerConfig.scaleResolutionDownBy = base ** (requestedLayers - layer);
      nativeSenderParameters.push(layerConfig);
    }
    return nativeSenderParameters;
  };

  that.addPC = (pc, p2pKey, options) => {
    if (p2pKey) {
      that.p2p = true;
      if (that.pc === undefined) {
        that.pc = new Map();
      }
      that.pc.add(p2pKey, pc);
      pc.on('ice-state-change', onICEConnectionStateChange);
      return;
    }
    if (that.pc) {
      that.pc.off('add-stream', onStreamAddedToPC);
      that.pc.off('remove-stream', onStreamRemovedFromPC);
      that.pc.off('ice-state-change', onICEConnectionStateChange);
    }
    that.pc = pc;
    that.pc.on('add-stream', onStreamAddedToPC);
    that.pc.on('remove-stream', onStreamRemovedFromPC);
    that.pc.on('ice-state-change', onICEConnectionStateChange);
    if (options) {
      configureVideoStream(options);
    }
  };

  // Sends data through this stream.
  that.sendData = (msg) => {
    if (that.local && that.hasData?.()) {
      that.emit(StreamEvent({ type: 'internal-send-data', stream: that, msg }));
      return;
    }
    log.error(`message: Failed to send data, reason: Stream has not been published, ${that.toLog?.()}`);
  };

  // Initializes the stream and tries to retrieve a stream from local video and audio
  // We need to call this method before we can publish it in the room.
  that.init = () => {
    try {
      if ((spec.audio || spec.video || spec.screen) && spec.url === undefined) {
        log.debug(`message: Requested access to local media, ${that.toLog?.()}`);
        let videoOpt = spec.video;
        if (videoOpt === true || spec.screen === true) {
          videoOpt = videoOpt === true || videoOpt === null ? {} : videoOpt;
          if (that.videoSize !== undefined && Array.isArray(that.videoSize)) {
            Object.assign(videoOpt, {
              width: {
                min: that.videoSize[0],
                max: that.videoSize[2],
              },
              height: {
                min: that.videoSize[1],
                max: that.videoSize[3],
              }
            })

          }

          if (that.videoFrameRate !== undefined && Array.isArray(that.videoFrameRate)) {
            Object.assign(videoOpt, {
              frameRate: {
                min: that.videoFrameRate[0],
                max: that.videoFrameRate[1],
              }
            })
          }
        } else if (spec.screen as boolean === true && videoOpt === undefined) {
          videoOpt = true;
        }
        const opt = {
          video: videoOpt,
          audio: spec.audio,
          fake: spec.fake,
          screen: spec.screen,
          extensionId: that.extensionId,
          desktopStreamId: that.desktopStreamId
        };

        that.ConnectionHelpers?.GetUserMedia(opt, (stream) => {
          log.debug(`message: User has granted access to local media, ${that.toLog?.()}`);
          that.stream = stream as RTCNativeStream; // SORRY 🙏 I had to

          that.dispatchEvent(StreamEvent({ type: 'access-accepted' }));
          const nativeStreamContainsVideo = that.stream.getVideoTracks().length > 0;
          const nativeStreamContainsAudio = that.stream.getAudioTracks().length > 0;
          if (!nativeStreamContainsAudio) {
            spec.audio = false;
          }
          if (!nativeStreamContainsVideo) {
            spec.video = false;
          }

          that.stream.getTracks().forEach((trackInput) => {
            log.debug(`message: getTracks, track: ${trackInput.kind}, ${that.toLog?.()}`);
            const track = trackInput;
            track.onended = () => {
              that.stream?.getTracks().forEach((secondTrackInput) => {
                const secondTrack = secondTrackInput;
                secondTrack.onended = null;
              });
              const streamEvent = StreamEvent({
                type: 'stream-ended',
                stream: that,
                msg: track.kind
              });
              that.dispatchEvent(streamEvent);
            };
          });
        }, (error: any) => {
          log.error(`message: Failed to get access to local media, ${that.toLog?.()}, error: ${error.name}, message: ${error.message}`);
          const streamEvent = StreamEvent({ type: 'access-denied', msg: error });
          that.dispatchEvent(streamEvent);
        });
      } else {
        const streamEvent = StreamEvent({ type: 'access-accepted' });
        that.dispatchEvent(streamEvent);
      }
    } catch (e: any) {
      log.error(`message: Failed to get access to local media, ${that.toLog?.()}, error: ${e}`);
      const streamEvent = StreamEvent({ type: 'access-denied', msg: e });
      that.dispatchEvent(streamEvent);
    }
  };


  that.close = () => {
    if (that.local) {
      if (that.room !== undefined) {
        that.room.unpublish(that);
      }
      // Remove HTML element
      that.hide?.();
      if (that.stream !== undefined) {
        that.stream.getTracks().forEach((trackInput) => {
          const track = trackInput;
          track.onended = null;
          track.stop();
        });
      }
      that.stream = undefined;
    }
    if (that.pc && !that.p2p) {
      that.pc.off('add-stream', onStreamAddedToPC);
      that.pc.off('remove-stream', onStreamRemovedFromPC);
      that.pc.off('ice-state-change', onICEConnectionStateChange);
    } else if (that.pc && that.p2p) {
      // TODO: Decide pc's type
      that.pc.forEach((pc: any) => {
        pc.off('add-stream', onStreamAddedToPC);
        pc.off('remove-stream', onStreamRemovedFromPC);
        pc.off('ice-state-change', onICEConnectionStateChange);
      });
    }
    that.removeAllListeners();
  };

  that.play = (elementID, optionsInput) => {
    const options = optionsInput || {};
    that.elementID = elementID;
    let player;
    const nativeStreamContainsVideo = that.stream && that.stream.getVideoTracks().length > 0;
    const nativeStreamContainsAudio = that.stream && that.stream.getAudioTracks().length > 0;
    if (nativeStreamContainsVideo && (that.hasVideo?.() || that.hasScreen?.())) {
      // Draw on HTML
      if (elementID !== undefined) {
        player = VideoPlayer({
          id: that.getID?.() as string,
          stream: that as any,
          elementID,
          options
        });
        that.player = player;
        that.showing = true;
      }
    } else if (nativeStreamContainsAudio && that.hasAudio?.()) {
      player = AudioPlayer({
        id: that.getID?.() as string,
        stream: that as any,
        elementID,
        options
      });
      that.player = player;
      that.showing = true;
    }
  };

  that.stop = () => {
    if (that.showing) {
      if (that.player !== undefined) {
        try {
          that.player.destroy();
        } catch (e: any) {
          log.warning(`message: Exception when destroying Player, error: ${e.message}, ${that.toLog?.()}`);
        }
        that.showing = false;
      }
    }
  };

  that.show = that.play;
  that.hide = that.stop;

  const getFrame = () => {
    if (that.player !== undefined && that.stream !== undefined) {
      const video = (that.player as VideoPlayerElement).video;
      const style = document.defaultView?.getComputedStyle(video);
      const width = parseInt(style?.getPropertyValue('width') ?? "0", 10);
      const height = parseInt(style?.getPropertyValue('height') ?? "0", 10);
      const left = parseInt(style?.getPropertyValue('left') ?? "0", 10);
      const top = parseInt(style?.getPropertyValue('top') ?? "0", 10);

      let div;
      if (typeof that.elementID === 'object' &&
        typeof that.elementID.appendChild === 'function') {
        div = that.elementID;
      } else {
        div = document.getElementById(that.elementID as string) as HTMLDivElement;
      }

      const divStyle = document.defaultView?.getComputedStyle(div);
      const divWidth = parseInt(divStyle?.getPropertyValue('width') ?? "0", 10);
      const divHeight = parseInt(divStyle?.getPropertyValue('height') ?? "0", 10);
      const canvas = document.createElement('canvas');

      canvas.id = 'testing';
      canvas.width = divWidth;
      canvas.height = divHeight;
      canvas.setAttribute('style', 'display: none');
      // document.body.appendChild(canvas);
      const context = canvas.getContext('2d');

      context?.drawImage(video, left, top, width, height);

      return canvas;
    }
    return null;
  };

  that.getVideoFrameURL = (format) => {
    const canvas = getFrame();
    if (canvas !== null) {
      if (format) {
        return canvas.toDataURL(format);
      }
      return canvas.toDataURL();
    }
    return null;
  };

  that.getVideoFrame = () => {
    const canvas = getFrame();
    if (canvas !== null) {
      return canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
    }
    return null;
  };

  that.checkOptions = (configInput, isUpdate) => {
    const config = configInput;
    // TODO: Check for any incompatible options
    if (config.maxVideoBW && config.maxVideoBW > limitMaxVideoBW) {
      config.maxVideoBW = limitMaxVideoBW;
    }
    if (config.maxAudioBW && config.maxAudioBW > limitMaxAudioBW) {
      config.maxAudioBW = limitMaxAudioBW;
    }
    if (isUpdate === true) { // We are updating the stream
      if (config.audio || config.screen) {
        log.warning(`message: Cannot update type of subscription, ${that.toLog?.()}`);
        config.audio = undefined;
        config.screen = undefined;
      }
    } else if (that.local === false) { // check what we can subscribe to
      if (config.video === true && that.hasVideo?.() === false) {
        log.warning(`message: Trying to subscribe to video when there is no video, ${that.toLog?.()}`);
        config.video = false;
      }
      if (config.audio === true && that.hasAudio?.() === false) {
        log.warning(`message: Trying to subscribe to audio when there is no audio, ${that.toLog?.()}`);
        config.audio = false;
      }
    }
    if (that.local === false) {
      if (!that.hasVideo?.() && (config.slideShowMode === true)) {
        log.warning(`message: Cannot enable slideShowMode without video, ${that.toLog?.()}`);
        config.slideShowMode = false;
      }
    }
  };

  const muteStream = (callback?: (msg?: string) => void) => {
    if (that.room && that.room.p2p) {
      log.warning(`message: muteAudio/muteVideo are not implemented in p2p streams, ${that.toLog?.()}`);
      callback?.('error');
      return;
    }
    if (!that.stream || !that.pc) {
      log.warning(`message: muteAudio/muteVideo cannot be called until a stream is published or subscribed, ${that.toLog?.()}`);
      callback?.('error');
    }
    if (!that.stream) return
    for (let index = 0; index < that.stream.getVideoTracks().length; index += 1) {
      const track = that.stream.getVideoTracks()[index];
      track.enabled = !that.videoMuted;
    }
    const config = { muteStream: { audio: that.audioMuted, video: that.videoMuted } };
    that.checkOptions?.(config, true);
    that.pc.updateSpec(config, that.getID?.(), callback);
  };

  that.muteAudio = (isMuted, callback) => {
    that.audioMuted = isMuted;
    muteStream(callback);
  };

  that.muteVideo = (isMuted, callback = () => { }) => {
    that.videoMuted = isMuted;
    muteStream(callback);
  };

  // eslint-disable-next-line no-underscore-dangle
  that._setStaticQualityLayer = (spatialLayer, temporalLayer, callback = () => { }) => {
    if (that.room && that.room.p2p) {
      log.warning(`message: setStaticQualityLayer is not implemented in p2p streams, ${that.toLog?.()}`);
      callback('error');
      return;
    }
    const config = { qualityLayer: { spatialLayer, temporalLayer } };
    that.checkOptions?.(config, true);
    that.pc.updateSpec(config, that.getID?.(), callback);
  };

  // eslint-disable-next-line no-underscore-dangle
  that._setDynamicQualityLayer = (callback) => {
    if (that.room && that.room.p2p) {
      log.warning(`message: setDynamicQualityLayer is not implemented in p2p streams, ${that.toLog?.()}`);
      callback?.('error');
      return;
    }
    const config = { qualityLayer: { spatialLayer: -1, temporalLayer: -1 } };
    that.checkOptions?.(config, true);
    that.pc.updateSpec(config, that.getID?.(), callback);
  };

  // eslint-disable-next-line no-underscore-dangle
  that._enableSlideShowBelowSpatialLayer = (enabled, spatialLayer = 0, callback = () => { }) => {
    if (that.room && that.room.p2p) {
      log.warning(`message: enableSlideShowBelowSpatialLayer is not implemented in p2p streams, ${that.toLog?.()}`);
      callback('error');
      return;
    }
    const config = { slideShowBelowLayer: { enabled, spatialLayer } };
    that.checkOptions?.(config, true);
    log.debug(`message: Calling updateSpec, ${that.toLog?.()}, config: ${JSON.stringify(config)}`);
    that.pc.updateSpec(config, that.getID?.(), callback);
  };

  // This is an alias to keep backwards compatibility
  // eslint-disable-next-line no-underscore-dangle
  that._setMinSpatialLayer = that._enableSlideShowBelowSpatialLayer.bind(this, true);

  const controlHandler = (handlersInput?: string[] | string, publisherSideInput?: unknown, enable?: boolean) => {
    let publisherSide = publisherSideInput;
    let handlers = handlersInput;
    if (publisherSide !== true) {
      publisherSide = false;
    }

    handlers = (typeof handlers === 'string') ? [handlers] : handlers;
    handlers = (handlers instanceof Array) ? handlers : [];

    if (handlers.length > 0) {
      that.room.sendControlMessage(that, 'control', {
        name: 'controlhandlers',
        enable,
        publisherSide,
        handlers
      });
    }
  };

  that.disableHandlers = (handlers, publisherSide) => {
    controlHandler(handlers, publisherSide, false);
  };

  that.enableHandlers = (handlers, publisherSide) => {
    controlHandler(handlers, publisherSide, true);
  };

  // TODO: Determine type of setEncodingConfig.args.values
  const setEncodingConfig = (field: keyof RTCRtpEncodingParameters, values: Record<string, any>, check?: <T = any>(value: T) => boolean) => {
    Object.keys(values).forEach((layerId) => {
      const value = values[layerId];
      if (!videoSenderLicodeParameters[layerId]) {
        log.warning(`Cannot set parameter ${field} for layer ${layerId}, it does not exist`);
      }
      if (check?.(value)) {
        Object.assign(videoSenderLicodeParameters, {
          [layerId]: {
            ...(videoSenderLicodeParameters[layerId]),
            [field]: value
          }
        })
      }
    });
  };

  that.updateSimulcastLayersBitrate = (bitrates) => {
    if (that.pc && that.local) {
      // limit with maxVideoBW
      const limitedBitrates = Object.assign({}, bitrates);
      Object.keys(limitedBitrates).forEach((key) => {
        // explicitly passing undefined means assigning the max for that layer
        if (that.maxVideoBW !== undefined && limitedBitrates[key] > that.maxVideoBW || limitedBitrates[key] === undefined) {
          log.info('message: updateSimulcastLayersBitrate defaulting to max bitrate,' +
            `, layer :${key}, requested: ${limitedBitrates[key]}, max: ${that.maxVideoBW}`);
          Object.assign(limitedBitrates, { [key]: that.maxVideoBW })
        }
      });
      setEncodingConfig('maxBitrate', limitedBitrates);
      that.applySenderEncoderParameters?.();
    }
  };

  that.updateSimulcastActiveLayers = (layersInfo) => {
    if (that.pc && that.local) {
      const ifIsBoolean = <T = boolean | number | string>(value: T) => typeof value === "boolean";
      setEncodingConfig('active', layersInfo, ifIsBoolean);
      that.applySenderEncoderParameters?.();
    }
  };

  that.updateConfiguration = (config, callback) => {
    if (config === undefined) { return; }
    if (that.pc) {
      that.checkOptions?.(config, true);
      if (that.local) {
        if (config.maxVideoBW) {
          setMaxVideoBW(config.maxVideoBW);
          that.applySenderEncoderParameters?.();
        }
        if (that.room.p2p) {
          for (let index = 0; index < that.pc.length; index += 1) {
            that.pc[index].updateSpec(config, that.getID?.(), callback);
          }
        } else {
          that.pc.updateSpec(config, that.getID?.(), callback);
          if (config.maxVideoBW) {
            setMaxVideoBW(config.maxVideoBW);
          }
        }
      } else {
        that.pc.updateSpec(config, that.getID?.(), callback);
      }
    } else {
      callback?.('This stream has no peerConnection attached, ignoring');
    }
  };

  return that;
};