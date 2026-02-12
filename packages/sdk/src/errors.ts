export class UCError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'UCError'
    this.status = status
    this.code = code || `HTTP_${status}`
  }
}
