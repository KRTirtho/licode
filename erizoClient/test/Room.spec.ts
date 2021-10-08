import "mocha"
import sinon from "sinon"
import { expect } from "chai"
import Room from "../src/Room"
import Logger from "../src/utils/Logger"
import ErizoConnectionManager from "../src/ErizoConnectionManager"
import Base64 from "../src/utils/Base64"
import { StreamEvent, StreamEventSpec } from "../src/Events"

function promisify(func) {
  return new Promise((resolve) => {
    func((val: any) => {
      resolve(val);
    });
  });
}

describe('Room', () => {
  let room: Room;
  let io;
  let connectionHelpers;
  let connectionManager;
  let socket;

  beforeEach(() => {
    Logger.setLogLevel(Logger.NONE);
    socket = {
      io: { engine: { transport: { ws: { onclose: sinon.stub() } } } },
      on: sinon.stub(),
      removeListener: sinon.stub(),
      emit: sinon.stub(),
      disconnect: sinon.stub(),
    };
    io = {
      connect: sinon.stub().returns(socket),
    };
    connectionHelpers = {
      getBrowser: sinon.stub(),
    };
    connectionManager = { ErizoConnectionManager };
  });

  afterEach(() => {
  });


  it('should connect to ErizoController', async () => {
    const data = {
      tokenId: 'arbitraryId',
    };
    const spec = { token: Base64.encodeBase64(JSON.stringify(data)) };
    room = new Room(io, connectionHelpers, connectionManager, spec);
    room.connect({});
    const promise = promisify(room.on.bind(null, 'room-connected'));
    const response = {
      id: 'arbitraryRoomId',
      clientId: 'arbitraryClientId',
      streams: [],
    };
    socket.on.withArgs('connected').callArgWith(1, response);

    const roomEvent: any = await promise;
    expect(roomEvent.type).to.equals('room-connected');
    expect(roomEvent.streams.length).to.equals(0);
  });

  context('Room connected', () => {
    const arbitraryStream = {
      id: 'arbitraryStreamId',
      audio: true,
      video: true,
      data: true,
      label: 'arbitraryStreamId',
      screen: false,
      attributes: [],
    };

    beforeEach(async () => {
      const data = {
        tokenId: 'arbitraryId',
      };
      const spec = { token: Base64.encodeBase64(JSON.stringify(data)) };
      room = new Room(io, connectionHelpers, connectionManager, spec);
      room.connect({});
      const promise = promisify(room.on.bind(null, 'room-connected'));
      const response = {
        id: 'arbitraryRoomId',
        clientId: 'arbitraryClientId',
        streams: [],
      };
      socket.on.withArgs('connected').callArgWith(1, response);

      await promise;
    });

    it('should trigger new streams created', async () => {
      const promise = promisify(room.on.bind(null, 'stream-added'));
      socket.on.withArgs('onAddStream').callArgWith(1, arbitraryStream);
      const streamEvent = await promise as StreamEventSpec;
      const stream = streamEvent.stream;
      expect(stream.getID()).to.equal(arbitraryStream.id);
    });

    it('should trigger new streams deleted', async () => {
      const promise = promisify(room.on.bind(null, 'stream-removed'));
      socket.on.withArgs('onAddStream').callArgWith(1, arbitraryStream);
      socket.on.withArgs('onRemoveStream').callArgWith(1, arbitraryStream);
      const streamEvent = await promise as StreamEventSpec;
      const stream = streamEvent.stream;
      expect(stream.getID()).to.equal(arbitraryStream.id);
    });

    it('should subscribe to new streams', async () => {
      const promise = promisify(room.on.bind(null, 'stream-added'));
      socket.on.withArgs('onAddStream').callArgWith(1, arbitraryStream);
      const streamEvent = await promise as StreamEventSpec;
      const stream = streamEvent.stream;

      room.subscribe(stream);

      const result = 'arbitraryResult';
      const erizoId = 'arbitraryErizoId';
      const connectionId = 'arbitraryConnectionId';
      const error = null;

      const data = socket.emit.withArgs('subscribe').args[0][1].msg;
      expect(data.options.streamId).to.equal(arbitraryStream.id);
      expect(stream.state).to.equal('subscribing');

      socket.emit.withArgs('subscribe').args[0][2](result, erizoId, connectionId, error);
      stream.dispatchEvent(StreamEvent({ type: 'added', stream }));
      expect(stream.state).to.equal('subscribed');
    });

    it.skip('should resubscribe to new streams', async () => {
      const promise = promisify(room.on.bind(null, 'stream-added'));
      socket.on.withArgs('onAddStream').callArgWith(1, arbitraryStream);
      const streamEvent = await promise as StreamEventSpec;
      const stream = streamEvent.stream;

      room.subscribe(stream);

      const result = 'arbitraryResult';
      const erizoId = 'arbitraryErizoId';
      const connectionId = 'arbitraryConnectionId';
      const error = null;

      const data = socket.emit.withArgs('subscribe').args[0][1].msg;
      expect(data.options.streamId).to.equal(arbitraryStream.id);
      expect(stream.state).to.equal('subscribing');

      socket.emit.withArgs('subscribe').args[0][2](result, erizoId, connectionId, error);

      room.unsubscribe(stream);

      expect(stream.state).to.equal('unsubscribing');
      stream.dispatchEvent(StreamEvent({ type: 'added', stream }));
      expect(stream.state).to.equal('subscribed');
      const connection = room.erizoConnectionManager.getErizoConnection('arbitraryConnectionId');
      connection.streamRemovedListener(stream.getID());
      socket.emit.withArgs('unsubscribe').args[0][2](result, error);
      expect(stream.state).to.equal('unsubscribed');
    });
  });
});
