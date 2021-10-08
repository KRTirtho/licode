/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


import Room from './Room';
import Base64 from './utils/Base64';
import ErizoConnectionManager from './ErizoConnectionManager';
import { LicodeEvent, RoomEvent, StreamEvent, ConnectionEvent } from './Events';
import Stream from './Stream';
import Logger from './utils/Logger';
import { ErizoStream } from './ErizoStream';

const Erizo = {
  Room,
  LicodeEvent,
  RoomEvent,
  StreamEvent,
  ConnectionEvent,
  Stream: Stream.bind(null, undefined),
  ErizoStream,
  Logger,
  _: {
    ErizoConnectionManager,
    Room,
    Base64,
  },
};

export default Erizo;
