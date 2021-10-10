/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


import { ErizoConnectionManager, ErizoConnection } from './ErizoConnectionManager';
import { ConnectionHelpers as PreConnectionHelper } from './utils/ConnectionHelpers';
import { StreamEvent, RoomEvent, EventDispatcherClass, LicodeEventSpec, StreamEventSpec } from './Events';
import { Socket } from './Socket';
import io from "socket.io-client"
import { ErizoStreamOptions } from './Stream';
import ErizoMap from './utils/ErizoMap';
import { Base64 } from './utils/Base64';
import { Logger } from './utils/Logger';
import { ErizoStream } from './ErizoStream';
import { RTCNativeStream } from './webrtc-stacks/BaseStack';

const log = Logger.module('Room');

export interface RoomOptions {
  disableIceRestart?: boolean;
  singlePC?: boolean;
  maxAudioBW?: number;
  maxVideoBW?: number;
  defaultVideoBW?: number;
  token?: string
}

export interface SocketPublishEventData {
  streamId: string;
  peerSocket: boolean;
};

export interface RoomStreamsConstrains {
  metadata?: Record<any, any>;
  createOffer?: boolean;
  muteStream?: {
    audio: boolean;
    video: boolean;
  };
  encryptTransport?: any;
  limitMaxVideoBW?: number;
  maxVideoBW?: number;
  limitMaxAudioBW?: number;
  forceTurn?: boolean;
  simulcast?: boolean;
  handlerProfile?: string[] | null;
  minVideoBW?: number;
  maxAudioBW?: number;
  scheme?: unknown;
  data?: any;
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
  slideShowMode?: boolean;
}

export type PassOrFailCB<T = any, E = any> = (msg?: T, error?: E) => void;

/**
 * Class Room represents a Licode Room. It will handle the connection, local stream publication and remote stream subscription.
 * Typical Room initialization would be:
 * ```js
 * var room = Erizo.Room({token:'213h8012hwduahd-321ueiwqewq'});
 * ```
 * It also handles RoomEvents and StreamEvents. For example:
 * Event `'room-connected'` points out that the user has been successfully connected to the room.
 * 
 * Event `'room-disconnected'` shows that the user has been already disconnected.
 * 
 * Event `'stream-added'` indicates that there is a new stream available in the room.
 * 
 * Event `'stream-removed'` shows that a previous available stream has been removed from the room.
 */
export class Room extends EventDispatcherClass {
  // Defined properties
  DISCONNECTED = 0;
  CONNECTING = 1;
  CONNECTED = 2;
  remoteStreams = ErizoMap<string, ErizoStream>();
  localStreams = ErizoMap<string, ErizoStream>();
  roomID = '';
  state = this.DISCONNECTED;
  p2p = false;
  minConnectionQualityLevel = '';

  // declared vars
  disableIceRestart: boolean;
  socket?: Socket;
  iceServers?: RTCIceServer[]
  clientIntiatedDisconnection?: boolean;
  streamPriorityStrategy?: string;
  connectionTargetBw?: number;


  constructor(
    public altIo: typeof io,
    public ConnectionHelpers: typeof PreConnectionHelper = PreConnectionHelper,
    public erizoConnectionManager: ErizoConnectionManager = new ErizoConnectionManager(),
    public spec?: RoomOptions
  ) {
    super()
    this.disableIceRestart = !!spec?.disableIceRestart;
    this.socket = new Socket(altIo);

    // event listeners
    this.on('room-disconnected', this.clearAll);

    this.socket.on('onAddStream', this.socketEventToArgs.bind(null, this.socketOnAddStream));
    this.socket.on('stream_message_erizo', this.socketEventToArgs.bind(null, this.socketOnStreamMessageFromErizo));
    this.socket.on('stream_message_p2p', this.socketEventToArgs.bind(null, this.socketOnStreamMessageFromP2P));
    this.socket.on('connection_message_erizo', this.socketEventToArgs.bind(null, this.socketOnConnectionMessageFromErizo));
    this.socket.on('publish_me', this.socketEventToArgs.bind(null, this.socketOnPublishMe));
    this.socket.on('unpublish_me', this.socketEventToArgs.bind(null, this.socketOnUnpublishMe));
    this.socket.on('onBandwidthAlert', this.socketEventToArgs.bind(null, this.socketOnBandwidthAlert));
    this.socket.on('onDataStream', this.socketEventToArgs.bind(null, this.socketOnDataStream));
    this.socket.on('onUpdateAttributeStream', this.socketEventToArgs.bind(null, this.socketOnUpdateAttributeStream));
    this.socket.on('onRemoveStream', this.socketEventToArgs.bind(null, this.socketOnRemoveStream));
    this.socket.on('disconnect', this.socketEventToArgs.bind(null, this.socketOnDisconnect));
    this.socket.on('reconnecting', this.socketEventToArgs.bind(null, this.socketOnReconnecting));
    this.socket.on('reconnected', this.socketEventToArgs.bind(null, this.socketOnReconnected));
    this.socket.on('connection_failed', this.socketEventToArgs.bind(null, this.socketOnICEConnectionFailed));
    this.socket.on('error', this.socketEventToArgs.bind(null, this.socketOnError));
  };

  // Private functions
  private toLog() {
    return `roomId: ${this.roomID.length > 0 ? this.roomID : 'undefined'}`
  };

  private removeStream = (streamInput: ErizoStream) => {
    const stream = streamInput;
    stream.removeAllListeners();

    if (stream.pc && !this.p2p) {
      stream.pc.removeStream(stream);
    }

    log.debug(`message: Removed stream, ${stream.toLog()}, ${this.toLog()}`);
    if (stream.stream) {
      // Remove HTML element
      stream.hide();

      stream.stop();
      stream.close();
      delete stream.stream;
    }

    // Close PC stream
    if (stream.pc) {
      if (stream.local && this.p2p) {
        stream.pc.forEach((connection: ErizoConnection, id: number) => {
          connection.close();
          stream.pc.remove(id);
        });
      } else {
        this.erizoConnectionManager.maybeCloseConnection(stream.pc);
        delete stream.pc;
      }
    }
  };

