import ChromeStableStack, { RTCChromeStableStackOptions } from './webrtc-stacks/ChromeStableStack';
import SafariStack from './webrtc-stacks/SafariStack';
import FirefoxStack from './webrtc-stacks/FirefoxStack';
import FcStack, { RTCFcStack, RTCFcStackOptions } from './webrtc-stacks/FcStack';
import { Logger } from './utils/Logger';
import { EventEmitter, ConnectionEvent } from './Events';
import { ConnectionHelpers } from './utils/ConnectionHelpers';
import { RTCBaseStack, RTCBaseStackOptions, RTCBaseStackSpecs } from './webrtc-stacks/BaseStack';
import { ErizoStream } from './ErizoStream';
import { MsgCb } from './Stream';

export interface RTCStreamEvent extends Event {
  stream: MediaStream;
};

let ErizoSessionId = 103;

const QUALITY_LEVEL_GOOD = 'good';
const QUALITY_LEVEL_LOW_PACKET_LOSSES = 'low-packet-losses';
const QUALITY_LEVEL_HIGH_PACKET_LOSSES = 'high-packet-losses';
const ICE_DISCONNECTED_TIMEOUT = 2000;

const QUALITY_LEVELS = [
  QUALITY_LEVEL_HIGH_PACKET_LOSSES,
  QUALITY_LEVEL_LOW_PACKET_LOSSES,
  QUALITY_LEVEL_GOOD,
];

const log = Logger.module('ErizoConnection');

type ErizoConnectionOptions = RTCFcStackOptions & RTCChromeStableStackOptions & RTCBaseStackOptions & {
  connectionId: string,
  disableIceRestart: boolean,
  streamRemovedListener?: Function,
}

export class ErizoConnection extends EventEmitter {
  sessionId: number;
  connectionId: string;
  disableIceRestart: boolean;
  qualityLevel: string;
  wasAbleToConnect: boolean;
  streamsMap: Map<string, ErizoStream>;
  stack: Record<any, any> | RTCFcStack | RTCBaseStack;
  streamRemovedListener: Function;
  browser: string
  peerConnection?: RTCPeerConnection;

  constructor(specInput: ErizoConnectionOptions, public erizoId?: string) {
    super();
    this.stack = {};

    this.streamsMap = new Map<string, ErizoStream>();

    ErizoSessionId += 1;
    const spec: ErizoConnectionOptions & {
      sessionId: number,
      onEnqueueingTimeout?(step: number): void
    } = {
      ...specInput,
      sessionId: ErizoSessionId,
      onEnqueueingTimeout: (step) => {
        const message = `Timeout in ${step}`;
        this._onConnectionFailed(message);
      }
    };
    spec.sessionId = ErizoSessionId;
    this.sessionId = ErizoSessionId;
    this.connectionId = spec.connectionId;
    this.disableIceRestart = spec.disableIceRestart;
    this.qualityLevel = QUALITY_LEVEL_GOOD;
    this.wasAbleToConnect = false;

    log.debug(`message: Building a new Connection, ${this.toLog()}`);

    if (!spec.streamRemovedListener) {
      spec.streamRemovedListener = () => { };
    }
    this.streamRemovedListener = spec.streamRemovedListener;

    // Check which WebRTC Stack is installed.
    this.browser = ConnectionHelpers.getBrowser();
    if (this.browser === 'fake') {
      log.warning(`message: Publish/subscribe video/audio streams not supported in erizofc yet, ${this.toLog()}`);
      this.stack = FcStack(spec);
    } else if (this.browser === 'mozilla') {
      log.debug(`message: Firefox Stack, ${this.toLog()}`);
      this.stack = FirefoxStack(spec);
    } else if (this.browser === 'safari') {
      log.debug(`message: Safari Stack, ${this.toLog()}`);
      this.stack = SafariStack(spec);
    } else if (this.browser === 'chrome-stable' || this.browser === 'electron') {
      log.debug(`message: Chrome Stable Stack, ${this.toLog()}`);
      this.stack = ChromeStableStack(spec);
    } else {
      log.error(`message: No stack available for this browser, ${this.toLog()}`);
      throw new Error('WebRTC stack not available');
    }
    if (!(this.stack as RTCBaseStack).updateSpec) {
      (this.stack as RTCBaseStack).updateSpec = ((newSpec: any, callback?: MsgCb) => {
        log.error(`message: Update Configuration not implemented in this browser, ${this.toLog()}`);
        callback?.('unimplemented');
      }) as any;
    }
    if (!(this.stack as any).setSignallingCallback) {
      (this.stack as any).setSignallingCallback = () => {
        log.error(`message: setSignallingCallback is not implemented in this stack, ${this.toLog()}`);
      };
    }

    // PeerConnection Events
    if (this.stack.peerConnection) {
      this.peerConnection = this.stack.peerConnection; // For backwards compatibility


      this.stack.peerConnection.onaddstream = (evt: RTCStreamEvent) => {
        this.emit(ConnectionEvent({ type: 'add-stream', stream: evt.stream }));
      };

      this.stack.peerConnection.onremovestream = (evt: RTCStreamEvent) => {
        this.emit(ConnectionEvent({ type: 'remove-stream', stream: evt.stream }));
        this.streamRemovedListener(evt.stream.id);
      };

      this.stack.peerConnection.oniceconnectionstatechange = () => {
        const state = this.stack.peerConnection.iceConnectionState;
        if (['completed', 'connected'].indexOf(state) !== -1) {
          this.wasAbleToConnect = true;
        }
        if (state === 'failed' && this.wasAbleToConnect && !this.disableIceRestart) {
          log.warning(`message: Restarting ICE, ${this.toLog()}`);
          (this.stack as RTCBaseStack).restartIce();
          return;
        }
        this.emit(ConnectionEvent({ type: 'ice-state-change', state, wasAbleToConnect: this.wasAbleToConnect }));
      };
    }
  }

