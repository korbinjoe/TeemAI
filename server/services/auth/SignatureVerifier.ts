/**
 * SignatureVerifier — Ed25519
 *
 *  manifest.json  bundle
 *
 */

import { createHash, generateKeyPairSync, sign, verify } from 'crypto'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { createLogger } from '../../lib/logger'
import { OPENTEAM_HOME } from '../../config/paths'

const log = createLogger('SignatureVerifier')

const KEYS_DIR = join(OPENTEAM_HOME, 'keys')
const PRIVATE_KEY_PATH = join(KEYS_DIR, 'update-signing.pem')
const PUBLIC_KEY_PATH = join(KEYS_DIR, 'update-signing.pub')

export class SignatureVerifier {
  private privateKey: string | null = null
  private publicKey: string | null = null

  constructor() {
    this.loadKeys()
  }

  private loadKeys() {
    if (existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
      this.privateKey = readFileSync(PRIVATE_KEY_PATH, 'utf-8')
      this.publicKey = readFileSync(PUBLIC_KEY_PATH, 'utf-8')
      log.info('Signing keys loaded')
      return
    }

    this.generateKeyPair()
  }

  private generateKeyPair() {
    if (!existsSync(KEYS_DIR)) {
      mkdirSync(KEYS_DIR, { recursive: true })
    }

    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })

    this.privateKey = privateKey
    this.publicKey = publicKey

    writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 })
    writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 })

    log.info('Generated new Ed25519 signing key pair')
  }

  /**
   *  manifest
   *
   * manifest JSON  key
   *  base64
   */
  signManifest(manifest: Record<string, unknown>): string | null {
    if (!this.privateKey) {
      log.error('Private key not available for signing')
      return null
    }

    const payload = this.canonicalize(manifest)
    const signature = sign(null, Buffer.from(payload), this.privateKey)
    return signature.toString('base64')
  }

  verifyManifest(manifest: Record<string, unknown>, signature: string): boolean {
    if (!this.publicKey) {
      log.error('Public key not available for verification')
      return false
    }

    try {
      const payload = this.canonicalize(manifest)
      return verify(null, Buffer.from(payload), this.publicKey, Buffer.from(signature, 'base64'))
    } catch (err) {
      log.error('Signature verification failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  signFile(filePath: string): string | null {
    if (!this.privateKey) return null

    const data = readFileSync(filePath)
    const signature = sign(null, data, this.privateKey)
    return signature.toString('base64')
  }

  verifyFile(filePath: string, signature: string): boolean {
    if (!this.publicKey) return false

    try {
      const data = readFileSync(filePath)
      return verify(null, data, this.publicKey, Buffer.from(signature, 'base64'))
    } catch {
      return false
    }
  }

  getPublicKey(): string | null {
    return this.publicKey
  }

  getPublicKeyFingerprint(): string | null {
    if (!this.publicKey) return null
    return createHash('sha256')
      .update(this.publicKey)
      .digest('hex')
      .slice(0, 16)
  }

  private canonicalize(obj: unknown): string {
    return JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort())
  }
}