  private dispatchStreamSubscribed(streamInput: ErizoStream, evt: { stream: RTCNativeStream }) {
    const stream = streamInput;
    // Draw on html
    log.info(`message: Stream subscribed, ${stream.toLog()}, ${this.toLog()}`);
    stream.stream = evt.stream;
    if (!this.p2p) {
      stream.pc.addStream(stream);
    }
    stream.state = 'subscribed';
    const evt2 = StreamEvent({ type: 'stream-subscribed', stream });
    this.dispatchEvent(evt2);
  };

  private maybeDispatchStreamUnsubscribed(streamInput: ErizoStream) {
    const stream = streamInput;
    log.debug(`message: Unsubscribing Stream, ${stream.toLog()}, unsubscribing: ${stream.unsubscribing}, ${this.toLog()}`);
    // IDK, how stream has a failed prop when it clearly doesn't😑
    if (stream && stream.unsubscribing.callbackReceived &&
      (stream.unsubscribing.pcEventReceived || (stream as any).failed)) {
      log.info(`message: Stream fully unsubscribed, ${stream.toLog()}, ${this.toLog()}`);
      stream.unsubscribing.callbackReceived = false;
      stream.unsubscribing.pcEventReceived = false;
      this.removeStream(stream);
      delete (stream as any).failed;
      Object.assign(stream, { state: "unsubscribed" })
      const evt2 = StreamEvent({ type: 'stream-unsubscribed', stream });
      this.dispatchEvent(evt2);
    } else {
      log.debug(`message: Not dispatching stream unsubscribed yet, ${stream.toLog()}, ${this.toLog()}`);
    }
  };

  private onStreamFailed(streamInput: ErizoStream, message?: string, origin = 'unknown', wasAbleToConnect = false) {
    const stream = streamInput;
    if (this.state !== this.DISCONNECTED && stream && !stream.failed) {
      stream.failed = true;

      const streamFailedEvt = StreamEvent(
        {
          type: 'stream-failed',
          msg: message || 'Stream failed after connection',
          stream,
          origin,
          wasAbleToConnect
        });
      this.dispatchEvent(streamFailedEvt);
      const connection = stream.pc;

      if (stream.local) {
        this.unpublish(stream);
      } else if (stream.unsubscribing.callbackReceived) {
        this.maybeDispatchStreamUnsubscribed(stream);
      } else {
        this.unsubscribe(stream);
      }

      if (connection && this.spec?.singlePC) {
        this.erizoConnectionManager.maybeCloseConnection(connection, true);
      }
    }
  };


  private getP2PConnectionOptions(stream: ErizoStream, peerSocket: boolean) {
    const options = {
      callback: ((msg: string, streamIds: string[]) => {
        this.socket?.sendSDP('streamMessageP2P', {
          streamId: stream.getID(),
          streamIds,
          peerSocket,
          msg
        });
      }).bind(this),
      audio: stream.hasAudio(),
      video: stream.hasVideo(),
      iceServers: this.iceServers,
      maxAudioBW: stream.maxAudioBW,
      maxVideoBW: stream.maxVideoBW,
      limitMaxAudioBW: this.spec?.maxAudioBW,
      limitMaxVideoBW: this.spec?.maxVideoBW,
      // TODO: How! Why! HTF it Stream has forceTurn!! FIX IT ASAP
      forceTurn: (stream as any).forceTurn,
      p2p: true,
      disableIceRestart: this.disableIceRestart,
    };
    return options;
  };

  // TODO: The type of peerSocket is set to Erizo's Socket instance but  it can something else
  private createRemoteStreamP2PConnection(stream: ErizoStream, peerSocket: boolean) {
    const connectionOptions = this.getP2PConnectionOptions(stream, peerSocket);
    const connection = this.erizoConnectionManager.getOrBuildErizoConnection(connectionOptions);
    stream.addPC(connection, false, connectionOptions);
    connection.on('connection-failed', this.dispatchEvent.bind(this));
    stream.on('added', this.dispatchStreamSubscribed.bind(null, stream));
    stream.on('icestatechanged', (evt: any) => {
      log.debug(`message: icestatechanged, ${stream.toLog()}, iceConnectionState: ${evt.msg.state}, ${this.toLog()}`);
      if (evt.msg.state === 'failed') {
        const message = 'ICE Connection Failed';
        this.onStreamFailed(stream, message, 'ice-client', evt.msg.wasAbleToConnect);
      }
    });
  };

  private createLocalStreamP2PConnection(streamInput: ErizoStream, peerSocket: boolean) {
    const stream = streamInput;
    const connection = this.erizoConnectionManager.getOrBuildErizoConnection(
      this.getP2PConnectionOptions(stream, peerSocket));

    stream.addPC(connection, peerSocket);
    connection.on('connection-failed', this.dispatchEvent.bind(this));

    stream.on('icestatechanged', (evt: any) => {
      log.debug(`message: icestatechanged, streamId: ${stream.getID()}, iceConnectionState: ${evt.msg.state}, ${this.toLog()}`);
      if (evt.msg.state === 'failed') {
        stream.pc.get(peerSocket).close();
        stream.pc.remove(peerSocket);
      }
    });
    connection.addStream(stream);
  };

  private removeLocalStreamP2PConnection(streamInput: ErizoStream, peerSocket: boolean) {
    const stream = streamInput;
    if (stream.pc === undefined || !stream.pc.has(peerSocket)) {
      return;
    }
    const pc = stream.pc.get(peerSocket);
    pc.close();
    stream.pc.remove(peerSocket);
  };

