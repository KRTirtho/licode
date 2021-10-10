import "mocha"
import sinon from "sinon"
import { expect } from "chai"
import {
  StreamEvent,
  StreamEventSpec,
  ErizoConnectionManager,
  Base64,
  Logger,
  Room,
  ConnectionHelpers
} from "../src/index"

import { io as dotio, Socket } from "socket.io-client"
import jsdom from "mocha-jsdom"

function promisify(func: Function) {
  return new Promise((resolve) => {
    func((val: any) => {
      resolve(val);
    });
  });
}

describe('Room', () => {
  jsdom({ url: 'https://localhost' })

  let room: Room;
  let io: typeof dotio;
  let connectionHelpers: typeof ConnectionHelpers;
  let connectionManager: ErizoConnectionManager;
  let socket: Socket;

  beforeEach(() => {
    Logger.setLogLevel(Logger.NONE);
    socket = {
      io: { engine: { transport: { ws: { onclose: sinon.stub() } } } } as any,
      on: sinon.stub(),
      off: sinon.stub(),
      emit: sinon.stub(),
      disconnect: sinon.stub(),
    } as any;
    io = sinon.stub().returns(socket as unknown as Socket);
    connectionHelpers = {
      getBrowser: sinon.stub(),
      GetUserMedia: sinon.stub()
    };
    connectionManager = new ErizoConnectionManager();
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
    (socket.on as sinon.SinonStub).withArgs('connected').callArgWith(1, response);

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
      (socket.on as sinon.SinonStub).withArgs('connected').callArgWith(1, response);

      await promise;
    });

    it('should trigger new streams created', async () => {
      const promise = promisify(room.on.bind(null, 'stream-added'));
      (socket.on as sinon.SinonStub).withArgs('onAddStream').callArgWith(1, arbitraryStream);
      const streamEvent = await promise as StreamEventSpec;
      const stream = streamEvent.stream;
      expect(stream?.getID()).to.equal(arbitraryStream.id);
    });

    it('should trigger new streams deleted', async () => {
      const promise = promisify(room.on.bind(null, 'stream-removed'));
      (socket.on as sinon.SinonStub).withArgs('onAddStream').callArgWith(1, arbitraryStream);
      (socket.on as sinon.SinonStub).withArgs('onRemoveStream').callArgWith(1, arbitraryStream);
      const streamEvent = await promise as StreamEventSpec;
      const stream = streamEvent.stream;
      expect(stream?.getID()).to.equal(arbitraryStream.id);
    });

    it('should subscribe to new streams', async () => {
      const promise = promisify(room.on.bind(null, 'stream-added'));
      (socket.on as sinon.SinonStub).withArgs('onAddStream').callArgWith(1, arbitraryStream);
      const streamEvent = await promise as StreamEventSpec;
      const stream = streamEvent.stream;

      if (stream) room.subscribe(stream);

      const result = 'arbitraryResult';
      const erizoId = 'arbitraryErizoId';
      const connectionId = 'arbitraryConnectionId';
      const error = null;

      const data = (socket.emit as sinon.SinonStub).withArgs('subscribe').args[0][1].msg;
      expect(data.options.streamId).to.equal(arbitraryStream.id);
      expect(stream?.state).to.equal('subscribing');

      (socket.emit as sinon.SinonStub).withArgs('subscribe').args[0][2](result, erizoId, connectionId, error);
      stream?.dispatchEvent(StreamEvent({ type: 'added', stream }));
      expect(stream?.state).to.equal('subscribed');
    });

    it.skip('should resubscribe to new streams', async () => {
      const promise = promisify(room.on.bind(null, 'stream-added'));
      (socket.on as sinon.SinonStub).withArgs('onAddStream').callArgWith(1, arbitraryStream);
      const streamEvent = await promise as StreamEventSpec;
      const stream = streamEvent.stream;

      if (stream) room.subscribe(stream);

      const result = 'arbitraryResult';
      const erizoId = 'arbitraryErizoId';
      const connectionId = 'arbitraryConnectionId';
      const error = null;

      const data = (socket.emit as sinon.SinonStub).withArgs('subscribe').args[0][1].msg;
      expect(data.options.streamId).to.equal(arbitraryStream.id);
      expect(stream?.state).to.equal('subscribing');

      (socket.emit as sinon.SinonStub).withArgs('subscribe').args[0][2](result, erizoId, connectionId, error);

      if (stream) room.unsubscribe(stream);

      expect(stream?.state).to.equal('unsubscribing');
      stream?.dispatchEvent(StreamEvent({ type: 'added', stream }));
      expect(stream?.state).to.equal('subscribed');
      const connection = room.erizoConnectionManager.getErizoConnection('arbitraryConnectionId');
      connection?.streamRemovedListener(stream?.getID());
      (socket.emit as sinon.SinonStub).withArgs('unsubscribe').args[0][2](result, error);
      expect(stream?.state).to.equal('unsubscribed');
    });
  });
});
