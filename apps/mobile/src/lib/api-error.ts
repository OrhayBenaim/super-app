/** A response the server refused: `status` tells the caller what to do about it. Failures without a status never got a response. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