  private onRemoteStreamRemovedListener(label: string) {
    this.remoteStreams.forEach((stream) => {
      if (!stream.local && stream.getLabel() === label) {
        const streamToRemove = stream;
        streamToRemove.unsubscribing.pcEventReceived = true;
        this.maybeDispatchStreamUnsubscribed(streamToRemove);
      }
    });
  };

  private getErizoConnectionOptions(stream: ErizoStream, connectionId: string, erizoId: string, options?: any, isRemote?: boolean) {
    const connectionOpts = {
      callback: ((message: LicodeEventSpec, streamId = stream.getID() as string) => {
        if (message && message.type && message.type === 'updatestream') {
          this.socket?.sendSDP('streamMessage', {
            streamId,
            erizoId,
            msg: message,
            browser: stream.pc && stream.pc.browser
          }, undefined, () => { });
        } else {
          this.socket?.sendSDP('connectionMessage', {
            connectionId,
            erizoId,
            msg: message,
            browser: stream.pc && stream.pc.browser
          }, undefined, () => { });
        }
      }).bind(this),
      connectionId,
      nop2p: true,
      audio: (options?.audio && stream.hasAudio()) as boolean,
      video: (options?.video && stream.hasVideo()) as boolean,
      maxAudioBW: options?.maxAudioBW,
      maxVideoBW: options?.maxVideoBW,
      simulcast: options.simulcast,
      limitMaxAudioBW: this.spec?.maxAudioBW,
      limitMaxVideoBW: this.spec?.maxVideoBW,
      label: stream.getLabel(),
      iceServers: this.iceServers,
      disableIceRestart: this.disableIceRestart,
      forceTurn: (stream as any).forceTurn as boolean,
      p2p: false,
      streamRemovedListener: this.onRemoteStreamRemovedListener,
      isRemote,
      ...(!isRemote ? {
        startVideoBW: options?.startVideoBW,
        hardMinVideoBW: options?.hardMinVideoBW,
      } : {})
    };
    return connectionOpts;
  };

  private createRemoteStreamErizoConnection(streamInput: ErizoStream, connectionId: string, erizoId: string, options?: any) {
    const stream = streamInput;
    const connectionOpts = this.getErizoConnectionOptions(stream, connectionId, erizoId, options, true);
    const connection = this.erizoConnectionManager
      .getOrBuildErizoConnection(connectionOpts, erizoId, this.spec?.singlePC);
    stream.addPC(connection, false, connectionOpts);
    connection.on('connection-failed', this.dispatchEvent.bind(this));

    stream.on('added', this.dispatchStreamSubscribed.bind(null, stream));
    stream.on('icestatechanged', (evt: any) => {
      log.debug(`message: icestatechanged, ${stream.toLog()}, iceConnectionState: ${evt.msg.state}, ${this.toLog()}`);
      if (evt.msg.state === 'failed') {
        const message = 'ICE Connection Failed';
        this.onStreamFailed(stream, message, 'ice-client', evt.msg.wasAbleToConnect);
        if (this.spec?.singlePC) {
          connectionOpts.callback({ type: 'failed' });
        }
      }
    });
  };

  private createLocalStreamErizoConnection(streamInput: ErizoStream, connectionId: string, erizoId: string, options?: any) {
    const stream = streamInput;
    const connectionOpts = this.getErizoConnectionOptions(stream, connectionId, erizoId, options);
    const connection = this.erizoConnectionManager
      .getOrBuildErizoConnection(connectionOpts, erizoId, this.spec?.singlePC);
    stream.addPC(connection, false, options);
    connection.on('connection-failed', this.dispatchEvent.bind(this));
    stream.on('icestatechanged', (evt: any) => {
      log.debug(`message: icestatechanged, ${stream.toLog()}, iceConnectionState: ${evt.msg.state}, ${this.toLog()}`);
      if (evt.msg.state === 'failed') {
        const message = 'ICE Connection Failed';
        this.onStreamFailed(stream, message, 'ice-client', evt.msg.wasAbleToConnect);
        if (this.spec?.singlePC) {
          connectionOpts.callback({ type: 'failed' });
        }
      }
    });
    stream.pc.addStream(stream);
  };

  // We receive an event with a new stream in the room.
  // type can be "media" or "data"

  private socketOnAddStream(arg: Omit<ErizoStreamOptions, "streamID"> & { id: string }) {
    if (this.remoteStreams.has(arg.id)) {
      return;
    }
    const stream = new ErizoStream(this.ConnectionHelpers, {
      streamID: arg.id,
      local: this.localStreams.has(arg.id),
      audio: arg.audio,
      video: arg.video,
      data: arg.data,
      label: arg.label,
      screen: arg.screen,
      attributes: arg.attributes
    });
    stream.room = this;
    stream.state = 'unsubscribed';
    this.remoteStreams.add(arg.id, stream);
    const evt = StreamEvent({ type: 'stream-added', stream });
    this.dispatchEvent(evt);
  };

  private socketOnStreamMessageFromErizo(arg: ErizoStreamOptions) {
    log.debug(`message: Failed applying a stream message from erizo, ${this.toLog()}, msg: ${JSON.stringify(arg)}`);
  };

  // TODO: determine type of `socketOnConnectionQualityLevel.args.arg`
  private socketOnConnectionQualityLevel(arg: any) {
    const level = arg.evt.level;
    let minLevel = Number.MAX_SAFE_INTEGER;
    let minLevelMessage = '';
    this.localStreams.forEach((stream) => {
      if (!stream.failed && stream.pc) {
        if (stream.pc.connectionId === arg.connectionId) {
          stream.pc.setQualityLevel(level);
        }
        const streamLevel = stream.pc.getQualityLevel();
        if (streamLevel.index < minLevel) {
          minLevel = streamLevel.index;
          minLevelMessage = streamLevel.message;
        }
      }
    });
    this.remoteStreams.forEach((stream) => {
      if (!!stream.failed && stream.pc) {
        if (stream.pc.connectionId === arg.connectionId) {
          stream.pc.setQualityLevel(level);
        }
        const streamLevel = stream.pc.getQualityLevel();
        if (streamLevel.index < minLevel) {
          minLevel = streamLevel.index;
          minLevelMessage = streamLevel.message;
        }
      }
    });
    if (minLevelMessage !== this.minConnectionQualityLevel) {
      this.minConnectionQualityLevel = minLevelMessage;
      this.dispatchEvent(RoomEvent({ type: 'quality-level', message: minLevelMessage }));
    }
  };

