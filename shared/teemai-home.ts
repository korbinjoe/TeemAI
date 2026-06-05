import { join } from 'path'
import { homedir } from 'os'

export const TEEMAI_HOME = process.env.TEEMAI_HOME ?? join(homedir(), '.teemai')
