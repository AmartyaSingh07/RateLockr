declare module "serverless-http" {
  import type { IncomingMessage, ServerResponse } from "http";
  import type { RequestListener } from "http";

  type Handler = (
    req: IncomingMessage,
    res: ServerResponse
  ) => Promise<void> | void;

  interface ServerlessHandler {
    (req: IncomingMessage, res: ServerResponse): Promise<void>;
  }

  function serverless(app: any): ServerlessHandler;
  export default serverless;
}