  // TODO: Decide the type of `arg`
  private socketOnConnectionMessageFromErizo(arg: any) {
    if (arg.evt.type === 'quality_level') {
      this.socketOnConnectionQualityLevel(arg);
      return;
    }
    const connection = this.erizoConnectionManager.getErizoConnection(arg.connectionId);
    if (connection) {
      connection.processSignalingMessage(arg.evt);
    } else {
      log.warning(`message: Received signaling message to unknown connectionId, connectionId: ${arg.connectionId}, ${this.toLog()}`);
    }
  };

  private socketOnStreamMessageFromP2P(arg: { streamId: string, msg: string, peerSocket: boolean }) {
    let stream = this.localStreams.get(arg.streamId);

    if (stream && !stream.failed) {
      stream.pc.get(arg.peerSocket).processSignalingMessage(arg.msg);
    } else {
      stream = this.remoteStreams.get(arg.streamId);

      if (stream && !stream.pc) {
        this.createRemoteStreamP2PConnection(stream, arg.peerSocket);
      }
      stream?.pc.processSignalingMessage(arg.msg);
    }
  };

  private socketOnPublishMe(arg: SocketPublishEventData) {
    const myStream = this.localStreams.get(arg.streamId);
    if (myStream)
      this.createLocalStreamP2PConnection(myStream, arg.peerSocket);
  };

  private socketOnUnpublishMe(arg: SocketPublishEventData) {
    const myStream = this.localStreams.get(arg.streamId);
    if (myStream) {
      this.removeLocalStreamP2PConnection(myStream, arg.peerSocket);
    }
  };

  private socketOnBandwidthAlert(arg: { streamID?: string, bandwidth: number, message?: string }) {
    log.debug(`message: Bandwidth Alert, streamId: ${arg.streamID}, bwMessage: ${arg.message}, bandwidth: ${arg.bandwidth}, ${this.toLog()}`);
    if (arg.streamID) {
      const stream = this.remoteStreams.get(arg.streamID);
      if (stream && !stream.failed) {
        const evt = StreamEvent({
          type: 'bandwidth-alert',
          stream,
          msg: arg.message,
          bandwidth: arg.bandwidth
        });
        stream.dispatchEvent(evt);
      }
    }
  };

  // We receive an event of new data in one of the streams
  private socketOnDataStream(arg: { id: string, msg: string }) {
    const stream = this.remoteStreams.get(arg.id);
    const evt = StreamEvent({ type: 'stream-data', msg: arg.msg, stream });
    stream?.dispatchEvent(evt);
  };

  // TODO: Find types of `socketOnUpdateAttributeStream.args.arg.attrs`
  // We receive an event of new data in one of the streams
  private socketOnUpdateAttributeStream(arg: { id: string, attrs: Record<any, any> }) {
    const stream = this.remoteStreams.get(arg.id);
    const evt = StreamEvent({
      type: 'stream-attributes-update',
      attrs: arg.attrs,
      stream
    });
    stream?.updateLocalAttributes(arg.attrs);
    stream?.dispatchEvent(evt);
  };

  // We receive an event of a stream removed from the room
  private socketOnRemoveStream(arg: { id: string }) {
    let stream = this.localStreams.get(arg.id);
    if (stream) {
      this.onStreamFailed(stream, 'Stream removed from server', 'server');
      return;
    }
    stream = this.remoteStreams.get(arg.id);
    if (stream) {
      log.info(`message: Stream removed, ${stream.toLog()}, ${this.toLog()}`);
      this.removeStream(stream);
      this.remoteStreams.remove(arg.id);
      const evt = StreamEvent({ type: 'stream-removed', stream });
      this.dispatchEvent(evt);
    }
  };

  // The socket has disconnected
  private socketOnDisconnect() {
    log.info(`message: Socket disconnected, reason: lost connection to ErizoController, ${this.toLog()}`);
    if (this.state !== this.DISCONNECTED) {
      log.error(`message: Unexpected disconnection from ErizoController, ${this.toLog()}`);
      const disconnectEvt = RoomEvent({
        type: 'room-disconnected',
        message: 'unexpected-disconnection'
      });
      this.dispatchEvent(disconnectEvt);
    }
  };

  private socketOnReconnecting(reason: string) {
    log.info(`message: Socket reconnecting, reason: lost connection to ErizoController, ${this.toLog()}`);
    const reconnectingEvt = RoomEvent({
      type: 'room-reconnecting',
      message: `reconnecting - ${reason}`
    });
    this.dispatchEvent(reconnectingEvt);
  };

  private socketOnReconnected() {
    log.info(`message: Socket reconnected, reason: restablished connection to ErizoController, ${this.toLog()}`);
    const reconnectedEvt = RoomEvent({
      type: 'room-reconnected',
      message: 'reconnected'
    });
    this.dispatchEvent(reconnectedEvt);
  };

  private socketOnICEConnectionFailed(arg: { type: string, streamId: string }) {
    let stream;
    if (!arg.streamId) {
      return;
    }
    const message = `message: ICE Connection Failed, type: ${arg.type}, streamId: ${arg.streamId}, state: ${this.state}, ${this.toLog()}`;
    log.error(message);
    if (arg.type === 'publish') {
      stream = this.localStreams.get(arg.streamId);
    } else {
      stream = this.remoteStreams.get(arg.streamId);
    }
    if (stream) this.onStreamFailed(stream, message, 'ice-server');
  };

