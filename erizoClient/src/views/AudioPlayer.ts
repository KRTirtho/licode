/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


import View from './View';
import Bar from './Bar';
import { VideoPlayerElement, VideoPlayerNestedOptions, VideoPlayerOptions } from './VideoPlayer';

export interface AudioPlayerOptions extends Omit<VideoPlayerOptions, "options"> {
  options: Omit<VideoPlayerNestedOptions, "loader">
}
export interface AudioPlayerElement extends Omit<VideoPlayerElement, "video" | "containerHeight" | "containerWidth"> {
  audio: HTMLAudioElement
}

/*
 * AudioPlayer represents a Licode Audio component that shows either a local or a remote Audio.
 * Ex.: var player = AudioPlayer({id: id, stream: stream, elementID: elementID});
 * A AudioPlayer is also a View component.
 */

const AudioPlayer = (spec: AudioPlayerOptions) => {
  const that: AudioPlayerElement = {
    ...View(),
    div: document.createElement("div"),
    ...spec,
    stream: spec.stream.stream as MediaStream,
    audio: document.createElement("audio"),
    destroy() { },
  };
  let onmouseover;
  let onmouseout;


  // Audio tag
  that.audio.setAttribute('id', `stream${that.id}`);
  that.audio.setAttribute('class', 'licode_stream');
  that.audio.setAttribute('style', 'width: 100%; height: 100%; position: absolute');
  that.audio.setAttribute('autoplay', 'autoplay');

  if (spec.stream.local) { that.audio.volume = 0; }

  if (that.elementID !== undefined) {
    // It will stop the AudioPlayer and remove it from the HTML
    that.destroy = () => {
      that.audio.pause();
      that.parentNode?.removeChild(that.div);
    };

    onmouseover = () => {
      that.bar?.display();
    };

    onmouseout = () => {
      that.bar?.hide();
    };

    // Container
    that.div.setAttribute('id', `player_${that.id}`);
    that.div.setAttribute('class', 'licode_player');
    that.div.setAttribute('style', 'width: 100%; height: 100%; position: relative; ' +
      'overflow: hidden;');

    // Check for a passed DOM node.
    if (typeof that.elementID === 'object' &&
      typeof that.elementID.appendChild === 'function') {
      that.container = that.elementID;
    } else {
      that.container = document.getElementById(that.elementID as string);
    }
    that.container?.appendChild(that.div);


    Object.assign(that, { parentNode: that.div.parentNode })

    that.div.appendChild(that.audio);

    // Bottom Bar
    if (spec.options?.bar !== false) {
      that.bar = Bar({
        elementID: `player_${that.id}`,
        id: that.id,
        stream: spec.stream,
        media: that.audio,
        options: spec.options
      });

      that.div.onmouseover = onmouseover;
      that.div.onmouseout = onmouseout;
    } else {
      // Expose a consistent object to manipulate the media.
      that.media = that.audio;
    }
  } else {
    // It will stop the AudioPlayer and remove it from the HTML
    that.destroy = () => {
      that.audio.pause();
      that.parentNode?.removeChild(that.audio);
    };

    document.body.appendChild(that.audio);
    that.parentNode = document.body;
  }

  that.audio.srcObject = that.stream;

  return that;
};

export default AudioPlayer;
