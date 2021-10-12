import { JSDOM } from "jsdom"

const dom = new JSDOM(`<!DOCTYPE html><html lang="en">`, { url: "https://localhost" })

global.window = dom.window as any;
global.document = window.document;
global.navigator = {
  ...dom.window.navigator,
  mediaDevices: {
    ...dom.window.navigator.mediaDevices,
    getUserMedia(constraints) {
      if ("mediaDevices" in dom.window.navigator) {
        return dom.window.navigator.mediaDevices.getUserMedia(constraints);
      }
      else if ("getUserMedia" in dom.window.navigator) {
        return (dom.window.navigator as any).getUserMedia(constraints)
      }
      else {
        return {} as MediaStream;
      }
    },
    getDisplayMedia(constraints) {
      if ("mediaDevices" in dom.window.navigator) {
        return dom.window.navigator.mediaDevices.getDisplayMedia(constraints);
      }
      else if ("getDisplayMedia" in dom.window.navigator) {
        return (dom.window.navigator as any).getDisplayMedia(constraints)
      }
      else {
        return Promise.resolve<MediaStream>({} as MediaStream);
      }
    }
  }
};