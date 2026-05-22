export interface ShellCreatedPayload {
  shellId: string
  cwd: string
  nonce?: string
}

export interface ShellOutputPayload {
  shellId: string
  data: string
}

export interface ShellExitPayload {
  shellId: string
  exitCode: number
}