  private socketOnError(e: any) {
    log.error(`message: Error in the connection to Erizo Controller, ${this.toLog()}, error: ${e}`);
    const connectEvt = RoomEvent({ type: 'room-error', message: e });
    this.dispatchEvent(connectEvt);
  };

  private sendDataSocketFromStreamEvent(evt: StreamEventSpec) {
    const stream = evt.stream;
    const msg = evt.msg;
    if (stream?.local) {
      this.socket?.sendMessage('sendDataStream', { id: stream?.getID(), msg });
    } else {
      log.error(`message: You can not send data through a remote stream, ${stream?.toLog()}, ${this.toLog()}`);
    }
  };

  private updateAttributesFromStreamEvent(evt: StreamEventSpec) {
    const stream = evt.stream;
    const attrs = evt.attrs ?? {};
    if (stream?.local) {
      stream.updateLocalAttributes(attrs);
      this.socket?.sendMessage('updateStreamAttributes', { id: stream.getID(), attrs });
    } else {
      log.error(`message: You can not update attributes in a remote stream, ${stream?.toLog()}, ${this.toLog()}`);
    }
  };

  private socketEventToArgs(func: Function, event: any) {
    if (event.args) {
      func(...event.args);
    } else {
      func();
    }
  };

  private createSdpConstraints(type: string, stream: ErizoStream, options: RoomStreamsConstrains) {
    return ({
      state: type,
      data: stream.hasData(),
      audio: stream.hasAudio(),
      video: stream.hasVideo(),
      label: stream.getLabel(),
      screen: stream.hasScreen(),
      attributes: stream.getAttributes(),
      metadata: options.metadata,
      createOffer: options.createOffer,
      muteStream: options.muteStream,
      encryptTransport: options.encryptTransport ?? true,
      handlerProfile: options.handlerProfile,
    })
  };

  private populateStreamFunctions(id: string | null, streamInput: ErizoStream, error?: any, callback?: PassOrFailCB) {
    const stream = streamInput;
    if (id === null) {
      log.error(`message: Error when publishing the stream, ${stream.toLog()}, ${this.toLog()}, error: ${error}`);
      // Unauth -1052488119
      // Network -5
      callback?.(undefined, error);
      return;
    }
    log.info(`message: Stream published, ${stream.toLog()}, ${this.toLog()}`);
    stream.getID = () => id;
    stream.on('internal-send-data', this.sendDataSocketFromStreamEvent);
    stream.on('internal-set-attributes', this.updateAttributesFromStreamEvent);
    this.localStreams.add(id, stream);
    stream.room = this;
    callback?.(id);
  };

  private publishExternal(streamInput: ErizoStream, options: RoomStreamsConstrains, callback = () => { }) {
    const stream = streamInput;
    let type;
    let arg;
    if (stream.url) {
      type = 'url';
      arg = stream.url;
    } else {
      type = 'recording';
      arg = stream.recording;
    }
    log.debug(`message: Checking publish options, ${stream.toLog()}, ${this.toLog()}`);
    stream.checkOptions(options);
    this.socket?.sendSDP('publish', this.createSdpConstraints(type, stream, options), arg,
      (id: string | null, error?: any) => {
        this.populateStreamFunctions(id, stream, error, callback);
      });
  };

  private publishP2P(streamInput: ErizoStream, options: RoomStreamsConstrains, callback?: PassOrFailCB) {
    const stream = streamInput;
    // We save them now to be used when actually publishing in P2P mode.
    stream.maxAudioBW = options.maxAudioBW;
    stream.maxVideoBW = options.maxVideoBW;
    this.socket?.sendSDP('publish', this.createSdpConstraints('p2p', stream, options), undefined, (id: string | null, error?: any) => {
      this.populateStreamFunctions(id, stream, error, callback);
    });
  };

  private publishData(streamInput: ErizoStream, options: RoomStreamsConstrains, callback?: PassOrFailCB) {
    const stream = streamInput;
    this.socket?.sendSDP('publish', this.createSdpConstraints('data', stream, options), undefined, (id: string | null, error?: any) => {
      this.populateStreamFunctions(id, stream, error, callback);
    });
  };

  // TODO: Determine the type of `publishErizo.args.options.scheme`
  private publishErizo(streamInput: ErizoStream, options: RoomStreamsConstrains, callback?: Function) {
    const stream = streamInput;
    log.debug(`message: Publishing to Erizo Normally, createOffer: ${options.createOffer}, ${this.toLog()}`);
    const constraints = this.createSdpConstraints('erizo', stream, options);

    Object.assign(constraints, {
      minVideoBW: options.minVideoBW,
      maxVideoBW: options.maxVideoBW,
      scheme: options.scheme,
    })

    this.socket?.sendSDP('publish', constraints, undefined, (id: string | null, erizoId: string, connectionId: string, error?: any) => {
      if (id === null) {
        log.error(`message: Error publishing stream, ${stream.toLog()}, ${this.toLog()}, error: ${error}`);
        callback?.(undefined, error);
        return;
      }
      this.populateStreamFunctions(id, stream, error, undefined);
      this.createLocalStreamErizoConnection(stream, connectionId, erizoId, options);
      callback?.(id);
    });
  };

  private getVideoConstraints(stream: ErizoStream, video?: MediaTrackConstraints) {
    const hasVideo = video && stream.hasVideo();
    const width = video?.width;
    const height = video?.height;
    const frameRate = video?.frameRate;
    if (width || height || frameRate) {
      return { width, height, frameRate };
    }
    return hasVideo;
  };

