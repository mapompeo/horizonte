import type { ClientEngine, EnginePort, ServerEngine } from './port'

/** Junta um servidor e um cliente numa só porta. O ajuste de bitrate vale para os dois lados. */
export function composeEngine(server: ServerEngine, client: ClientEngine): EnginePort {
  return {
    prepare: (onStep, settings, onProgress) => server.prepare(onStep, settings, onProgress),
    abort: () => server.abort(),
    approve: (request) => server.approve(request),
    deny: (pairingId) => server.deny(pairingId),
    stopSending: (fingerprint) => server.stopSending(fingerprint),
    applyBitrate: async (mbps) => {
      await Promise.allSettled([server.applyBitrate(mbps), client.applyBitrate(mbps)])
    },
    placeDisplay: async (side) => {
      await server.placeDisplay?.(side)
    },
    placeScreen: async (placement, fingerprint) => {
      await server.placeScreen?.(placement, fingerprint)
    },
    onPairRequest: (callback) => server.onPairRequest(callback),
    onPairCancelled: (callback) => server.onPairCancelled(callback),
    onClientConnected: (callback) => server.onClientConnected(callback),
    onClientDisconnected: (callback) => server.onClientDisconnected(callback),
    listHosts: () => client.listHosts(),
    connect: (host, settings) => client.connect(host, settings),
    disconnect: () => client.disconnect(),
    onStreamEnded: (callback) => client.onStreamEnded(callback)
  }
}
