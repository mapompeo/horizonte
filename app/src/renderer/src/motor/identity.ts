/** Identidade deste aparelho: um id e um certificado DTLS que duram entre execuções (IndexedDB do perfil). */
export interface Identity {
  id: string
  certificate: RTCCertificate
  /** SHA-256 do certificado, como aparece no SDP. */
  fp: string
}

const DB = 'horizonte-motor'
const STORE = 'identidade'
const KEY = 'este-aparelho'
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000
/** Renova com folga antes de vencer, para não cair no meio de uma sessão. */
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000

interface Stored {
  id: string
  certificate: RTCCertificate
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function open(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB, 1)
  req.onupgradeneeded = () => req.result.createObjectStore(STORE)
  return request(req)
}

function fingerprintOf(certificate: RTCCertificate): string {
  const sha = certificate.getFingerprints().find((f) => f.algorithm === 'sha-256')
  if (!sha?.value) throw new Error('O certificado não tem impressão digital SHA-256.')
  return sha.value.toUpperCase()
}

/** Lê a identidade guardada ou cria uma nova (na primeira vez, ou se o certificado estiver para vencer). */
export async function loadIdentity(): Promise<Identity> {
  const db = await open()
  try {
    const read = db.transaction(STORE, 'readonly').objectStore(STORE)
    const stored = (await request(read.get(KEY))) as Stored | undefined
    if (stored && stored.certificate.expires - Date.now() > RENEW_BEFORE_MS)
      return { ...stored, fp: fingerprintOf(stored.certificate) }

    const certificate = await RTCPeerConnection.generateCertificate({
      name: 'ECDSA',
      namedCurve: 'P-256',
      expires: TEN_YEARS_MS
    } as EcKeyGenParams & { expires: number })
    const fresh: Stored = { id: stored?.id ?? crypto.randomUUID(), certificate }
    const write = db.transaction(STORE, 'readwrite').objectStore(STORE)
    await request(write.put(fresh, KEY))
    return { ...fresh, fp: fingerprintOf(certificate) }
  } finally {
    db.close()
  }
}