  // TODO: Determine type of encryptTransport, handlerProfile
  private subscribeErizo(streamInput: ErizoStream, optionsInput: RoomStreamsConstrains, callback?: Function) {
    const stream = streamInput;
    const options = optionsInput;
    Object.assign(options, {
      maxVideoBW: options.maxVideoBW || this.spec?.defaultVideoBW
    })
    if (this.spec?.maxVideoBW && options.maxVideoBW && options.maxVideoBW > this.spec.maxVideoBW) {
      options.maxVideoBW = this.spec.maxVideoBW;
    }
    options.audio = options.audio ?? true;
    options.video = options.video ?? true;
    options.data = options.data ?? true;
    options.encryptTransport = options.encryptTransport ?? true;

    stream.checkOptions(options);
    const constraint = {
      streamId: stream.getID(),
      audio: options.audio && stream.hasAudio(),
      video: this.getVideoConstraints(stream, options.video as MediaTrackConstraints),
      maxVideoBW: options.maxVideoBW,
      data: options.data && stream.hasData(),
      browser: this.ConnectionHelpers?.getBrowser(),
      createOffer: options.createOffer,
      metadata: options.metadata,
      muteStream: options.muteStream,
      encryptTransport: options.encryptTransport,
      slideShowMode: options.slideShowMode,
      handlerProfile: options.handlerProfile,
    };
    this.socket?.sendSDP('subscribe', constraint, undefined, (result: any | null, erizoId: string, connectionId: string, error?: any) => {
      if (result === null) {
        log.error(`message: Error subscribing to stream, ${stream.toLog()}, ${this.toLog()}, error: ${error}`);
        stream.state = 'unsubscribed';
        callback?.(undefined, error);
        return;
      }

      log.debug(`message: Subscriber added, ${stream.toLog()}, ${this.toLog()}, erizoId: ${erizoId}, connectionId: ${connectionId}`);
      this.createRemoteStreamErizoConnection(stream, connectionId, erizoId, options);
      callback?.(true);
    });
  };

  private subscribeData(streamInput: ErizoStream, options: RoomStreamsConstrains, callback?: Function) {
    const stream = streamInput;
    this.socket?.sendSDP('subscribe',
      {
        streamId: stream.getID(),
        data: options.data,
        metadata: options.metadata
      },
      undefined, (result: any | null, error?: any) => {
        if (result === null) {
          log.error(`message: Error subscribing to stream, ${stream.toLog()}, ${this.toLog()}, error: ${error}`);
          stream.state = 'unsubscribed';
          callback?.(undefined, error);
          return;
        }
        log.debug(`message: Stream subscribed, ${stream.toLog()}, ${this.toLog()}`);
        const evt = StreamEvent({ type: 'stream-subscribed', stream });
        this.dispatchEvent(evt);
        callback?.(true);
      });
  };

  private clearAll() {
    this.state = this.DISCONNECTED;
    if (this.socket) this.socket.state = this.socket.DISCONNECTED;

    // Close all PeerConnections
    this.erizoConnectionManager.ErizoConnectionsMap.forEach((connection) => {
      Object.keys(connection).forEach((key) => {
        connection[key].close();
      });
    });

    // Remove all streams
    this.remoteStreams.forEach((stream, id) => {
      this.removeStream(stream);
      this.remoteStreams.remove(id);
      if (stream && !stream.failed) {
        const evt2 = StreamEvent({ type: 'stream-removed', stream });
        this.dispatchEvent(evt2);
      }
    });
    this.remoteStreams = ErizoMap();

    // Close Peer Connections
    this.localStreams.forEach((stream, id) => {
      this.removeStream(stream);
      this.localStreams.remove(id);
    });
    this.localStreams = ErizoMap();

    // Close socket
    try {
      this.socket?.disconnect(this.clientIntiatedDisconnection);
    } catch (error) {
      log.debug(`message: Socket already disconnected, ${this.toLog()}, error: ${error}`);
    }
    log.info(`message: Disconnected from room, roomId: ${this.roomID}, ${this.toLog()}`);
    this.socket = undefined;
  };

  // Public functions

  // It stablishes a connection to the room.
  // Once it is done it throws a RoomEvent("room-connected")
  connect(options: Record<any, any> = {}) {
    const token = JSON.parse(Base64.decodeBase64(this.spec?.token ?? ""
    /*for satisfying TSC */));

    if (this.state !== this.DISCONNECTED) {
      log.warning(`message: Room already connected, roomId: ${this.roomID}, ${this.toLog()}`);
    }

    // 1- Connect to Erizo-Controller
    this.state = this.CONNECTING;
    this.clientIntiatedDisconnection = false;
    log.info(`message: Connecting to room, tokenId: ${token.tokenId}`);
    this.socket?.connect(token, options, (res) => {
      const response = res as any;
      let stream;
      const streamList: ErizoStream[] = [];
      const streams = response.streams || [];
      const roomId = response.id;

      this.p2p = response.p2p;
      this.iceServers = response.iceServers;
      this.state = this.CONNECTED;
      Object.assign(this.spec, {
        singlePC: response.singlePC,
        defaultVideoBW: response.defaultVideoBW,
        maxVideoBW: response.maxVideoBW,
      })
      this.streamPriorityStrategy = response.streamPriorityStrategy;
      this.connectionTargetBw = response.connectionTargetBw;

      // 2- Retrieve list of streams
      const streamIndices = Object.keys(streams);
      for (let index = 0; index < streamIndices.length; index += 1) {
        const arg = streams[streamIndices[index]];
        stream = new ErizoStream(this.ConnectionHelpers, {
          streamID: arg.id,
          local: false,
          audio: arg.audio,
          video: arg.video,
          data: arg.data,
          label: arg.label,
          screen: arg.screen,
          attributes: arg.attributes
        });
        stream.room = this;
        stream.state = 'unsubscribed';
        streamList.push(stream);
        this.remoteStreams.add(arg.id, stream);
      }

      // 3 - Update RoomID
      this.roomID = roomId;

      log.info(`message: Connected to room, ${this.toLog()}`);

      const connectEvt = RoomEvent({ type: 'room-connected', streams: streamList });
      this.dispatchEvent(connectEvt);
    }, (error) => {
      log.error(`message: Error connecting to room, ${this.toLog()}, error: ${error}`);
      const connectEvt = RoomEvent({ type: 'room-error', message: error });
      this.dispatchEvent(connectEvt);
    });
  };

