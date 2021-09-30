// TODO: Fix/create appropriate SDP related types

const SdpHelpers = {
  addSim(spatialLayers: string[]) {
    let line = 'a=ssrc-group:SIM';
    spatialLayers.forEach((spatialLayerId) => {
      line += ` ${spatialLayerId}`;
    });
    return `${line}\r\n`;
  },
  addGroup: (spatialLayerId: string, spatialLayerIdRtx: string) =>
    `a=ssrc-group:FID ${spatialLayerId} ${spatialLayerIdRtx}\r\n`,
  addSpatialLayer: (cname: string, msid: string, mslabel: string,
    label: string, spatialLayerId: string, spatialLayerIdRtx: string) =>
    `a=ssrc:${spatialLayerId} cname:${cname}\r\n` +
    `a=ssrc:${spatialLayerId} msid:${msid}\r\n` +
    `a=ssrc:${spatialLayerId} mslabel:${mslabel}\r\n` +
    `a=ssrc:${spatialLayerId} label:${label}\r\n` +
    `a=ssrc:${spatialLayerIdRtx} cname:${cname}\r\n` +
    `a=ssrc:${spatialLayerIdRtx} msid:${msid}\r\n` +
    `a=ssrc:${spatialLayerIdRtx} mslabel:${mslabel}\r\n` +
    `a=ssrc:${spatialLayerIdRtx} label:${label}\r\n`,
  setMaxBW: (sdp: any, spec: any) => {
    if (!spec.p2p) {
      return;
    }
    if (spec.video && spec.maxVideoBW) {
      const video = sdp.getMedia('video');
      if (video) {
        video.setBitrate(spec.maxVideoBW);
      }
    }

    if (spec.audio && spec.maxAudioBW) {
      const audio = sdp.getMedia('audio');
      if (audio) {
        audio.setBitrate(spec.maxAudioBW);
      }
    }
  },
  enableOpusNacks: (sdpInput: string) => {
    let sdp = sdpInput;
    const sdpMatch = sdp.match(/a=rtpmap:(.*)opus.*\r\n/);
    if (sdpMatch !== null) {
      const theLine = `${sdpMatch[0]}a=rtcp-fb:${sdpMatch[1]}nack\r\n`;
      sdp = sdp.replace(sdpMatch[0], theLine);
    }

    return sdp;
  },
  setParamForCodecs: (sdpInfo: any, mediaType: unknown, paramName: string, value: unknown) => {
    sdpInfo.medias.forEach((mediaInfo: any) => {
      if (mediaInfo.id === mediaType) {
        mediaInfo.codecs.forEach((codec: any) => {
          codec.setParam(paramName, value);
        });
      }
    });
  }
};

export default SdpHelpers;
