declare module "erizo" {

  // TODO: Implement EventDispatcher Types
  export interface EvenDispatcher{

  }

  export class EventEmitter{
    emitter: EvenDispatcher;
    addEventListener(event: string, listener: VoidFunction): void;
    removeEventListener(event: string, listener: VoidFunction): void;
    dispatchEvent(event: string): void;
    on(event: string, listener: VoidFunction): void;
    off(event: string, listener: VoidFunction): void;
    emit(event: string): void;
  }

  // TODO: Implement ErizoConnection Types
  export class ErizoConnection extends EventEmitter{

  }
  
  interface StreamPlayOptions {
    speaker?: boolean;
    crop?: boolean;
    bar?: boolean;
    loader?: boolean;
  }

  export interface ErizoStream{
    showing: boolean,
    room: ErizoRoom,
    local: boolean
    hasAudio(): boolean,
    hasVideo(): boolean,
    hasData(): boolean,
    init(): void,
    close(): void,
    play(elementId: string, options?: StreamPlayOptions): void,
    stop(): void;
    muteAudio(isMuted: boolean, callback: (result: "error" | unknown)=>void): void;
    muteVideo(isMuted: boolean, callback: (result: "error" | unknown)=>void): void;
    sendData(msg: Record<string|number, any> | string): unknown;
    getAttributes(): ErizoStreamAttributes;
    setAttributes(attributes: ErizoStreamAttributes): void;
    getVideoFrame(): ImageData;
    getVideoFrameURL(format?: string): string | null;
    updateConfiguration(config: StreamMeta, callback: (result?: string) => void): unknown;
    updateSimulcastLayersBitrate(config: Record<number, number>): void;
    updateSimulcastActiveLayers(config: Record<number, boolean>): void;
  }

  export interface ErizoStreamAttributes{
    name: string;
    type: "private"|"public"
  }

  export interface StreamMeta extends Omit<MediaStreamConstraints, "peerIdentity">{
    data?: boolean,
    recording?: boolean;
    desktopStreamId?: string,
    maxVideoBW?: number;
    maxAudioBW?: number;
    slideShowMode?: boolean;
  }

  export interface ErizoStreamOptions extends StreamMeta{
    attributes?: ErizoStreamAttributes,
    url?: string,
    videoSize?: number[],
  }

  export interface SubscribeOptions extends StreamMeta{
    forceTurn?: boolean,

  }

  type ResultOrErrCallback<R=string> = (id?: R | null, err?: string | null) => void;

  export interface ErizoRoom{
    localStreams: Map<string, ErizoRoom>,
    remoteStreams: Map<string, ErizoRoom>[],
    roomID: string,
    state: 0 | 1 | 2,
    connect(): void,
    publish(
      stream: ErizoStream,
      options?: Record<string | number, unknown>,
      cb?: ResultOrErrCallback
    ): void,
    subscribe(
      stream: ErizoStream,
      options?: StreamMeta,
      cb?: ResultOrErrCallback
    ): void,
    unsubscribe(stream: ErizoStream, cb?: ResultOrErrCallback): void,
    unpublish(stream: ErizoStream, cb?: ResultOrErrCallback): void,
    disconnect(): void;
    startRecording(stream: ErizoStream, cb?: ResultOrErrCallback): void,
    stopRecording(recordingId: string, cb?: ResultOrErrCallback<boolean>): void;
    getStreamsByAttribute(name: string, value: string): ErizoStream[]
  }

  export interface ErizoRoomArgs{
    token: string;
  }

  export interface LicodeEvent{
    type: string,
  }

  export interface RoomEvent extends LicodeEvent{
    streams: ErizoStream[],
    message?: string,
  }

  export interface StreamEvent extends LicodeEvent{
    stream: ErizoStream,
    msg: string,
    // TODO: Find StreamEvent.origin type
    origin?: unknown,
    // TODO: Find StreamEvent.bandwidth type
    bandwidth?: unknown,
    // TODO: Find StreamEvent.attrs type
    attrs?: unknown,
    wasAbleToConnect?: boolean,
  }

  export interface ConnectionEvent extends LicodeEvent{
    stream: ErizoStream;
    connection: ErizoConnection;
    // TODO: Find ConnectionEvent.state type
    state: 0 | 1 | 2;
    message: string;
    wasAbleToConnect: boolean;
  }
  
  const Erizo: {
    Stream(args: ErizoStreamOptions): ErizoStream,
    Room(args: ErizoRoomArgs): ErizoRoom,
    LicodeEvent(options: LicodeEvent): LicodeEvent,
    RoomEvent(options: RoomEvent): RoomEvent,
    StreamEvent(options: StreamEvent): StreamEvent,
    ConnectionEvent(options: ConnectionEvent): ConnectionEvent;
  };

  export default Erizo;
}