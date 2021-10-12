/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


import io, { ManagerOptions, Socket as WSocket, SocketOptions } from 'socket.io-client';
import { Logger } from './utils/Logger';
import ReliableSocket, { PendingSocketData } from './ReliableSocket';

import { LicodeEvent } from './Events';
import { MsgCb } from './Stream';
import { DefaultEventsMap } from 'socket.io-client/build/typed-events';
import { EventDispatcher } from './Events';

const log = Logger.module('Socket');

const SocketEvent = <T = unknown>(type: string, specInput: { args: T }) => {
  const that = LicodeEvent({ type });
  Object.assign(that, { args: specInput.args })
  return that;
};

/*
 * Class Socket represents a client Socket.IO connection to ErizoController.
 */
class Socket {
  private ed = EventDispatcher()

  addEventListener = this.ed.addEventListener
  removeEventListener = this.ed.removeEventListener
  removeAllListeners = this.ed.removeAllListeners
  on = this.ed.on
  off = this.ed.off



  id?: string;
  CONNECTED = Symbol('connected');
  RECONNECTING = Symbol('reconnecting');
  DISCONNECTED = Symbol('disconnected');
  WEBSOCKET_NORMAL_CLOSURE = 1000;
  state: symbol = this.DISCONNECTED;
  defaultCallback = () => { }
  pageUnloaded = false;

  socket?: WSocket<DefaultEventsMap, DefaultEventsMap>;
  reliableSocket?: ReliableSocket;
  clientInitiated?: boolean;