  // It disconnects from the room, dispatching a new RoomEvent("room-disconnected")
  disconnect() {
    log.info(`message: Disconnection requested, ${this.toLog()}`);
    // 1- Disconnect from room
    const disconnectEvt = RoomEvent({
      type: 'room-disconnected',
      message: 'expected-disconnection'
    });
    this.clientIntiatedDisconnection = true;
    this.dispatchEvent(disconnectEvt);
  };

  // It publishes the stream provided as argument. Once it is added it throws a
  // StreamEvent("stream-added").
  publish(streamInput: ErizoStream, optionsInput: RoomStreamsConstrains = {}, callback?: PassOrFailCB) {
    const stream = streamInput;
    const options: RoomStreamsConstrains = {
      ...optionsInput,
      maxVideoBW: optionsInput.maxVideoBW || this.spec?.defaultVideoBW,
      limitMaxVideoBW: this.spec?.maxVideoBW,
      limitMaxAudioBW: this.spec?.maxAudioBW,
      simulcast: optionsInput.simulcast ?? false,
      handlerProfile: optionsInput.handlerProfile || null,
      muteStream: {
        audio: stream.audioMuted,
        video: stream.videoMuted,
      },
    };

    log.info(`message: Publishing stream, ${stream.toLog()}, ${this.toLog()}`);


    if (options.maxVideoBW && this.spec?.maxVideoBW && options.maxVideoBW > this.spec.maxVideoBW) {
      options.maxVideoBW = this.spec.maxVideoBW;
    }

    if (options.minVideoBW === undefined) {
      options.minVideoBW = 0;
    }

    if (this.spec?.defaultVideoBW && options.minVideoBW > this.spec.defaultVideoBW) {
      options.minVideoBW = this.spec.defaultVideoBW;
    }

    if (options.forceTurn !== undefined) stream.forceTurn = options.forceTurn;

    // 1- If the stream is not local or it is a failed stream we do nothing.
    if (stream && stream.local && !stream.failed && !this.localStreams.has(stream.getID())) {
      // 2- Publish Media Stream to Erizo-Controller
      if (stream.hasMedia()) {
        if (stream.isExternal()) {
          this.publishExternal(stream, options, callback);
        } else if (this.p2p) {
          this.publishP2P(stream, options, callback);
        } else {
          this.publishErizo(stream, options, callback);
        }
      } else if (stream.hasData()) {
        this.publishData(stream, options, callback);
      }
    } else {
      log.error(`message: Trying to publish invalid stream, ${stream.toLog()}, ${this.toLog()}`);
      callback?.(undefined, 'Invalid Stream');
    }
  };

  /**
   * Returns callback(id, error)
   */
  startRecording(stream?: ErizoStream, callback?: PassOrFailCB) {
    if (stream === undefined)// What kind of Joke is this piece of code!?😑
    {
      log.error(`message: Trying to start recording on an invalid stream, ${(stream as any)?.toLog()}, ${this.toLog()}`);
      callback?.(undefined, 'Invalid Stream');
      return;
    }
    log.debug(`message: Start Recording stream, ${stream.toLog()}, ${this.toLog()}`);
    this.socket?.sendMessage('startRecorder', { to: stream.getID() }, (id, error) => {
      if (id === null) {
        log.error(`message: Error on start recording, ${stream.toLog()}, ${this.toLog()}, error: ${error}`);
        callback?.(undefined, error);
        return;
      }

      log.debug(`message: Start recording, id: ${id}, ${this.toLog()}`);
      callback?.(id);
    });
  };

  // Returns callback(id, error)
  stopRecording(recordingId: string, callback?: PassOrFailCB) {
    this.socket?.sendMessage('stopRecorder', { id: recordingId }, (result, error) => {
      if (result === null) {
        log.error(`message: Error on stop recording, recordingId: ${recordingId}, ${this.toLog()}, error: ${error}`);
        callback?.(undefined, error);
        return;
      }
      log.debug(`message: Stop recording, id: ${recordingId}, ${this.toLog()}`);
      callback?.(true);
    });
  };

  // It unpublishes the local stream in the room, dispatching a StreamEvent("stream-removed")
  unpublish(streamInput: ErizoStream, callback?: PassOrFailCB) {
    const stream = this.localStreams.get(streamInput.getID());
    // Unpublish stream from Erizo-Controller
    if (stream && stream.local) {
      // Media stream
      this.socket?.sendMessage('unpublish', stream.getID(), (result, error) => {
        if (result === null) {
          log.error(`message: Error unpublishing stream, ${stream.toLog()}, ${this.toLog()}, error: ${error}`);
          callback?.(undefined, error);
          return;
        }

        log.info(`message: Stream unpublished, ${stream.toLog()}, ${this.toLog()}`);

        delete (stream as any).failed; // this absolutely ridiculous☹
        callback?.(true);
      });

      log.info(`message: Unpublishing stream, ${stream.toLog()}, ${this.toLog()}`);
      stream.room = undefined;
      if (stream.hasMedia() && !stream.isExternal()) {
        const localStream = this.localStreams.has(stream.getID()) ?
          this.localStreams.get(stream.getID()) as ErizoStream : stream;
        this.removeStream(localStream);
      }
      this.localStreams.remove(stream.getID());

      Object.assign(stream, {
        getID: () => { }, // So not done bro! The worst workaround..🤐
      })
      stream.off('internal-send-data', this.sendDataSocketFromStreamEvent);
      stream.off('internal-set-attributes', this.updateAttributesFromStreamEvent);
    } else {
      const error = `message: Cannot unpublish because stream does not exist or is not local, ${stream?.toLog()}, ${this.toLog()}`;
      log.error(error);
      callback?.(undefined, error);
    }
  };

