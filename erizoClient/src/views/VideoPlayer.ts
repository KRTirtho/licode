/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


import View, { ViewElement } from './View';
import Bar, { BarElement, BarOptions } from './Bar';

export interface VideoPlayerNestedOptions {
  bar?: boolean;
  loader?: boolean;
  speaker?: boolean;
}

export interface VideoPlayerOptions extends Omit<BarOptions, "options" | "elementID"> {
  options?: VideoPlayerNestedOptions,
  elementID: string | HTMLElement
}

export interface VideoPlayerElement extends Omit<VideoPlayerOptions, "stream">, ViewElement {
  div: HTMLDivElement,
  loader?: HTMLImageElement,
  video: HTMLVideoElement,
  container?: HTMLElement | HTMLDivElement | null
  containerWidth: number,
  stream: MediaStream
  containerHeight: number,
  bar?: BarElement
  parentNode?: ParentNode,
  destroy(): void,
}

/*
 * VideoPlayer represents a Licode video component that shows either a local or a remote video.
 * Ex.: var player = VideoPlayer({id: id, stream: stream, elementID: elementID});
 * A VideoPlayer is also a View component.
 */
const VideoPlayer = (spec: VideoPlayerOptions) => {
  const that: VideoPlayerElement = {
    ...View(),
    div: document.createElement("div"),
    ...spec,
    stream: spec.stream.stream as MediaStream,
    containerHeight: 0,
    containerWidth: 0,
    video: document.createElement("video"),
    destroy() { },
  };



  that.destroy = () => {
    that.video.pause();
    that.parentNode?.removeChild(that.div);
  };


  // Private functions
  const onmouseover = () => {
    that.bar?.display();
  };

  const onmouseout = () => {
    that.bar?.hide();
  };

  // Container
  that.div = document.createElement('div');
  that.div.setAttribute('id', `player_${that.id}`);
  that.div.setAttribute('class', 'licode_player');
  that.div.setAttribute('style', 'width: 100%; height: 100%; position: relative; ' +
    'background-color: black; overflow: hidden;');

  // Loader icon
  if (spec.options?.loader !== false) {
    that.loader = document.createElement('img');
    that.loader.setAttribute('style', 'width: 16px; height: 16px; position: absolute; ' +
      'top: 50%; left: 50%; margin-top: -8px; margin-left: -8px');
    that.loader.setAttribute('id', `back_${that.id}`);
    that.loader.setAttribute('class', 'licode_loader');
    that.loader.setAttribute('src', `${that.url}/assets/loader.gif`);
  }

  // Video tag
  that.video.setAttribute('id', `stream${that.id}`);
  that.video.setAttribute('class', 'licode_stream');
  that.video.setAttribute('style', 'width: 100%; height: 100%; position: absolute; object-fit: cover');
  that.video.setAttribute('autoplay', 'autoplay');
  that.video.setAttribute('playsinline', 'playsinline');

  if (spec.stream.local) { that.video.volume = 0; }

  if (that.elementID !== undefined) {
    // Check for a passed DOM node.
    if (typeof that.elementID === 'object' &&
      typeof that.elementID.appendChild === 'function') {
      that.container = that.elementID;
    } else {
      that.container = document.getElementById(that.elementID as string);
    }
  } else {
    that.container = document.body;
  }
  that.container?.appendChild(that.div);

  Object.assign(that, { parentNode: that.div.parentNode })

  if (that.loader) {
    that.div.appendChild(that.loader);
  }
  that.div.appendChild(that.video);

  that.containerWidth = 0;
  that.containerHeight = 0;

  // Bottom Bar
  if (spec.options?.bar !== false) {
    that.bar = Bar({
      elementID: `player_${that.id}`,
      id: that.id,
      stream: spec.stream,
      media: that.video,
      options: spec.options
    });

    that.div.onmouseover = onmouseover;
    that.div.onmouseout = onmouseout;
  } else {
    // Expose a consistent object to manipulate the media.
    that.media = that.video;
  }

  that.video.srcObject = that.stream;

  return that;
};

export default VideoPlayer;