  constructor(private IO: typeof io = io) {
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  emit<T>(type: string, ...args: T[]) {
    this.ed.dispatchEvent(SocketEvent(type, { args }));
  };

  connect(token: ManagerOptions, userOptions: Record<any, any> = {}, callback?: <T = string>(arg1: T) => void, error?: MsgCb) {
    const query = userOptions;
    Object.assign(userOptions, token);
    // Reconnection Logic: 3 attempts.
    // 1st attempt: 1000 +/-  500ms
    // 2nd attempt: 2000 +/- 1000ms
    // 3rd attempt: 4000 +/- 2000ms

    // Example of a failing reconnection with 3 reconnection Attempts:
    // - connect            // the client successfully establishes a connection to the server
    // - disconnect         // some bad thing happens (the client goes offline, for example)
    // - reconnect_attempt  // after a given delay, the client tries to reconnect
    // - reconnect_error    // the first attempt fails
    // - reconnect_attempt  // after a given delay, the client tries to reconnect
    // - reconnect_error    // the second attempt fails
    // - reconnect_attempt  // after a given delay, the client tries to reconnect
    // - reconnect_error    // the third attempt fails
    // - reconnect_failed   // the client won't try to reconnect anymore

    // Example of a success reconnection:
    // - connect            // the client successfully establishes a connection to the server.
    // - disconnect         // some bad thing happens (the server crashes, for example).
    // - reconnect_attempt  // after a given delay, the client tries to reconnect.
    // - reconnect_error    // the first attempt fails.
    // - reconnect_attempt  // after a given delay, the client tries to reconnect again
    // - connect            // the client successfully restore the connection to the server.
    const options = {
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
      randomizationFactor: 0.5,
      secure: token.secure,
      forceNew: true,
      transports: ['websocket'],
      rejectUnauthorized: false,
      query,
    };
    const transport = token.secure ? 'wss://' : 'ws://';
    const host = token.host;
    this.socket = this.IO(transport + host, options);
    this.reliableSocket = new ReliableSocket(this.socket);

    this.reliableSocket = this.reliableSocket;

    // Hack to know the exact reason of the WS closure (socket.io does not publish it)
    let closeCode = this.WEBSOCKET_NORMAL_CLOSURE;
    const socketOnCloseFunction = this.socket.io.engine.transport.ws.onclose;
    (this.socket.io.engine.transport.ws as WebSocket).onclose = (closeEvent) => {
      log.info(`message: WebSocket closed, code: ${closeEvent.code}, id: ${this.id}`);
      closeCode = closeEvent.code;
      socketOnCloseFunction(closeEvent);
    };

    this.reliableSocket.on('connected', (response) => {
      log.info(`message: connected, previousState: ${this.state.toString()}, id: ${this.id}`);
      this.state = this.CONNECTED;
      if (typeof response === "object") {
        this.id = response?.clientId;
      }
      callback?.(response);
    });

    this.reliableSocket.on('onAddStream', this.emit.bind(this, 'onAddStream'));

    this.reliableSocket.on('stream_message_erizo', this.emit.bind(this, 'stream_message_erizo'));
    this.reliableSocket.on('stream_message_p2p', this.emit.bind(this, 'stream_message_p2p'));
    this.reliableSocket.on('connection_message_erizo', this.emit.bind(this, 'connection_message_erizo'));
    this.reliableSocket.on('publish_me', this.emit.bind(this, 'publish_me'));
    this.reliableSocket.on('unpublish_me', this.emit.bind(this, 'unpublish_me'));
    this.reliableSocket.on('onBandwidthAlert', this.emit.bind(this, 'onBandwidthAlert'));

    // We receive an event of new data in one of the streams
    this.reliableSocket.on('onDataStream', this.emit.bind(this, 'onDataStream'));

    // We receive an event of new data in one of the streams
    this.reliableSocket.on('onUpdateAttributeStream', this.emit.bind(this, 'onUpdateAttributeStream'));

    // We receive an event of a stream removed from the room
    this.reliableSocket.on('onRemoveStream', this.emit.bind(this, 'onRemoveStream'));

    this.reliableSocket.on('onAutomaticStreamsSubscription', this.emit.bind(this, 'onAutomaticStreamsSubscription'));

    this.reliableSocket.on('connection_failed', (evt) => {
      log.warning(`message: connection failed, id: ${this.id}, evt: ${evt}`);
      this.emit('connection_failed', evt);
    });

    // Socket.io Internal events
    this.reliableSocket.on('connect', () => {
      log.info(`message: connect, previousState: ${this.state.toString()}, id: ${this.id}`);
      if (this.state === this.RECONNECTING) {
        log.info(`message: reconnected, id: ${this.id}`);
        this.state = this.CONNECTED;
        this.emit('reconnected', this.id);
      }
    });

    this.reliableSocket.on('error', (err) => {
      log.warning(`message: socket error, id: ${this.id}, state: ${this.state.toString()}, error: ${err}`);
      const tokenIssue = 'token: ';
      if (typeof err === "string" && err.startsWith(tokenIssue)) {
        this.state = this.DISCONNECTED;
        error?.(err.slice(tokenIssue.length));
        this.reliableSocket?.disconnect();
        return;
      }
      if (this.state === this.RECONNECTING) {
        this.state = this.DISCONNECTED;
        this.reliableSocket?.disconnect(true);
        this.emit('disconnect', err);
        return;
      }
      if (this.state === this.DISCONNECTED) {
        this.reliableSocket?.disconnect(true);
        return;
      }
      this.emit('error');
    });

    // The socket has disconnected
    this.reliableSocket.on('disconnect', (reason) => {
      const pendingMessages = this.reliableSocket?.getNumberOfPending();
      log.info(`message: disconnect, id: ${this.id}, reason: ${reason}, closeCode: ${closeCode}, pending: ${pendingMessages}`);
      if (this.clientInitiated) {
        this.state = this.DISCONNECTED;
        if (!this.pageUnloaded) {
          this.emit('disconnect', reason);
        }
        this.reliableSocket?.disconnect(true);
      } else {
        this.state = this.RECONNECTING;
        this.emit('reconnecting', `reason: ${reason}, pendingMessages: ${pendingMessages}`);
      }
    });

    this.reliableSocket.on('connect_error', (err) => {
      // This can be thrown during reconnection attempts too
      if (typeof err !== "string") log.warning(`message: connect error, id: ${this.id}, error: ${err?.message}`);
    });

    this.reliableSocket.on('connect_timeout', (err) => {
      if (typeof err !== "string") log.warning(`message: connect timeout, id: ${this.id}, error: ${err?.message}`);
    });

    this.reliableSocket.on('reconnecting', (attemptNumber) => {
      log.info(`message: reconnecting, id: ${this.id}, attempt: ${attemptNumber}`);
    });

    this.reliableSocket.on('reconnect', (attemptNumber) => {
      // Underlying WS has been reconnected, but we still need to wait for the 'connect' message.
      log.info(`message: internal ws reconnected, id: ${this.id}, attempt: ${attemptNumber}`);
    });

    this.reliableSocket.on('reconnect_attempt', (attemptNumber) => {
      // We are starting a new reconnection attempt, so we will update the query to let
      // ErizoController know this the new socket is a reconnection attempt.
      log.debug(`message: reconnect attempt, id: ${this.id}, attempt: ${attemptNumber}`);
      query.clientId = this.id;
      Object.assign(this.socket, {
        io: {
          ...this.socket?.io,
          opts: {
            ...this.socket?.io.opts,
            query
          }
        }
      })
    });

    this.reliableSocket.on('reconnect_error', (err) => {
      // The last reconnection attempt failed.
      if (typeof err !== "string") log.info(`message: error reconnecting, id: ${this.id}, error: ${err?.message}`);
    });

    this.reliableSocket.on('reconnect_failed', () => {
      // We could not reconnect after all attempts.
      log.info(`message: reconnect failed, id: ${this.id}`);
      this.state = this.DISCONNECTED;
      this.emit('disconnect', 'reconnect failed');
      this.reliableSocket?.disconnect(true);
    });
  };

  private onBeforeUnload(evtIn: Event) {
    const evt = evtIn;
    if (this.state === this.DISCONNECTED) {
      return;
    }
    evt.preventDefault();
    delete (evt as any).returnValue;
    this.pageUnloaded = true;
    this.disconnect(true);
  };

  disconnect(clientInitiated?: boolean) {
    log.warning(`message: disconnect, id: ${this?.id}, clientInitiated: ${clientInitiated}, state: ${this.state.toString()}`);
    this.state = this.DISCONNECTED;
    this.clientInitiated = clientInitiated;
    if (clientInitiated) {
      this.reliableSocket?.emit('clientDisconnection');
    }
    this.reliableSocket?.disconnect();
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  };



  // Function to send a message to the server using socket.io
  sendMessage(type: string, msg: any, callback?: <T, U>(arg1?: T, arg2?: U) => void, error?: (resp: PendingSocketData) => void) {
    if (this.state === this.DISCONNECTED) {
      log.debug(`message: Trying to send a message over a disconnected Socket, id: ${this.id}, type: ${type}`);
      return;
    }
    this.reliableSocket?.emit(type, msg, (respType, resp) => {
      if (respType === 'success') {
        callback?.(resp);
      } else if (respType === 'error') {
        error?.(resp);
      } else {
        callback?.(respType, resp);
      }
    });
  };

  // It sends a SDP message to the server using socket.io
  sendSDP<T extends Function = (respType: string, resp: PendingSocketData) => void>(type: string, options?: any, sdp?: string, callback?: T) {
    if (this.state === this.DISCONNECTED) {
      log.warning(`message: Trying to send a message over a disconnected Socket, id: ${this.id}`);
      return;
    }
    this.reliableSocket?.emit(type, { options, sdp }, (...args) => {
      callback?.(...args);
    });
  };
};

export { SocketEvent, Socket };
