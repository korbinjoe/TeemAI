/**
 *
 * server/index.ts  setServerPort()
 *  getServerPort()
 */

import { PORTS } from '../../shared/ports'

let currentPort = PORTS.DEV_SERVER

export const getServerPort = () => currentPort

export const setServerPort = (port: number) => {
  currentPort = port
}
