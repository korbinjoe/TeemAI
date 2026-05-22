/**
 * ACPSessionBootstrap -  ACP  + /
 *
 * handleStart  handleResume  bootstrap
 *   1. createACPAdapter(provider, streamManager, opts)
 *   2. new ACPClient(adapter)
 *   3. client.initialize()
 *   4. client.createSession(cwd)  client.loadSession(cliSessionId)
 */

import type { CliProvider } from '../config/types'
import type { StreamJsonManager } from '../terminal/StreamJsonManager'
import { ACPClient } from './ACPClient'
import { createACPAdapter, type CreateAdapterOptions } from './ACPAdapterFactory'

export interface BootstrapOptions {
  provider: CliProvider
  streamManager: StreamJsonManager
  adapterOptions: CreateAdapterOptions
}

export interface BootstrapNewParams {
  mode: 'new'
  cwd: string
  env?: Record<string, string>
}

export interface BootstrapLoadParams {
  mode: 'load'
  sessionId: string
  cwd?: string
}

export type BootstrapParams = BootstrapNewParams | BootstrapLoadParams

export const bootstrapACPSession = async (
  opts: BootstrapOptions,
  params: BootstrapParams,
): Promise<ACPClient> => {
  const adapter = createACPAdapter(opts.provider, opts.streamManager, opts.adapterOptions)
  const client = new ACPClient(adapter)

  await client.initialize()

  if (params.mode === 'new') {
    await client.createSession({ cwd: params.cwd, env: params.env })
  } else {
    await client.loadSession({ sessionId: params.sessionId, cwd: params.cwd })
  }

  return client
}