  sendControlMessage(stream: ErizoStream, type: string, action: Record<any, any> = {}) {
    if (stream && stream.getID()) {
      const msg = { type: 'control', action };
      this.socket?.sendSDP('streamMessage', { streamId: stream.getID(), msg });
    }
  };

  // It subscribe to a remote stream and draws it inside the HTML tag given by the ID='elementID'
  subscribe(streamInput: ErizoStream, optionsInput: RoomStreamsConstrains = {}, callback?: PassOrFailCB) {
    const stream = this.remoteStreams.get(streamInput.getID());
    const options = optionsInput;

    if (stream && !stream.local && !stream.failed) {
      if (stream.state !== 'unsubscribed' && stream.state !== 'unsubscribing') {
        log.warning(`message: Cannot subscribe to a subscribed stream, ${stream.toLog()}, ${this.toLog()}`);
        callback?.(undefined, 'Stream already subscribed');
        return;
      }
      stream.state = 'subscribing';
      if (stream.hasMedia()) {
        // 1- Subscribe to Stream
        if (!stream.hasVideo() && !stream.hasScreen()) {
          options.video = false;
        }
        if (!stream.hasAudio()) {
          options.audio = false;
        }

        options.muteStream = {
          audio: stream.audioMuted,
          video: stream.videoMuted,
        };

        if (options.forceTurn !== undefined) stream.forceTurn = options.forceTurn;

        if (this.p2p) {
          const streamToSubscribe = this.remoteStreams.get(stream.getID());
          Object.assign(streamToSubscribe, {
            maxAudioBW: options.maxAudioBW,
            maxVideoBW: options.maxVideoBW,
          })
          this.socket?.sendSDP('subscribe', { streamId: stream.getID(), metadata: options.metadata });
          callback?.(true);
        } else {
          this.subscribeErizo(stream, options, callback);
        }
      } else if (stream.hasData() && options.data !== false) {
        this.subscribeData(stream, options, callback);
      } else {
        log.warning(`message: There is nothing to subscribe to in stream, ${stream.toLog()}, ${this.toLog()}`);
        stream.state = 'unsubscribed';
        callback?.(undefined, 'Nothing to subscribe to');
        return;
      }
      // Subscribe to stream stream
      log.info(`message: Subscribing to stream, ${stream.toLog()}, ${this.toLog()}`);
    } else {
      let error = 'Error on subscribe';
      if (stream) stream.state = 'unsubscribed';
      if (!stream) {
        // Why, how can you access the toLog method when
        // stream is undefined!!!! This is super stupid😤
        log.warning(`message: Cannot subscribe to invalid stream, ${(stream as any)?.toLog()}, ${this.toLog()}`);
        error = 'Invalid or undefined stream';
      } else if (stream.local) {
        log.warning(`message: Cannot subscribe to local stream, ${stream.toLog()}, ${this.toLog()}`);
        error = 'Local copy of stream';
      } else if (stream.failed) {
        log.warning(`message: Cannot subscribe to failed stream, ${stream.toLog()}, ${this.toLog()},` +
          `unsubscribing: ${stream.unsubscribing}, failed: ${stream.failed}`);
        error = 'Failed stream';
      }
      callback?.(undefined, error);
    }
  };

  // It unsubscribes from the stream, removing the HTML element.
  unsubscribe(streamInput: ErizoStream, callback?: PassOrFailCB) {
    const stream = this.remoteStreams.get(streamInput.getID());
    // Unsubscribe from stream
    if (this.socket !== undefined) {
      if (stream && !stream.local) {
        if (stream.state !== 'subscribed' && stream.state !== 'subscribing') {
          log.warning(`message: Cannot unsubscribe to a stream that is not subscribed, ${stream.toLog()}, ${this.toLog()}`);
          callback?.(undefined, 'Stream not subscribed');
          return;
        }
        stream.state = 'unsubscribing';
        log.info(`message: Unsubscribing stream, ${stream.toLog()}, ${this.toLog()}`);
        this.socket.sendMessage('unsubscribe', stream.getID(), (result, error) => {
          if (result === null) {
            stream.state = 'subscribed';
            callback?.(undefined, error);
            return;
          }
          callback?.(true);
          stream.unsubscribing.callbackReceived = true;
          this.maybeDispatchStreamUnsubscribed(stream);
        }, () => {
          stream.state = 'subscribed';
          log.error(`message: Error calling unsubscribe, ${stream.toLog()}, ${this.toLog()}`);
        });
      } else {
        if (stream) stream.state = 'unsubscribed';
        callback?.(undefined,
          'Error unsubscribing, stream does not exist or is not local');
      }
    }
  };

  getStreamStats(stream?: ErizoStream, callback?: PassOrFailCB) {
    if (!this.socket) {
      return 'Error getting stats - no socket';
    }
    if (!stream) {
      return 'Error getting stats - no stream';
    }

    this.socket.sendMessage('getStreamStats', stream.getID(), (result) => {
      if (result) {
        callback?.(result);
      }
    });
    return undefined;
  };

  // It searchs the streams that have "name" attribute with "value" value
  getStreamsByAttribute(name: string, value: string) {
    const streams: ErizoStream[] = [];

    this.remoteStreams.forEach((stream) => {
      // TODO: find out the type of `attributes`
      if (stream.getAttributes() !== undefined && (stream.getAttributes() as any)?.[name] === value) {
        streams.push(stream);
      }
    });

    return streams;
  };

  setStreamPriorityStrategy(strategyId: string, callback?: PassOrFailCB) {
    this.socket?.sendMessage('setStreamPriorityStrategy', strategyId, (result) => {
      this.streamPriorityStrategy = strategyId;
      if (result) {
        callback?.(result);
      }
    });
  };

  setConnectionTargetBandwidth(connectionTargetBw: number, callback?: PassOrFailCB) {
    this.socket?.sendMessage('setConnectionTargetBandwidth', connectionTargetBw, (result) => {
      this.connectionTargetBw = connectionTargetBw;
      if (result) {
        callback?.(result);
      }
    });
  }
};
