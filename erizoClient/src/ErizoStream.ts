import { RTCStreamEvent } from "./ErizoConnectionManager";
import { EventDispatcher, StreamEvent } from "./Events";
import { Room } from "./Room";
import { ErizoStreamCheckOptions, ErizoStreamOptions, MsgCb } from "./Stream";
import { ConnectionHelpers, CommonMediaTrackConstraints } from "./utils/ConnectionHelpers";
import { Logger } from "./utils/Logger";
import Random from "./utils/Random";
import AudioPlayer, { AudioPlayerElement } from "./views/AudioPlayer";
import VideoPlayer, { VideoPlayerElement, VideoPlayerNestedOptions } from "./views/VideoPlayer";
import { RTCNativeStream } from "./webrtc-stacks/BaseStack";

const log = Logger.module("EStream");
export type ErizoStreamState = "unsubscribed" | "subscribed" | "unsubscribing" | "subscribing";

export class ErizoStream {
  p2p?: boolean = false;
  defaultSimulcastSpatialLayers: number = 3;
  scaleResolutionDownBase: number = 2
  scaleResolutionDownBaseScreenshare: number = 1;
  _setMinSpatialLayer = this._enableSlideShowBelowSpatialLayer.bind(this, true);
  videoSenderLicodeParameters: Record<string | number, RTCRtpEncodingParameters> = {};
  showing: boolean = false;
  local: boolean = false;
  unsubscribing: { callbackReceived: boolean; pcEventReceived: boolean; } = {
    callbackReceived: false,
    pcEventReceived: false,
  };
  private dispatcher = EventDispatcher();
  addEventListener = this.dispatcher.addEventListener;
  removeEventListener = this.dispatcher.removeEventListener;
  dispatchEvent = this.dispatcher.dispatchEvent;
  removeAllListeners = this.dispatcher.removeAllListeners;
  on = this.dispatcher.on;
  off = this.dispatcher.off;
  emit = this.dispatcher.emit;


  stream?: RTCNativeStream;
  url?: string;
  pc?: any;
  player?: VideoPlayerElement | AudioPlayerElement;
  ConnectionHelpers?: typeof ConnectionHelpers
  elementID?: string | HTMLElement;
  recording?: string;
  room?: Room;
  video?: boolean | CommonMediaTrackConstraints;
  audio?: boolean | CommonMediaTrackConstraints;
  screen?: boolean;
  videoSize?: number | [number, number, number, number];
  videoFrameRate?: number;
  extensionId?: string;
  desktopStreamId?: string;
  audioMuted: boolean = false;
  videoMuted: boolean = false;
  maxVideoBW?: number;
  maxAudioBW?: number;
  streamID?: string;
  attributes?: unknown;
  data?: boolean;
  fake?: boolean;
  limitMaxVideoBW?: number;
  limitMaxAudioBW?: number;

  // for setting later
  private _state: ErizoStreamState = "unsubscribed"
  get state(): ErizoStreamState { return this._state; }
  set state(status: ErizoStreamState) { this._state = status }

  // Outside usage
  private _failed: boolean = false;
  get failed(): boolean { return this._failed }
  set failed(failed: boolean) {
    this._failed = failed
  }

  // outside usage
  private _forceTurn = false;
  get forceTurn() { return this._forceTurn };
  set forceTurn(forceTurn: boolean) { this._forceTurn = forceTurn }

  constructor(public altConnectionHelpers: typeof ConnectionHelpers = ConnectionHelpers, protected spec: Partial<ErizoStreamOptions & { label: string }> = {}) {
    this.stream = spec?.stream;
    this.url = spec?.url;
    this.recording = spec?.recording;
    this.video = spec?.video;
    this.audio = spec?.audio;
    this.screen = spec?.screen;
    this.videoSize = spec?.videoSize;
    this.videoFrameRate = spec?.videoFrameRate;
    this.extensionId = spec?.extensionId;
    this.desktopStreamId = spec?.desktopStreamId;

    if (this.url !== undefined) {
      spec.label = `ei_${Random.getRandomValue()}`;
    }
    if (this.videoSize !== undefined &&
      (!(this.videoSize instanceof Array) ||
        this.videoSize.length !== 4)) {
      throw Error('Invalid Video Size');
    }
    if (spec.local === undefined || spec.local === true) {
      this.local = true;
    }
  }

