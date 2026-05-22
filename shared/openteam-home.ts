import { join } from 'path'
import { homedir } from 'os'

export const OPENTEAM_HOME = process.env.OPENTEAM_HOME ?? join(homedir(), '.openteam')
