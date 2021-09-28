declare module "erizo" {
  export interface ErizoRoom{}
  
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
    updateConfiguration(config: ErizoStreamArgs, callback: (result?: string) => void): unknown;
    updateSimulcastLayersBitrate(config: Record<number, number>): void;
    updateSimulcastActiveLayers(config: Record<number, boolean>): void;
  }

  export interface ErizoStreamAttributes{
    name: string;
    type: "private"|"public"
  }

  export interface ErizoStreamArgs{
    audio?: boolean,
    video?: boolean,
    data?: boolean,
    recording?: boolean;
    desktopStreamId?: string,
    url?: string,
    videoSize?: number[],
    attributes?: ErizoStreamAttributes,
    maxVideoBW?: number;
    maxAudioBW?: number;
    slideShowMode?: boolean;
  }
  
  export default class Erizo{
    static Stream(options: ErizoStreamArgs): ErizoStream;
  }
}