/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */

import View, { ViewElement } from './View';
import Speaker, { SpeakerElement, SpeakerOptions } from './Speaker';

export interface BarOptions {
  elementID: string,
  id: string,
  options?: { speaker?: boolean },
  stream: SpeakerOptions["stream"] & { screen?: boolean },
  media?: HTMLMediaElement
}

export interface BarElement extends BarOptions, ViewElement {
  div: HTMLDivElement,
  bar: HTMLDivElement,
  link: HTMLAnchorElement,
  logo: HTMLImageElement,
  speaker?: SpeakerElement
  hide(): void,
  display(): void
}

/*
 * Bar represents the bottom menu bar of every mediaPlayer.
 * It contains a Speaker and an icon.
 * Every Bar is a View.
 * Ex.: var bar = Bar({elementID: element, id: id});
 */
const Bar = (spec: BarOptions): BarElement => {
  const that: BarElement = {
    ...View(),
    ...spec,
    div: document.createElement("div"),
    bar: document.createElement("div"),
    link: document.createElement("a"),
    logo: document.createElement("img"),
    display: () => {
      show('block');
    },
    hide: () => {
      waiting = setTimeout(show, 1000) as unknown as number;
    }
  };
  let waiting: number;

  // Variables

  // Container
  that.div.setAttribute('id', `bar_${that.id}`);
  that.div.setAttribute('class', 'licode_bar');

  // Bottom bar
  that.bar.setAttribute('style', 'width: 100%; height: 15%; max-height: 30px; ' +
    'position: absolute; bottom: 0; right: 0; ' +
    'background-color: rgba(255,255,255,0.62)');
  that.bar.setAttribute('id', `subbar_${that.id}`);
  that.bar.setAttribute('class', 'licode_subbar');

  // Lynckia icon
  that.link.setAttribute('href', 'http://www.lynckia.com/');
  that.link.setAttribute('class', 'licode_link');
  that.link.setAttribute('target', '_blank');

  that.logo.setAttribute('style', 'width: 100%; height: 100%; max-width: 30px; ' +
    'position: absolute; top: 0; left: 2px;');
  that.logo.setAttribute('class', 'licode_logo');
  that.logo.setAttribute('alt', 'Lynckia');
  that.logo.setAttribute('src', `${that.url}/assets/star.svg`);

  // Private functions
  const show = (displaying: string) => {
    let action = displaying;
    if (displaying !== 'block') {
      action = 'none';
    } else {
      clearTimeout(waiting);
    }

    that.div.setAttribute('style',
      `width: 100%; height: 100%; position: relative; bottom: 0; right: 0; display: ${action}`);
  };

  // Public functions

  document.getElementById(that.elementID)?.appendChild(that.div);
  that.div.appendChild(that.bar);
  that.bar.appendChild(that.link);
  that.link.appendChild(that.logo);

  // Speaker component
  if (!spec.stream.screen && (spec.options === undefined ||
    spec.options.speaker === undefined ||
    spec.options.speaker === true)) {
    that.speaker = Speaker({
      elementID: `subbar_${that.id}`,
      id: that.id,
      stream: spec.stream,
      media: spec.media
    });
  }

  that.display();
  that.hide();

  return that;
};

export default Bar;