  toLog() {
    return `connectionId: ${this.connectionId}, sessionId: ${this.sessionId}, qualityLevel: ${this.qualityLevel}, erizoId: ${this.erizoId}`;
  }

  _onConnectionFailed(message: string) {
    log.warning(`Connection Failed, message: ${message}, ${this.toLog()}`);
    this.emit(ConnectionEvent({ type: 'connection-failed', connection: this, message }));
  }

  close() {
    log.debug(`message: Closing ErizoConnection, ${this.toLog()}`);
    this.streamsMap.clear();
    this.stack.close();
  }

  addStream(stream: ErizoStream) {
    log.debug(`message: Adding stream to Connection, ${this.toLog()}, ${stream.toLog()}`);
    this.streamsMap.set(stream.getID(), stream);
    if (stream.local) {
      this.stack.addStream(stream);
    }
  }

  removeStream(stream: ErizoStream) {
    const streamId = stream.getID();
    if (!this.streamsMap.has(streamId)) {
      log.debug(`message: Cannot remove stream not in map, ${this.toLog()}, ${stream.toLog()}`);
      return;
    }
    this.streamsMap.delete(streamId);
    if (stream.local && stream.stream) {
      (this.stack as RTCBaseStack).removeStream(stream.stream);
    } else if (this.streamsMap.size === 0) {
      this.streamRemovedListener(stream.getLabel());
    }
  }

  // TODO: Determine type of `processSignalingMessage.msg`
  processSignalingMessage(msg: any) {
    if (msg.type === 'failed') {
      const message = 'Ice Connection failure detected in server';
      this._onConnectionFailed(message);
      return;
    }
    this.stack.processSignalingMessage(msg);
  }

  sendSignalingMessage(msg: string) {
    (this.stack as RTCFcStack).sendSignalingMessage(msg);
  }

  updateSpec(configInput: RTCBaseStackSpecs, streamId: string, callback?: MsgCb) {
    // How that's supposed to be possible. All weirdos!@!
    (this.stack as any).updateSpec(configInput, streamId, callback);
  }

  setQualityLevel(level: number) {
    this.qualityLevel = QUALITY_LEVELS[level];
  }

  getQualityLevel() {
    return { message: this.qualityLevel, index: QUALITY_LEVELS.indexOf(this.qualityLevel) };
  }
}

type ConnectionMapValue = Record<string, ErizoConnection>;

export class ErizoConnectionManager {
  ErizoConnectionsMap = new Map<string, ConnectionMapValue>(); // key: erizoId, value: {connectionId: connection}

  getErizoConnection(erizoConnectionId: string) {
    let connection: ErizoConnection | undefined;
    this.ErizoConnectionsMap.forEach((entry) => {
      Object.keys(entry).forEach((entryKey) => {
        if (entry[entryKey].connectionId === erizoConnectionId) {
          connection = entry[entryKey];
        }
      });
    });
    return connection;
  }

  getOrBuildErizoConnection(specInput: any, erizoId?: string, singlePC: boolean = false) {
    log.debug(`message: getOrBuildErizoConnection, erizoId: ${erizoId}, singlePC: ${singlePC}`);
    let connection: ErizoConnection | Record<any, any> = {};
    const type = specInput.isRemote ? 'subscribe' : 'publish';

    if (erizoId === undefined) {
      // we have no erizoJS id - p2p
      return new ErizoConnection(specInput);
    }
    if (singlePC) {
      let connectionEntry: ConnectionMapValue;
      if (this.ErizoConnectionsMap.has(erizoId)) {
        connectionEntry = this.ErizoConnectionsMap.get(erizoId) as ConnectionMapValue;
      } else {
        connectionEntry = {};
        this.ErizoConnectionsMap.set(erizoId, connectionEntry);
      }
      if (!connectionEntry[`single-pc-${type}`] && erizoId) {
        connectionEntry[`single-pc-${type}`] = new ErizoConnection(specInput, erizoId);
      }
      connection = connectionEntry[`single-pc-${type}`];
    } else {
      connection = new ErizoConnection(specInput, erizoId);
      if (this.ErizoConnectionsMap.has(erizoId)) {
        Object.assign(this.ErizoConnectionsMap.get(erizoId), {
          [connection.sessionId]: connection
        })
      } else {
        const connectionEntry: ConnectionMapValue = {};
        connectionEntry[connection.sessionId] = connection as ErizoConnection;
        this.ErizoConnectionsMap.set(erizoId, connectionEntry);
      }
    }
    return connection;
  }

  maybeCloseConnection(connection: ErizoConnection, force = false) {
    log.debug(`message: Trying to remove connection, ${connection.toLog()}`);
    if (connection.streamsMap.size === 0 || force) {
      log.debug(`message: No streams in connection, ${connection.toLog()}`);
      const peerConnection = this.ErizoConnectionsMap.get(connection.erizoId as string);
      if (peerConnection !== undefined) {
        if ((peerConnection['single-pc-publish'] || peerConnection['single-pc-subscribe']) && !force) {
          log.debug(`message: Will not remove empty connection, ${connection.toLog()}, reason: It is singlePC`);
          return;
        }
      }
      connection.close();
      if (peerConnection !== undefined) {
        delete peerConnection['single-pc-subscribe'];
        delete peerConnection['single-pc-publish'];
        delete peerConnection[connection.sessionId];
      }
    }
  }
}
