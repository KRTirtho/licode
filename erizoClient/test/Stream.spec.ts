import "mocha"
import sinon from "sinon"
import { ErizoStream as Stream } from "../src/ErizoStream"
import Logger from "../src/utils/Logger"
import { expect } from "chai"

describe('Stream.init', () => {
  beforeEach(() => {
    Logger.setLogLevel(Logger.NONE);
    sinon.spy(navigator.mediaDevices, 'getUserMedia');
    sinon.spy(navigator.mediaDevices, 'getDisplayMedia');
  });

  afterEach(() => {
    type S = sinon.SinonSpy<[constraints?: MediaStreamConstraints], Promise<MediaStream>>
    (navigator.mediaDevices.getUserMedia as S).restore();
    (navigator.mediaDevices.getDisplayMedia as S).restore();
  });

  it('should get access to user media when requesting access to video and audio', async () => {
    const localStream = new Stream(undefined, { audio: true, video: true, data: true });
    const promise = new Promise((resolve) => {
      localStream.on('access-accepted', () => {
        resolve(undefined);
      });
    });
    localStream.init();

    await promise;
    expect(localStream).to.have.property('stream');
    expect((navigator.mediaDevices.getUserMedia as sinon.SinonSpy).called).to.be.true;
    const constraints = (navigator.mediaDevices.getUserMedia as sinon.SinonSpy).firstCall.firstArg;
    expect(constraints.video).not.equals(false);
    expect(constraints.audio).not.equals(false);
    expect(localStream.stream.getVideoTracks().length).to.equals(1);
    expect(localStream.stream.getAudioTracks().length).to.equals(1);
  });

  it('should get access to user media when requesting access to video', async () => {
    const localStream = new Stream(undefined, { audio: false, video: true, data: true });
    const promise = new Promise((resolve) => {
      localStream.on('access-accepted', () => {
        resolve(undefined);
      });
    });
    localStream.init();

    await promise;
    expect(localStream).to.have.property('stream');
    expect((navigator.mediaDevices.getUserMedia as sinon.SinonSpy).called).to.be.true;
    const constraints = (navigator.mediaDevices.getUserMedia as sinon.SinonSpy).firstCall.firstArg;
    expect(constraints.video).not.equals(false);
    expect(constraints.audio).equals(false);
    expect(localStream.stream.getVideoTracks().length).to.equals(1);
    expect(localStream.stream.getAudioTracks().length).to.equals(0);
  });

  it('should get access to user media when requesting access to audio', async () => {
    const localStream = new Stream(undefined, { audio: true, video: false, data: true });
    const promise = new Promise((resolve) => {
      localStream.on('access-accepted', () => {
        resolve(undefined);
      });
    });
    localStream.init();

    await promise;
    expect(localStream).to.have.property('stream');
    expect((navigator.mediaDevices.getUserMedia as sinon.SinonSpy).called).to.be.true;
    const constraints = (navigator.mediaDevices.getUserMedia as sinon.SinonSpy).firstCall.firstArg;
    expect(constraints.video).equals(false);
    expect(constraints.audio).not.equals(false);
    expect(localStream.stream.getVideoTracks().length).to.equals(0);
    expect(localStream.stream.getAudioTracks().length).to.equals(1);
  });

  it('should get access to user media when requesting access to screen sharing', async () => {
    const localStream = new Stream(undefined, { screen: true, data: true });
    const promise = new Promise((resolve) => {
      localStream.on('access-accepted', () => {
        resolve(undefined);
      });
    });
    localStream.init();
    await promise;
    expect(localStream).to.have.property('stream');
    expect((navigator.mediaDevices.getDisplayMedia as sinon.SinonSpy).called).to.be.true;
    const constraints = (navigator.mediaDevices.getDisplayMedia as sinon.SinonSpy).firstCall.firstArg;
    expect(constraints.screen).equals(false);
    expect(constraints.video).equals(false);
    expect(constraints.audio).equals(false);
    expect(localStream.stream.getVideoTracks().length).to.equals(1);
    expect(localStream.stream.getAudioTracks().length).to.equals(0);
  });
});
