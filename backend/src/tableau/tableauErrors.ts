export class TableauRequestError extends Error {
  constructor(
    message: string,
    readonly details: {
      operation: string;
      status?: number;
      path?: string;
    },
  ) {
    super(message);
    this.name = "TableauRequestError";
  }
}

