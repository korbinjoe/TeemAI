export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export const createApiError = (code: string, message: string, details?: unknown): ApiErrorBody => ({
  error: { code, message, ...(details !== undefined && { details }) },
})
