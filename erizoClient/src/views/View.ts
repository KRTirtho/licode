/*
 * View class represents a HTML component
 * Every view is an EventDispatcher.
 */

import { EventDispatcher } from '../Events';

export interface ViewElement extends EventDispatcher {
  url: string
}

const View = (): ViewElement => {
  const dispatcher = EventDispatcher();

  // URL where it will look for icons and assets
  return { ...dispatcher, url: "" };
};

export default View;
