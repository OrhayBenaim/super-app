/** A response the server refused: `status` tells the caller what to do about it. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** The request never got a response: no network, or it was aborted. */
export class NetworkError extends Error {}