  private onStreamAddedToPC(evt: RTCStreamEvent) {
    if (evt.stream.id === this.getLabel()) {
      this.emit(StreamEvent({ type: 'added', stream: evt.stream }));
    }
  }

  private onStreamRemovedFromPC(evt: RTCStreamEvent) {
    if (evt.stream.id === this.getLabel()) {
      this.emit(StreamEvent({ type: 'removed', stream: this }));
    }
  };

  private onICEConnectionStateChange(msg: string) {
    this.emit(StreamEvent({ type: 'icestatechanged', msg }));
  };




  private setMaxVideoBW(maxVideoBW: number) {
    if (this.local) {
      // Estimate codec bitrate from connection (with overhead) bitrate - source https://datatracker.ietf.org/doc/html/rfc8829
      // using 0.90 instead of 0.95 to allow more margin to our quality selection algorithms
      const translated = (maxVideoBW * 1000 * 0.90) - (50 * 40 * 8);
      log.info(`message: Setting maxVideoBW, streamId: ${this.getID()}, maxVideoBW: ${maxVideoBW}, translated: ${translated}`);
      this.maxVideoBW = translated;
      // Make sure all the current parameters respect the new limit
      if (this.videoSenderLicodeParameters) {
        Object.keys(this.videoSenderLicodeParameters).forEach((key) => {
          const senderParam = this.videoSenderLicodeParameters[key];
          senderParam.maxBitrate = this.maxVideoBW && senderParam.maxBitrate && senderParam.maxBitrate > this.maxVideoBW ?
            this.maxVideoBW : senderParam.maxBitrate;
        });
      }
    } else {
      this.maxVideoBW = maxVideoBW;
    }
  };

  private configureParameterForLayer(layerParameters: RTCRtpEncodingParameters, layerConfig: RTCRtpEncodingParameters) {
    const newParameters = layerParameters;
    newParameters.maxBitrate = layerConfig.maxBitrate;
    if (layerConfig.active !== undefined) {
      newParameters.active = layerConfig.active;
    }
    return newParameters;
  };

