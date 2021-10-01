/* global */
import Logger from './utils/Logger';

const log = Logger.module('EventDispatcher');

export type ListenerFunction<T = undefined> = (arg: T) => void

interface EventDispatcher {
  addEventListener: (event: string, listener: ListenerFunction) => void
  removeEventListener: (event: string, listener: ListenerFunction) => void
  removeAllListeners: () => void
  dispatchEvent: (event: LicodeEventSpec) => void
  on: (event: string, listener: ListenerFunction) => void
  off: (event: string, listener: ListenerFunction) => void
  emit: (event: LicodeEventSpec) => void
}

/*
 * Class EventDispatcher provides event handling to sub-classes.
 * It is inherited from Publisher, Room, etc.
 */
const EventDispatcher = (): EventDispatcher => {
  const listenFunc = <T = undefined>(eventType: string, listener: ListenerFunction<T>) => {
    if (dispatcher.eventListeners[eventType] === undefined) {
      dispatcher.eventListeners[eventType] = [];
    }
    dispatcher.eventListeners[eventType].push(listener);
  };
  const unListenFunc = (eventType: string, listener: ListenerFunction) => {
    if (!dispatcher.eventListeners[eventType]) {
      return;
    }
    const index = dispatcher.eventListeners[eventType].indexOf(listener);
    if (index !== -1) {
      dispatcher.eventListeners[eventType].splice(index, 1);
    }
  };
  const emitterFunc = (event: LicodeEventSpec) => {
    if (!event || !event.type) {
      throw new Error('Undefined event');
    }
    let listeners = dispatcher.eventListeners[event.type] || [];
    listeners = listeners.slice(0);
    for (let i = 0; i < listeners.length; i += 1) {
      try {
        listeners[i](event);
      } catch (e) {
        log.info(`Error triggering event: ${event.type}, error: ${e}`);
      }
    }
    for (const listener of listeners) {
      listener(event);
    }
  };
  // Private vars
  const dispatcher: {
    eventListeners: Record<string, ListenerFunction<any>[]>
  } = {
    eventListeners: {},
  };

  return {
    // It adds an event listener attached to an event type.
    addEventListener: listenFunc,
    // It removes an available event listener.
    removeEventListener: unListenFunc,
    // It removes all listeners
    removeAllListeners: () => {
      dispatcher.eventListeners = {};
    },
    // It dispatch a new event to the event listeners, based on the type
    // of event. All events are intended to be LicodeEvents.
    dispatchEvent: emitterFunc,
    on: listenFunc,
    off: unListenFunc,
    emit: emitterFunc
  };
};

class EventEmitter {
  emitter;

  constructor() {
    this.emitter = EventDispatcher();
  }
  addEventListener(eventType: string, listener: ListenerFunction) {
    this.emitter.addEventListener(eventType, listener);
  }
  removeEventListener(eventType: string, listener: ListenerFunction) {
    this.emitter.removeEventListener(eventType, listener);
  }
  dispatchEvent(evt: LicodeEventSpec) {
    this.emitter.dispatchEvent(evt);
  }
  on(eventType: string, listener: ListenerFunction) {
    this.addEventListener(eventType, listener);
  }
  off(eventType: string, listener: ListenerFunction) {
    this.removeEventListener(eventType, listener);
  }
  emit(evt: LicodeEventSpec) {
    this.dispatchEvent(evt);
  }
}


// **** EVENTS ****

/*
 * Class LicodeEvent represents a generic Event in the library.
 * It handles the type of event, that is important when adding
 * event listeners to EventDispatchers and dispatching new events.
 * A LicodeEvent can be initialized this way:
 * var event = LicodeEvent({type: "room-connected"});
 */
const LicodeEvent = (spec: LicodeEventSpec) => {
  // Event type. Examples are: 'room-connected', 'stream-added', etc.
  return { ...spec };
};


export type LicodeEventSpec = Pick<Event, "type">;

export interface ConnectionEventSpec extends LicodeEventSpec {
  stream: unknown;
  connection: unknown;
  // TODO: Find ConnectionEvent.state type
  state: 0 | 1 | 2;
  message: string;
  wasAbleToConnect: boolean;
}


/*
 * Class ConnectionEvent represents an Event that happens in a Room. It is a
 * LicodeEvent.
 * It is usually initialized as:
 * var roomEvent = ConnectionEvent({type:"stream-added", stream:stream1, state:state});
 * Event types:
 * 'stream-added' - a stream has been added to the connection.
 * 'stream-removed' - a stream has been removed from the connection.
 * 'ice-state-change' - ICE state changed
 * 'connection-failed' - Connection Failed
 */
const ConnectionEvent = (spec: ConnectionEventSpec): ConnectionEventSpec => {
  const event = LicodeEvent(spec);
  Object.assign(event, spec)
  return event as ConnectionEventSpec;
};


export interface RoomEventSpec extends LicodeEventSpec {
  streams: unknown[],
  message?: string,
}

/*
 * Class RoomEvent represents an Event that happens in a Room. It is a
 * LicodeEvent.
 * It is usually initialized as:
 * var roomEvent = RoomEvent({type:"room-connected", streams:[stream1, stream2]});
 * Event types:
 * 'room-connected' - points out that the user has been successfully connected to the room.
 * 'room-disconnected' - shows that the user has been already disconnected.
 * 'quality-level' - Connection Quality Level
 */
const RoomEvent = (spec: RoomEventSpec): RoomEventSpec => {
  const event = LicodeEvent(spec);

  Object.assign(event, spec)

  return event as RoomEventSpec;
};

export interface StreamEventSpec extends LicodeEventSpec {
  stream: unknown,
  msg: string,
  // TODO: Find StreamEvent.origin type
  origin?: unknown,
  // TODO: Find StreamEvent.bandwidth type
  bandwidth?: unknown,
  // TODO: Find StreamEvent.attrs type
  attrs?: unknown,
  wasAbleToConnect?: boolean,
}

/*
 * Class StreamEvent represents an event related to a stream. It is a LicodeEvent.
 * It is usually initialized this way:
 * var streamEvent = StreamEvent({type:"stream-added", stream:stream1});
 * Event types:
 * 'stream-added' - indicates that there is a new stream available in the room.
 * 'stream-removed' - shows that a previous available stream has been removed from the room.
 */
const StreamEvent = (spec: StreamEventSpec): StreamEventSpec => {
  const event = LicodeEvent(spec);

  Object.assign(event, spec)

  return event as StreamEventSpec;
};

/*
 * Class PublisherEvent represents an event related to a publisher. It is a LicodeEvent.
 * It usually initializes as:
 * var publisherEvent = PublisherEvent({})
 * Event types:
 * 'access-accepted' - indicates that the user has accepted to share his camera and microphone
 */
const PublisherEvent = (spec: LicodeEventSpec): LicodeEventSpec => {
  const that = LicodeEvent(spec);

  return that;
};

export {
  EventDispatcher,
  EventEmitter,
  LicodeEvent,
  RoomEvent,
  StreamEvent,
  PublisherEvent,
  ConnectionEvent
};