  private applySenderEncoderParameters() {
    this.stream?.transceivers.forEach((transceiver) => {
      if (transceiver.sender && transceiver.sender.track?.kind === 'video') {
        const parameters = transceiver.sender.getParameters();
        Object.keys(this.videoSenderLicodeParameters).forEach((layerId) => {
          if (parameters.encodings[parseInt(layerId)] === undefined) {
            log.warning(`message: Failed Configure parameters for layer, layer: ${layerId}, config: ${this.videoSenderLicodeParameters[layerId]}`);
          } else {
            parameters.encodings[parseInt(layerId)] = this.configureParameterForLayer(
              parameters.encodings[parseInt(layerId)],
              this.videoSenderLicodeParameters[layerId]);
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
  private initializeEncoderParameters(simulcastConfig: any) {
    log.info('Initializing encoder simulcastConfig', simulcastConfig, 'MaxVideoBW is ', this.maxVideoBW);
    if (!simulcastConfig) {
      this.videoSenderLicodeParameters[0] = { maxBitrate: this.maxVideoBW }; // No simulcast
      return;
    }
    const layersToConfigure = simulcastConfig.numSpatialLayers;
    for (let index = 0; index < layersToConfigure; index += 1) {
      this.videoSenderLicodeParameters[index] = {};
    }
    if (this.maxVideoBW) {
      log.debug('Setting maxVideoBW', this.maxVideoBW);
      this.videoSenderLicodeParameters[layersToConfigure - 1].maxBitrate = this.maxVideoBW;
    }
  };

  // TODO: Find/Create types for `configureVideoStream.args.options`
  private configureVideoStream(options: any) {
    log.debug('configureVideoStream', options);
    this.limitMaxAudioBW = options.limitMaxAudioBW;
    this.limitMaxVideoBW = options.limitMaxVideoBW;
    if (options.maxVideoBW) {
      this.setMaxVideoBW(options.maxVideoBW);
    }
    if (this.local) {
      this.initializeEncoderParameters(options.simulcast);
    }
  };

  // Public functions
  getID() {
    return this.local && !this.spec.streamID ? "local" : this.spec.streamID as string;
  };

  getLabel() {
    if (this.stream && this.stream.id) {
      return this.stream.id;
    }
    return this.spec.label;
  };

  // Get attributes of this stream.
  getAttributes = () => this.spec.attributes;

  // Changes the attributes of this stream in the room.
  setAttributes(attrs: Record<any, any>) {
    if (this.local) {
      this.emit(StreamEvent({ type: 'internal-set-attributes', stream: this, attrs }));
      return;
    }
    log.error(`message: Failed to set attributes data, reason: Stream has not been published, ${this.toLog()}`);
  };

  toLog() {
    let info = `streamId: ${this.getID()}, label: ${this.getLabel()}`;
    if (this.spec.attributes) {
      // TODO: Determine attributes type
      const attrKeys = Object.keys(this.spec.attributes as any);
      attrKeys.forEach((attrKey) => {
        info = `${info}, ${attrKey}: ${(this.spec.attributes as any)[attrKey]}`;
      });
    }
    return info;
  };

  updateLocalAttributes = (attrs: Record<any, any>) => {
    this.spec.attributes = attrs;
  };

  // Indicates if the stream has audio activated
  hasAudio() { return this.spec.audio !== false && this.spec.audio !== undefined; }

  // Indicates if the stream has video activated
  hasVideo() { return this.spec.video !== false && this.spec.video !== undefined; }

  // Indicates if the stream has data activated
  hasData() { return this.spec.data !== false && this.spec.data !== undefined; }

  // Indicates if the stream has screen activated
  hasScreen() { return this.spec.screen ?? false; }

  hasMedia() { return !!(this.spec.audio || this.spec.video || this.spec.screen); }

  isExternal() { return this.url !== undefined || this.recording !== undefined; }

  getMaxVideoBW() { return this.maxVideoBW; }
  hasSimulcast() { return Object.keys(this.videoSenderLicodeParameters).length > 1; }

  generateEncoderParameters() {
    const nativeSenderParameters: RTCRtpEncodingParameters[] = [];
    const requestedLayers = Object.keys(this.videoSenderLicodeParameters).length ||
      this.defaultSimulcastSpatialLayers;
    const isScreenshare = this.hasScreen();
    const base = isScreenshare ? this.scaleResolutionDownBaseScreenshare : this.scaleResolutionDownBase;

    for (let layer = 1; layer <= requestedLayers; layer += 1) {
      const layerConfig = Object.assign({}, this.videoSenderLicodeParameters[layer - 1]);
      layerConfig.rid = (layer).toString();
      layerConfig.scaleResolutionDownBy = base ** (requestedLayers - layer);
      nativeSenderParameters.push(layerConfig);
    }
    return nativeSenderParameters;
  };

  addPC(pc?: any, p2pKey?: boolean, options?: any) {
    if (p2pKey) {
      this.p2p = true;
      if (this.pc === undefined) {
        this.pc = new Map();
      }
      this.pc.add(p2pKey, pc);
      pc.on('ice-state-change', this.onICEConnectionStateChange);
      return;
    }
    if (this.pc) {
      this.pc.off('add-stream', this.onStreamAddedToPC);
      this.pc.off('remove-stream', this.onStreamRemovedFromPC);
      this.pc.off('ice-state-change', this.onICEConnectionStateChange);
    }
    this.pc = pc;
    this.pc.on('add-stream', this.onStreamAddedToPC);
    this.pc.on('remove-stream', this.onStreamRemovedFromPC);
    this.pc.on('ice-state-change', this.onICEConnectionStateChange);
    if (options) {
      this.configureVideoStream(options);
    }
  };

  // Sends data through this stream.
  sendData(msg: string) {
    if (this.local && this.hasData()) {
      this.emit(StreamEvent({ type: 'internal-send-data', stream: this, msg }));
      return;
    }
    log.error(`message: Failed to send data, reason: Stream has not been published, ${this.toLog()}`);
  };

  // Initializes the stream and tries to retrieve a stream from local video and audio
  // We need to call this method before we can publish it in the room.
  init() {
    try {
      if ((this.spec.audio || this.spec.video || this.spec.screen) && this.spec.url === undefined) {
        log.debug(`message: Requested access to local media, ${this.toLog()}`);
        let videoOpt = this.spec.video;
        if (videoOpt === true || this.spec.screen === true) {
          videoOpt = videoOpt === true || videoOpt === null ? {} : videoOpt;
          if (this.videoSize !== undefined && Array.isArray(this.videoSize)) {
            Object.assign(videoOpt, {
              width: {
                min: this.videoSize[0],
                max: this.videoSize[2],
              },
              height: {
                min: this.videoSize[1],
                max: this.videoSize[3],
              }
            })

          }

          if (this.videoFrameRate !== undefined && Array.isArray(this.videoFrameRate)) {
            Object.assign(videoOpt, {
              frameRate: {
                min: this.videoFrameRate[0],
                max: this.videoFrameRate[1],
              }
            })
          }
        } else if (this.spec.screen as boolean === true && videoOpt === undefined) {
          videoOpt = true;
        }
        const opt = {
          video: videoOpt,
          audio: this.spec.audio,
          fake: this.spec.fake,
          screen: this.spec.screen,
          extensionId: this.extensionId,
          desktopStreamId: this.desktopStreamId
        };

        this.ConnectionHelpers?.GetUserMedia(opt, (stream) => {
          log.debug(`message: User has granted access to local media, ${this.toLog()}`);
          this.stream = stream as RTCNativeStream; // SORRY 🙏 I had to

          this.dispatchEvent(StreamEvent({ type: 'access-accepted' }));
          const nativeStreamContainsVideo = this.stream.getVideoTracks().length > 0;
          const nativeStreamContainsAudio = this.stream.getAudioTracks().length > 0;
          if (!nativeStreamContainsAudio) {
            this.spec.audio = false;
          }
          if (!nativeStreamContainsVideo) {
            this.spec.video = false;
          }

          this.stream.getTracks().forEach((trackInput) => {
            log.debug(`message: getTracks, track: ${trackInput.kind}, ${this.toLog()}`);
            const track = trackInput;
            track.onended = () => {
              this.stream?.getTracks().forEach((secondTrackInput) => {
                const secondTrack = secondTrackInput;
                secondTrack.onended = null;
              });
              const streamEvent = StreamEvent({
                type: 'stream-ended',
                stream: this,
                msg: track.kind
              });
              this.dispatchEvent(streamEvent);
            };
          });
        }, (error: any) => {
          log.error(`message: Failed to get access to local media, ${this.toLog()}, error: ${error.name}, message: ${error.message}`);
          const streamEvent = StreamEvent({ type: 'access-denied', msg: error });
          this.dispatchEvent(streamEvent);
        });
      } else {
        const streamEvent = StreamEvent({ type: 'access-accepted' });
        this.dispatchEvent(streamEvent);
      }
    } catch (e: any) {
      log.error(`message: Failed to get access to local media, ${this.toLog()}, error: ${e}`);
      const streamEvent = StreamEvent({ type: 'access-denied', msg: e });
      this.dispatchEvent(streamEvent);
    }
  };


  close() {
    if (this.local) {
      if (this.room !== undefined) {
        this.room.unpublish(this);
      }
      // Remove HTML element
      this.hide();
      if (this.stream !== undefined) {
        this.stream.getTracks().forEach((trackInput) => {
          const track = trackInput;
          track.onended = null;
          track.stop();
        });
      }
      this.stream = undefined;
    }
    if (this.pc && !this.p2p) {
      this.pc.off('add-stream', this.onStreamAddedToPC);
      this.pc.off('remove-stream', this.onStreamRemovedFromPC);
      this.pc.off('ice-state-change', this.onICEConnectionStateChange);
    } else if (this.pc && this.p2p) {
      // TODO: Decide pc's type
      this.pc.forEach((pc: any) => {
        pc.off('add-stream', this.onStreamAddedToPC);
        pc.off('remove-stream', this.onStreamRemovedFromPC);
        pc.off('ice-state-change', this.onICEConnectionStateChange);
      });
    }
    this.removeAllListeners();
  };

  play(elementID: string, optionsInput?: VideoPlayerNestedOptions) {
    const options = optionsInput || {};
    this.elementID = elementID;
    let player;
    const nativeStreamContainsVideo = this.stream && this.stream.getVideoTracks().length > 0;
    const nativeStreamContainsAudio = this.stream && this.stream.getAudioTracks().length > 0;
    if (nativeStreamContainsVideo && (this.hasVideo() || this.hasScreen())) {
      // Draw on HTML
      if (elementID !== undefined) {
        player = VideoPlayer({
          id: this.getID() as string,
          stream: this,
          elementID,
          options
        });
        this.player = player;
        this.showing = true;
      }
    } else if (nativeStreamContainsAudio && this.hasAudio()) {
      player = AudioPlayer({
        id: this.getID() as string,
        stream: this,
        elementID,
        options
      });
      this.player = player;
      this.showing = true;
    }
  };

  stop() {
    if (this.showing) {
      if (this.player !== undefined) {
        try {
          this.player.destroy();
        } catch (e: any) {
          log.warning(`message: Exception when destroying Player, error: ${e.message}, ${this.toLog()}`);
        }
        this.showing = false;
      }
    }
  };

  show = this.play;
  hide = this.stop;

  private getFrame() {
    if (this.player !== undefined && this.stream !== undefined) {
      const video = (this.player as VideoPlayerElement).video;
      const style = document.defaultView?.getComputedStyle(video);
      const width = parseInt(style?.getPropertyValue('width') ?? "0", 10);
      const height = parseInt(style?.getPropertyValue('height') ?? "0", 10);
      const left = parseInt(style?.getPropertyValue('left') ?? "0", 10);
      const top = parseInt(style?.getPropertyValue('top') ?? "0", 10);

      let div;
      if (typeof this.elementID === 'object' &&
        typeof this.elementID.appendChild === 'function') {
        div = this.elementID;
      } else {
        div = document.getElementById(this.elementID as string) as HTMLDivElement;
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

  getVideoFrameURL(format?: string) {
    const canvas = this.getFrame();
    if (canvas !== null) {
      if (format) {
        return canvas.toDataURL(format);
      }
      return canvas.toDataURL();
    }
    return null;
  };

  getVideoFrame() {
    const canvas = this.getFrame();
    if (canvas !== null) {
      return canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
    }
    return null;
  };

  checkOptions(configInput: ErizoStreamCheckOptions, isUpdate?: boolean) {
    const config = configInput;
    // TODO: Check for any incompatible options
    if (config.maxVideoBW && this.limitMaxVideoBW && config.maxVideoBW > this.limitMaxVideoBW) {
      config.maxVideoBW = this.limitMaxVideoBW;
    }
    if (config.maxAudioBW && this.limitMaxAudioBW && config.maxAudioBW > this.limitMaxAudioBW) {
      config.maxAudioBW = this.limitMaxAudioBW;
    }
    if (isUpdate === true) { // We are updating the stream
      if (config.audio || config.screen) {
        log.warning(`message: Cannot update type of subscription, ${this.toLog()}`);
        config.audio = undefined;
        config.screen = undefined;
      }
    } else if (this.local === false) { // check what we can subscribe to
      if (config.video === true && this.hasVideo() === false) {
        log.warning(`message: Trying to subscribe to video when there is no video, ${this.toLog()}`);
        config.video = false;
      }
      if (config.audio === true && this.hasAudio() === false) {
        log.warning(`message: Trying to subscribe to audio when there is no audio, ${this.toLog()}`);
        config.audio = false;
      }
    }
    if (this.local === false) {
      if (!this.hasVideo() && (config.slideShowMode === true)) {
        log.warning(`message: Cannot enable slideShowMode without video, ${this.toLog()}`);
        config.slideShowMode = false;
      }
    }
  };

  private muteStream(callback?: (msg?: string) => void) {
    if (this.room && this.room.p2p) {
      log.warning(`message: muteAudio/muteVideo are not implemented in p2p streams, ${this.toLog()}`);
      callback?.('error');
      return;
    }
    if (!this.stream || !this.pc) {
      log.warning(`message: muteAudio/muteVideo cannot be called until a stream is published or subscribed, ${this.toLog()}`);
      callback?.('error');
    }
    if (!this.stream) return
    for (let index = 0; index < this.stream.getVideoTracks().length; index += 1) {
      const track = this.stream.getVideoTracks()[index];
      track.enabled = !this.videoMuted;
    }
    const config = { muteStream: { audio: this.audioMuted, video: this.videoMuted } };
    this.checkOptions(config, true);
    this.pc.updateSpec(config, this.getID(), callback);
  };

  muteAudio(isMuted: boolean, callback?: MsgCb) {
    this.audioMuted = isMuted;
    this.muteStream(callback);
  };

  muteVideo(isMuted: boolean, callback?: MsgCb) {
    this.videoMuted = isMuted;
    this.muteStream(callback);
  };

  // eslint-disable-next-line no-underscore-dangle
  _setStaticQualityLayer(spatialLayer?: number | unknown, temporalLayer?: number | unknown, callback?: MsgCb) {
    if (this.room && this.room.p2p) {
      log.warning(`message: setStaticQualityLayer is not implemented in p2p streams, ${this.toLog()}`);
      callback?.('error');
      return;
    }
    const config = { qualityLayer: { spatialLayer, temporalLayer } };
    this.checkOptions(config, true);
    this.pc.updateSpec(config, this.getID(), callback);
  }

  // eslint-disable-next-line no-underscore-dangle
  _setDynamicQualityLayer(callback?: MsgCb) {
    if (this.room && this.room.p2p) {
      log.warning(`message: setDynamicQualityLayer is not implemented in p2p streams, ${this.toLog()}`);
      callback?.('error');
      return;
    }
    const config = { qualityLayer: { spatialLayer: -1, temporalLayer: -1 } };
    this.checkOptions(config, true);
    this.pc.updateSpec(config, this.getID(), callback);
  };

  // eslint-disable-next-line no-underscore-dangle
  _enableSlideShowBelowSpatialLayer(enabled?: boolean, spatialLayer?: number | unknown, callback?: MsgCb) {
    if (this.room && this.room.p2p) {
      log.warning(`message: enableSlideShowBelowSpatialLayer is not implemented in p2p streams, ${this.toLog()}`);
      callback?.('error');
      return;
    }
    const config = { slideShowBelowLayer: { enabled, spatialLayer } };
    this.checkOptions(config, true);
    log.debug(`message: Calling updateSpec, ${this.toLog()}, config: ${JSON.stringify(config)}`);
    this.pc.updateSpec(config, this.getID(), callback);
  };

  private controlHandler(handlersInput?: string[] | string, publisherSideInput?: unknown, enable?: boolean) {
    let publisherSide = publisherSideInput;
    let handlers = handlersInput;
    if (publisherSide !== true) {
      publisherSide = false;
    }

    handlers = (typeof handlers === 'string') ? [handlers] : handlers;
    handlers = (handlers instanceof Array) ? handlers : [];

    if (handlers.length > 0) {
      this.room?.sendControlMessage(this, 'control', {
        name: 'controlhandlers',
        enable,
        publisherSide,
        handlers
      });
    }
  };

  disableHandlers(handlers: string | string[], publisherSide: unknown) {
    this.controlHandler(handlers, publisherSide, false);
  };

  enableHandlers(handlers: string | string[], publisherSide: unknown) {
    this.controlHandler(handlers, publisherSide, true);
  };

  // TODO: Determine type of setEncodingConfig.args.values
  private setEncodingConfig(field: keyof RTCRtpEncodingParameters, values: Record<string, any>, check?: <T = any>(value: T) => boolean) {
    Object.keys(values).forEach((layerId) => {
      const value = values[layerId];
      if (!this.videoSenderLicodeParameters[layerId]) {
        log.warning(`Cannot set parameter ${field} for layer ${layerId}, it does not exist`);
      }
      if (check?.(value)) {
        // this.videoSenderLicodeParameters[layerId][field] = value;
        Object.assign(this.videoSenderLicodeParameters, {
          [layerId]: {
            ...(this.videoSenderLicodeParameters[layerId]),
            [field]: value
          }
        })
      }
    });
  };

  updateSimulcastLayersBitrate(bitrates: Record<string | number, number>) {
    if (this.pc && this.local) {
      // limit with maxVideoBW
      const limitedBitrates = Object.assign({}, bitrates);
      Object.keys(limitedBitrates).forEach((key) => {
        // explicitly passing undefined means assigning the max for this layer
        if (this.maxVideoBW !== undefined && limitedBitrates[key] > this.maxVideoBW || limitedBitrates[key] === undefined) {
          log.info('message: updateSimulcastLayersBitrate defaulting to max bitrate,' +
            `, layer :${key}, requested: ${limitedBitrates[key]}, max: ${this.maxVideoBW}`);
          Object.assign(limitedBitrates, { [key]: this.maxVideoBW })
        }
      });
      this.setEncodingConfig('maxBitrate', limitedBitrates);
      this.applySenderEncoderParameters();
    }
  };

  updateSimulcastActiveLayers(layersInfo: Record<string | number, number>) {
    if (this.pc && this.local) {
      const ifIsBoolean = <T = boolean | number | string>(value: T) => typeof value === "boolean";
      this.setEncodingConfig('active', layersInfo, ifIsBoolean);
      this.applySenderEncoderParameters();
    }
  };

  updateConfiguration(config: ErizoStreamCheckOptions, callback?: MsgCb) {
    if (config === undefined) { return; }
    if (this.pc) {
      this.checkOptions(config, true);
      if (this.local) {
        if (config.maxVideoBW) {
          this.setMaxVideoBW(config.maxVideoBW);
          this.applySenderEncoderParameters();
        }
        if (this.room?.p2p) {
          for (let index = 0; index < this.pc.length; index += 1) {
            this.pc[index].updateSpec(config, this.getID(), callback);
          }
        } else {
          this.pc.updateSpec(config, this.getID(), callback);
          if (config.maxVideoBW) {
            this.setMaxVideoBW(config.maxVideoBW);
          }
        }
      } else {
        this.pc.updateSpec(config, this.getID(), callback);
      }
    } else {
      callback?.('This stream has no peerConnection attached, ignoring');
    }
  };
}